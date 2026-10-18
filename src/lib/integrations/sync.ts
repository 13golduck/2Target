import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { channelDaily, connections, kpiMeasurements, kpis, leadEvents, leads, marketingCosts, seoSnapshots, socialAccounts, socialPosts } from "@/db/schema";
import { funnelStats } from "@/lib/leads";
import { adsMonthlySpend } from "@/lib/ads-costs";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { ApiError } from "./http";
import * as google from "./google";
import * as instagram from "./instagram";
import * as linkedin from "./linkedin";
import * as meta from "./meta";
import * as pinterest from "./pinterest";
import * as siteHealth from "./site-health";
import * as threads from "./threads";
import * as tiktok from "./tiktok";
import type { DailyValue, PostData } from "./meta";
import * as youtube from "./youtube";

type Channel = typeof socialAccounts.$inferSelect;
type Connection = typeof connections.$inferSelect;

/** Token valido per la connessione (Google, TikTok e Pinterest si rinnovano con il refresh token, Instagram e Threads rinnovano il loro). */
export async function accessToken(conn: Connection) {
  const token = decryptSecret(conn.accessTokenEnc);
  if (!token) throw new ApiError("Token illeggibile: ricollega l'account", 401, true);
  // Instagram: token di 60 giorni, si rinnova quando ne mancano meno di 10 (la sincronizzazione notturna basta)
  if (conn.provider === "instagram" && conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 10 * 86_400_000) {
    if (conn.expiresAt.getTime() < Date.now()) throw new ApiError("Accesso Instagram scaduto: ricollega l'account", 401, true);
    try {
      const fresh = await instagram.refreshAccessToken(token);
      await db
        .update(connections)
        .set({ accessTokenEnc: encryptSecret(fresh.accessToken), expiresAt: fresh.expiresAt, status: "attivo", lastError: null })
        .where(eq(connections.id, conn.id));
      return fresh.accessToken;
    } catch (e) {
      // Rinnovo non riuscito (es. token di meno di 24 ore): finché è valido si usa quello attuale
      if (e instanceof ApiError && e.expired) throw e;
      return token;
    }
  }
  // Threads: come Instagram, token di 60 giorni rinnovato quando ne mancano meno di 10
  if (conn.provider === "threads" && conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 10 * 86_400_000) {
    if (conn.expiresAt.getTime() < Date.now()) throw new ApiError("Accesso Threads scaduto: ricollega l'account", 401, true);
    try {
      const fresh = await threads.refreshAccessToken(token);
      await db
        .update(connections)
        .set({ accessTokenEnc: encryptSecret(fresh.accessToken), expiresAt: fresh.expiresAt, status: "attivo", lastError: null })
        .where(eq(connections.id, conn.id));
      return fresh.accessToken;
    } catch (e) {
      if (e instanceof ApiError && e.expired) throw e;
      return token;
    }
  }
  // Pinterest: token di 30 giorni, rinnovato con il refresh token (valido un anno) poco prima della scadenza
  if (conn.provider === "pinterest" && conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 86_400_000) {
    const refresh = decryptSecret(conn.refreshTokenEnc);
    if (!refresh) throw new ApiError("Accesso Pinterest scaduto: ricollega l'account", 401, true);
    const fresh = await pinterest.refreshAccessToken(refresh);
    await db
      .update(connections)
      .set({ accessTokenEnc: encryptSecret(fresh.accessToken), ...(fresh.refreshToken && { refreshTokenEnc: encryptSecret(fresh.refreshToken) }), expiresAt: fresh.expiresAt, status: "attivo", lastError: null })
      .where(eq(connections.id, conn.id));
    return fresh.accessToken;
  }
  if (conn.provider === "tiktok" && conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 5 * 60_000) {
    const refresh = decryptSecret(conn.refreshTokenEnc);
    if (!refresh) throw new ApiError("Accesso TikTok scaduto: ricollega l'account", 401, true);
    const fresh = await tiktok.refreshAccessToken(refresh);
    await db
      .update(connections)
      .set({ accessTokenEnc: encryptSecret(fresh.accessToken), refreshTokenEnc: encryptSecret(fresh.refreshToken), expiresAt: fresh.expiresAt, status: "attivo", lastError: null })
      .where(eq(connections.id, conn.id));
    return fresh.accessToken;
  }
  // LinkedIn: token di 60 giorni; con il refresh token (se LinkedIn lo dà all'app) si rinnova da solo, altrimenti si ricollega
  if (conn.provider === "linkedin" && conn.expiresAt && conn.expiresAt.getTime() < Date.now() + 7 * 86_400_000) {
    const refresh = decryptSecret(conn.refreshTokenEnc);
    if (refresh) {
      const fresh = await linkedin.refreshAccessToken(refresh);
      await db
        .update(connections)
        .set({ accessTokenEnc: encryptSecret(fresh.accessToken), refreshTokenEnc: encryptSecret(fresh.refreshToken), expiresAt: fresh.expiresAt, status: "attivo", lastError: null })
        .where(eq(connections.id, conn.id));
      return fresh.accessToken;
    }
    if (conn.expiresAt.getTime() < Date.now()) throw new ApiError("Accesso LinkedIn scaduto: ricollega l'account", 401, true);
  }
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

/**
 * Fotografie SEO: si tengono quelle degli ultimi 14 giorni più l'ultima di ogni mese (storico mensile),
 * così le classifiche di ricerche e pagine non riempiono il database.
 */
async function pruneSnapshots(channelId: number) {
  const rows = await db.select({ id: seoSnapshots.id, kind: seoSnapshots.kind, createdAt: seoSnapshots.createdAt }).from(seoSnapshots).where(eq(seoSnapshots.socialAccountId, channelId));
  const recent = Date.now() - 14 * 86_400_000;
  const keep = new Set<number>();
  const lastOfMonth = new Map<string, number>();
  for (const r of rows.sort((a, b) => a.id - b.id)) {
    if (r.createdAt.getTime() >= recent) keep.add(r.id);
    lastOfMonth.set(`${r.kind}|${r.createdAt.toISOString().slice(0, 7)}`, r.id);
  }
  for (const id of lastOfMonth.values()) keep.add(id);
  const drop = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  for (let i = 0; i < drop.length; i += 200) await db.delete(seoSnapshots).where(inArray(seoSnapshots.id, drop.slice(i, i + 200)));
}

const adsCostNote = (customerId: string) => `Spesa Google Ads letta in automatico (account ${customerId})`;

/**
 * Spesa Google Ads per mese nei costi di marketing (fonte google_ads): così costo per lead, CAC e ROI la contano
 * da soli. Una riga automatica per mese, riscritta a ogni sincronizzazione; quelle inserite a mano restano.
 * Solo per gli account in euro (gli importi dei costi di marketing sono in euro).
 */
async function saveAdsCosts(clientId: number, customerId: string, daily: DailyValue[], currency: string | null, windowStart: string) {
  const note = adsCostNote(customerId);
  if (currency && currency !== "EUR") return;
  const byMonth = adsMonthlySpend(daily, windowStart);
  await db.transaction(async (tx) => {
    for (const [month, amount] of byMonth) {
      // Un mese con costi Google Ads inseriti a mano resta com'è: la spesa non si conta due volte
      const manual = await tx
        .select({ id: marketingCosts.id, notes: marketingCosts.notes })
        .from(marketingCosts)
        .where(and(eq(marketingCosts.clientId, clientId), eq(marketingCosts.month, month), eq(marketingCosts.source, "google_ads")))
        .for("update");
      if (manual.some((m) => !m.notes?.startsWith("Spesa Google Ads letta in automatico"))) continue;
      await tx.delete(marketingCosts).where(and(eq(marketingCosts.clientId, clientId), eq(marketingCosts.month, month), eq(marketingCosts.source, "google_ads"), eq(marketingCosts.notes, note)));
      if (amount > 0) await tx.insert(marketingCosts).values({ clientId, month, source: "google_ads", kind: "inserzioni", amount: Math.round(amount * 100) / 100, notes: note });
    }
  });
}

/** Sincronizza un canale. Restituisce un messaggio leggibile (o lancia l'errore). */
export async function syncChannel(channel: Channel) {
  await ensureIntegrationKeys();
  try {
    if (channel.platform === "website") {
      // PageSpeed e controllo salute sono indipendenti: la quota esaurita del PageSpeed non deve impedire
      // di sapere se il certificato è scaduto o il dominio è stato dirottato (e viceversa).
      let pageSpeedError: unknown = null;
      try {
        const result = await google.pageSpeed(channel.handle, "mobile");
        const day = new Date().toISOString().slice(0, 10);
        await db.insert(seoSnapshots).values({ socialAccountId: channel.id, kind: "pagespeed", periodStart: day, periodEnd: day, rows: [result] });
        await saveDaily(channel.id, [
          ...(result.performance != null ? [{ day, metric: "pagespeed_performance", value: result.performance }] : []),
          ...(result.seo != null ? [{ day, metric: "pagespeed_seo", value: result.seo }] : []),
        ]);
      } catch (e) {
        pageSpeedError = e;
      }
      await siteHealth.runAndStoreSiteHealth(channel);
      // L'errore del PageSpeed resta visibile sul canale, ma solo dopo aver salvato la salute del sito
      if (pageSpeedError) throw pageSpeedError;
    } else {
      if (!channel.connectionId) throw new ApiError("Canale non collegato a un account", 400);
      const [conn] = await db.select().from(connections).where(eq(connections.id, channel.connectionId));
      if (!conn) throw new ApiError("Collegamento non trovato: ricollega l'account", 400, true);
      const userToken = await accessToken(conn);
      const assetToken = decryptSecret(channel.assetTokenEnc) ?? userToken;
      const id = channel.externalId!;

      if (channel.platform === "instagram") {
        // Collegato con il login Instagram: token dell'utente su graph.instagram.com; altrimenti token della Pagina
        const r = conn.provider === "instagram" ? await meta.syncInstagram(id, userToken, "instagram") : await meta.syncInstagram(id, assetToken);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "facebook") {
        const r = await meta.syncFacebookPage(id, assetToken);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "tiktok") {
        const r = await tiktok.syncTikTok(userToken);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "linkedin") {
        const r = await linkedin.syncOrganization(id, userToken);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "threads") {
        const r = await threads.syncThreads(userToken, id);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "pinterest") {
        const r = await pinterest.syncBoard(userToken, id);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "search_console") {
        const r = await google.syncSearchConsole(userToken, id);
        await saveDaily(channel.id, r.daily);
        for (const s of r.snapshots) await db.insert(seoSnapshots).values({ socialAccountId: channel.id, ...s });
      } else if (channel.platform === "ga4") {
        const r = await google.syncAnalytics(userToken, id);
        await saveDaily(channel.id, r.daily);
        for (const s of r.snapshots) await db.insert(seoSnapshots).values({ socialAccountId: channel.id, ...s });
      } else if (channel.platform === "business_profile") {
        const r = await google.syncBusinessProfile(userToken, id);
        await saveDaily(channel.id, r.daily);
        for (const s of r.snapshots) await db.insert(seoSnapshots).values({ socialAccountId: channel.id, ...s });
      } else if (channel.platform === "youtube") {
        const r = await youtube.syncYouTube(userToken, id);
        await saveDaily(channel.id, r.daily);
        await savePosts(channel.id, r.posts);
      } else if (channel.platform === "google_ads") {
        const r = await google.syncGoogleAds(userToken, id);
        await saveDaily(channel.id, r.daily);
        for (const s of r.snapshots) await db.insert(seoSnapshots).values({ socialAccountId: channel.id, ...s });
        await saveAdsCosts(channel.clientId, id, r.daily, r.currency, r.windowStart);
      } else {
        throw new ApiError(`Sincronizzazione non ancora disponibile per ${channel.platform}`, 400);
      }
    }
    await db.update(socialAccounts).set({ lastSyncAt: new Date(), lastSyncError: null }).where(eq(socialAccounts.id, channel.id));
    await pruneSnapshots(channel.id).catch((e) => console.error("[sync] pulizia fotografie SEO:", e));
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
  // Spesa e risultati delle sponsorizzate (import dinamico: il modulo inserzioni usa a sua volta questo file)
  try {
    const { syncAds } = await import("@/lib/ads/ads");
    for (const e of await syncAds(clientId)) errors.push(`Sponsorizzate: ${e}`);
    // Contatti arrivati dai moduli di Meta (lead ads) → Lead del cliente
    const { syncLeadForms } = await import("@/lib/ads/campaigns");
    for (const e of (await syncLeadForms(clientId)).errors) errors.push(`Moduli contatti: ${e}`);
  } catch (e) {
    errors.push(`Sponsorizzate: ${(e as Error).message}`);
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
  "gbp_views", "gbp_calls", "gbp_directions", "gbp_website_clicks", "gbp_rating",
  "ads_conversions", "ads_cpa", "ads_roas",
]);

// Metriche calcolate dal raccoglitore lead (KPI senza canale)
const LEAD_METRICS: Record<string, (s: ReturnType<typeof funnelStats>) => number | null> = {
  leads_total: (s) => s.leads,
  qualified_leads: (s) => s.reached.qualificato,
  new_customers: (s) => s.customers,
  first_order_value: (s) => s.avgDeal,
  days_to_first_order: (s) => s.avgDaysToClose,
  lead_cpl: (s) => s.cpl,
  cac: (s) => s.cac,
  lead_to_customer: (s) => s.leadToCustomer,
  marketing_roi: (s) => s.roi,
};

export async function updateKpisFromData(clientId: number, now = new Date()) {
  const start = `${now.toISOString().slice(0, 8)}01`;
  const end = now.toISOString().slice(0, 10);
  const all = (await db.select().from(kpis).where(eq(kpis.clientId, clientId))).filter((k) => k.active);
  const write = async (kpiId: number, value: number) => {
    await db.delete(kpiMeasurements).where(and(eq(kpiMeasurements.kpiId, kpiId), eq(kpiMeasurements.periodStart, start), eq(kpiMeasurements.source, "api")));
    await db.insert(kpiMeasurements).values({ kpiId, periodStart: start, periodEnd: end, value, source: "api" });
  };

  const leadKpis = all.filter((k) => !k.platform && LEAD_METRICS[k.metricKey]);
  if (leadKpis.length) {
    const rows = await db.select().from(leads).where(eq(leads.clientId, clientId));
    if (rows.length) {
      const events = await db
        .select({ leadId: leadEvents.leadId, toStage: leadEvents.toStage })
        .from(leadEvents)
        .where(sql`${leadEvents.leadId} in (select id from leads where client_id = ${clientId})`);
      const costs = await db.select().from(marketingCosts).where(eq(marketingCosts.clientId, clientId));
      const stats = funnelStats(
        rows.map((l) => ({ id: l.id, source: l.source, stage: l.stage, receivedAt: l.receivedAt, wonAt: l.wonAt, wonValue: l.wonValue, estimatedValue: l.estimatedValue, lostReason: l.lostReason })),
        events,
        costs.map((c) => ({ month: c.month, source: c.source, kind: c.kind, amount: c.amount })),
        new Date(`${start}T00:00:00Z`),
        new Date(`${end}T23:59:59Z`),
      );
      for (const k of leadKpis) {
        const v = LEAD_METRICS[k.metricKey](stats);
        if (v != null) await write(k.id, v);
      }
    }
  }

  const list = all.filter((k) => AUTO_METRICS.has(k.metricKey));
  if (!list.length) return;
  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));

  for (const k of list) {
    // Le metriche Google Ads si leggono sempre dall'account Ads, anche se il KPI è legato a un social
    const ch = (k.metricKey.startsWith("ads_") ? channels.find((c) => c.platform === "google_ads") : undefined) ??
      channels.find((c) => c.platform === k.platform) ??
      (k.metricKey.startsWith("seo_") ? channels.find((c) => c.platform === "search_console") : undefined) ??
      (["organic_sessions", "key_events"].includes(k.metricKey) ? channels.find((c) => c.platform === "ga4") : undefined) ??
      (k.metricKey.startsWith("gbp_") ? channels.find((c) => c.platform === "business_profile") : undefined) ??
      (k.metricKey.startsWith("ads_") ? channels.find((c) => c.platform === "google_ads") : undefined);
    if (!ch) continue;
    const value = await computeMetric(k.metricKey, ch.id, start, end);
    if (value == null) continue;
    await write(k.id, value);
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
  if (key === "gbp_views") {
    const [a, b] = [await dailySum(channelId, "gbp_views_search", start, end), await dailySum(channelId, "gbp_views_maps", start, end)];
    return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
  }
  if (key === "gbp_calls" || key === "gbp_directions" || key === "gbp_website_clicks") return dailySum(channelId, key, start, end);
  if (key === "gbp_rating") {
    const [r] = await db
      .select({ value: channelDaily.value })
      .from(channelDaily)
      .where(and(eq(channelDaily.socialAccountId, channelId), eq(channelDaily.metric, "gbp_rating"), lte(channelDaily.day, end)))
      .orderBy(desc(channelDaily.day))
      .limit(1);
    return r ? r.value : null;
  }
  if (key === "ads_conversions") return dailySum(channelId, "ads_conversions", start, end);
  if (key === "ads_cpa") return ratio(await dailySum(channelId, "ads_spend", start, end), await dailySum(channelId, "ads_conversions", start, end));
  if (key === "ads_roas") return ratio(await dailySum(channelId, "ads_conversion_value", start, end), await dailySum(channelId, "ads_spend", start, end));
  return null;
}
