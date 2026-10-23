import "server-only";
import { and, eq, gte, like, sql } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, appSettings } from "@/db/schema";

// Controlli di spesa dell'AI, in euro. Il costo di ogni chiamata è il listino Anthropic (in dollari)
// convertito al cambio BCE del giorno e moltiplicato per il ricarico Golduck (predefinito 1,8).
// Due livelli di blocco:
// 1. Anthropic (platform.claude.com): limite mensile dell'organizzazione/workspace = blocco definitivo.
// 2. 2Target (qui): si ferma PRIMA, con un messaggio chiaro, in base a queste impostazioni.

export interface AiLimits {
  enabled: boolean; // interruttore generale
  monthlyEur: number; // budget del mese per tutta l'app (€)
  warnPct: number; // soglia di avviso (es. 0.8)
  checkupEur: number; // tetto per singolo check-up (€)
  clientMonthlyEur: number; // tetto mensile per cliente (€, 0 = nessuno)
  imagesMonthlyEur: number; // tetto mensile per le immagini create o modificate dall'AI (€, dentro il budget del mese)
  maxConcurrent: number; // lavori AI contemporanei
  maxCheckupsPerDay: number; // nuovi check-up AI al giorno
  markup: number; // ricarico sul listino Anthropic (1,8 = +80%)
}

export const DEFAULT_LIMITS: AiLimits = {
  enabled: true,
  monthlyEur: 80,
  warnPct: 0.8,
  checkupEur: 15,
  clientMonthlyEur: 25,
  imagesMonthlyEur: 20,
  maxConcurrent: 2,
  maxCheckupsPerDay: 10,
  markup: 1.8,
};

export class BudgetError extends Error {}

type StoredLimits = Partial<AiLimits> & { monthlyUsd?: number; checkupUsd?: number; clientMonthlyUsd?: number };

export async function getLimits(): Promise<AiLimits> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "ai_limits"));
  const v = (row?.value as StoredLimits) ?? {};
  // Limiti salvati prima del passaggio all'euro (in $): si convertono con lo stesso criterio dei costi
  const f = 1.8 / 1.1195;
  const legacy = (eur: number | undefined, usd: number | undefined, d: number) => eur ?? (usd != null ? Math.round(usd * f) : d);
  return {
    ...DEFAULT_LIMITS,
    ...v,
    monthlyEur: legacy(v.monthlyEur, v.monthlyUsd, DEFAULT_LIMITS.monthlyEur),
    checkupEur: legacy(v.checkupEur, v.checkupUsd, DEFAULT_LIMITS.checkupEur),
    clientMonthlyEur: legacy(v.clientMonthlyEur, v.clientMonthlyUsd, DEFAULT_LIMITS.clientMonthlyEur),
    markup: v.markup && v.markup > 0 ? v.markup : DEFAULT_LIMITS.markup,
  };
}

// ── Cambio dollaro/euro (BCE) ────────────────────────────────────────
// Si legge il cambio di riferimento BCE una volta al giorno; se la BCE non risponde si usa l'ultimo salvato.

const FX_KEY = "fx_usd_eur";
const FX_FALLBACK = 1.12; // dollari per 1 euro, solo se non c'è mai stato un cambio salvato
type Fx = { usdPerEur: number; date: string; fetchedAt: string };
const g = globalThis as unknown as { __fx?: { fx: Fx; at: number } };

async function fetchEcbRate(): Promise<Fx | null> {
  try {
    const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const xml = await res.text();
    const rate = Number(xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
    const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1] ?? new Date().toISOString().slice(0, 10);
    return rate > 0 ? { usdPerEur: rate, date, fetchedAt: new Date().toISOString() } : null;
  } catch {
    return null;
  }
}

/** Cambio in uso: memoria (1 ora) → database → BCE se il salvato ha più di 20 ore. */
export async function fxRate(): Promise<Fx> {
  if (g.__fx && Date.now() - g.__fx.at < 3_600_000) return g.__fx.fx;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, FX_KEY));
  let fx = row?.value as Fx | undefined;
  if (!fx || Date.now() - Date.parse(fx.fetchedAt) > 20 * 3_600_000) {
    const fresh = await fetchEcbRate();
    if (fresh) {
      fx = fresh;
      await db.insert(appSettings).values({ key: FX_KEY, value: fx }).onDuplicateKeyUpdate({ set: { value: fx } });
    }
  }
  fx ??= { usdPerEur: FX_FALLBACK, date: "stima", fetchedAt: new Date(0).toISOString() };
  g.__fx = { fx, at: Date.now() };
  return fx;
}

/** Da listino Anthropic in dollari a costo Golduck in euro (cambio BCE × ricarico). */
export async function usdToBilledEur(usd: number) {
  const [fx, l] = await Promise.all([fxRate(), getLimits()]);
  return Math.round((usd / fx.usdPerEur) * l.markup * 10_000) / 10_000;
}

export async function saveLimits(limits: AiLimits, userId: number) {
  await db.insert(appSettings).values({ key: "ai_limits", value: limits, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value: limits, updatedBy: userId } });
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function spent(where: ReturnType<typeof and>) {
  const [r] = await db.select({ total: sql<string | null>`sum(${aiRuns.costEur})` }).from(aiRuns).where(where);
  return Number(r?.total ?? 0);
}

export const monthSpend = () => spent(and(gte(aiRuns.createdAt, monthStart())));
export const clientMonthSpend = (clientId: number) => spent(and(eq(aiRuns.clientId, clientId), gte(aiRuns.createdAt, monthStart())));
export const checkupSpend = (checkupId: number) => spent(and(eq(aiRuns.checkupId, checkupId)));

/** Le immagini AI si registrano con un passo che inizia così: il tetto delle immagini somma solo quelle. */
export const IMAGE_STEP_PREFIX = "Immagine AI";
export const imageMonthSpend = () => spent(and(like(aiRuns.step, `${IMAGE_STEP_PREFIX}%`), gte(aiRuns.createdAt, monthStart())));

/** Stima prudente del costo di una fase in dollari di listino (si converte in euro con usdToBilledEur). */
export const PHASE_ESTIMATE_USD: Record<string, { opus: number; sonnet: number }> = {
  ricognizione: { opus: 1.2, sonnet: 0.6 },
  domande: { opus: 0.25, sonnet: 0.12 },
  ricerca: { opus: 2.5, sonnet: 1.2 },
  scrittura: { opus: 1.5, sonnet: 0.8 },
  revisione: { opus: 0.35, sonnet: 0.18 },
};

const fmt = (n: number) => `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Regola di blocco (pura, testata): restituisce il motivo del blocco o null. */
export function budgetViolation(l: AiLimits, spent: { month: number; client?: number; checkup?: number; images?: number }, est = 0): string | null {
  // Bloccato se il tetto è già raggiunto, oppure se la stima della fase lo farebbe superare
  const over = (used: number, cap: number) => used >= cap || used + est > cap;
  if (!l.enabled) return "L'AI è disattivata dalle impostazioni (Consumi AI).";
  if (over(spent.month, l.monthlyEur)) {
    return `Budget AI del mese raggiunto: spesi ${fmt(spent.month)} su ${fmt(l.monthlyEur)}${est ? ` (questa fase ne richiede circa ${fmt(est)})` : ""}. Un amministratore può alzarlo in Consumi AI.`;
  }
  if (spent.client != null && l.clientMonthlyEur > 0 && over(spent.client, l.clientMonthlyEur)) {
    return `Tetto mensile per questo cliente raggiunto: ${fmt(spent.client)} su ${fmt(l.clientMonthlyEur)}.`;
  }
  if (spent.images != null && over(spent.images, l.imagesMonthlyEur)) {
    return `Tetto mensile delle immagini AI raggiunto: spesi ${fmt(spent.images)} su ${fmt(l.imagesMonthlyEur)}. Un amministratore può alzarlo in Impostazioni → Limiti AI.`;
  }
  if (spent.checkup != null && over(spent.checkup, l.checkupEur)) {
    return `Tetto per singolo check-up raggiunto: ${fmt(spent.checkup)} su ${fmt(l.checkupEur)}. Un amministratore può alzarlo in Consumi AI.`;
  }
  return null;
}

/**
 * Lancia BudgetError se l'operazione non va fatta. Si chiama prima di ogni fase
 * (con la stima) e prima di ogni singola chiamata (stima 0: controlla i tetti già raggiunti).
 */
export async function assertBudget(o: { clientId?: number; checkupId?: number; estimateUsd?: number; images?: boolean }) {
  const l = await getLimits();
  const message = budgetViolation(
    l,
    {
      month: await monthSpend(),
      client: o.clientId ? await clientMonthSpend(o.clientId) : undefined,
      checkup: o.checkupId ? await checkupSpend(o.checkupId) : undefined,
      images: o.images ? await imageMonthSpend() : undefined,
    },
    o.estimateUsd ? await usdToBilledEur(o.estimateUsd) : 0,
  );
  if (message) throw new BudgetError(message);
}

export async function budgetStatus() {
  const l = await getLimits();
  const month = await monthSpend();
  return { limits: l, month, ratio: l.monthlyEur > 0 ? month / l.monthlyEur : 1, warning: month >= l.monthlyEur * l.warnPct };
}
