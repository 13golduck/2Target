"use server";

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { adCampaigns, adLeadForms, clients, connections, editorialItems, LEAD_FORM_FIELDS, mediaAssets, socialAccounts } from "@/db/schema";
import { changeSponsorshipStatus, clientAdsExposure, launchSponsorship, metaUserToken, syncAds } from "@/lib/ads/ads";
import { createClientLeadForm, launchNewCampaign, syncLeadForms } from "@/lib/ads/campaigns";
import { listAdAccounts, searchCities } from "@/lib/ads/meta-ads";
import { AD_BUTTONS } from "@/lib/ads/meta-campaigns";
import { audit, diff } from "@/lib/audit";
import { requireClientAccess, requireWriter, userCanPublish } from "@/lib/auth";
import { previewMediaUrl } from "@/lib/media";
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
    const leadsSync = await syncLeadForms(clientId);
    errors.push(...leadsSync.errors);
    return errors.length ? { error: errors[0] } : { ok: true, leads: leadsSync.added };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Campagne nuove e moduli contatti ──────────────────────────────────

/**
 * Tutto ciò che serve per comporre una campagna nuova del cliente: schede del piano con foto o video,
 * moduli contatti, impostazioni di pagamento e cosa è collegato (Pagina Facebook, Instagram).
 */
export async function loadCampaignSources(clientId: number) {
  await requirePublisher();
  await requireClientAccess(clientId);
  const [client] = await db
    .select({ name: clients.name, website: clients.website, adAccountId: clients.adAccountId, adAccountName: clients.adAccountName, currency: clients.adAccountCurrency, payer: clients.adsPayer, monthlyCap: clients.adsMonthlyCap, markup: clients.adsMarkup })
    .from(clients)
    .where(eq(clients.id, clientId));
  if (!client) return { error: "Cliente non trovato" };

  const media = await db
    .select({ id: mediaAssets.id, itemId: mediaAssets.itemId, kind: mediaAssets.kind, position: mediaAssets.position })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.clientId, clientId), isNotNull(mediaAssets.itemId)))
    .orderBy(asc(mediaAssets.position));
  const itemIds = [...new Set(media.map((m) => m.itemId!))];
  const items = itemIds.length
    ? await db
        .select({
          id: editorialItems.id,
          title: editorialItems.title,
          format: editorialItems.format,
          caption: editorialItems.caption,
          ctaUrl: editorialItems.ctaUrl,
          scheduledAt: editorialItems.scheduledAt,
          isPaid: editorialItems.isPaid,
          adObjective: editorialItems.adObjective,
          adBudget: editorialItems.adBudget,
          adDays: editorialItems.adDays,
        })
        .from(editorialItems)
        .where(and(inArray(editorialItems.id, itemIds), eq(editorialItems.clientId, clientId)))
        .orderBy(desc(editorialItems.scheduledAt))
        .limit(80)
    : [];
  const forms = await db.select().from(adLeadForms).where(eq(adLeadForms.clientId, clientId)).orderBy(desc(adLeadForms.id));
  const channels = await db
    .select({ platform: socialAccounts.platform })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, clientId), inArray(socialAccounts.platform, ["facebook", "instagram"]), eq(socialAccounts.connected, true)));
  const exposure = await clientAdsExposure(clientId);

  return {
    client: { ...client, ...exposure },
    hasPage: channels.some((c) => c.platform === "facebook"),
    hasInstagram: channels.some((c) => c.platform === "instagram"),
    items: items.map((i) => ({
      ...i,
      scheduledAt: i.scheduledAt?.toISOString() ?? null,
      media: media.filter((m) => m.itemId === i.id).map((m) => ({ id: m.id, kind: m.kind, url: previewMediaUrl(m.id) })),
    })),
    forms: forms.map((f) => ({ id: f.id, name: f.name, fields: f.fields, customQuestion: f.customQuestion, simulated: f.simulated, leadsCount: f.leadsCount, lastLeadsSyncAt: f.lastLeadsSyncAt?.toISOString() ?? null })),
  };
}

const NewCampaign = z.object({
  clientId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  objective: z.enum(["notorieta", "traffico", "interazione", "contatti"]),
  placement: z.enum(["facebook", "instagram", "entrambi"]),
  creative: z.object({
    mediaIds: z.array(z.number().int().positive()).min(1).max(10),
    message: z.string().trim().min(1).max(2200),
    headline: z.string().trim().max(60).optional(),
    description: z.string().trim().max(90).optional(),
    link: z.string().trim().url().max(500).optional().or(z.literal("")),
    button: z.enum(Object.keys(AD_BUTTONS) as [string, ...string[]]),
  }),
  leadFormId: z.number().int().positive().nullable(),
  budget: z.number().min(1).max(100_000),
  days: z.number().int().min(1).max(90),
  city: z.object({ key: z.string().max(60), name: z.string().max(200), radiusKm: z.number().int().min(1).max(80) }).nullable(),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  gender: z.enum(["tutti", "uomini", "donne"]),
});

export async function startCampaign(input: z.infer<typeof NewCampaign>) {
  const me = await requirePublisher();
  const p = NewCampaign.safeParse(input);
  if (!p.success || p.data.ageMax < p.data.ageMin) return { error: "Dati non validi: controlla testi, link, budget, durata ed età" };
  const v = p.data;
  await requireClientAccess(v.clientId);
  try {
    const r = await launchNewCampaign({
      clientId: v.clientId,
      itemId: v.itemId,
      name: v.name,
      objective: v.objective,
      placement: v.placement,
      creative: { ...v.creative, link: v.creative.link || undefined },
      leadFormId: v.leadFormId ?? undefined,
      budget: v.budget,
      days: v.days,
      targeting: { ...(v.city && { city: v.city }), ageMin: v.ageMin, ageMax: v.ageMax, gender: v.gender },
      userId: me.id,
    });
    await audit({
      userId: me.id,
      category: "contenuti",
      action: r.simulated ? "campagna.simulata" : "campagna.avviata",
      description: `${r.simulated ? "Simulata" : "Avviata"} la campagna «${v.name}» (${v.objective}) da ${v.budget} € per ${v.days} giorni`,
      clientId: v.clientId,
      target: `sponsorizzata:${r.id}`,
      meta: { scheda: v.itemId, dove: v.placement, zona: v.city?.name ?? "Italia", eta: `${v.ageMin}-${v.ageMax}`, sesso: v.gender },
    });
    revalidatePath("/sponsorizzate");
    return { ok: true, simulated: r.simulated };
  } catch (e) {
    await audit({ userId: me.id, category: "errori", action: "campagna.errore", description: `Campagna non avviata: ${(e as Error).message}`.slice(0, 500), clientId: v.clientId });
    return { error: (e as Error).message };
  }
}

const NewForm = z.object({
  clientId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  fields: z.array(z.enum(LEAD_FORM_FIELDS)).max(4),
  customQuestion: z.string().trim().max(300).nullable(),
  intro: z.string().trim().max(500).nullable(),
  privacyUrl: z.string().trim().url().max(500),
  thankYou: z.string().trim().max(300).nullable(),
});

export async function createLeadFormAction(input: z.infer<typeof NewForm>) {
  const me = await requirePublisher();
  const p = NewForm.safeParse(input);
  if (!p.success) return { error: "Dati non validi: nome del modulo e indirizzo dell'informativa privacy (https://…)" };
  if (!p.data.fields.length && !p.data.customQuestion) return { error: "Il modulo deve avere almeno una domanda" };
  await requireClientAccess(p.data.clientId);
  try {
    const r = await createClientLeadForm({ ...p.data, userId: me.id });
    await audit({ userId: me.id, category: "canali", action: "modulo_contatti.creato", description: `${r.simulated ? "Simulato" : "Creato"} il modulo contatti «${p.data.name}»`, clientId: p.data.clientId });
    return { ok: true, id: r.id, simulated: r.simulated };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
