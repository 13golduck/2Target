// Riciclo dei contenuti: quali schede già uscite conviene riproporre.
// Due motivi: il consulente le ha segnate «sempre valide», oppure sono tra le più seguite del cliente.
// Non si ripubblica nulla da solo: si propone una copia in bozza, che passa dall'approvazione come le altre.

export const MIN_AGE_DAYS = 90; // uscita da almeno 3 mesi: il pubblico l'ha dimenticata, l'algoritmo anche
export const COOLDOWN_DAYS = 90; // non riproporre la stessa scheda più di una volta a trimestre
export const TOP_SHARE = 0.25; // «tra le più seguite» = il quarto migliore
export const MIN_POSTS_FOR_TOP = 4; // con meno post il confronto non ha senso
export const MAX_SUGGESTIONS = 6;

const DAY = 86_400_000;

export type RecycleCandidate = {
  itemId: number;
  title: string;
  format: string;
  publishedAt: Date;
  evergreen: boolean;
  /** Ultima copia riproposta (null = mai). */
  lastRecycledAt: Date | null;
  /** Interazioni (per persona raggiunta, se nota) dei post usciti dalla scheda. */
  score: number | null;
};

export type RecycleSuggestion = { itemId: number; title: string; format: string; publishedAt: Date; reason: "sempre valido" | "tra i più seguiti" };

/**
 * Punteggio di un post: interazioni sulle persone raggiunte quando la copertura è nota (confronta post grandi e piccoli),
 * altrimenti le interazioni assolute. Funzione pura.
 */
export function engagementScore(m: Record<string, number> | null | undefined) {
  if (!m) return null;
  const interactions = m.total_interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saved ?? 0);
  const reach = m.reach ?? 0;
  if (!interactions && !reach) return null;
  return reach >= 100 ? interactions / reach : interactions;
}

export function selectRecycle(candidates: RecycleCandidate[], now = new Date()): RecycleSuggestion[] {
  const scored = candidates.filter((c) => c.score != null).map((c) => c.score!).sort((a, b) => b - a);
  const threshold = scored.length >= MIN_POSTS_FOR_TOP ? scored[Math.max(0, Math.ceil(scored.length * TOP_SHARE) - 1)] : Infinity;
  return candidates
    .filter((c) => now.getTime() - c.publishedAt.getTime() >= MIN_AGE_DAYS * DAY)
    .filter((c) => !c.lastRecycledAt || now.getTime() - c.lastRecycledAt.getTime() >= COOLDOWN_DAYS * DAY)
    .map((c) => ({ c, reason: c.evergreen ? ("sempre valido" as const) : c.score != null && c.score >= threshold ? ("tra i più seguiti" as const) : null }))
    .filter((x): x is { c: RecycleCandidate; reason: RecycleSuggestion["reason"] } => !!x.reason)
    // Prima i «sempre validi», poi per punteggio
    .sort((a, b) => (a.reason === b.reason ? (b.c.score ?? 0) - (a.c.score ?? 0) : a.reason === "sempre valido" ? -1 : 1))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ c, reason }) => ({ itemId: c.itemId, title: c.title, format: c.format, publishedAt: c.publishedAt, reason }));
}
