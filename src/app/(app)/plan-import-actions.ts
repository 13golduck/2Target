"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { clients, editorialItems, editorialPlans, FORMATS, PLATFORMS } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isAiConfigured } from "@/lib/ai/claude";
import { BudgetError } from "@/lib/ai/budget";
import { errorDetail, logError } from "@/lib/error-log";
import { fromRomeInput } from "@/lib/format";
import { documentToInput, extractPlan, IMPORT_MAX_BYTES, ImportedItemSchema } from "@/lib/plan-import";

// Importazione del piano editoriale da file: prima si legge (anteprima), poi si importa ciò che il consulente conferma.

// La lettura di un piano lungo può richiedere minuti: si avvia in sottofondo e la pagina chiede l'esito ogni pochi secondi
type Job = { userId: number; clientId: number; status: "in_corso" | "pronto" | "errore"; result?: unknown; error?: string; at: number };
const g = globalThis as unknown as { __planImportJobs?: Map<string, Job> };
const jobs = (g.__planImportJobs ??= new Map<string, Job>());

export async function analyzePlanDocument(f: FormData) {
  const me = await requireWriter();
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic: un amministratore la inserisce in Impostazioni → Integrazioni" };
  const clientId = Number(f.get("clientId"));
  const planId = Number(f.get("planId")) || null;
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Scegli un file" };
  if (file.size > IMPORT_MAX_BYTES) return { error: "File troppo grande: massimo 5 MB" };
  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId));
  if (!client) return { error: "Cliente non trovato" };
  const [plan] = planId ? await db.select().from(editorialPlans).where(and(eq(editorialPlans.id, planId), eq(editorialPlans.clientId, clientId))) : [];

  let input;
  try {
    input = await documentToInput(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Documento non leggibile" };
  }
  if (input.kind === "text" && !input.text.trim()) return { error: "Il documento sembra vuoto: nessun testo leggibile" };

  for (const [k, j] of jobs) if (Date.now() - j.at > 3_600_000) jobs.delete(k);
  const jobId = randomUUID();
  jobs.set(jobId, { userId: me.id, clientId, status: "in_corso", at: Date.now() });
  const fileName = file.name;
  void (async () => {
    try {
      const r = await extractPlan({ clientId, clientName: client.name, fileName, input, plan: plan ? { startsOn: plan.startsOn, endsOn: plan.endsOn } : null });
      jobs.set(jobId, { userId: me.id, clientId, status: "pronto", result: r, at: Date.now() });
      await audit({
        userId: me.id,
        category: "contenuti",
        action: "piano.import_letto",
        description: `Letto il documento «${fileName.slice(0, 120)}»: ${r.items.length} pubblicazioni trovate`,
        clientId,
        meta: r.warnings.length ? { avvisi: r.warnings.slice(0, 20) } : null,
      });
    } catch (e) {
      const error = e instanceof BudgetError ? e.message : e instanceof Error ? e.message : "Lettura non riuscita";
      jobs.set(jobId, { userId: me.id, clientId, status: "errore", error, at: Date.now() });
      await logError({ userId: me.id, area: "Importazione piano", message: `Importazione di «${fileName}» non riuscita: ${error}`, detail: errorDetail(e, { File: fileName }), clientId });
    }
  })();
  return { ok: true, jobId };
}

/** Esito della lettura: in corso, pronto (con le pubblicazioni) o errore. Solo per chi l'ha avviata. */
export async function planImportStatus(jobId: string) {
  const me = await requireWriter();
  const job = jobs.get(jobId);
  if (!job || job.userId !== me.id) return { status: "errore" as const, error: "Lettura non trovata: riprova a caricare il file" };
  return { status: job.status, result: job.result, error: job.error };
}

const ImportRequest = z.object({
  clientId: z.number().int().positive(),
  planId: z.number().int().positive().nullable(),
  newPlanName: z.string().max(200).nullable(),
  newPlan: z.object({ startsOn: z.string(), endsOn: z.string(), brief: z.string().max(20_000) }).nullable().optional(),
  items: z.array(ImportedItemSchema.extend({ platform: z.enum(PLATFORMS), format: z.enum(FORMATS), title: z.string().min(1).max(255) })).min(1).max(400),
});

export async function importPlanItems(input: z.infer<typeof ImportRequest>) {
  const me = await requireWriter();
  const req = ImportRequest.safeParse(input);
  if (!req.success) return { error: "Dati non validi: ogni pubblicazione deve avere titolo, piattaforma e formato" };
  const { clientId, items } = req.data;

  const dates = items.map((i) => i.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  let planId = req.data.planId;
  if (planId) {
    const [plan] = await db.select({ id: editorialPlans.id }).from(editorialPlans).where(and(eq(editorialPlans.id, planId), eq(editorialPlans.clientId, clientId)));
    if (!plan) return { error: "Piano non trovato" };
  } else {
    // Nuovo piano: date dalla prima all'ultima pubblicazione, piattaforme usate nel documento
    const today = new Date().toISOString().slice(0, 10);
    const [r] = await db.insert(editorialPlans).values({
      clientId,
      name: (req.data.newPlanName?.trim() || "Piano importato").slice(0, 200),
      startsOn: /^\d{4}-\d{2}-\d{2}$/.test(req.data.newPlan?.startsOn ?? "") ? req.data.newPlan!.startsOn : (dates[0] ?? today),
      endsOn: /^\d{4}-\d{2}-\d{2}$/.test(req.data.newPlan?.endsOn ?? "") ? req.data.newPlan!.endsOn : (dates[dates.length - 1] ?? today),
      platforms: [...new Set(items.flatMap((i) => [i.platform, ...i.alsoOn]))],
      brief: req.data.newPlan?.brief?.trim() ? `Importato da documento.\n\n${req.data.newPlan.brief.trim()}` : "Importato da documento",
    });
    planId = r.insertId;
  }

  for (const it of items) {
    const when = /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? fromRomeInput(`${it.date}T${/^\d{2}:\d{2}$/.test(it.time) ? it.time : "09:00"}`) : null;
    await db.insert(editorialItems).values({
      clientId,
      planId,
      title: it.title.slice(0, 255),
      platform: it.platform,
      crossPost: (() => {
        const other = [...new Set(it.alsoOn.filter((p) => p !== it.platform))];
        return other.length ? other : null;
      })(),
      format: it.format,
      scheduledAt: when,
      caption: it.caption || null,
      script: it.script || null,
      isPaid: !!it.sponsored,
      hashtags: it.hashtags || null,
      hook: it.hook || null,
      cta: it.cta || null,
      layoutNotes: it.notes || null,
      productionNotes: it.production || null,
      needsClientMaterial: !!it.needsMaterial,
      internalNotes: it.pillar ? `Pilastro: ${it.pillar}` : null,
      status: "bozza",
    });
  }
  await audit({
    userId: me.id,
    category: "contenuti",
    action: "piano.importato",
    description: `Importate ${items.length} pubblicazioni ${req.data.planId ? "nel piano esistente" : "in un nuovo piano"} da documento`,
    clientId,
    target: `piano:${planId}`,
  });
  revalidatePath(`/clienti/${clientId}/piano`);
  return { ok: true, planId };
}
