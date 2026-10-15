import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { adCampaigns, adSpendDaily, clients, connections, publications, socialAccounts } from "@/db/schema";
import { fxRate } from "@/lib/ai/budget";
import { META } from "@/lib/integrations/config";
import { getJson, qs } from "@/lib/integrations/http";
import { accessToken } from "@/lib/integrations/sync";
import { isDryRun } from "@/lib/publishing/meta-publish";
import { decryptSecret } from "@/lib/secret-box";
import * as metaAds from "./meta-ads";

// Sponsorizzate: regole di 2Target sopra la Marketing API.
// - chi paga è deciso nella scheda del cliente e fissato al lancio;
// - tetto mensile per cliente (spesa del mese + budget residui delle campagne attive);
// - in simulazione (locale, o pubblicazione reale spenta) non si contatta Meta e non si spende nulla.

type Campaign = typeof adCampaigns.$inferSelect;

/** Token utente Meta del cliente (serve per gli account pubblicitari: il token di pagina non basta). */
export async function metaUserToken(clientId: number) {
  const list = await db.select().from(connections).where(and(eq(connections.clientId, clientId), eq(connections.provider, "meta"), eq(connections.status, "attivo")));
  if (!list.length) throw new Error("Collega prima Meta in Canali: serve l'accesso con i permessi per le inserzioni");
  return accessToken(list[0]);
}

/** Da valuta dell'account a euro (gli account europei sono quasi sempre in euro). */
export async function toEur(amount: number, currency: string) {
  if (currency === "EUR") return amount;
  if (currency === "USD") return amount / (await fxRate()).usdPerEur;
  return amount;
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

/** Spesa del mese (€) e impegni residui delle campagne ancora attive (€). */
export async function clientAdsExposure(clientId: number) {
  const [spent] = await db
    .select({ total: sql<string | null>`sum(${adSpendDaily.spendEur})` })
    .from(adSpendDaily)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adSpendDaily.campaignId))
    .where(and(eq(adCampaigns.clientId, clientId), gte(adSpendDaily.day, monthStart())));
  const open = await db
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.clientId, clientId), inArray(adCampaigns.status, ["in_avvio", "attiva", "in_pausa"])));
  let committed = 0;
  for (const c of open) committed += await toEur(Math.max(0, c.budget - c.spend), c.currency);
  return { spentMonth: Number(spent?.total ?? 0), committed };
}

async function pageInfo(channel: typeof socialAccounts.$inferSelect) {
  // Facebook: l'id del canale è la pagina. Instagram: la pagina collegata si ricava dal token di pagina.
  if (channel.platform === "facebook") return { pageId: channel.externalId!, instagramUserId: undefined };
  const pageToken = decryptSecret(channel.assetTokenEnc);
  if (!pageToken) throw new Error("Token della pagina mancante: ricollega Meta in Canali");
  const me = await getJson<{ id: string }>(`https://graph.facebook.com/${META.version}/me?${qs({ fields: "id", access_token: pageToken })}`);
  return { pageId: me.id, instagramUserId: channel.externalId! };
}

export type LaunchInput = {
  clientId: number;
  publicationId: number;
  objective: string;
  budget: number;
  days: number;
  city?: { key: string; name: string; radiusKm: number };
  ageMin: number;
  ageMax: number;
  userId: number;
};

export async function launchSponsorship(i: LaunchInput) {
  const [client] = await db.select().from(clients).where(eq(clients.id, i.clientId));
  if (!client?.adAccountId) throw new Error("Scegli prima l'account pubblicitario del cliente (Canali → Sponsorizzate)");
  const [pub] = await db.select().from(publications).where(and(eq(publications.id, i.publicationId), eq(publications.clientId, i.clientId)));
  if (!pub || pub.status !== "pubblicata" || !pub.externalId) throw new Error("Si possono sponsorizzare solo post già pubblicati da 2Target");
  const [channel] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, pub.socialAccountId));
  if (!channel || !["facebook", "instagram"].includes(channel.platform)) throw new Error("Canale non valido per le sponsorizzate");

  const currency = client.adAccountCurrency ?? "EUR";
  const budgetEur = await toEur(i.budget, currency);
  if (client.adsMonthlyCap != null) {
    const x = await clientAdsExposure(i.clientId);
    if (x.spentMonth + x.committed + budgetEur > client.adsMonthlyCap + 0.005) {
      throw new Error(
        `Supera il tetto mensile del cliente: già spesi ${x.spentMonth.toFixed(2)} € e impegnati ${x.committed.toFixed(2)} € su ${client.adsMonthlyCap.toFixed(2)} €`,
      );
    }
  }

  const startAt = new Date(Date.now() + 5 * 60_000);
  const endAt = new Date(startAt.getTime() + i.days * 86_400_000);
  const objective = metaAds.promotableObjective(i.objective) as Campaign["objective"];
  const simulated = isDryRun() || pub.externalId.startsWith("simulazione-");
  const [row] = await db.insert(adCampaigns).values({
    clientId: i.clientId,
    itemId: pub.itemId,
    publicationId: pub.id,
    platform: channel.platform as "facebook" | "instagram",
    payer: client.adsPayer,
    adAccountId: client.adAccountId,
    currency,
    objective,
    budget: i.budget,
    startAt,
    endAt,
    targeting: { ...(i.city && { city: i.city }), ageMin: i.ageMin, ageMax: i.ageMax },
    simulated,
    createdBy: i.userId,
  });
  const id = row.insertId;

  if (simulated) {
    await db.update(adCampaigns).set({ status: "attiva", metaCampaignId: `simulazione-${id}` }).where(eq(adCampaigns.id, id));
    return { id, simulated: true };
  }
  try {
    const token = await metaUserToken(i.clientId);
    const page = await pageInfo(channel);
    const r = await metaAds.boostPost({
      userToken: token,
      adAccountId: client.adAccountId,
      platform: channel.platform as "facebook" | "instagram",
      postId: pub.externalId,
      ...page,
      name: `${client.name} · ${pub.caption?.slice(0, 40) ?? `post ${pub.id}`}`,
      objective,
      budget: i.budget,
      startAt,
      endAt,
      city: i.city ? { key: i.city.key, radiusKm: i.city.radiusKm } : undefined,
      ageMin: i.ageMin,
      ageMax: i.ageMax,
    });
    await db.update(adCampaigns).set({ status: "attiva", metaCampaignId: r.campaignId, metaAdSetId: r.adSetId, metaAdId: r.adId }).where(eq(adCampaigns.id, id));
    return { id, simulated: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(adCampaigns).set({ status: "errore", error: message.slice(0, 1000) }).where(eq(adCampaigns.id, id));
    throw new Error(message);
  }
}

export async function changeSponsorshipStatus(campaign: Campaign, action: "pausa" | "riprendi" | "termina") {
  const next = action === "pausa" ? "in_pausa" : action === "riprendi" ? "attiva" : "terminata";
  if (!campaign.simulated && campaign.metaCampaignId) {
    const token = await metaUserToken(campaign.clientId);
    await metaAds.setCampaignStatus(token, campaign.metaCampaignId, action === "pausa" ? "PAUSED" : action === "riprendi" ? "ACTIVE" : "DELETED");
  }
  await db.update(adCampaigns).set({ status: next }).where(eq(adCampaigns.id, campaign.id));
  return next;
}

/** Aggiorna spesa e risultati delle sponsorizzate del cliente (sincronizzazione notturna e «Aggiorna»). */
export async function syncAds(clientId: number) {
  const list = await db
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.clientId, clientId), eq(adCampaigns.simulated, false), inArray(adCampaigns.status, ["attiva", "in_pausa", "terminata"])));
  // Le terminate si rileggono per 7 giorni (Meta consolida la spesa con qualche giorno di ritardo)
  const recent = list.filter((c) => c.status !== "terminata" || Date.now() - c.endAt.getTime() < 7 * 86_400_000);
  if (!recent.length) return [];
  const token = await metaUserToken(clientId);
  const errors: string[] = [];
  for (const c of recent) {
    if (!c.metaCampaignId) continue;
    try {
      const since = c.startAt.toISOString().slice(0, 10);
      const until = new Date(Math.min(Date.now(), c.endAt.getTime())).toISOString().slice(0, 10);
      const r = await metaAds.campaignInsights(token, c.metaCampaignId, since, until);
      for (const d of r.daily) {
        const spendEur = Math.round((await toEur(d.spend, c.currency)) * 100) / 100;
        await db.insert(adSpendDaily).values({ campaignId: c.id, day: d.day, spendEur }).onDuplicateKeyUpdate({ set: { spendEur } });
      }
      const status =
        c.endAt.getTime() < Date.now() || ["DELETED", "ARCHIVED"].includes(r.effectiveStatus) ? "terminata" : r.effectiveStatus.includes("PAUSED") ? "in_pausa" : "attiva";
      await db.update(adCampaigns).set({ spend: r.spend, results: r.results, status, lastSyncAt: new Date(), error: null }).where(eq(adCampaigns.id, c.id));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(message);
      await db.update(adCampaigns).set({ error: message.slice(0, 1000), lastSyncAt: new Date() }).where(eq(adCampaigns.id, c.id));
    }
  }
  return errors;
}
