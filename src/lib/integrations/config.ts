import "server-only";

// Chiavi delle app sviluppatore (in .env.local in locale, nelle variabili Node.js su Plesk).
// Ogni piattaforma si attiva da sola quando le sue chiavi sono presenti. Guida: docs/COLLEGAMENTI-API.md

export const META = {
  appId: process.env.META_APP_ID ?? "",
  appSecret: process.env.META_APP_SECRET ?? "",
  version: process.env.META_GRAPH_VERSION ?? "v23.0",
  // Lettura di profili, post e statistiche. Pubblicazione e inserzioni si aggiungono più avanti.
  scopes: [
    "pages_show_list",
    "pages_read_engagement",
    "read_insights",
    "business_management",
    "instagram_basic",
    "instagram_manage_insights",
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
