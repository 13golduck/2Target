import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { channelDaily, connections, kpiMeasurements, kpis, seoSnapshots, socialAccounts, socialPosts } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { ApiError } from "./http";
import * as google from "./google";
import * as meta from "./meta";
import type { DailyValue, PostData } from "./meta";

type Channel = typeof socialAccounts.$inferSelect;
type Connection = typeof connections.$inferSelect;

/** Token valido per la connessione (Google si rinnova da solo con il refresh token). */
async function accessToken(conn: Connection) {
  const token = decryptSecret(conn.accessTokenEnc);
  if (!token) throw new ApiError("Token illeggibile: ricollega l'account", 401, true);
  if (conn.provider === "google" && conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 5 * 60_000) {
    const refresh = decryptSecret(conn.refreshTokenEnc);
    if (!refresh) throw new ApiError("Accesso Google scaduto: ricollega l'account", 401, true);
    const fresh = await google.refreshAccessToken(refresh);
    await db
      .update(connections)
      .set({ accessTokenEnc: encryptSecret(fresh.accessToken), expiresAt: fresh.expiresAt, status: "attivo", lastError: null })
      .where(eq(connections.id, conn.id));
    return fresh.accessToken;
  }
  return token;
}

async function saveDaily(channelId: number, rows: DailyValue[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ socialAccountId: channelId, day: r.day, metric: r.metric, value: r.value }));
    if (chunk.length) await db.insert(channelDaily).values(chunk).onDuplicateKeyUpdate({ set: { value: sql`values(${channelDaily.value})` } });
  }
}

async function savePosts(channelId: number, posts: PostData[]) {
  const now = new Date();
  for (const p of posts) {
    await db
      .insert(socialPosts)
      .values({ socialAccountId: channelId, externalId: p.externalId, mediaType: p.mediaType, permalink: p.permalink, caption: p.caption, thumbnailUrl: p.thumbnailUrl, publishedAt: p.publishedAt, metrics: p.metrics, syncedAt: now })
      .onDuplicateKeyUpdate({ set: { metrics: p.metrics, permalink: p.permalink, caption: p.caption, thumbnailUrl: p.thumbnailUrl, syncedAt: now } });
  }
}

/** Sincronizza un canale. Restituisce un messaggio leggibile (o lancia l'errore). */
export async function syncChannel(channel: Channel) {
  try {
    if (channel.platform === "website") {
      const result = await google.pageSpeed(channel.handle, "mobile");
      const day = new Date().toISOString().slice(0, 10);
      await db.insert(seoSnapshots).values({ socialAccountId: channel.id, kind: "pagespeed", periodStart: day, periodEnd: day, rows: [result] });
      await saveDaily(channel.id, [
        ...(result.performance != null ? [{ day, metric: "pagespeed_performance", value: result.performance }] : []),
        ...(result.seo != null ? [{ day, metric: "pagespeed_seo", value: result.seo }] : []),
      ]);
    } else {
      if (!channel.connectionId) throw new ApiError("Canale non collegato a un account", 400);
      const [conn] = await db.select().from(connections).where(eq(connections.id, channel.connectionId));
      if (!conn) throw new ApiError("Collegamento non trovato: ricollega l'account", 400, true);
      const userToken = await accessToken(conn);
      const assetToken = decryptSecret(channel.assetTokenEnc) ?? userToken;
      const id = channel.externalId!;

      if (channel.platform === "instagram") {
        const r = await meta.syncInstagram(id, assetToken);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "facebook") {
        const r = await meta.syncFacebookPage(id, assetToken);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "search_console") {
        const r = await google.syncSearchConsole(userToken, id);
        await saveDaily(channel.id, r.daily);
        for (const s of r.snapshots) await db.insert(seoSnapshots).values({ socialAccountId: channel.id, ...s });
      } else if (channel.platform === "ga4") {
        const r = await google.syncAnalytics(userToken, id);
        await saveDaily(channel.id, r.daily);
      } else {
        throw new ApiError(`Sincronizzazione non ancora disponibile per ${channel.platform}`, 400);
      }
    }
    await db.update(socialAccounts).set({ lastSyncAt: new Date(), lastSyncError: null }).where(eq(socialAccounts.id, channel.id));
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 500);
    await db.update(socialAccounts).set({ lastSyncError: err.message.slice(0, 500) }).where(eq(socialAccounts.id, channel.id));
    if (err.expired && channel.connectionId) {
      await db.update(connections).set({ status: "scaduto", lastError: err.message.slice(0, 500) }).where(eq(connections.id, channel.connectionId));
    }
    throw err;
  }
}

/** Sincronizza tutti i canali del cliente e aggiorna i KPI. Gli errori di un canale non fermano gli altri. */
export async function syncClient(clientId: number) {
  const list = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  const errors: string[] = [];
  for (const ch of list) {
    if (ch.platform !== "website" && !ch.connectionId) continue;
    try {
      await syncChannel(ch);
    } catch (e) {
      errors.push(`${ch.name ?? ch.handle}: ${(e as Error).message}`);
    }
  }
  await updateKpisFromData(clientId);
  return errors;
}

// ── KPI automatici ───────────────────────────────────────────────────
// Per ogni KPI con una metrica calcolabile dai dati sincronizzati e un canale indicato,
// scrive la misura del mese in corso (fonte "api"). Le misure manuali restano intatte.

const AUTO_METRICS = new Set([
  "reach", "er_reach", "saves_rate", "shares_rate", "follower_growth",
  "seo_clicks", "seo_impressions", "seo_ctr", "seo_position", "organic_sessions", "key_events",
]);

export async function updateKpisFromData(clientId: number, now = new Date()) {
  const start = `${now.toISOString().slice(0, 8)}01`;
  const end = now.toISOString().slice(0, 10);
  const list = (await db.select().from(kpis).where(eq(kpis.clientId, clientId))).filter((k) => k.active && AUTO_METRICS.has(k.metricKey));
  if (!list.length) return;
  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));

  for (const k of list) {
    const ch = channels.find((c) => c.platform === k.platform) ??
      (k.metricKey.startsWith("seo_") ? channels.find((c) => c.platform === "search_console") : undefined) ??
      (["organic_sessions", "key_events"].includes(k.metricKey) ? channels.find((c) => c.platform === "ga4") : undefined);
    if (!ch) continue;
    const value = await computeMetric(k.metricKey, ch.id, start, end);
    if (value == null) continue;
    await db.delete(kpiMeasurements).where(and(eq(kpiMeasurements.kpiId, k.id), eq(kpiMeasurements.periodStart, start), eq(kpiMeasurements.source, "api")));
    await db.insert(kpiMeasurements).values({ kpiId: k.id, periodStart: start, periodEnd: end, value, source: "api" });
  }
}

async function dailySum(channelId: number, metric: string, start: string, end: string) {
  const [r] = await db
    .select({ total: sql<string | null>`sum(${channelDaily.value})`, n: sql<number>`count(*)` })
    .from(channelDaily)
    .where(and(eq(channelDaily.socialAccountId, channelId), eq(channelDaily.metric, metric), gte(channelDaily.day, start), lte(channelDaily.day, end)));
  return r && Number(r.n) > 0 ? Number(r.total) : null;
}

export async function computeMetric(key: string, channelId: number, start: string, end: string): Promise<number | null> {
  const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);

  if (["er_reach", "saves_rate", "shares_rate"].includes(key)) {
    const posts = await db
      .select({ metrics: socialPosts.metrics })
      .from(socialPosts)
      .where(and(eq(socialPosts.socialAccountId, channelId), gte(socialPosts.publishedAt, new Date(`${start}T00:00:00Z`)), lte(socialPosts.publishedAt, new Date(`${end}T23:59:59Z`))));
    const sum = (f: (m: Record<string, number>) => number) => posts.reduce((t, p) => t + f(p.metrics ?? {}), 0);
    const reach = sum((m) => m.reach ?? 0);
    if (!reach) return null;
    if (key === "saves_rate") return sum((m) => m.saved ?? 0) / reach;
    if (key === "shares_rate") return sum((m) => m.shares ?? 0) / reach;
    return sum((m) => m.total_interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.saved ?? 0) + (m.shares ?? 0)) / reach;
  }
  if (key === "follower_growth") {
    const rows = await db
      .select({ day: channelDaily.day, value: channelDaily.value })
      .from(channelDaily)
      .where(and(eq(channelDaily.socialAccountId, channelId), eq(channelDaily.metric, "followers"), gte(channelDaily.day, start), lte(channelDaily.day, end)))
      .orderBy(channelDaily.day);
    return rows.length >= 2 && rows[0].value ? (rows[rows.length - 1].value - rows[0].value) / rows[0].value : null;
  }
  if (key === "reach") return dailySum(channelId, "reach", start, end);
  if (key === "seo_clicks") return dailySum(channelId, "seo_clicks", start, end);
  if (key === "seo_impressions") return dailySum(channelId, "seo_impressions", start, end);
  if (key === "seo_ctr") return ratio(await dailySum(channelId, "seo_clicks", start, end), await dailySum(channelId, "seo_impressions", start, end));
  if (key === "seo_position") {
    // Media della posizione pesata sulle impressioni di ogni giorno
    const [r] = await db
      .select({
        w: sql<string | null>`sum(p.value * i.value)`,
        i: sql<string | null>`sum(i.value)`,
      })
      .from(sql`${channelDaily} p join ${channelDaily} i on i.social_account_id = p.social_account_id and i.day = p.day and i.metric = 'seo_impressions'`)
      .where(sql`p.social_account_id = ${channelId} and p.metric = 'seo_position' and p.day between ${start} and ${end}`);
    return r?.i && Number(r.i) > 0 ? Number(r.w) / Number(r.i) : null;
  }
  if (key === "organic_sessions") return dailySum(channelId, "sessions_organic_search", start, end);
  if (key === "key_events") return dailySum(channelId, "key_events", start, end);
  return null;
}
