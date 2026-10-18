import "server-only";

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { channelDaily, competitors, competitorSnapshots, socialAccounts, socialPosts } from "@/db/schema";
import { discoveryLens, instagramDiscovery } from "@/lib/social-reader";
import { competitorInsights, metricsFromPosts, normalizeInstagram, POSTS_SAMPLE, type CompareRow, type CompetitorMetrics } from "./competitors";

// Istantanee dei concorrenti (una al giorno al massimo) e quadro di confronto con il cliente.
// La lettura usa la «lente» Business Discovery: un account Instagram professionale collegato a 2Target.

const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86_400_000;

type Snapshot = typeof competitorSnapshots.$inferSelect;

const LENS_EXPIRED = /oauth|access token|session has expired|error validating/i;
export const LENS_EXPIRED_MESSAGE = "Il profilo Instagram che 2Target usa per leggere i concorrenti non è più collegato: ricollega la Pagina Facebook di un cliente (o di Golduck) da Canali";

const toMetrics = (s: Snapshot): CompetitorMetrics => ({
  followers: s.followers,
  mediaCount: s.mediaCount,
  postsPerWeek: s.postsPerWeekX10 == null ? null : s.postsPerWeekX10 / 10,
  avgInteractions: s.avgInteractions,
  er: s.erBp == null ? null : s.erBp / 100,
  reelsShare: s.reelsShare,
  lastPostAt: s.lastPostAt,
  topPosts: s.topPosts ?? [],
});

/**
 * Legge su Instagram i concorrenti del cliente che hanno un profilo indicato. Senza `force` salta quelli
 * già letti oggi (la sincronizzazione notturna la chiama per ogni cliente). Gli errori di uno non fermano gli altri.
 */
export async function refreshCompetitorSnapshots(clientId: number, opts: { force?: boolean } = {}) {
  const list = await db.select().from(competitors).where(eq(competitors.clientId, clientId));
  const withIg = list.map((c) => ({ c, username: normalizeInstagram(c.socialHandles?.instagram) })).filter((x) => x.username);
  if (!withIg.length) return { done: 0, errors: [] as string[] };
  const lens = await discoveryLens();
  if (!lens) return { done: 0, errors: ["Per leggere i concorrenti serve almeno un profilo Instagram collegato a 2Target tramite Pagina Facebook (Canali di un cliente o di Golduck)"] };

  const day = today();
  const fresh = opts.force
    ? []
    : await db.select({ id: competitorSnapshots.competitorId }).from(competitorSnapshots).where(and(inArray(competitorSnapshots.competitorId, withIg.map((x) => x.c.id)), eq(competitorSnapshots.day, day)));
  let done = 0;
  const errors: string[] = [];
  for (const { c, username } of withIg) {
    if (fresh.some((f) => f.id === c.id)) continue;
    try {
      const d = await instagramDiscovery(username!, lens);
      const posts = (d.media?.data ?? []).map((m) => ({ at: m.timestamp, type: m.media_product_type === "REELS" ? "REELS" : m.media_type, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, permalink: m.permalink }));
      const m = metricsFromPosts(d.followers_count ?? null, d.media_count ?? null, posts);
      const values = {
        username: username!,
        followers: m.followers,
        mediaCount: m.mediaCount,
        postsPerWeekX10: m.postsPerWeek == null ? null : Math.round(m.postsPerWeek * 10),
        avgInteractions: m.avgInteractions,
        erBp: m.er == null ? null : Math.round(m.er * 100),
        reelsShare: m.reelsShare,
        lastPostAt: m.lastPostAt,
        topPosts: m.topPosts,
      };
      await db.insert(competitorSnapshots).values({ competitorId: c.id, day, ...values }).onDuplicateKeyUpdate({ set: values });
      done++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Token della lente scaduto o revocato: inutile provare gli altri, va ricollegato quel profilo
      if (LENS_EXPIRED.test(message)) {
        errors.push(LENS_EXPIRED_MESSAGE);
        break;
      }
      // Profilo personale, inesistente o rinominato: Meta non lo restituisce
      errors.push(`${c.name} (@${username}): ${message.slice(0, 160)}`);
    }
  }
  return { done, errors };
}

/** Metriche del cliente con lo stesso metodo dei concorrenti: follower di Instagram e ultimi post sincronizzati. */
async function clientMetrics(clientId: number): Promise<{ handle: string; metrics: CompetitorMetrics } | null> {
  const [ig] = await db
    .select({ id: socialAccounts.id, handle: socialAccounts.handle })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, clientId), eq(socialAccounts.platform, "instagram"), eq(socialAccounts.connected, true)))
    .limit(1);
  if (!ig) return null;
  const [followers] = await db
    .select({ value: channelDaily.value })
    .from(channelDaily)
    .where(and(eq(channelDaily.socialAccountId, ig.id), eq(channelDaily.metric, "followers")))
    .orderBy(desc(channelDaily.day))
    .limit(1);
  const posts = await db
    .select({ at: socialPosts.publishedAt, type: socialPosts.mediaType, metrics: socialPosts.metrics, permalink: socialPosts.permalink })
    .from(socialPosts)
    .where(eq(socialPosts.socialAccountId, ig.id))
    .orderBy(desc(socialPosts.publishedAt))
    .limit(POSTS_SAMPLE);
  const sample = posts
    .filter((p) => p.at)
    .map((p) => ({ at: p.at!.toISOString(), type: p.type === "REEL" ? "REELS" : (p.type ?? ""), likes: p.metrics?.likes ?? 0, comments: p.metrics?.comments ?? 0, permalink: p.permalink }));
  return { handle: ig.handle, metrics: metricsFromPosts(followers?.value ?? null, null, sample) };
}

/** Quadro per la pagina Concorrenti: cliente, concorrenti con l'ultima istantanea e la variazione dei follower a 30 giorni. */
export async function competitorOverview(clientId: number) {
  const list = await db.select().from(competitors).where(eq(competitors.clientId, clientId)).orderBy(competitors.name);
  const ids = list.map((c) => c.id);
  const since = new Date(Date.now() - 45 * DAY).toISOString().slice(0, 10);
  const snaps = ids.length
    ? await db.select().from(competitorSnapshots).where(and(inArray(competitorSnapshots.competitorId, ids), gte(competitorSnapshots.day, since), lte(competitorSnapshots.day, today()))).orderBy(competitorSnapshots.day)
    : [];
  const monthAgo = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const rows = list.map((c) => {
    const mine = snaps.filter((s) => s.competitorId === c.id);
    const last = mine.at(-1) ?? null;
    // Riferimento: l'istantanea più vicina a 30 giorni fa (la prima disponibile se sono meno)
    const base = mine.filter((s) => s.day <= monthAgo).at(-1) ?? mine[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      instagram: c.socialHandles?.instagram ?? null,
      fromCheckup: !!c.checkupId,
      lastDay: last?.day ?? null,
      metrics: last ? toMetrics(last) : null,
      followersDelta: last && base && base.id !== last.id && last.followers != null && base.followers != null ? { value: last.followers - base.followers, since: base.day } : null,
    };
  });
  const client = await clientMetrics(clientId);
  const others: CompareRow[] = rows.filter((r) => r.metrics).map((r) => ({ name: r.name, metrics: r.metrics! }));
  return {
    client,
    rows,
    insights: competitorInsights(client ? { name: "Cliente", metrics: client.metrics } : null, others),
  };
}
