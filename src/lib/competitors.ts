// Confronto con i concorrenti su Instagram: metriche dagli ultimi post pubblici e spunti leggibili.
// Funzioni pure (le usano la lettura dei concorrenti, i dati del cliente e i test).

const DAY = 86_400_000;
/** Si guardano gli ultimi 12 post: abbastanza per una media, pochi per restare entro i limiti dell'API. */
export const POSTS_SAMPLE = 12;

export type SamplePost = { at: string; type: string; likes: number; comments: number; permalink?: string | null };

export type CompetitorMetrics = {
  followers: number | null;
  mediaCount: number | null;
  postsPerWeek: number | null;
  avgInteractions: number | null;
  /** Engagement rate in percentuale (interazioni medie / follower). */
  er: number | null;
  /** Quota di reel sugli ultimi post, in percentuale. */
  reelsShare: number | null;
  lastPostAt: Date | null;
  topPosts: { permalink: string; interactions: number; type: string; at: string }[];
};

/** Nome Instagram da «@nome», link al profilo o nome semplice; null se non valido. */
export function normalizeInstagram(input: string | null | undefined) {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const fromUrl = raw.match(/instagram\.com\/([^/?#]+)/i)?.[1];
  const name = (fromUrl ?? raw).replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(name) ? name : null;
}

export function metricsFromPosts(followers: number | null, mediaCount: number | null, posts: SamplePost[], now = new Date()): CompetitorMetrics {
  const sample = [...posts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, POSTS_SAMPLE);
  const interactions = sample.map((p) => p.likes + p.comments);
  const avg = sample.length ? Math.round(interactions.reduce((a, b) => a + b, 0) / sample.length) : null;
  // Frequenza dal post più vecchio del campione a oggi: un account fermo da mesi risulta poco attivo
  const oldest = sample.length ? Date.parse(sample[sample.length - 1].at) : null;
  const weeks = oldest != null ? Math.max(1, (now.getTime() - oldest) / (7 * DAY)) : null;
  return {
    followers,
    mediaCount,
    postsPerWeek: weeks ? Math.round((sample.length / weeks) * 10) / 10 : null,
    avgInteractions: avg,
    er: avg != null && followers ? Math.round((avg / followers) * 10000) / 100 : null,
    reelsShare: sample.length ? Math.round((sample.filter((p) => p.type === "REELS").length / sample.length) * 100) : null,
    lastPostAt: sample.length ? new Date(sample[0].at) : null,
    topPosts: sample
      .filter((p) => p.permalink)
      .map((p) => ({ permalink: p.permalink!, interactions: p.likes + p.comments, type: p.type, at: p.at }))
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 3),
  };
}

export type CompareRow = { name: string; metrics: CompetitorMetrics };

const it = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, useGrouping: "always" });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Spunti per il consulente: dove il cliente sta sotto (o sopra) i concorrenti. Si confronta con la mediana,
 * così un concorrente fuori scala non falsa il quadro. Al massimo 4 frasi, le più utili per prime.
 */
export function competitorInsights(client: CompareRow | null, others: CompareRow[], now = new Date()): string[] {
  const out: string[] = [];
  const with_ = (k: keyof CompetitorMetrics) => others.filter((o) => typeof o.metrics[k] === "number");
  const c = client?.metrics;

  const freq = with_("postsPerWeek");
  if (c?.postsPerWeek != null && freq.length) {
    const m = median(freq.map((o) => o.metrics.postsPerWeek!));
    if (c.postsPerWeek < m * 0.6) out.push(`Il cliente pubblica ${it(c.postsPerWeek)} post a settimana, i concorrenti ${it(m)}: aumentare la frequenza è la leva più semplice.`);
  }
  const er = with_("er");
  if (c?.er != null && er.length) {
    const m = median(er.map((o) => o.metrics.er!));
    if (c.er < m * 0.7) out.push(`Engagement del cliente ${it(c.er)}% contro ${it(m)}% dei concorrenti: i contenuti coinvolgono meno, guarda i loro post migliori qui sotto.`);
    else if (c.er > m * 1.3) out.push(`Engagement del cliente ${it(c.er)}%, sopra i concorrenti (${it(m)}%): il pubblico risponde, conviene spingere sulla crescita.`);
  }
  const reels = with_("reelsShare");
  if (reels.length) {
    const m = median(reels.map((o) => o.metrics.reelsShare!));
    if (m >= 50 && (c?.reelsShare ?? 0) < m / 2) out.push(`I concorrenti puntano sui reel (${Math.round(m)}% dei post), il cliente molto meno: più video brevi nel piano.`);
  }
  const silent = others.filter((o) => o.metrics.lastPostAt && now.getTime() - o.metrics.lastPostAt.getTime() > 30 * DAY);
  if (silent.length) out.push(`${silent.map((o) => o.name).join(", ")} non ${silent.length > 1 ? "pubblicano" : "pubblica"} da oltre un mese: spazio libero da occupare.`);
  const bigger = others.filter((o) => o.metrics.followers && c?.followers && o.metrics.followers > c.followers * 3);
  if (bigger.length && out.length < 4) out.push(`${bigger.map((o) => o.name).join(", ")} ${bigger.length > 1 ? "hanno" : "ha"} più del triplo dei follower: confronta soprattutto engagement e frequenza, non i numeri assoluti.`);
  return out.slice(0, 4);
}
