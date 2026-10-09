import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { kpiMeasurements } from "@/db/schema";
import { METRICS } from "@/lib/kpi-catalog";
import { kpisWithStatus } from "@/lib/queries";
import { KpiView } from "./kpi-view";

export const metadata = { title: "KPI" };

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const rows = await kpisWithStatus([clientId]);
  const history = rows.length
    ? await db
        .select()
        .from(kpiMeasurements)
        .where(inArray(kpiMeasurements.kpiId, rows.map((r) => r.id)))
        .orderBy(asc(kpiMeasurements.periodEnd))
    : [];

  const kpis = rows.map((k) => ({
    id: k.id,
    label: k.label,
    scope: k.scope,
    platform: k.platform,
    direction: k.direction,
    unit: k.unit,
    baseline: k.baseline,
    target: k.target,
    minSample: k.minSample,
    status: k.evaluation.status,
    score: k.evaluation.score,
    message: k.evaluation.message,
    latest: k.latest && { value: k.latest.value, periodStart: k.latest.periodStart, periodEnd: k.latest.periodEnd },
    history: history.filter((h) => h.kpiId === k.id).map((h) => ({ x: h.periodEnd, y: h.value })),
  }));

  const metrics = METRICS.map(({ key, label, scope, unit }) => ({ key, label, scope, unit }));
  return <KpiView clientId={clientId} kpis={kpis} metrics={metrics} />;
}
