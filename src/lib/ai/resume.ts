import "server-only";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, checkupQuestions, checkups } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertBudget, BudgetError } from "./budget";
import { askQuestions, runDeepResearch, runRecon, runWriting } from "./checkup-agent";
import { isRunning, startJob } from "./jobs";

// Ripresa di un check-up dalla fase rimasta a metà: la usa il pulsante «Riprendi» e, all'avvio dell'app,
// la ripresa automatica dei lavori fermati da un riavvio (deploy, Riavvia app su Plesk).

/** Riparte dalla prima fase non completata. Restituisce false se non c'era niente da far ripartire. */
export async function resumeCheckup(checkupId: number, userId?: number) {
  const [c] = await db.select().from(checkups).where(eq(checkups.id, checkupId));
  if (!c || isRunning(checkupId)) return false;
  const open = await db.select({ id: checkupQuestions.id }).from(checkupQuestions).where(eq(checkupQuestions.checkupId, checkupId));

  if (!c.dossier) return startJob(checkupId, "ricognizione", () => runRecon(checkupId), userId);
  if (!open.length) return startJob(checkupId, "ricognizione", async () => void (await askQuestions(checkupId, 1)), userId);
  if (!c.dossier.includes("# Ricerca approfondita")) {
    // L'errore può essere arrivato durante le domande: se non ci sono risposte si torna lì
    const unanswered = await db.select({ id: checkupQuestions.id }).from(checkupQuestions).where(and(eq(checkupQuestions.checkupId, checkupId), isNull(checkupQuestions.answer)));
    if ((c.aiState === "errore" || c.aiState === "interrotto") && unanswered.length === open.length) {
      await db.update(checkups).set({ aiState: "domande", aiError: null }).where(eq(checkups.id, checkupId));
      return true;
    }
    return startJob(checkupId, "ricerca", async () => { await runDeepResearch(checkupId); await runWriting(checkupId); }, userId);
  }
  return startJob(checkupId, "scrittura", () => runWriting(checkupId), userId);
}

/**
 * All'avvio: i check-up rimasti «in lavorazione» non hanno più un processo che li segue (l'app si è riavviata).
 * Ripartono da soli se l'ultima attività dell'AI è recente (6 ore) e i limiti di spesa lo consentono; altrimenti restano da riprendere a mano.
 */
export async function resumeStaleCheckups() {
  const stale = await db
    .select({ id: checkups.id, clientId: checkups.clientId, aiState: checkups.aiState })
    .from(checkups)
    .where(and(inArray(checkups.aiState, ["ricognizione", "ricerca", "scrittura"]), isNull(checkups.archivedAt)));
  const since = new Date(Date.now() - 6 * 3600_000);
  for (const c of stale) {
    const [recent] = await db.select({ id: aiRuns.id }).from(aiRuns).where(and(eq(aiRuns.checkupId, c.id), gte(aiRuns.createdAt, since))).limit(1);
    let note: string;
    try {
      if (!recent) throw new Error("ultima attività dell'AI più vecchia di 6 ore");
      await assertBudget({ clientId: c.clientId, checkupId: c.id, estimateUsd: 0.5 });
      await resumeCheckup(c.id);
      note = `Check-up ripreso in automatico dopo il riavvio dell'app (era: ${c.aiState})`;
    } catch (e) {
      await db.update(checkups).set({ aiState: "interrotto", aiProgress: "Fermato da un riavvio dell'app: premi Riprendi" }).where(eq(checkups.id, c.id));
      note = `Check-up fermato dal riavvio dell'app e non ripreso: ${e instanceof BudgetError ? e.message : (e as Error).message}`;
    }
    await audit({ userId: null, actorLabel: "Sistema", category: "checkup", action: "checkup.ripresa_auto", description: note, clientId: c.clientId, target: `checkup:${c.id}` });
  }
}
