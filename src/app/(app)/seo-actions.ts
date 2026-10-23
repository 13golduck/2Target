"use server";

import { revalidatePath } from "next/cache";

import { requireClientAccess, requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isAiConfigured } from "@/lib/ai/claude";
import { BudgetError } from "@/lib/ai/budget";
import { runSeoAnalysis } from "@/lib/ai/seo-agent";
import { errorDetail, logError } from "@/lib/error-log";

// Analisi SEO con l'AI avviata dalla pagina SEO del cliente (richiede circa un minuto).

const running = new Set<number>();

export async function startSeoAnalysis(clientId: number, createIdeas: boolean) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic: un amministratore la inserisce in Impostazioni → Integrazioni" };
  if (running.has(clientId)) return { error: "L'analisi è già in corso per questo cliente" };
  running.add(clientId);
  try {
    const r = await runSeoAnalysis(clientId, { userId: me.id, createIdeas, trigger: "manuale" });
    await audit({ userId: me.id, category: "canali", action: "seo.analisi", description: `Analisi SEO con l'AI${r.ideas ? `: ${r.ideas} idee aggiunte in bacheca` : ""}`, clientId, target: `analisi-seo:${r.id}` });
    revalidatePath(`/clienti/${clientId}/seo`);
    revalidatePath(`/clienti/${clientId}/idee`);
    return { ok: true, ideas: r.ideas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analisi non riuscita";
    if (!(e instanceof BudgetError)) await logError({ userId: me.id, area: "Analisi SEO", message: `Analisi SEO non riuscita: ${msg}`, detail: errorDetail(e, { Cliente: clientId }), clientId, path: `/clienti/${clientId}/seo` });
    return { error: msg };
  } finally {
    running.delete(clientId);
  }
}
