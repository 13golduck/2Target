import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";

import { GOOGLE, callbackUrl } from "./config";
import { ApiError, getJson, qs } from "./http";
import type { DailyValue } from "./meta";

// Google: Search Console (SEO), Analytics 4 (traffico), Business Profile (scheda Google del cliente),
// Google Ads (campagne a pagamento) e PageSpeed Insights (velocità e SEO tecnica).

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
  kind: "search_console" | "ga4" | "business_profile" | "google_ads";
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
  // Business Profile e Google Ads: richiedono permessi in più (gli account collegati prima vanno ricollegati)
  out.push(...(await listBusinessProfiles(token).catch(() => [])));
  out.push(...(await listAdsAccounts(token).catch(() => [])));
  return out;
}

// ── Business Profile ─────────────────────────────────────────────────
// Schede Google del cliente (ex Google My Business). L'accesso alle API va richiesto a Google per il progetto.

async function listBusinessProfiles(token: string): Promise<GoogleAsset[]> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const out: GoogleAsset[] = [];
  const accounts = await getJson<{ accounts?: { name: string; accountName?: string }[] }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", auth);
  for (const a of accounts.accounts ?? []) {
    let pageToken: string | undefined;
    do {
      const res: { locations?: { name: string; title?: string; storefrontAddress?: { locality?: string } }[]; nextPageToken?: string } = await getJson(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?${qs({ readMask: "name,title,storefrontAddress", pageSize: 100, pageToken })}`,
        auth,
      );
      for (const l of res.locations ?? []) {
        const city = l.storefrontAddress?.locality;
        // externalId «accounts/A/locations/L»: serve sia alle statistiche (locations/L) sia alle recensioni (accounts/A/locations/L)
        out.push({ kind: "business_profile", externalId: `${a.name}/${l.name}`, handle: l.title ?? l.name, name: `${l.title ?? l.name}${city ? ` · ${city}` : ""}` });
      }
      pageToken = res.nextPageToken;
    } while (pageToken);
  }
  return out;
}

const GBP_METRICS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "gbp_views_search",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "gbp_views_search",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "gbp_views_maps",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "gbp_views_maps",
  CALL_CLICKS: "gbp_calls",
  BUSINESS_DIRECTION_REQUESTS: "gbp_directions",
  WEBSITE_CLICKS: "gbp_website_clicks",
  BUSINESS_CONVERSATIONS: "gbp_messages",
  BUSINESS_BOOKINGS: "gbp_bookings",
};
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** Scheda Google: visualizzazioni (ricerca e Maps), chiamate, indicazioni, clic al sito giorno per giorno; recensioni. */
export async function syncBusinessProfile(token: string, externalId: string) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const location = externalId.slice(externalId.indexOf("locations/"));
  const start = daysAgo(92);
  const end = daysAgo(1);
  const params = new URLSearchParams();
  for (const m of Object.keys(GBP_METRICS)) params.append("dailyMetrics", m);
  params.set("dailyRange.start_date.year", String(start.getUTCFullYear()));
  params.set("dailyRange.start_date.month", String(start.getUTCMonth() + 1));
  params.set("dailyRange.start_date.day", String(start.getUTCDate()));
  params.set("dailyRange.end_date.year", String(end.getUTCFullYear()));
  params.set("dailyRange.end_date.month", String(end.getUTCMonth() + 1));
  params.set("dailyRange.end_date.day", String(end.getUTCDate()));
  type Series = { dailyMetric: string; timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] } };
  const res = await getJson<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: Series[] }[] }>(
    `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries?${params}`,
    auth,
  );
  const totals = new Map<string, number>();
  for (const group of res.multiDailyMetricTimeSeries ?? [])
    for (const ser of group.dailyMetricTimeSeries ?? [])
      for (const v of ser.timeSeries?.datedValues ?? []) {
        const day = `${v.date.year}-${String(v.date.month).padStart(2, "0")}-${String(v.date.day).padStart(2, "0")}`;
        const metric = GBP_METRICS[ser.dailyMetric];
        if (metric) totals.set(`${day}|${metric}`, (totals.get(`${day}|${metric}`) ?? 0) + Number(v.value ?? 0));
      }
  const daily: DailyValue[] = [...totals.entries()].map(([k, value]) => {
    const [day, metric] = k.split("|");
    return { day, metric, value };
  });

  // Recensioni (API v4): ultime 50, valutazione media e totale. Se non disponibili restano solo le statistiche.
  type Review = { reviewer?: { displayName?: string }; starRating?: string; comment?: string; createTime: string; reviewReply?: { comment?: string } };
  const reviews = await getJson<{ reviews?: Review[]; averageRating?: number; totalReviewCount?: number }>(`https://mybusiness.googleapis.com/v4/${externalId}/reviews?pageSize=50`, auth).catch(() => null);
  const today = ymd(new Date());
  if (reviews?.averageRating != null) daily.push({ day: today, metric: "gbp_rating", value: reviews.averageRating });
  if (reviews?.totalReviewCount != null) daily.push({ day: today, metric: "gbp_reviews_total", value: reviews.totalReviewCount });
  const snapshots = reviews
    ? [
        {
          kind: "gbp_reviews" as const,
          periodStart: today,
          periodEnd: today,
          rows: (reviews.reviews ?? []).map((r) => ({
            author: r.reviewer?.displayName ?? "Utente Google",
            stars: STARS[r.starRating ?? ""] ?? null,
            comment: (r.comment ?? "").slice(0, 1500),
            at: r.createTime,
            replied: !!r.reviewReply?.comment,
          })),
        },
      ]
    : [];
  return { daily, snapshots };
}

// ── Google Ads ───────────────────────────────────────────────────────
// Serve il developer token del centro clienti (MCC) di Golduck, approvato da Google per l'accesso «Base».

const adsUrl = (path: string) => `https://googleads.googleapis.com/${GOOGLE.adsVersion}/${path}`;
// login-customer-id solo quando l'account si raggiunge tramite un centro clienti (MCC), mai per l'accesso diretto
const adsHeaders = (token: string, loginCustomerId?: string) => ({
  Authorization: `Bearer ${token}`,
  "developer-token": GOOGLE.adsDeveloperToken,
  "Content-Type": "application/json",
  ...(loginCustomerId && { "login-customer-id": loginCustomerId }),
});

async function adsSearch<T>(token: string, customerId: string, query: string, loginCustomerId?: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const res: { results?: T[]; nextPageToken?: string } = await getJson(adsUrl(`customers/${customerId}/googleAds:search`), {
      method: "POST",
      headers: adsHeaders(token, loginCustomerId),
      body: JSON.stringify({ query, ...(pageToken && { pageToken }) }),
    });
    out.push(...(res.results ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken && out.length < 20_000);
  return out;
}

const adsLabel = (id: string) => id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

async function accessibleCustomers(token: string) {
  const res = await getJson<{ resourceNames?: string[] }>(adsUrl("customers:listAccessibleCustomers"), { headers: adsHeaders(token) });
  return (res.resourceNames ?? []).map((rn) => rn.split("/")[1]);
}

type CustomerClient = { customerClient: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; status?: string } };

/** Account dei clienti sotto un centro clienti (MCC), a qualsiasi livello. */
async function managerChildren(token: string, managerId: string) {
  const rows = await adsSearch<CustomerClient>(
    token,
    managerId,
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.level >= 1",
    managerId,
  ).catch(() => []);
  return rows.map((r) => r.customerClient).filter((c) => c.id && !c.manager && (!c.status || c.status === "ENABLED"));
}

/**
 * Account Google Ads visibili all'utente collegato: quelli a cui ha accesso diretto e, per i centri clienti (MCC),
 * gli account dei clienti che gestiscono (è il caso dell'utente Golduck con il centro clienti di Golduck).
 */
async function listAdsAccounts(token: string): Promise<GoogleAsset[]> {
  if (!GOOGLE.adsDeveloperToken) return [];
  const out = new Map<string, GoogleAsset>();
  const push = (id: string, name?: string, currency?: string) => {
    if (!out.has(id)) out.set(id, { kind: "google_ads", externalId: id, handle: adsLabel(id), name: `${name || "Account Google Ads"} · ${adsLabel(id)}${currency ? ` · ${currency}` : ""}` });
  };
  for (const id of await accessibleCustomers(token)) {
    const [c] = await adsSearch<{ customer: { descriptiveName?: string; currencyCode?: string; manager?: boolean } }>(
      token,
      id,
      "SELECT customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1",
    ).catch(() => []);
    if (!c?.customer.manager) push(id, c?.customer.descriptiveName, c?.customer.currencyCode);
    else for (const child of await managerChildren(token, id)) push(child.id!, child.descriptiveName, child.currencyCode);
  }
  return [...out.values()];
}

/** Da quale centro clienti passare per leggere l'account (undefined = accesso diretto). */
async function adsLoginFor(token: string, customerId: string) {
  const direct = await accessibleCustomers(token);
  if (direct.includes(customerId)) return undefined;
  // Prima il centro clienti di Golduck (se configurato), poi gli altri a cui l'utente ha accesso
  const candidates = [...new Set([GOOGLE.adsLoginCustomerId, ...direct].filter(Boolean))];
  for (const managerId of candidates) {
    const rows = await adsSearch<CustomerClient>(token, managerId, `SELECT customer_client.id FROM customer_client WHERE customer_client.id = ${Number(customerId)}`, managerId).catch(() => []);
    if (rows.length) return managerId;
  }
  throw new ApiError(`L'account Google Ads ${adsLabel(customerId)} non è più raggiungibile con questo collegamento: ricollega Google da Canali`, 403);
}

/** Google Ads: spesa, clic, impression, conversioni giorno per giorno (90 giorni) e per campagna (28 giorni). */
export async function syncGoogleAds(token: string, customerId: string) {
  type Row = {
    segments: { date: string };
    campaign: { id: string; name: string; status?: string };
    metrics: { costMicros?: string; clicks?: string; impressions?: string; conversions?: number; conversionsValue?: number };
  };
  const windowStart = ymd(daysAgo(91));
  const login = await adsLoginFor(token, customerId);
  const rows = await adsSearch<Row>(
    token,
    customerId,
    `SELECT segments.date, campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${windowStart}' AND '${ymd(daysAgo(1))}'`,
    login,
  );
  const [cust] = await adsSearch<{ customer: { currencyCode?: string } }>(token, customerId, "SELECT customer.currency_code FROM customer LIMIT 1", login).catch(() => []);
  const totals = new Map<string, number>();
  const add = (day: string, metric: string, v: number) => totals.set(`${day}|${metric}`, (totals.get(`${day}|${metric}`) ?? 0) + v);
  const since28 = ymd(daysAgo(28));
  const campaigns = new Map<string, { id: string; name: string; status: string; cost: number; clicks: number; impressions: number; conversions: number; value: number }>();
  for (const r of rows) {
    const day = r.segments.date;
    const cost = Number(r.metrics.costMicros ?? 0) / 1_000_000;
    const clicks = Number(r.metrics.clicks ?? 0);
    const impressions = Number(r.metrics.impressions ?? 0);
    const conversions = Number(r.metrics.conversions ?? 0);
    const value = Number(r.metrics.conversionsValue ?? 0);
    add(day, "ads_spend", cost);
    add(day, "ads_clicks", clicks);
    add(day, "ads_impressions", impressions);
    add(day, "ads_conversions", conversions);
    add(day, "ads_conversion_value", value);
    if (day >= since28) {
      const c = campaigns.get(r.campaign.id) ?? { id: r.campaign.id, name: r.campaign.name, status: r.campaign.status ?? "", cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
      c.cost += cost;
      c.clicks += clicks;
      c.impressions += impressions;
      c.conversions += conversions;
      c.value += value;
      campaigns.set(r.campaign.id, c);
    }
  }
  const daily: DailyValue[] = [...totals.entries()].map(([k, value]) => {
    const [day, metric] = k.split("|");
    return { day, metric, value };
  });
  return {
    daily,
    windowStart,
    currency: cust?.customer.currencyCode ?? null,
    snapshots: [{ kind: "ads_campaigns" as const, periodStart: since28, periodEnd: ymd(daysAgo(1)), rows: [...campaigns.values()].sort((a, b) => b.cost - a.cost) }],
  };
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

/**
 * Ultimi 90 giorni giorno per giorno; ricerche e pagine degli ultimi 28 giorni e dei 28 precedenti (per le variazioni);
 * dispositivi; totali a confronto con il periodo precedente e con lo stesso periodo dell'anno prima.
 */
export async function syncSearchConsole(token: string, siteUrl: string) {
  // I dati di Search Console arrivano con 2-3 giorni di ritardo
  const end = ymd(daysAgo(2));
  const start90 = ymd(daysAgo(92));
  const cur = { start: ymd(daysAgo(29)), end };
  const prev = { start: ymd(daysAgo(57)), end: ymd(daysAgo(30)) };
  // Anno prima: 364 giorni, così i giorni della settimana coincidono
  const year = { start: ymd(daysAgo(29 + 364)), end: ymd(daysAgo(2 + 364)) };

  const daily: DailyValue[] = [];
  for (const r of await gscQuery(token, siteUrl, { startDate: start90, endDate: end, dimensions: ["date"], rowLimit: 500 })) {
    const day = r.keys[0];
    daily.push({ day, metric: "seo_clicks", value: r.clicks }, { day, metric: "seo_impressions", value: r.impressions }, { day, metric: "seo_position", value: r.position });
  }
  const toRows = (rows: GscRow[]) => rows.map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  const by = (dimension: string, p: { start: string; end: string }, rowLimit: number) =>
    gscQuery(token, siteUrl, { startDate: p.start, endDate: p.end, dimensions: [dimension], rowLimit }).then(toRows);
  const total = async (label: string, p: { start: string; end: string }) => {
    const [r] = await gscQuery(token, siteUrl, { startDate: p.start, endDate: p.end });
    return { key: label, start: p.start, end: p.end, clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, ctr: r?.ctr ?? 0, position: r?.position ?? 0 };
  };

  const [queries, pages, queriesPrev, pagesPrev, devices, devicesPrev, summary] = await Promise.all([
    by("query", cur, 1000),
    by("page", cur, 500),
    by("query", prev, 1000),
    by("page", prev, 500),
    by("device", cur, 10),
    by("device", prev, 10),
    Promise.all([total("attuale", cur), total("precedente", prev), total("anno_prima", year)]),
  ]);
  const snap = (kind: "queries" | "pages" | "queries_prev" | "pages_prev" | "devices" | "summary", p: { start: string; end: string }, rows: Record<string, unknown>[]) => ({
    kind,
    periodStart: p.start,
    periodEnd: p.end,
    rows,
  });
  return {
    daily,
    snapshots: [
      snap("queries", cur, queries),
      snap("pages", cur, pages),
      snap("queries_prev", prev, queriesPrev),
      snap("pages_prev", prev, pagesPrev),
      snap("devices", cur, devices.map((d) => ({ ...d, prevClicks: devicesPrev.find((x) => x.key === d.key)?.clicks ?? 0 }))),
      snap("summary", cur, summary),
    ],
  };
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

type Ga4Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };

async function ga4Report(token: string, property: string, body: object) {
  return getJson<Ga4Report>(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Righe di un report come oggetti { dimensione: valore, metrica: numero }. */
function ga4Rows(res: Ga4Report, dims: string[], metrics: string[]) {
  return (res.rows ?? []).map((r) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, r.dimensionValues[i]?.value ?? ""])),
    ...Object.fromEntries(metrics.map((m, i) => [m, Number(r.metricValues[i]?.value ?? 0)])),
  }));
}

/**
 * Sessioni per canale e conversioni (eventi chiave) degli ultimi 90 giorni giorno per giorno;
 * degli ultimi 28 giorni: pagine di atterraggio, campagne (sorgente / mezzo / campagna, cioè gli UTM) e
 * conversioni per evento e canale.
 */
export async function syncAnalytics(token: string, property: string) {
  const res = await ga4Report(token, property, {
    dateRanges: [{ startDate: "90daysAgo", endDate: "yesterday" }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }],
    limit: 10000,
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

  const range = [{ startDate: "28daysAgo", endDate: "yesterday" }];
  const periodStart = ymd(daysAgo(28));
  const periodEnd = ymd(daysAgo(1));
  const report = async (dims: string[], metrics: string[], limit: number, extra: object = {}) =>
    ga4Rows(
      await ga4Report(token, property, { dateRanges: range, dimensions: dims.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit, ...extra }),
      dims,
      metrics,
    );
  const byMetric = (name: string) => ({ orderBys: [{ metric: { metricName: name }, desc: true }] });
  // Dettagli: se una proprietà non ha una metrica (es. nessun e-commerce) il resto dei dati resta valido
  const [landing, campaigns, conversions] = await Promise.all([
    report(["landingPage"], ["sessions", "engagementRate", "keyEvents", "totalUsers"], 50, byMetric("sessions")).catch(() => []),
    report(["sessionSource", "sessionMedium", "sessionCampaignName"], ["sessions", "keyEvents", "totalRevenue"], 50, byMetric("sessions")).catch(() =>
      report(["sessionSource", "sessionMedium", "sessionCampaignName"], ["sessions", "keyEvents"], 50, byMetric("sessions")).catch(() => []),
    ),
    report(["eventName", "sessionDefaultChannelGroup"], ["keyEvents"], 200, byMetric("keyEvents")).catch(() => []),
  ]);
  return {
    daily,
    snapshots: [
      { kind: "landing_pages" as const, periodStart, periodEnd, rows: landing },
      { kind: "campaigns" as const, periodStart, periodEnd, rows: campaigns },
      { kind: "conversions" as const, periodStart, periodEnd, rows: conversions.filter((r) => Number(r.keyEvents) > 0) },
    ],
  };
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
      throw new Error("Google ha esaurito la quota gratuita condivisa: inserisci la chiave API PageSpeed in Impostazioni → Integrazioni (è gratuita)");
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
