"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { adCampaigns, clients, connections } from "@/db/schema";
import { changeSponsorshipStatus, launchSponsorship, metaUserToken, syncAds } from "@/lib/ads/ads";
import { listAdAccounts, searchCities } from "@/lib/ads/meta-ads";
import { audit, diff } from "@/lib/audit";
import { requireWriter, userCanPublish } from "@/lib/auth";
import { isDryRun } from "@/lib/publishing/meta-publish";

// Sponsorizzate: solo chi può pubblicare (amministratori e User abilitati) gestisce account e campagne.

async function requirePublisher() {
  const me = await requireWriter();
  if (!(await userCanPublish(me))) throw new Error("Solo gli amministratori e chi è abilitato a pubblicare gestiscono le sponsorizzate");
  return me;
}

async function hasMeta(clientId: number) {
  const [c] = await db.select({ id: connections.id }).from(connections).where(and(eq(connections.clientId, clientId), eq(connections.provider, "meta")));
  return !!c;
}

/** Account pubblicitari visibili con il collegamento Meta del cliente. In simulazione senza Meta: un account di prova. */
export async function loadAdAccounts(clientId: number) {
  await requirePublisher();
  if (!(await hasMeta(clientId))) {
    if (isDryRun()) return { accounts: [{ id: "act_simulazione", name: "Account di prova (simulazione)", currency: "EUR", status: 1, business: "2Target" }] };
    return { error: "Collega prima Meta in Canali, con i permessi per le inserzioni" };
  }
  try {
    return { accounts: await listAdAccounts(await metaUserToken(clientId)) };
  } catch (e) {
    return { error: `Meta: ${(e as Error).message}` };
  }
}

export async function findCities(clientId: number, q: string) {
  await requirePublisher();
  if (q.trim().length < 2) return { cities: [] };
  if (!(await hasMeta(clientId)) && isDryRun()) return { cities: [{ key: `sim-${q.toLowerCase()}`, name: `${q} (simulazione)`, country: "IT" }] };
  try {
    return { cities: await searchCities(await metaUserToken(clientId), q.trim()) };
  } catch (e) {
    return { error: (e as Error).message, cities: [] };
  }
}

const Settings = z.object({
  clientId: z.number().int().positive(),
  payer: z.enum(["cliente", "golduck"]),
  adAccountId: z.string().regex(/^act_[\w]+$/).nullable(),
  adAccountName: z.string().max(200).nullable(),
  currency: z.string().length(3).nullable(),
  monthlyCap: z.number().min(0).max(1_000_000).nullable(),
  markup: z.number().min(1).max(5),
});

export async function saveAdsSettings(input: z.infer<typeof Settings>) {
  const me = await requirePublisher();
  const p = Settings.safeParse(input);
  if (!p.success) return { error: "Dati non validi: controlla account, tetto e ricarico" };
  const v = p.data;
  const [before] = await db.select().from(clients).where(eq(clients.id, v.clientId));
  if (!before) return { error: "Cliente non trovato" };
  const next = {
    adsPayer: v.payer,
    adAccountId: v.adAccountId,
    adAccountName: v.adAccountName,
    adAccountCurrency: v.currency,
    adsMonthlyCap: v.monthlyCap,
    adsMarkup: v.payer === "golduck" ? v.markup : 1,
  };
  await db.update(clients).set(next).where(eq(clients.id, v.clientId));
  const changes = diff(
    { pagatore: before.adsPayer, account: before.adAccountName ?? before.adAccountId, tetto: before.adsMonthlyCap, ricarico: before.adsMarkup },
    { pagatore: next.adsPayer, account: next.adAccountName ?? next.adAccountId, tetto: next.adsMonthlyCap, ricarico: next.adsMarkup },
  );
  await audit({
    userId: me.id,
    category: "canali",
    action: "sponsorizzate.impostazioni",
    description: `Sponsorizzate: paga ${v.payer === "golduck" ? "Golduck (rifatturazione)" : "il cliente"}, account «${v.adAccountName ?? "nessuno"}»`,
    clientId: v.clientId,
    meta: changes,
  });
  revalidatePath(`/clienti/${v.clientId}/canali`);
  return { ok: true };
}

const Launch = z.object({
  clientId: z.number().int().positive(),
  publicationId: z.number().int().positive(),
  objective: z.enum(["notorieta", "interazione", "traffico"]),
  budget: z.number().min(1).max(100_000),
  days: z.number().int().min(1).max(90),
  city: z.object({ key: z.string().max(60), name: z.string().max(200), radiusKm: z.number().int().min(1).max(80) }).nullable(),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
});

export async function startSponsorship(input: z.infer<typeof Launch>) {
  const me = await requirePublisher();
  const p = Launch.safeParse(input);
  if (!p.success || p.data.ageMax < p.data.ageMin) return { error: "Dati non validi: budget, durata, età o zona" };
  const v = p.data;
  const [client] = await db.select({ name: clients.name, payer: clients.adsPayer, currency: clients.adAccountCurrency }).from(clients).where(eq(clients.id, v.clientId));
  try {
    const r = await launchSponsorship({ ...v, city: v.city ?? undefined, userId: me.id });
    await audit({
      userId: me.id,
      category: "contenuti",
      action: r.simulated ? "sponsorizzata.simulata" : "sponsorizzata.avviata",
      description: `${r.simulated ? "Simulata" : "Avviata"} una sponsorizzata da ${v.budget} ${client?.currency ?? "EUR"} per ${v.days} giorni (${v.objective}) · paga ${client?.payer === "golduck" ? "Golduck" : "il cliente"}`,
      clientId: v.clientId,
      target: `sponsorizzata:${r.id}`,
      meta: { pubblicazione: v.publicationId, zona: v.city?.name ?? "Italia", eta: `${v.ageMin}-${v.ageMax}` },
    });
    revalidatePath("/sponsorizzate");
    return { ok: true, simulated: r.simulated };
  } catch (e) {
    await audit({ userId: me.id, category: "errori", action: "sponsorizzata.errore", description: `Sponsorizzata non avviata: ${(e as Error).message}`.slice(0, 500), clientId: v.clientId });
    return { error: (e as Error).message };
  }
}

export async function changeSponsorship(id: number, action: "pausa" | "riprendi" | "termina") {
  const me = await requirePublisher();
  const [c] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id));
  if (!c) return { error: "Sponsorizzata non trovata" };
  try {
    const status = await changeSponsorshipStatus(c, action);
    await audit({ userId: me.id, category: "contenuti", action: `sponsorizzata.${action}`, description: `Sponsorizzata ${action === "pausa" ? "messa in pausa" : action === "riprendi" ? "riattivata" : "terminata"}`, clientId: c.clientId, target: `sponsorizzata:${id}` });
    revalidatePath("/sponsorizzate");
    return { ok: true, status };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function refreshSponsorships(clientId: number) {
  await requirePublisher();
  try {
    const errors = await syncAds(clientId);
    return errors.length ? { error: errors[0] } : { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
