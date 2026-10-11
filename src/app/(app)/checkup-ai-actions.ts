"use server";

import { REASONING, REGISTERS } from "@/lib/checkup-report";
import { getMethodology } from "@/lib/ai/metodologia";

import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { AI_MODES, checkupQuestions, checkups, clients } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/claude";
import { askQuestions, rewriteSection, runDeepResearch, runRecon, runWriting } from "@/lib/ai/checkup-agent";
import { cancelJob, isRunning, runningCount, startJob } from "@/lib/ai/jobs";
import { assertBudget, getLimits, BudgetError } from "@/lib/ai/budget";
import { audit } from "@/lib/audit";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const path = (clientId: number) => `/clienti/${clientId}/checkup`;

/** Controlli prima di avviare un lavoro AI: limiti di spesa, lavori contemporanei. */
async function preflight(clientId: number, checkupId?: number) {
  try {
    await assertBudget({ clientId, checkupId, estimateUsd: 0.5 });
  } catch (e) {
    if (e instanceof BudgetError) return e.message;
    throw e;
  }
  const limits = await getLimits();
  if (runningCount() >= limits.maxConcurrent) return `Ci sono già ${runningCount()} lavori AI in corso (massimo ${limits.maxConcurrent}): riprova tra qualche minuto.`;
  return null;
}
const monthLabel = () => new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" }).replace(/^./, (c) => c.toUpperCase());

async function checkupOf(id: number) {
  const [c] = await db.select().from(checkups).where(eq(checkups.id, id));
  if (!c) throw new Error("Check-up non trovato");
  return c;
}

// Avvii in corso per cliente: blocca i doppi clic anche prima che il check-up sia scritto nel database
const starting = new Set<number>();
const ACTIVE_STATES = ["ricognizione", "domande", "ricerca", "scrittura"] as const;

/** Check-up AI ancora aperto (in lavorazione o in attesa di risposte) per il cliente. */
async function activeCheckup(clientId: number) {
  const [c] = await db
    .select({ id: checkups.id })
    .from(checkups)
    .where(and(eq(checkups.clientId, clientId), inArray(checkups.aiState, [...ACTIVE_STATES])))
    .orderBy(desc(checkups.id))
    .limit(1);
  return c?.id ?? null;
}

/** Dati del cliente + scelta del modello → ricognizione online e prime domande. Un solo check-up aperto per cliente. */
export async function startAiCheckup(f: FormData) {
  const me = await requireWriter();
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic (ANTHROPIC_API_KEY): vedi docs/AI-ANTHROPIC.md" };
  const clientId = Number(f.get("clientId"));
  if (starting.has(clientId)) return { error: "Il check-up sta già partendo", checkupId: null };
  const open = await activeCheckup(clientId);
  if (open) return { error: "C'è già un check-up in corso per questo cliente: lo apro. Puoi interromperlo da lì.", checkupId: open };
  starting.add(clientId);
  try {
    return await startAiCheckupLocked(f, clientId, me.id);
  } finally {
    starting.delete(clientId);
  }
}

async function startAiCheckupLocked(f: FormData, clientId: number, userId: number) {
  const mode = String(f.get("mode")) as (typeof AI_MODES)[number];
  if (!AI_MODES.includes(mode)) return { error: "Scegli il modello" };
  const blocked = await preflight(clientId);
  if (blocked) return { error: blocked };
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const todayCount = (await db.select({ id: checkups.id }).from(checkups).where(and(isNotNull(checkups.aiMode), gte(checkups.createdAt, today)))).length;
  const { maxCheckupsPerDay } = await getLimits();
  if (todayCount >= maxCheckupsPerDay) return { error: `Raggiunto il limite di ${maxCheckupsPerDay} check-up AI al giorno (Consumi AI).` };
  let website = str(f, "website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  await db
    .update(clients)
    .set({
      name: str(f, "name") ?? undefined,
      sector: str(f, "sector"),
      website,
      vatNumber: str(f, "vatNumber"),
      city: str(f, "city"),
      contactName: str(f, "contactName"),
      socialLinks: str(f, "socialLinks"),
      notes: str(f, "notes"),
    })
    .where(eq(clients.id, clientId));

  // Check-up periodico: si parte dal precedente (confronto e storico)
  const [prev] = await db.select({ id: checkups.id }).from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id)).limit(1);
  const register = REGISTERS.find((x) => x === f.get("register")) ?? "auto";
  const reasoning = REASONING.find((x) => x === f.get("reasoning")) ?? "avanzato";
  const { version: methodVersion } = await getMethodology();
  const [r] = await db
    .insert(checkups)
    .values({ clientId, period: monthLabel(), aiMode: mode, aiState: "ricognizione", aiLog: [], previousId: prev?.id ?? null, register, reasoning, methodVersion });
  startJob(r.insertId, "ricognizione", () => runRecon(r.insertId), userId);
  await audit({ userId, category: "checkup", action: "checkup.avvio", description: `Avviato il check-up AI (modello ${mode}, ragionamento ${reasoning}, registro ${register}, metodologia v${methodVersion})`, clientId, target: `checkup:${r.insertId}` });
  revalidatePath(path(clientId));
  return { ok: true, checkupId: r.insertId };
}

export async function saveAnswers(f: FormData) {
  await requireWriter();
  const checkupId = Number(f.get("checkupId"));
  const c = await checkupOf(checkupId);
  const now = new Date();
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("q:")) continue;
    const id = Number(k.slice(2));
    const answer = String(v).trim();
    await db
      .update(checkupQuestions)
      .set({ answer: answer || null, answeredAt: answer ? now : null })
      .where(and(eq(checkupQuestions.id, id), eq(checkupQuestions.checkupId, checkupId)));
  }
  revalidatePath(path(c.clientId));
  return { ok: true };
}

/** Dopo le risposte: altre domande (se servono) oppure ricerca approfondita + scrittura. */
export async function continueAiCheckup(f: FormData) {
  const me = await requireWriter();
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic (ANTHROPIC_API_KEY): vedi docs/AI-ANTHROPIC.md" };
  await saveAnswers(f);
  const checkupId = Number(f.get("checkupId"));
  const next = String(f.get("next"));
  const c = await checkupOf(checkupId);
  if (isRunning(checkupId)) return { error: "L'AI sta già lavorando su questo check-up" };
  const blocked = await preflight(c.clientId, checkupId);
  if (blocked) return { error: blocked };

  await audit({ userId: me.id, category: "checkup", action: "checkup.risposte", description: next === "domande" ? "Inviate le risposte: chiesto un altro giro di domande" : "Inviate le risposte: avviata ricerca approfondita e scrittura", clientId: c.clientId, target: `checkup:${checkupId}` });
  if (next === "domande") {
    if (c.questionRound >= 3) return { error: "Bastano tre giri di domande: avvia la ricerca approfondita" };
    startJob(checkupId, "ricognizione", async () => {
      const n = await askQuestions(checkupId, c.questionRound + 1);
      if (n === 0) {
        await runDeepResearch(checkupId);
        await runWriting(checkupId);
      }
    }, me.id);
  } else {
    startJob(checkupId, "ricerca", async () => {
      await runDeepResearch(checkupId);
      await runWriting(checkupId);
    }, me.id);
  }
  revalidatePath(path(c.clientId));
  return { ok: true };
}

/** Riprende dalla fase rimasta a metà (errore o riavvio dell'app). */
export async function resumeAiCheckup(f: FormData) {
  const me = await requireWriter();
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic (ANTHROPIC_API_KEY): vedi docs/AI-ANTHROPIC.md" };
  const checkupId = Number(f.get("checkupId"));
  const c = await checkupOf(checkupId);
  if (isRunning(checkupId)) return { error: "L'AI sta già lavorando su questo check-up" };
  const blocked = await preflight(c.clientId, checkupId);
  if (blocked) return { error: blocked };
  const open = await db.select({ id: checkupQuestions.id }).from(checkupQuestions).where(eq(checkupQuestions.checkupId, checkupId));
  await audit({ userId: me.id, category: "checkup", action: "checkup.ripresa", description: `Ripreso il check-up AI (era: ${c.aiState})`, clientId: c.clientId, target: `checkup:${checkupId}`, meta: c.aiError ? { errore: c.aiError.slice(0, 300) } : null });

  if (!c.dossier) startJob(checkupId, "ricognizione", () => runRecon(checkupId), me.id);
  else if (!open.length) startJob(checkupId, "ricognizione", async () => void (await askQuestions(checkupId, 1)), me.id);
  else if (!c.dossier.includes("# Ricerca approfondita")) {
    // L'errore può essere arrivato durante le domande: se non ci sono risposte si torna lì
    const unanswered = await db.select({ id: checkupQuestions.id }).from(checkupQuestions).where(and(eq(checkupQuestions.checkupId, checkupId), isNull(checkupQuestions.answer)));
    if ((c.aiState === "errore" || c.aiState === "interrotto") && unanswered.length === open.length) await db.update(checkups).set({ aiState: "domande", aiError: null }).where(eq(checkups.id, checkupId));
    else startJob(checkupId, "ricerca", async () => { await runDeepResearch(checkupId); await runWriting(checkupId); }, me.id);
  } else startJob(checkupId, "scrittura", () => runWriting(checkupId), me.id);
  revalidatePath(path(c.clientId));
  return { ok: true };
}

/** Interrompe il check-up: ferma la chiamata all'AI in corso e non avvia le fasi successive. */
export async function stopAiCheckup(checkupId: number) {
  const me = await requireWriter();
  const c = await checkupOf(checkupId);
  const wasRunning = cancelJob(checkupId);
  await audit({ userId: me.id, category: "checkup", action: "checkup.interrotto", description: "Interrotto il check-up AI", clientId: c.clientId, target: `checkup:${checkupId}` });
  if (wasRunning) await db.update(checkups).set({ aiProgress: "Interruzione in corso…" }).where(eq(checkups.id, checkupId));
  // Se non stava lavorando (es. in attesa delle risposte) si chiude subito
  if (!wasRunning) await db.update(checkups).set({ aiState: "interrotto", aiProgress: "Interrotto dal consulente" }).where(eq(checkups.id, checkupId));
  revalidatePath(path(c.clientId));
  return { ok: true };
}

/** Archivia (o ripristina) un check-up. Quelli ancora aperti vanno prima interrotti. */
export async function archiveCheckup(checkupId: number, archive: boolean) {
  const me = await requireWriter();
  const c = await checkupOf(checkupId);
  if (archive && isRunning(checkupId)) return { error: "L'AI sta lavorando su questo check-up: interrompilo prima di archiviarlo" };
  // Rimasto a metà (riavvio dell'app, attesa risposte): si chiude come interrotto, così non blocca un nuovo check-up
  const stale = archive && (ACTIVE_STATES as readonly string[]).includes(c.aiState);
  await db
    .update(checkups)
    .set({ archivedAt: archive ? new Date() : null, ...(stale && { aiState: "interrotto" as const, aiProgress: "Archiviato senza completare" }) })
    .where(eq(checkups.id, checkupId));
  await audit({ userId: me.id, category: "checkup", action: archive ? "checkup.archiviato" : "checkup.ripristinato", description: archive ? "Check-up archiviato" : "Check-up ripristinato dall'archivio", clientId: c.clientId, target: `checkup:${checkupId}` });
  revalidatePath(path(c.clientId));
  return { ok: true };
}

export async function reviseSection(f: FormData) {
  const me = await requireWriter();
  const checkupId = Number(f.get("checkupId"));
  const sectionKey = String(f.get("sectionKey"));
  const instruction = str(f, "instruction");
  const c = await checkupOf(checkupId);
  if (!instruction) return { error: "Scrivi cosa cambiare" };
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic" };
  try {
    await rewriteSection(checkupId, sectionKey, instruction);
    await audit({ userId: me.id, category: "checkup", action: "checkup.revisione_ai", description: `Sezione «${sectionKey}» riscritta dall'AI su richiesta`, clientId: c.clientId, target: `checkup:${checkupId}`, meta: { istruzione: instruction.slice(0, 300) } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(path(c.clientId));
  return { ok: true };
}
