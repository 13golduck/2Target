"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { checkups, clients, PLATFORMS } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isAiConfigured } from "@/lib/ai/claude";
import { BudgetError } from "@/lib/ai/budget";
import { generatePlan, planQuestions, type PlanSetup } from "@/lib/ai/plan-agent";
import { errorDetail, logError } from "@/lib/error-log";

// Piano editoriale generato con l'AI: domande, poi generazione. Entrambe girano in sottofondo
// (la generazione richiede alcuni minuti) e la pagina chiede l'esito ogni pochi secondi.

type Job = { userId: number; status: "in_corso" | "pronto" | "errore"; progress?: string; result?: unknown; error?: string; at: number };
const g = globalThis as unknown as { __planAiJobs?: Map<string, Job> };
const jobs = (g.__planAiJobs ??= new Map<string, Job>());

const Setup = z.object({
  clientId: z.number().int().positive(),
  checkupId: z.number().int().positive().nullable(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  perWeek: z.number().int().min(1).max(21),
  notes: z.string().max(5000),
});

async function check(input: unknown): Promise<{ error: string } | { setup: PlanSetup; userId: number }> {
  const me = await requireWriter();
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic: un amministratore la inserisce in Impostazioni → Integrazioni" };
  const p = Setup.safeParse(input);
  if (!p.success) return { error: "Impostazione non valida: controlla date, piattaforme e frequenza" };
  const s = p.data;
  if (s.endsOn < s.startsOn) return { error: "La data di fine è prima dell'inizio" };
  const daysLong = (Date.parse(s.endsOn) - Date.parse(s.startsOn)) / 86_400_000;
  if (daysLong > 190) return { error: "Periodo troppo lungo: al massimo 6 mesi per piano" };
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, s.clientId));
  if (!client) return { error: "Cliente non trovato" };
  if (s.checkupId) {
    const [c] = await db.select({ id: checkups.id }).from(checkups).where(and(eq(checkups.id, s.checkupId), eq(checkups.clientId, s.clientId)));
    if (!c) return { error: "Check-up non trovato" };
  }
  return { setup: s, userId: me.id };
}

function run(userId: number, work: (progress: (t: string) => void) => Promise<unknown>, onError: (e: unknown, msg: string) => Promise<void>) {
  for (const [k, j] of jobs) if (Date.now() - j.at > 3_600_000) jobs.delete(k);
  const id = randomUUID();
  jobs.set(id, { userId, status: "in_corso", at: Date.now() });
  const progress = (t: string) => {
    const j = jobs.get(id);
    if (j) j.progress = t;
  };
  void (async () => {
    try {
      const result = await work(progress);
      jobs.set(id, { userId, status: "pronto", result, at: Date.now() });
    } catch (e) {
      const msg = e instanceof BudgetError ? e.message : e instanceof Error ? e.message : "Operazione non riuscita";
      jobs.set(id, { userId, status: "errore", error: msg, at: Date.now() });
      await onError(e, msg);
    }
  })();
  return id;
}

export async function startPlanQuestions(input: z.infer<typeof Setup>) {
  const c = await check(input);
  if ("error" in c) return c;
  const jobId = run(
    c.userId,
    () => planQuestions(c.setup),
    (e, msg) => logError({ userId: c.userId, area: "Piano AI", message: `Domande per il piano non generate: ${msg}`, detail: errorDetail(e, { Cliente: c.setup.clientId }), clientId: c.setup.clientId }),
  );
  return { ok: true, jobId };
}

const Answers = z.array(z.object({ question: z.string().max(2000), answer: z.string().max(4000) })).max(20);

export async function startPlanGeneration(input: z.infer<typeof Setup>, answers: z.infer<typeof Answers>) {
  const c = await check(input);
  if ("error" in c) return c;
  const a = Answers.safeParse(answers);
  if (!a.success) return { error: "Risposte non valide" };
  const { setup, userId } = c;
  const jobId = run(
    userId,
    async (progress) => {
      const r = await generatePlan({ setup, answers: a.data, userId, onProgress: progress });
      await audit({
        userId,
        category: "contenuti",
        action: "piano.generato_ai",
        description: `Piano editoriale generato con l'AI: ${r.items} contenuti, ${r.pillars} pilastri, ${r.items + r.ideas} idee (${setup.startsOn} → ${setup.endsOn})`,
        clientId: setup.clientId,
        target: `piano:${r.planId}`,
        meta: { checkup: setup.checkupId, piattaforme: setup.platforms, aSettimana: setup.perWeek, testiMancanti: r.missingTexts || undefined },
      });
      revalidatePath(`/clienti/${setup.clientId}/piano`);
      revalidatePath(`/clienti/${setup.clientId}/idee`);
      return r;
    },
    (e, msg) => logError({ userId, area: "Piano AI", message: `Generazione del piano non riuscita: ${msg}`, detail: errorDetail(e, { Cliente: setup.clientId, Periodo: `${setup.startsOn} → ${setup.endsOn}` }), clientId: setup.clientId }),
  );
  return { ok: true, jobId };
}

/** Stato di un'operazione avviata: solo per chi l'ha avviata. */
export async function planAiStatus(jobId: string) {
  const me = await requireWriter();
  const job = jobs.get(jobId);
  if (!job || job.userId !== me.id) return { status: "errore" as const, error: "Operazione non trovata (forse l'app è stata riavviata): riprova" };
  return { status: job.status, progress: job.progress, result: job.result, error: job.error };
}
