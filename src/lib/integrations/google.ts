import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";

import { GOOGLE, callbackUrl } from "./config";
import { getJson, qs } from "./http";
import type { DailyValue } from "./meta";

// Google: Search Console (SEO), Analytics 4 (traffico) e PageSpeed Insights (velocità e SEO tecnica).

export function authorizeUrl(state: string, request?: Request) {
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs({
    client_id: GOOGLE.clientId,
    redirect_uri: callbackUrl("google", request),
    response_type: "code",
    scope: GOOGLE.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

export async function exchangeCode(code: string, request?: Request) {
  const t = await getJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({
      code,
      client_id: GOOGLE.clientId,
      client_secret: GOOGLE.clientSecret,
      redirect_uri: callbackUrl("google", request),
      grant_type: "authorization_code",
    }),
  });
  const me = await getJson<{ sub: string; email?: string }>("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes: t.scope ?? GOOGLE.scopes.join(" "),
    externalUserId: me.sub,
    accountName: me.email ?? "Account Google",
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const t = await getJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({ refresh_token: refreshToken, client_id: GOOGLE.clientId, client_secret: GOOGLE.clientSecret, grant_type: "refresh_token" }),
  });
  return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

export interface GoogleAsset {
  kind: "search_console" | "ga4";
  externalId: string;
  handle: string;
  name: string;
}

export async function listAssets(token: string): Promise<GoogleAsset[]> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const out: GoogleAsset[] = [];
  const sites = await getJson<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("https://www.googleapis.com/webmasters/v3/sites", auth).catch(() => ({ siteEntry: [] }));
  for (const s of sites.siteEntry ?? []) {
    if (s.permissionLevel === "siteUnverifiedUser") continue;
    const label = s.siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    out.push({ kind: "search_console", externalId: s.siteUrl, handle: label, name: s.siteUrl.startsWith("sc-domain:") ? `${label} (dominio)` : label });
  }
  type Summaries = { accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[]; nextPageToken?: string };
  let pageToken: string | undefined;
  do {
    const res: Summaries = await getJson<Summaries>(`https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${qs({ pageSize: 200, pageToken })}`, auth).catch(() => ({}));
    for (const a of res.accountSummaries ?? [])
      for (const p of a.propertySummaries ?? [])
        out.push({ kind: "ga4", externalId: p.property, handle: p.displayName, name: `${p.displayName} · ${a.displayName}` });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

// ── Search Console ───────────────────────────────────────────────────

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(token: string, siteUrl: string, body: object) {
  const res = await getJson<{ rows?: GscRow[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  return res.rows ?? [];
}

/** Ultimi 90 giorni giorno per giorno + classifiche query e pagine degli ultimi 28 giorni. */
export async function syncSearchConsole(token: string, siteUrl: string) {
  // I dati di Search Console arrivano con 2-3 giorni di ritardo
  const end = ymd(daysAgo(2));
  const start90 = ymd(daysAgo(92));
  const start28 = ymd(daysAgo(30));

  const daily: DailyValue[] = [];
  for (const r of await gscQuery(token, siteUrl, { startDate: start90, endDate: end, dimensions: ["date"], rowLimit: 500 })) {
    const day = r.keys[0];
    daily.push({ day, metric: "seo_clicks", value: r.clicks }, { day, metric: "seo_impressions", value: r.impressions }, { day, metric: "seo_position", value: r.position });
  }
  const toRows = (rows: GscRow[]) => rows.map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  const queries = toRows(await gscQuery(token, siteUrl, { startDate: start28, endDate: end, dimensions: ["query"], rowLimit: 100 }));
  const pages = toRows(await gscQuery(token, siteUrl, { startDate: start28, endDate: end, dimensions: ["page"], rowLimit: 100 }));
  return { daily, snapshots: [{ kind: "queries" as const, periodStart: start28, periodEnd: end, rows: queries }, { kind: "pages" as const, periodStart: start28, periodEnd: end, rows: pages }] };
}

// ── Analytics 4 ──────────────────────────────────────────────────────

const CHANNEL_METRIC: Record<string, string> = {
  "Organic Search": "sessions_organic_search",
  "Organic Social": "sessions_organic_social",
  "Paid Social": "sessions_paid_social",
  "Paid Search": "sessions_paid_search",
  Direct: "sessions_direct",
  Referral: "sessions_referral",
};

/** Sessioni per canale e conversioni (eventi chiave) degli ultimi 90 giorni. */
export async function syncAnalytics(token: string, property: string) {
  type Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
  const res = await getJson<Report>(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "90daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      limit: 10000,
    }),
  });
  const totals = new Map<string, number>();
  const add = (day: string, metric: string, v: number) => totals.set(`${day}|${metric}`, (totals.get(`${day}|${metric}`) ?? 0) + v);
  for (const r of res.rows ?? []) {
    const raw = r.dimensionValues[0].value; // AAAAMMGG
    const day = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const channel = r.dimensionValues[1].value;
    const sessions = Number(r.metricValues[0].value);
    add(day, "sessions_total", sessions);
    add(day, "key_events", Number(r.metricValues[1].value));
    if (CHANNEL_METRIC[channel]) add(day, CHANNEL_METRIC[channel], sessions);
  }
  const daily: DailyValue[] = [...totals.entries()].map(([k, value]) => {
    const [day, metric] = k.split("|");
    return { day, metric, value };
  });
  return { daily };
}

// ── PageSpeed Insights (non serve l'accesso Google, solo una chiave facoltativa) ──

export async function pageSpeed(url: string, strategy: "mobile" | "desktop" = "mobile") {
  await ensureIntegrationKeys();
  type Psi = {
    lighthouseResult?: { categories?: Record<string, { score: number | null }>; audits?: Record<string, { numericValue?: number; displayValue?: string }> };
    loadingExperience?: { overall_category?: string };
  };
  const params = new URLSearchParams({ url, strategy });
  for (const c of ["PERFORMANCE", "SEO", "ACCESSIBILITY", "BEST_PRACTICES"]) params.append("category", c);
  if (GOOGLE.pageSpeedKey) params.set("key", GOOGLE.pageSpeedKey);
  let r: Psi;
  try {
    r = await getJson<Psi>(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: AbortSignal.timeout(90_000) });
  } catch (e) {
    if (/quota/i.test((e as Error).message) && !GOOGLE.pageSpeedKey) {
      throw new Error("Google ha esaurito la quota gratuita condivisa: imposta GOOGLE_PAGESPEED_KEY (chiave gratuita, vedi docs/COLLEGAMENTI-API.md)");
    }
    throw e;
  }
  const cat = r.lighthouseResult?.categories ?? {};
  const audit = r.lighthouseResult?.audits ?? {};
  const score = (k: string) => (cat[k]?.score == null ? null : Math.round((cat[k].score as number) * 100));
  return {
    url,
    strategy,
    performance: score("performance"),
    seo: score("seo"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    lcp: audit["largest-contentful-paint"]?.displayValue ?? null,
    cls: audit["cumulative-layout-shift"]?.displayValue ?? null,
    tbt: audit["total-blocking-time"]?.displayValue ?? null,
    fieldData: r.loadingExperience?.overall_category ?? null,
  };
}
