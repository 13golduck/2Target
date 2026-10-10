import { and, desc, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, clients } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isAdminRole, isViewer } from "@/lib/roles";
import { redirect } from "next/navigation";
import { budgetStatus } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { runningCount } from "@/lib/ai/jobs";
import { nowDate } from "@/lib/format";
import { UsageView } from "./usage-view";

export const metadata = { title: "Consumi AI" };

export default async function UsagePage() {
  const user = await requireUser();
  if (isViewer(user.role)) redirect("/");
  const now = nowDate();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const status = await budgetStatus();

  const byClient = await db
    .select({
      clientId: aiRuns.clientId,
      cost: sql<string>`sum(${aiRuns.costUsd})`,
      runs: sql<number>`count(*)`,
      checkups: sql<number>`count(distinct ${aiRuns.checkupId})`,
    })
    .from(aiRuns)
    .where(gte(aiRuns.createdAt, monthStart))
    .groupBy(aiRuns.clientId);
  const names = await db.select({ id: clients.id, name: clients.name }).from(clients);

  const [tokens] = await db
    .select({
      input: sql<string>`coalesce(sum(${aiRuns.inputTokens}), 0)`,
      cacheRead: sql<string>`coalesce(sum(${aiRuns.cacheReadTokens}), 0)`,
      cacheWrite: sql<string>`coalesce(sum(${aiRuns.cacheWriteTokens}), 0)`,
      output: sql<string>`coalesce(sum(${aiRuns.outputTokens}), 0)`,
      searches: sql<string>`coalesce(sum(${aiRuns.webSearches}), 0)`,
    })
    .from(aiRuns)
    .where(gte(aiRuns.createdAt, monthStart));

  // Ultimi 6 mesi
  const sixAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const monthly = await db
    .select({ month: sql<string>`date_format(${aiRuns.createdAt}, '%Y-%m')`, cost: sql<string>`sum(${aiRuns.costUsd})` })
    .from(aiRuns)
    .where(gte(aiRuns.createdAt, sixAgo))
    .groupBy(sql`date_format(${aiRuns.createdAt}, '%Y-%m')`);
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1)).toISOString().slice(0, 7));

  const recent = await db.select().from(aiRuns).orderBy(desc(aiRuns.id)).limit(40);

  // --- Analisi: previsione, confronto col mese scorso, dove va la spesa
  const dayMs = 86_400_000;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsedDays = Math.max(1, (now.getTime() - monthStart.getTime()) / dayMs);
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevSameDay = new Date(prevStart.getTime() + (now.getTime() - monthStart.getTime()));
  const [prev] = await db
    .select({ cost: sql<string>`coalesce(sum(${aiRuns.costUsd}), 0)` })
    .from(aiRuns)
    .where(and(gte(aiRuns.createdAt, prevStart), lt(aiRuns.createdAt, prevSameDay)));
  const prevCost = Number(prev.cost);
  const groupCost = async (col: typeof aiRuns.step | typeof aiRuns.model) =>
    db
      .select({ name: col, cost: sql<string>`sum(${aiRuns.costUsd})` })
      .from(aiRuns)
      .where(gte(aiRuns.createdAt, monthStart))
      .groupBy(col);
  const [steps, models, [ck]] = await Promise.all([
    groupCost(aiRuns.step),
    groupCost(aiRuns.model),
    db
      .select({ cost: sql<string>`coalesce(sum(${aiRuns.costUsd}), 0)`, n: sql<number>`count(distinct ${aiRuns.checkupId})` })
      .from(aiRuns)
      .where(and(gte(aiRuns.createdAt, monthStart), isNotNull(aiRuns.checkupId))),
  ]);
  // "Domande (2° giro)" e "Revisione: Buyer persona" contano come una fase sola
  const stepName = (s: string) => s.replace(/\s*\(\d+° giro\)$/, "").replace(/^Revisione:.*$/, "Revisioni");
  const stepTotals = new Map<string, number>();
  for (const r of steps) stepTotals.set(stepName(r.name), (stepTotals.get(stepName(r.name)) ?? 0) + Number(r.cost));
  const top = (list: { name: string; cost: number }[]) => {
    const best = list.sort((a, b) => b.cost - a.cost)[0];
    return best && status.month > 0 ? { ...best, share: best.cost / status.month } : null;
  };
  const clientRows = byClient.map((c) => ({ name: names.find((n) => n.id === c.clientId)?.name ?? "—", cost: Number(c.cost) }));
  const totalIn = Number(tokens.input) + Number(tokens.cacheRead) + Number(tokens.cacheWrite);
  const insights = {
    forecast: (status.month / elapsedDays) * daysInMonth,
    trendPct: prevCost > 0 ? (status.month - prevCost) / prevCost : null,
    checkups: Number(ck.n),
    avgCheckup: Number(ck.n) ? Number(ck.cost) / Number(ck.n) : 0,
    topStep: top([...stepTotals].map(([name, cost]) => ({ name, cost }))),
    topModel: top(models.map((m) => ({ name: m.name, cost: Number(m.cost) }))),
    topClient: top(clientRows),
    cacheShare: totalIn ? Number(tokens.cacheRead) / totalIn : 0,
  };

  return (
    <UsageView
      isAdmin={isAdminRole(user.role)}
      configured={isAiConfigured()}
      running={runningCount()}
      status={status}
      tokens={{ input: Number(tokens.input), cacheRead: Number(tokens.cacheRead), cacheWrite: Number(tokens.cacheWrite), output: Number(tokens.output), searches: Number(tokens.searches) }}
      monthly={months.map((m) => ({ month: m, cost: Number(monthly.find((x) => x.month === m)?.cost ?? 0) }))}
      byClient={byClient
        .map((c) => ({ name: names.find((n) => n.id === c.clientId)?.name ?? "—", cost: Number(c.cost), runs: Number(c.runs), checkups: Number(c.checkups) }))
        .sort((a, b) => b.cost - a.cost)}
      insights={insights}
      recent={recent.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        client: names.find((n) => n.id === r.clientId)?.name ?? "—",
        step: r.step,
        model: r.model,
        input: r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens,
        cacheRead: r.cacheReadTokens,
        output: r.outputTokens,
        searches: r.webSearches,
        cost: r.costUsd,
      }))}
    />
  );
}
