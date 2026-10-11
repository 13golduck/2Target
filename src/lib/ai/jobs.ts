import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { AI_STATES, checkups } from "@/db/schema";
import { logError } from "@/lib/error-log";

// Lavori lunghi dell'AI eseguiti in background nel processo Node (su Plesk ce n'è uno solo).
// Lo stato sta nel database: la pagina lo rilegge ogni pochi secondi e si può chiudere e riaprire.
// Se l'app si riavvia a metà, il check-up resta "in corso": il pulsante Riprendi lo fa ripartire.
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
  running.set(checkupId, controller);
  void jobContext.run({ signal: controller.signal }, async () => {
    try {
      await db.update(checkups).set({ aiState: state, aiError: null }).where(eq(checkups.id, checkupId));
      await job();
    } catch (e) {
      if (controller.signal.aborted) {
        await db.update(checkups).set({ aiState: "interrotto", aiProgress: "Interrotto dal consulente" }).where(eq(checkups.id, checkupId));
      } else {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[ai] check-up ${checkupId}:`, e);
        const [c] = await db.select({ clientId: checkups.clientId }).from(checkups).where(eq(checkups.id, checkupId));
        await logError({
          userId,
          area: "Check-up AI",
          message,
          detail: `Check-up ${checkupId}, fase ${state}\n${e instanceof Error ? (e.stack ?? "") : ""}`,
          path: c ? `/clienti/${c.clientId}/checkup?id=${checkupId}` : null,
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
