import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { AI_STATES, aiRuns, checkups } from "@/db/schema";
import { errorDetail, logError } from "@/lib/error-log";
import { audit } from "@/lib/audit";

// Lavori lunghi dell'AI eseguiti in background nel processo Node (su Plesk ce n'è uno solo).
// Lo stato sta nel database: la pagina lo rilegge ogni pochi secondi e si può chiudere e riaprire.
// Se l'app si riavvia a metà, all'avvio il check-up riparte da solo (lib/ai/resume.ts) o resta da riprendere con «Riprendi».
// Ogni lavoro ha un AbortController: "Interrompi" ferma anche la chiamata all'AI in corso.

const running = new Map<number, AbortController>();
const jobContext = new AsyncLocalStorage<{ signal: AbortSignal }>();

export const isRunning = (checkupId: number) => running.has(checkupId);
export const runningCount = () => running.size;

/** Segnale di interruzione del lavoro corrente (usato da callClaude). */
export const currentJobSignal = () => jobContext.getStore()?.signal;

export class JobCancelled extends Error {
  constructor() {
    super("Interrotto dal consulente");
  }
}

export function startJob(checkupId: number, state: (typeof AI_STATES)[number], job: () => Promise<void>, userId?: number) {
  if (running.has(checkupId)) return false;
  const controller = new AbortController();
  // Un secondo prima: i passi registrati nello stesso istante dell'avvio contano
  const startedAt = new Date(Date.now() - 1000);
  running.set(checkupId, controller);
  void jobContext.run({ signal: controller.signal }, async () => {
    try {
      await db.update(checkups).set({ aiState: state, aiError: null }).where(eq(checkups.id, checkupId));
      await job();
      const [c] = await db.select({ clientId: checkups.clientId, aiState: checkups.aiState }).from(checkups).where(eq(checkups.id, checkupId));
      const [spent] = await db
        .select({ usd: sql<number>`coalesce(sum(${aiRuns.costUsd}), 0)`, calls: sql<number>`count(*)`, searches: sql<number>`coalesce(sum(${aiRuns.webSearches}), 0)` })
        .from(aiRuns)
        .where(and(eq(aiRuns.checkupId, checkupId), gte(aiRuns.createdAt, startedAt)));
      await audit({
        userId: null,
        actorLabel: "AI",
        category: "checkup",
        action: "checkup.fase",
        description: `Lavoro AI concluso (partito da «${state}», ora «${c?.aiState}») in ${Math.round((Date.now() - startedAt.getTime()) / 60_000)} min · ${Number(spent.usd).toFixed(2)} $`,
        clientId: c?.clientId,
        target: `checkup:${checkupId}`,
        meta: { avviatoDa: userId ?? null, chiamateAI: Number(spent.calls), ricercheWeb: Number(spent.searches), costoUsd: Number(Number(spent.usd).toFixed(4)), durataSec: Math.round((Date.now() - startedAt.getTime()) / 1000) },
      });
    } catch (e) {
      if (controller.signal.aborted) {
        await db.update(checkups).set({ aiState: "interrotto", aiProgress: "Interrotto dal consulente" }).where(eq(checkups.id, checkupId));
      } else {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[ai] check-up ${checkupId}:`, e);
        const [c] = await db
          .select({ clientId: checkups.clientId, aiMode: checkups.aiMode, aiState: checkups.aiState, reasoning: checkups.reasoning, register: checkups.register, methodVersion: checkups.methodVersion })
          .from(checkups)
          .where(eq(checkups.id, checkupId));
        const where = c ? `/clienti/${c.clientId}/checkup?id=${checkupId}` : null;
        await logError({
          userId,
          area: "Check-up AI",
          message,
          detail: errorDetail(e, {
            "Check-up": checkupId,
            Cliente: c?.clientId,
            "Fase avviata": state,
            "Fase al momento dell'errore": c?.aiState,
            "Modalità": c?.aiMode,
            Ragionamento: c?.reasoning,
            Registro: c?.register,
            Metodologia: c?.methodVersion ? `v${c.methodVersion}` : null,
            Pagina: where,
          }),
          path: where,
          clientId: c?.clientId,
        });
        await db
          .update(checkups)
          .set({ aiState: "errore", aiError: message.slice(0, 1000), aiProgress: "Interrotto per un errore" })
          .where(eq(checkups.id, checkupId));
      }
    } finally {
      running.delete(checkupId);
    }
  });
  return true;
}

/** Ferma il lavoro in corso (anche a metà di una chiamata). Restituisce false se non stava lavorando. */
export function cancelJob(checkupId: number) {
  const c = running.get(checkupId);
  if (!c) return false;
  c.abort(new JobCancelled());
  return true;
}
