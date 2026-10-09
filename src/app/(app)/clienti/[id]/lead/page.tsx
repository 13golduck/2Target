import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, leadEvents, leads, marketingCosts } from "@/db/schema";
import { funnelBySource, funnelStats } from "@/lib/leads";
import { appUrl } from "@/lib/integrations/config";
import { nowDate } from "@/lib/format";
import { LeadsView } from "./leads-view";

export const metadata = { title: "Lead" };

const PERIODS = {
  mese: "Questo mese",
  "mese-prec": "Mese scorso",
  trimestre: "Ultimi 3 mesi",
  anno: "Ultimi 12 mesi",
} as const;

function range(key: keyof typeof PERIODS, now: Date) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const endOfToday = new Date(Date.UTC(y, m, now.getUTCDate(), 23, 59, 59));
  if (key === "mese-prec") return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
  if (key === "trimestre") return { from: new Date(Date.UTC(y, m - 2, 1)), to: endOfToday };
  if (key === "anno") return { from: new Date(Date.UTC(y, m - 11, 1)), to: endOfToday };
  return { from: new Date(Date.UTC(y, m, 1)), to: endOfToday };
}

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const clientId = Number((await params).id);
  const sp = await searchParams;
  const period = (sp.periodo && sp.periodo in PERIODS ? sp.periodo : "mese") as keyof typeof PERIODS;
  const now = nowDate();
  const { from, to } = range(period, now);

  const [client] = await db.select({ leadToken: clients.leadToken }).from(clients).where(eq(clients.id, clientId));
  const rows = await db.select().from(leads).where(eq(leads.clientId, clientId)).orderBy(desc(leads.receivedAt));
  const events = await db
    .select({ leadId: leadEvents.leadId, toStage: leadEvents.toStage })
    .from(leadEvents)
    .where(sql`${leadEvents.leadId} in (select id from leads where client_id = ${clientId})`);
  const costRows = await db.select().from(marketingCosts).where(eq(marketingCosts.clientId, clientId)).orderBy(desc(marketingCosts.month));

  const L = rows.map((l) => ({ id: l.id, source: l.source, stage: l.stage, receivedAt: l.receivedAt, wonAt: l.wonAt, wonValue: l.wonValue, estimatedValue: l.estimatedValue, lostReason: l.lostReason }));
  const C = costRows.map((c) => ({ month: c.month, source: c.source, kind: c.kind, amount: c.amount }));

  // Andamento degli ultimi 6 mesi
  const trend = Array.from({ length: 6 }, (_, i) => {
    const f = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const t = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0, 23, 59, 59));
    const s = funnelStats(L, events, C, f, t);
    return { month: f.toISOString().slice(0, 7), leads: s.leads, customers: s.customers, cost: s.cost, cpl: s.cpl, cac: s.cac, revenue: s.revenue };
  });

  // In pipeline: tutti i lead aperti + quelli chiusi nel periodo
  const inPeriod = (d: Date | null) => !!d && d >= from && d <= to;
  const pipeline = rows.filter((l) => !["vinto", "perso"].includes(l.stage) || inPeriod(l.receivedAt) || inPeriod(l.wonAt) || inPeriod(l.stageChangedAt));

  return (
    <LeadsView
      clientId={clientId}
      period={period}
      periods={PERIODS}
      stats={funnelStats(L, events, C, from, to)}
      bySource={funnelBySource(L, events, C, from, to)}
      trend={trend}
      leads={pipeline.map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company,
        email: l.email,
        phone: l.phone,
        message: l.message,
        source: l.source,
        stage: l.stage,
        utmCampaign: l.utmCampaign,
        landingUrl: l.landingUrl,
        estimatedValue: l.estimatedValue,
        wonValue: l.wonValue,
        lostReason: l.lostReason,
        notes: l.notes,
        receivedAt: l.receivedAt.toISOString(),
        stageChangedAt: l.stageChangedAt?.toISOString() ?? null,
      }))}
      costs={costRows.slice(0, 50).map((c) => ({ id: c.id, month: c.month, source: c.source, kind: c.kind, amount: c.amount, notes: c.notes }))}
      intake={client?.leadToken ? `${appUrl()}/api/lead/${client.leadToken}` : null}
    />
  );
}
