import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { adCampaigns, adSpendDaily, clients } from "@/db/schema";
import { requireUser, userCanPublish } from "@/lib/auth";
import { isDryRun } from "@/lib/publishing/meta-publish";
import { isViewer } from "@/lib/roles";
import { AdsView } from "./ads-view";

export const metadata = { title: "Sponsorizzate" };

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const me = await requireUser();
  if (isViewer(me.role)) redirect("/");
  const { mese } = await searchParams;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(mese ?? "") ? mese! : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  // Spesa del mese per campagna (in euro, da ad_spend_daily)
  const spend = await db
    .select({ campaignId: adSpendDaily.campaignId, eur: sql<string>`sum(${adSpendDaily.spendEur})` })
    .from(adSpendDaily)
    .where(and(gte(adSpendDaily.day, from), lt(adSpendDaily.day, to)))
    .groupBy(adSpendDaily.campaignId);
  const spentIds = spend.map((s) => s.campaignId);

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

  return (
    <AdsView
      month={month}
      dryRun={isDryRun()}
      canPublish={await userCanPublish(me)}
      rebill={[...rebill.values()].map((r) => ({ ...r, spend: Math.round(r.spend * 100) / 100, invoice: Math.round(r.spend * r.markup * 100) / 100 })).sort((a, b) => a.clientName.localeCompare(b.clientName))}
      campaigns={list.map(({ c, clientName }) => ({
        ...c,
        clientName,
        monthSpend: monthEur(c.id),
        startAt: c.startAt.toISOString(),
        endAt: c.endAt.toISOString(),
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        createdAt: undefined,
        updatedAt: undefined,
      }))}
    />
  );
}
