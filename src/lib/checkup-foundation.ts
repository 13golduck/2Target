// Base di lavoro che il check-up prepara alla consegna: KPI con obiettivo e punto di partenza, canali da collegare,
// buyer persona, rubriche, prime idee e bozza di piano editoriale. Ogni proposta cita le evidenze del check-up
// da cui nasce: qui c'è il catalogo numerato delle evidenze (E1, E2…) e il riepilogo salvato sul check-up.
// Modulo senza dipendenze dal server: lo usano anche lo schema e le pagine.

import type { CheckupReport } from "./checkup-report";
import type { CheckupSection } from "./checkup-template";

export type ChannelAction = "collegare" | "aprire" | "riattivare";

export interface FoundationChannel {
  /** Tipo di canale come in Canali (instagram, facebook, search_console, ga4…). */
  platform: string;
  action: ChannelAction;
  /** 1 = da fare subito, 3 = quando c'è tempo. */
  priority: 1 | 2 | 3;
  why: string;
  evidence: string[];
}

/** Riepilogo salvato sul check-up quando la base è pronta. */
export interface CheckupFoundation {
  kpis: number;
  /** KPI proposti ma già presenti per il cliente (stessa metrica e piattaforma): non duplicati. */
  kpisSkipped: number;
  personas: number;
  objectives: number;
  pillars: number;
  ideas: number;
  planId: number | null;
  planItems: number;
  /** Perché la bozza di piano non è stata creata (es. c'è già un piano nel periodo). */
  planSkipped: string | null;
  channels: FoundationChannel[];
}

export interface Evidence {
  id: string;
  text: string;
}

const MAX_EVIDENCE = 160;
const MAX_LEN = 280;

const clean = (s: string) => s.replace(/^[\s\-•*·\d.)]+/, "").replace(/\s+/g, " ").trim();
const cut = (s: string) => (s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s);

const VERDICT: Record<CheckupReport["channels"][number]["verdict"], string> = {
  miniera_d_oro: "miniera d'oro",
  da_rafforzare: "da rafforzare",
  efficace: "efficace",
  spreco: "spreco",
  non_prioritario: "non prioritario",
};

/**
 * Evidenze del check-up numerate: una per voce degli elenchi e delle tabelle, una per i campi di testo,
 * più verdetti sui canali e quick win del report. L'AI le cita per numero; qui si risolvono nel testo.
 */
export function buildEvidence(template: CheckupSection[], sections: Record<string, Record<string, string>>, report: CheckupReport | null): Evidence[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (where: string, text: string) => {
    const t = clean(text);
    if (t.length < 8) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cut(`${where}: ${t}`));
  };

  for (const sec of template) {
    const content = sections[sec.key];
    if (!content) continue;
    for (const f of sec.fields) {
      const v = content[f.key]?.trim();
      if (!v) continue;
      const where = `${sec.title} › ${f.label}`;
      if (f.kind === "testo") add(where, v);
      else for (const line of v.split("\n")) add(where, line);
    }
  }

  if (report) {
    for (const c of report.channels) add("Canali (report)", `${c.name}: efficacia ${c.current}/5, potenziale ${c.potential}/5, ${VERDICT[c.verdict]}. ${c.note}`);
    for (const q of report.quickWins) add("Quick win (report)", `${q.action} (impatto ${q.impact}, sforzo ${q.effort}, ${q.owner})`);
  }

  return out.slice(0, MAX_EVIDENCE).map((text, i) => ({ id: `E${i + 1}`, text }));
}

/** Testo delle evidenze citate (gli id sconosciuti si scartano: l'AI non può inventare evidenze). */
export function resolveEvidence(catalog: Evidence[], ids: string[]): string[] {
  const byId = new Map(catalog.map((e) => [e.id.toUpperCase(), e.text]));
  const out: string[] = [];
  for (const raw of ids) {
    const t = byId.get(raw.trim().toUpperCase());
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 4);
}

/** Valore come lo scrive una persona (5 = 5%) → valore salvato (0,05 per le percentuali). */
export function metricValue(n: number | null | undefined, unit: string): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return unit === "%" ? n / 100 : n;
}

/** Lunedì successivo a una data (AAAA-MM-GG): la bozza di piano parte da lì e dura 4 settimane. */
export function draftPeriod(from: Date, weeks = 4) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12));
  const toMonday = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + toMonday);
  const startsOn = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + weeks * 7 - 1);
  return { startsOn, endsOn: d.toISOString().slice(0, 10) };
}
