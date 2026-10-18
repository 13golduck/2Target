import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { adCampaigns, adSpendDaily, clients, leads } from "@/db/schema";
import { clientAdsExposure, toEur } from "@/lib/ads/ads";
import { campaignRoi } from "@/lib/ads/roi";
import { buildAdvice } from "@/lib/ads/advice";
import { requireUser, userCanPublish } from "@/lib/auth";
import { isDryRun } from "@/lib/publishing/meta-publish";
import { isViewer } from "@/lib/roles";
import { AdsView } from "./ads-view";

export const metadata = { title: "Sponsorizzate" };

const DAY = 86_400_000;

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const me = await requireUser();
  if (isViewer(me.role)) redirect("/");
  const { mese } = await searchParams;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(mese ?? "") ? mese! : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  // Spesa del mese per campagna e per giorno (in euro, da ad_spend_daily)
  const spend = await db
    .select({ campaignId: adSpendDaily.campaignId, eur: sql<string>`sum(${adSpendDaily.spendEur})` })
    .from(adSpendDaily)
    .where(and(gte(adSpendDaily.day, from), lt(adSpendDaily.day, to)))
    .groupBy(adSpendDaily.campaignId);
  const spentIds = spend.map((s) => s.campaignId);
  const daily = await db
    .select({ day: adSpendDaily.day, eur: sql<string>`sum(${adSpendDaily.spendEur})` })
    .from(adSpendDaily)
    .where(and(gte(adSpendDaily.day, from), lt(adSpendDaily.day, to)))
    .groupBy(adSpendDaily.day)
    .orderBy(asc(adSpendDaily.day));

  // Campagne del mese: quelle con spesa nel mese o ancora aperte, più le ultime create
  const list = await db
    .select({ c: adCampaigns, clientName: clients.name, markup: clients.adsMarkup })
    .from(adCampaigns)
    .innerJoin(clients, eq(clients.id, adCampaigns.clientId))
    .where(
      spentIds.length
        ? sql`${inArray(adCampaigns.id, spentIds)} or ${inArray(adCampaigns.status, ["in_avvio", "attiva", "in_pausa"])} or (${adCampaigns.startAt} >= ${from} and ${adCampaigns.startAt} < ${to})`
        : sql`${inArray(adCampaigns.status, ["in_avvio", "attiva", "in_pausa"])} or (${adCampaigns.startAt} >= ${from} and ${adCampaigns.startAt} < ${to})`,
    )
    .orderBy(desc(adCampaigns.id))
    .limit(500);

  const monthEur = (id: number) => Number(spend.find((s) => s.campaignId === id)?.eur ?? 0);

  // ROI: lead attribuiti a ogni campagna (moduli Meta e utm_campaign=2t-<id> dal sito), spesa totale in euro
  const active = await db.select().from(adCampaigns).where(eq(adCampaigns.status, "attiva"));
  const roiIds = [...new Set([...list.map(({ c }) => c.id), ...active.map((c) => c.id)])];
  const campaignLeads = roiIds.length
    ? await db
        .select({ adCampaignId: leads.adCampaignId, stage: leads.stage, wonValue: leads.wonValue, estimatedValue: leads.estimatedValue })
        .from(leads)
        .where(inArray(leads.adCampaignId, roiIds))
    : [];
  const roiOf = async (c: typeof adCampaigns.$inferSelect) =>
    campaignRoi(await toEur(c.spend, c.currency), campaignLeads.filter((l) => l.adCampaignId === c.id));

  // Rifatturazione: solo le campagne pagate da Golduck, per cliente, con il ricarico del cliente
  const rebill = new Map<number, { clientId: number; clientName: string; markup: number; spend: number; campaigns: number }>();
  for (const { c, clientName, markup } of list) {
    if (c.payer !== "golduck" || c.simulated) continue;
    const eur = monthEur(c.id);
    if (!eur) continue;
    const r = rebill.get(c.clientId) ?? { clientId: c.clientId, clientName, markup, spend: 0, campaigns: 0 };
    r.spend += eur;
    r.campaigns += 1;
    rebill.set(c.clientId, r);
  }

  // Indicatori del mese. I totali di clic e impressioni sono quelli complessivi delle campagne in elenco
  // (Meta li dà per l'intera durata): bastano per CTR e CPC medi; la spesa è quella del mese.
  const real = list.filter(({ c }) => !c.simulated).map(({ c }) => c);
  const sumResult = (k: string) => real.reduce((t, c) => t + (c.results?.[k] ?? 0), 0);
  const totalSpendAll = real.reduce((t, c) => t + c.spend, 0);
  const clicks = sumResult("clic");
  const impressions = sumResult("impressioni");
  const [{ n: metaLeads }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.source, "meta_ads"), gte(leads.receivedAt, new Date(`${from}T00:00:00Z`)), lt(leads.receivedAt, new Date(`${to}T00:00:00Z`))));
  const leadSpend = real.filter((c) => c.kind === "contatti").reduce((t, c) => t + monthEur(c.id), 0);
  const monthSpend = spend.reduce((t, s) => t + Number(s.eur), 0);
  const rois = await Promise.all(real.map((c) => roiOf(c)));
  const roiSpend = rois.reduce((t, r) => t + r.spend, 0);
  const roiRevenue = rois.reduce((t, r) => t + r.revenue, 0);
  const kpi = {
    revenue: Math.round(roiRevenue * 100) / 100,
    roas: roiSpend > 0 && roiRevenue > 0 ? Math.round((roiRevenue / roiSpend) * 100) / 100 : null,
    spend: Math.round(monthSpend * 100) / 100,
    active: list.filter(({ c }) => c.status === "attiva").length,
    leads: Number(metaLeads),
    costPerLead: Number(metaLeads) > 0 && leadSpend > 0 ? Math.round((leadSpend / Number(metaLeads)) * 100) / 100 : null,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
    cpc: clicks > 0 ? Math.round((totalSpendAll / clicks) * 100) / 100 : null,
  };

  // Consigli: sulle campagne attive (di qualsiasi mese) e sui clienti che fanno sponsorizzate
  // Consigli anche sulle campagne finite da almeno 30 giorni (il tempo di chiudere le vendite): si sono ripagate?
  const ended = await db
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.status, "terminata"), eq(adCampaigns.simulated, false), gte(adCampaigns.endAt, new Date(now.getTime() - 90 * DAY)), lt(adCampaigns.endAt, new Date(now.getTime() - 30 * DAY))));
  const endedLeads = ended.length
    ? await db.select({ adCampaignId: leads.adCampaignId, stage: leads.stage, wonValue: leads.wonValue, estimatedValue: leads.estimatedValue }).from(leads).where(inArray(leads.adCampaignId, ended.map((c) => c.id)))
    : [];
  const adClients = await db
    .select({ id: clients.id, name: clients.name, monthlyCap: clients.adsMonthlyCap })
    .from(clients)
    .where(isNotNull(clients.adAccountId))
    .orderBy(asc(clients.name));
  const waiting = adClients.length
    ? await db
        .select({ clientId: leads.clientId, n: sql<number>`count(*)` })
        .from(leads)
        .where(and(inArray(leads.clientId, adClients.map((c) => c.id)), eq(leads.source, "meta_ads"), eq(leads.stage, "nuovo"), lt(leads.receivedAt, new Date(now.getTime() - DAY))))
        .groupBy(leads.clientId)
    : [];
  const adviceClients = await Promise.all(
    adClients.map(async (c) => ({
      ...c,
      ...(await clientAdsExposure(c.id)),
      leadsWaiting: Number(waiting.find((w) => w.clientId === c.id)?.n ?? 0),
    })),
  );
  const forAdvice = await Promise.all(
    [...active, ...ended].map(async (c) => ({
      ...c,
      name: c.name ?? `Sponsorizzata ${c.id}`,
      roi: campaignRoi(await toEur(c.spend, c.currency), [...campaignLeads, ...endedLeads].filter((l) => l.adCampaignId === c.id)),
    })),
  );
  // Nomi di tutti i clienti citati nei consigli (anche chi oggi non ha più l'account pubblicitario impostato)
  const adviceClientIds = [...new Set([...adClients.map((c) => c.id), ...forAdvice.map((c) => c.clientId)])];
  const names = new Map(
    adviceClientIds.length ? (await db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, adviceClientIds))).map((c) => [c.id, c.name]) : [],
  );
  const advice = buildAdvice(
    forAdvice,
    adviceClients,
    now,
  ).map((a) => ({ ...a, clientName: names.get(a.clientId) ?? "" }));

  return (
    <AdsView
      month={month}
      dryRun={isDryRun()}
      canPublish={await userCanPublish(me)}
      kpi={kpi}
      advice={advice}
      daily={daily.map((d) => ({ day: d.day, eur: Math.round(Number(d.eur) * 100) / 100 }))}
      adClients={adClients.map((c) => ({ id: c.id, name: c.name }))}
      rebill={[...rebill.values()].map((r) => ({ ...r, spend: Math.round(r.spend * 100) / 100, invoice: Math.round(r.spend * r.markup * 100) / 100 })).sort((a, b) => a.clientName.localeCompare(b.clientName))}
      campaigns={await Promise.all(list.map(async ({ c, clientName }) => ({
        ...c,
        roi: c.simulated ? null : await roiOf(c),
        clientName,
        monthSpend: monthEur(c.id),
        startAt: c.startAt.toISOString(),
        endAt: c.endAt.toISOString(),
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        createdAt: undefined,
        updatedAt: undefined,
      })))}
    />
  );
}
