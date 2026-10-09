import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { editorialPlans, ideas, ideaVotes, FORMATS, FUNNEL } from "@/db/schema";
import { FUNNEL_STAGES } from "@/lib/funnel";
import { addIdea, planIdea, setIdeaStatus, voteIdea } from "../../../actions";

const COLUMNS = [
  { key: "idea", label: "Idee" },
  { key: "in_sviluppo", label: "In sviluppo" },
  { key: "approvata", label: "Approvate" },
  { key: "pianificata", label: "Nel piano" },
] as const;
const NEXT: Record<string, string | null> = { idea: "in_sviluppo", in_sviluppo: "approvata", approvata: null, pianificata: null };
const ORIGIN = { team: "team", ai: "AI", cliente: "cliente" } as const;

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
  const score = (id: number) => Number(votes.find((v) => v.ideaId === id)?.score ?? 0);
  const plans = await db.select().from(editorialPlans).where(eq(editorialPlans.clientId, clientId)).orderBy(desc(editorialPlans.startsOn));
  const discarded = list.filter((i) => i.status === "scartata").length;

  return (
    <div className="space-y-5">
      <form action={addIdea} className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input type="hidden" name="clientId" value={clientId} />
        <input name="title" required placeholder="Nuova idea…" className="field" />
        <select name="format" className="field" defaultValue="">
          <option value="">Formato</option>
          {FORMATS.map((f) => <option key={f}>{f}</option>)}
        </select>
        <select name="stage" className="field" defaultValue="">
          <option value="">Fase funnel</option>
          {FUNNEL.map((f) => <option key={f} value={f}>{FUNNEL_STAGES.find((x) => x.key === f)?.label}</option>)}
        </select>
        <button className="btn">Aggiungi</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = list.filter((i) => i.status === col.key).sort((a, b) => score(b.id) - score(a.id));
          return (
            <section key={col.key} className="space-y-2">
              <h2 className="h-section">{col.label} · {items.length}</h2>
              {items.map((i) => (
                <article key={i.id} className="card space-y-2 p-3">
                  <p className="text-sm font-medium leading-snug">{i.title}</p>
                  <p className="flex flex-wrap gap-1 text-[11px] text-muted">
                    {i.format && <span className="rounded bg-gold-soft px-1.5">{i.format}</span>}
                    {i.stage && <span className="rounded bg-black/5 px-1.5">{i.stage}</span>}
                    <span className="rounded bg-black/5 px-1.5">da {ORIGIN[i.origin]}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <form action={voteIdea} className="flex items-center gap-1">
                      <input type="hidden" name="ideaId" value={i.id} />
                      <button name="value" value="1" className="btn-ghost px-2 py-0.5 text-xs" title="Mi piace">▲</button>
                      <span className="w-5 text-center text-xs tabular-nums">{score(i.id)}</span>
                      <button name="value" value="-1" className="btn-ghost px-2 py-0.5 text-xs" title="Non convince">▼</button>
                    </form>
                    {NEXT[i.status] && (
                      <form action={setIdeaStatus}>
                        <input type="hidden" name="ideaId" value={i.id} />
                        <button name="status" value={NEXT[i.status]!} className="btn-ghost px-2 py-0.5 text-xs">Avanti →</button>
                      </form>
                    )}
                    {i.status !== "pianificata" && (
                      <form action={setIdeaStatus}>
                        <input type="hidden" name="ideaId" value={i.id} />
                        <button name="status" value="scartata" className="px-1 text-xs text-muted hover:text-bad">Scarta</button>
                      </form>
                    )}
                  </div>
                  {i.status === "approvata" && plans.length > 0 && (
                    <form action={planIdea} className="flex gap-1.5">
                      <input type="hidden" name="ideaId" value={i.id} />
                      <select name="planId" className="field py-1 text-xs">
                        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button className="btn px-2 py-1 text-xs">Pianifica</button>
                    </form>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
      {discarded > 0 && <p className="text-xs text-muted">{discarded} idee scartate (non mostrate).</p>}
    </div>
  );
}
