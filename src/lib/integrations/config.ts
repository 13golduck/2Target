import "server-only";

// Chiavi delle app sviluppatore (in .env.local in locale, nelle variabili Node.js su Plesk).
// Ogni piattaforma si attiva da sola quando le sue chiavi sono presenti. Guida: docs/COLLEGAMENTI-API.md

export const META = {
  appId: process.env.META_APP_ID ?? "",
  appSecret: process.env.META_APP_SECRET ?? "",
  version: process.env.META_GRAPH_VERSION ?? "v25.0",
  /** Configurazione di "Facebook Login for Business" (Meta for Developers → Configurazioni): elenca i permessi chiesti. */
  configId: process.env.META_CONFIG_ID ?? "",
  // Lettura di profili, post e statistiche + pubblicazione su Pagine e Instagram.
  // Con META_CONFIG_ID i permessi li decide la configurazione; questo elenco serve senza configurazione.
  scopes: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_read_user_content",
    "pages_manage_posts",
    "read_insights",
    "business_management",
    "instagram_basic",
    "instagram_manage_insights",
    "instagram_content_publish",
  ],
};

export const GOOGLE = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  pageSpeedKey: process.env.GOOGLE_PAGESPEED_KEY ?? "",
  scopes: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
  ],
};

export type Provider = "meta" | "google" | "tiktok" | "linkedin";

export function isConfigured(provider: Provider) {
  if (provider === "meta") return !!(META.appId && META.appSecret);
  if (provider === "google") return !!(GOOGLE.clientId && GOOGLE.clientSecret);
  return false; // TikTok e LinkedIn: in arrivo
}

/** Indirizzo pubblico dell'app: serve per i redirect OAuth (deve coincidere con quello registrato). */
export function appUrl(request?: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (request) {
    const h = request.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3070";
}

export const callbackUrl = (provider: Provider, request?: Request) => `${appUrl(request)}/api/connect/${provider}/callback`;
