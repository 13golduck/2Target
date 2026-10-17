import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { editorialPlans, ideas, ideaVotes, FORMATS } from "@/db/schema";
import { FUNNEL_STAGES } from "@/lib/funnel";
import { IdeasBoard } from "./ideas-board";

export const metadata = { title: "Idee" };

export default async function IdeasPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const list = await db.select().from(ideas).where(eq(ideas.clientId, clientId)).orderBy(desc(ideas.updatedAt));
  const votes = list.length
    ? await db
        .select({ ideaId: ideaVotes.ideaId, score: sql<number>`sum(${ideaVotes.value})` })
        .from(ideaVotes)
        .where(inArray(ideaVotes.ideaId, list.map((i) => i.id)))
        .groupBy(ideaVotes.ideaId)
    : [];
  const plans = await db
    .select({ id: editorialPlans.id, name: editorialPlans.name })
    .from(editorialPlans)
    .where(eq(editorialPlans.clientId, clientId))
    .orderBy(desc(editorialPlans.startsOn));

  return (
    <IdeasBoard
      clientId={clientId}
      ideas={list.map((i) => ({
        id: i.id,
        title: i.title,
        format: i.format,
        stage: i.stage,
        status: i.status,
        origin: i.origin,
        evidence: i.checkupId ? (i.evidence ?? "") : null,
        score: Number(votes.find((v) => v.ideaId === i.id)?.score ?? 0),
      }))}
      plans={plans}
      formats={[...FORMATS]}
      stages={FUNNEL_STAGES.map(({ key, label }) => ({ key, label }))}
    />
  );
}
