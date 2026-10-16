// Letture dei dati di Search Console che servono al consulente: opportunità (ricerche quasi in prima posizione
// con tanta visibilità e pochi clic), ricerche con il nome del brand e senza, pagine che crescono o calano.
// Modulo senza dipendenze dal server: lo usano la pagina SEO, il report e l'analisi AI.

export interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** CTR tipico per posizione su Google (ordine di grandezza, risultati organici senza funzioni speciali). */
export function expectedCtr(position: number) {
  const table = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  const p = Math.max(1, Math.round(position));
  return p <= 10 ? table[p - 1] : p <= 20 ? 0.01 : 0.004;
}

export interface Opportunity extends GscRow {
  /** Clic in più al mese se la ricerca salisse in 3ª posizione (stima). */
  extraClicks: number;
  reason: "quasi_prima_pagina" | "ctr_basso";
}

/**
 * Ricerche su cui conviene lavorare: in posizione 4-20 con abbastanza impressioni, oppure già in alto
 * ma con un CTR molto sotto il tipico (titolo e descrizione da riscrivere). Ordinate per clic recuperabili.
 */
export function opportunities(rows: GscRow[], minImpressions = 50, limit = 20): Opportunity[] {
  const out: Opportunity[] = [];
  for (const r of rows) {
    if (r.impressions < minImpressions) continue;
    if (r.position >= 3.5 && r.position <= 20.5) {
      const extra = Math.round(r.impressions * Math.max(0, expectedCtr(3) - r.ctr));
      if (extra > 0) out.push({ ...r, extraClicks: extra, reason: "quasi_prima_pagina" });
    } else if (r.position < 3.5 && r.ctr < expectedCtr(r.position) / 2) {
      const extra = Math.round(r.impressions * (expectedCtr(r.position) - r.ctr));
      if (extra > 0) out.push({ ...r, extraClicks: extra, reason: "ctr_basso" });
    }
  }
  return out.sort((a, b) => b.extraClicks - a.extraClicks).slice(0, limit);
}

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["srl", "spa", "snc", "sas", "srls", "the", "studio", "group", "italia", "societa", "di", "e", "la", "il", "lo"]);

/** Parole del brand: dal nome del cliente, dal dominio del sito e da quelle indicate a mano (separate da virgola). */
export function brandTerms(name: string, website: string | null, extra: string | null) {
  const terms = new Set<string>();
  const whole = norm(name).replace(/ /g, "");
  if (whole.length >= 3) terms.add(whole);
  // Dal nome solo la parola più distintiva (la più lunga): «Caffè Lesioli» → «lesioli», non la generica «caffè»
  const longest = norm(name).split(" ").filter((t) => !STOP.has(t)).sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length >= 5) terms.add(longest);
  if (website) {
    try {
      const host = new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
      const base = host.split(".")[0];
      if (base.length >= 3) terms.add(norm(base).replace(/ /g, ""));
    } catch {
      // indirizzo non valido: si ignora
    }
  }
  for (const t of (extra ?? "").split(",")) {
    const v = norm(t);
    if (v.length >= 3) terms.add(v);
  }
  return [...terms];
}

export const isBrandQuery = (query: string, terms: string[]) => {
  const q = norm(query);
  const compact = q.replace(/ /g, "");
  return terms.some((t) => (t.includes(" ") ? q.includes(t) : compact.includes(t)));
};

/** Clic e impressioni delle ricerche con il nome del brand e senza (sulle ricerche disponibili). */
export function brandSplit(rows: GscRow[], terms: string[]) {
  const acc = { brand: { clicks: 0, impressions: 0, queries: 0 }, generic: { clicks: 0, impressions: 0, queries: 0 } };
  for (const r of rows) {
    const k = isBrandQuery(r.key, terms) ? acc.brand : acc.generic;
    k.clicks += r.clicks;
    k.impressions += r.impressions;
    k.queries++;
  }
  return acc;
}

export interface Change {
  key: string;
  clicks: number;
  prevClicks: number;
  delta: number;
  position: number | null;
  prevPosition: number | null;
}

/** Confronto tra due periodi (pagine o ricerche): le maggiori perdite e i maggiori guadagni di clic. */
export function changes(current: GscRow[], previous: GscRow[], limit = 10) {
  const prev = new Map(previous.map((r) => [r.key, r]));
  const cur = new Map(current.map((r) => [r.key, r]));
  const all: Change[] = [];
  for (const key of new Set([...cur.keys(), ...prev.keys()])) {
    const c = cur.get(key);
    const p = prev.get(key);
    const delta = (c?.clicks ?? 0) - (p?.clicks ?? 0);
    if (delta !== 0) all.push({ key, clicks: c?.clicks ?? 0, prevClicks: p?.clicks ?? 0, delta, position: c?.position ?? null, prevPosition: p?.position ?? null });
  }
  return {
    losers: all.filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit),
    winners: all.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit),
  };
}

/** Variazione percentuale (null se il periodo di confronto è vuoto). */
export const variation = (now: number, before: number) => (before > 0 ? now / before - 1 : null);
