import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, checkupQuestions, checkupSections, checkups, clients } from "@/db/schema";
import { CHECKUP_SECTIONS } from "@/lib/checkup-template";
import { isAiConfigured } from "@/lib/ai/claude";
import { isRunning } from "@/lib/ai/jobs";
import { CheckupView } from "./checkup-view";

export const metadata = { title: "Check-up" };

export default async function CheckupPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  const [checkup] = await db.select().from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id)).limit(1);
  const sections = checkup ? await db.select().from(checkupSections).where(eq(checkupSections.checkupId, checkup.id)) : [];
  const questions = checkup
    ? await db.select().from(checkupQuestions).where(eq(checkupQuestions.checkupId, checkup.id)).orderBy(asc(checkupQuestions.round), asc(checkupQuestions.position))
    : [];
  const runs = checkup ? await db.select().from(aiRuns).where(eq(aiRuns.checkupId, checkup.id)).orderBy(asc(aiRuns.id)) : [];

  return (
    <CheckupView
      aiConfigured={isAiConfigured()}
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
              findings: checkup.findings ?? [],
              sources: checkup.sources ?? [],
              questionRound: checkup.questionRound,
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
        costUsd: r.costUsd,
        durationMs: r.durationMs,
      }))}
      template={CHECKUP_SECTIONS}
      content={Object.fromEntries(sections.map((s) => [s.sectionKey, s.content]))}
    />
  );
}
