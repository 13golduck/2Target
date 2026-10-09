import { desc, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, clients } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { budgetStatus } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { runningCount } from "@/lib/ai/jobs";
import { nowDate } from "@/lib/format";
import { UsageView } from "./usage-view";

export const metadata = { title: "Consumi AI" };

export default async function UsagePage() {
  const user = await requireUser();
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

  return (
    <UsageView
      isAdmin={user.role === "admin"}
      configured={isAiConfigured()}
      running={runningCount()}
      status={status}
      tokens={{ input: Number(tokens.input), cacheRead: Number(tokens.cacheRead), cacheWrite: Number(tokens.cacheWrite), output: Number(tokens.output), searches: Number(tokens.searches) }}
      monthly={months.map((m) => ({ month: m, cost: Number(monthly.find((x) => x.month === m)?.cost ?? 0) }))}
      byClient={byClient
        .map((c) => ({ name: names.find((n) => n.id === c.clientId)?.name ?? "—", cost: Number(c.cost), runs: Number(c.runs), checkups: Number(c.checkups) }))
        .sort((a, b) => b.cost - a.cost)}
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
