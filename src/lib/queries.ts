import "server-only";
import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { clients, kpiMeasurements, kpis } from "@/db/schema";
import { evaluateKpi, worstStatus, type KpiEvaluation } from "./kpi";
import { METRIC_BY_KEY } from "./kpi-catalog";

export type KpiRow = typeof kpis.$inferSelect & {
  unit: string;
  latest: typeof kpiMeasurements.$inferSelect | null;
  evaluation: KpiEvaluation;
};

/** KPI attivi dei clienti indicati, con l'ultima misura e lo stato del semaforo. */
export async function kpisWithStatus(clientIds: number[]): Promise<KpiRow[]> {
  if (clientIds.length === 0) return [];
  const rows = await db.select().from(kpis).where(inArray(kpis.clientId, clientIds));
  const active = rows.filter((k) => k.active);
  if (active.length === 0) return [];
  const measures = await db
    .select()
    .from(kpiMeasurements)
    .where(inArray(kpiMeasurements.kpiId, active.map((k) => k.id)))
    .orderBy(desc(kpiMeasurements.periodEnd), desc(kpiMeasurements.id));

  return active.map((k) => {
    const latest = measures.find((m) => m.kpiId === k.id) ?? null;
    return {
      ...k,
      unit: METRIC_BY_KEY[k.metricKey]?.unit ?? "n",
      latest,
      evaluation: evaluateKpi(
        latest?.value,
        { direction: k.direction, target: k.target, warnRatio: k.warnRatio, criticalRatio: k.criticalRatio, minSample: k.minSample },
        latest?.sample,
      ),
    };
  });
}

export async function getClient(id: number) {
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return client ?? null;
}

export const clientStatus = (rows: KpiRow[], clientId: number) =>
  worstStatus(rows.filter((r) => r.clientId === clientId).map((r) => r.evaluation.status));
