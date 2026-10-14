import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, checkupQuestions, checkupSections, checkups, clients } from "@/db/schema";
import { CHECKUP_SECTIONS } from "@/lib/checkup-template";
import { isAiConfigured } from "@/lib/ai/claude";
import { isRunning } from "@/lib/ai/jobs";
import { CheckupView } from "./checkup-view";

export const metadata = { title: "Check-up" };

export default async function CheckupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ id?: string; nuovo?: string; archiviati?: string }> }) {
  const clientId = Number((await params).id);
  const sp = await searchParams;
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));

  // Storico: tutti i check-up del cliente, con il costo AI di ciascuno
  const all = await db.select().from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id));
  const costs = all.length
    ? await db
        .select({ checkupId: aiRuns.checkupId, cost: sql<string>`sum(${aiRuns.costEur})` })
        .from(aiRuns)
        .where(eq(aiRuns.clientId, clientId))
        .groupBy(aiRuns.checkupId)
    : [];
  const history = all.map((c) => ({
    id: c.id,
    period: c.period,
    status: c.status,
    aiMode: c.aiMode,
    aiState: c.aiState,
    createdAt: c.createdAt.toISOString(),
    completedAt: c.completedAt?.toISOString() ?? null,
    deliveredAt: c.deliveredAt?.toISOString() ?? null,
    costUsd: Number(costs.find((x) => x.checkupId === c.id)?.cost ?? 0),
    archived: !!c.archivedAt,
  }));
  // Si apre il più recente non archiviato; gli archiviati restano raggiungibili dallo storico
  const active = all.filter((c) => !c.archivedAt);
  const checkup = sp.nuovo ? undefined : (all.find((c) => c.id === Number(sp.id)) ?? active[0]);
  const sections = checkup ? await db.select().from(checkupSections).where(eq(checkupSections.checkupId, checkup.id)) : [];
  const questions = checkup
    ? await db.select().from(checkupQuestions).where(eq(checkupQuestions.checkupId, checkup.id)).orderBy(asc(checkupQuestions.round), asc(checkupQuestions.position))
    : [];
  const runs = checkup ? await db.select().from(aiRuns).where(eq(aiRuns.checkupId, checkup.id)).orderBy(asc(aiRuns.id)) : [];

  return (
    <CheckupView
      aiConfigured={isAiConfigured()}
      history={history}
      showArchived={sp.archiviati === "1"}
      isLatest={!checkup || checkup.id === active[0]?.id}
      previous={all.length && !checkup ? { period: all[0].period } : null}
      client={{
        id: client.id,
        name: client.name,
        sector: client.sector,
        website: client.website,
        vatNumber: client.vatNumber,
        city: client.city,
        contactName: client.contactName,
        socialLinks: client.socialLinks,
        notes: client.notes,
      }}
      checkup={
        checkup
          ? {
              id: checkup.id,
              title: checkup.title,
              period: checkup.period,
              status: checkup.status,
              deliveredAt: checkup.deliveredAt?.toISOString() ?? null,
              aiMode: checkup.aiMode,
              aiState: checkup.aiState,
              aiProgress: checkup.aiProgress,
              aiLog: checkup.aiLog ?? [],
              aiError: checkup.aiError,
              running: isRunning(checkup.id),
              archived: !!checkup.archivedAt,
              findings: checkup.findings ?? [],
              sources: checkup.sources ?? [],
              questionRound: checkup.questionRound,
              previousId: checkup.previousId,
              kpiSnapshot: checkup.kpiSnapshot ?? [],
              completedAt: checkup.completedAt?.toISOString() ?? null,
            }
          : null
      }
      questions={questions.map((q) => ({ id: q.id, round: q.round, topic: q.topic, question: q.question, why: q.why, options: q.options ?? [], answer: q.answer }))}
      runs={runs.map((r) => ({
        id: r.id,
        step: r.step,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        webSearches: r.webSearches,
        webFetches: r.webFetches,
        costUsd: r.costEur,
        durationMs: r.durationMs,
      }))}
      template={CHECKUP_SECTIONS}
      content={Object.fromEntries(sections.map((s) => [s.sectionKey, s.content]))}
    />
  );
}
