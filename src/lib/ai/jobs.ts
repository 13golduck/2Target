import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { AI_STATES, checkups } from "@/db/schema";

// Lavori lunghi dell'AI eseguiti in background nel processo Node (su Plesk ce n'è uno solo).
// Lo stato sta nel database: la pagina lo rilegge ogni pochi secondi e si può chiudere e riaprire.
// Se l'app si riavvia a metà, il check-up resta "in corso": il pulsante Riprendi lo fa ripartire.

const running = new Set<number>();

export const isRunning = (checkupId: number) => running.has(checkupId);

export function startJob(checkupId: number, state: (typeof AI_STATES)[number], job: () => Promise<void>) {
  if (running.has(checkupId)) return false;
  running.add(checkupId);
  void (async () => {
    try {
      await db.update(checkups).set({ aiState: state, aiError: null }).where(eq(checkups.id, checkupId));
      await job();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[ai] check-up ${checkupId}:`, e);
      await db
        .update(checkups)
        .set({ aiState: "errore", aiError: message.slice(0, 1000), aiProgress: "Interrotto per un errore" })
        .where(eq(checkups.id, checkupId));
    } finally {
      running.delete(checkupId);
    }
  })();
  return true;
}
