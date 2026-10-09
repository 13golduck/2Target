import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, appSettings } from "@/db/schema";

// Controlli di spesa dell'AI. Due livelli:
// 1. Anthropic (platform.claude.com): limite mensile dell'organizzazione/workspace = blocco definitivo.
// 2. 2Target (qui): si ferma PRIMA, con un messaggio chiaro, in base a queste impostazioni.

export interface AiLimits {
  enabled: boolean; // interruttore generale
  monthlyUsd: number; // budget del mese per tutta l'app
  warnPct: number; // soglia di avviso (es. 0.8)
  checkupUsd: number; // tetto per singolo check-up
  clientMonthlyUsd: number; // tetto mensile per cliente (0 = nessuno)
  maxConcurrent: number; // lavori AI contemporanei
  maxCheckupsPerDay: number; // nuovi check-up AI al giorno
}

export const DEFAULT_LIMITS: AiLimits = {
  enabled: true,
  monthlyUsd: 50,
  warnPct: 0.8,
  checkupUsd: 8,
  clientMonthlyUsd: 15,
  maxConcurrent: 2,
  maxCheckupsPerDay: 10,
};

export class BudgetError extends Error {}

export async function getLimits(): Promise<AiLimits> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "ai_limits"));
  return { ...DEFAULT_LIMITS, ...((row?.value as Partial<AiLimits>) ?? {}) };
}

export async function saveLimits(limits: AiLimits, userId: number) {
  await db.insert(appSettings).values({ key: "ai_limits", value: limits, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value: limits, updatedBy: userId } });
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function spent(where: ReturnType<typeof and>) {
  const [r] = await db.select({ total: sql<string | null>`sum(${aiRuns.costUsd})` }).from(aiRuns).where(where);
  return Number(r?.total ?? 0);
}

export const monthSpend = () => spent(and(gte(aiRuns.createdAt, monthStart())));
export const clientMonthSpend = (clientId: number) => spent(and(eq(aiRuns.clientId, clientId), gte(aiRuns.createdAt, monthStart())));
export const checkupSpend = (checkupId: number) => spent(and(eq(aiRuns.checkupId, checkupId)));

/** Stima prudente del costo di una fase, per non iniziarla se sforerebbe i limiti. */
export const PHASE_ESTIMATE_USD: Record<string, { opus: number; sonnet: number }> = {
  ricognizione: { opus: 1.2, sonnet: 0.6 },
  domande: { opus: 0.25, sonnet: 0.12 },
  ricerca: { opus: 2.5, sonnet: 1.2 },
  scrittura: { opus: 1.5, sonnet: 0.8 },
  revisione: { opus: 0.35, sonnet: 0.18 },
};

const fmt = (n: number) => `${n.toFixed(2)} $`;

/** Regola di blocco (pura, testata): restituisce il motivo del blocco o null. */
export function budgetViolation(l: AiLimits, spent: { month: number; client?: number; checkup?: number }, est = 0): string | null {
  // Bloccato se il tetto è già raggiunto, oppure se la stima della fase lo farebbe superare
  const over = (used: number, cap: number) => used >= cap || used + est > cap;
  if (!l.enabled) return "L'AI è disattivata dalle impostazioni (Consumi AI).";
  if (over(spent.month, l.monthlyUsd)) {
    return `Budget AI del mese raggiunto: spesi ${fmt(spent.month)} su ${fmt(l.monthlyUsd)}${est ? ` (questa fase ne richiede circa ${fmt(est)})` : ""}. Un amministratore può alzarlo in Consumi AI.`;
  }
  if (spent.client != null && l.clientMonthlyUsd > 0 && over(spent.client, l.clientMonthlyUsd)) {
    return `Tetto mensile per questo cliente raggiunto: ${fmt(spent.client)} su ${fmt(l.clientMonthlyUsd)}.`;
  }
  if (spent.checkup != null && over(spent.checkup, l.checkupUsd)) {
    return `Tetto per singolo check-up raggiunto: ${fmt(spent.checkup)} su ${fmt(l.checkupUsd)}. Un amministratore può alzarlo in Consumi AI.`;
  }
  return null;
}

/**
 * Lancia BudgetError se l'operazione non va fatta. Si chiama prima di ogni fase
 * (con la stima) e prima di ogni singola chiamata (stima 0: controlla i tetti già raggiunti).
 */
export async function assertBudget(o: { clientId?: number; checkupId?: number; estimateUsd?: number }) {
  const l = await getLimits();
  const message = budgetViolation(
    l,
    {
      month: await monthSpend(),
      client: o.clientId ? await clientMonthSpend(o.clientId) : undefined,
      checkup: o.checkupId ? await checkupSpend(o.checkupId) : undefined,
    },
    o.estimateUsd ?? 0,
  );
  if (message) throw new BudgetError(message);
}

export async function budgetStatus() {
  const l = await getLimits();
  const month = await monthSpend();
  return { limits: l, month, ratio: l.monthlyUsd > 0 ? month / l.monthlyUsd : 1, warning: month >= l.monthlyUsd * l.warnPct };
}
