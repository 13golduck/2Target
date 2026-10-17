import "server-only";

// Chiavi delle app sviluppatore di Golduck: si inseriscono in 2Target (Impostazioni → Integrazioni);
// le variabili d'ambiente (.env.local, Plesk) restano come riserva. Ogni piattaforma si attiva da sola
// quando le sue chiavi sono presenti. Guida: docs/COLLEGAMENTI-API.md

import { integrationKey } from "./keys";

export const META = {
  // Chiavi: da Impostazioni → Integrazioni (o, in riserva, dalle variabili di Plesk)
  get appId() {
    return integrationKey("metaAppId");
  },
  get appSecret() {
    return integrationKey("metaAppSecret");
  },
  version: process.env.META_GRAPH_VERSION ?? "v25.0",
  /** Configurazione di "Facebook Login for Business" (Meta for Developers → Configurazioni): elenca i permessi chiesti. */
  get configId() {
    return integrationKey("metaConfigId");
  },
  /** Token dell'utente di sistema del portfolio Golduck (vuoto = non configurato). */
  get systemUserToken() {
    return integrationKey("metaSystemUserToken");
  },
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
  get clientId() {
    return integrationKey("googleClientId");
  },
  get clientSecret() {
    return integrationKey("googleClientSecret");
  },
  get pageSpeedKey() {
    return integrationKey("googlePageSpeedKey");
  },
  /** Facoltativo: dal 9/9/2026 Google ha ritirato i developer token (l'accesso dipende dal progetto Google Cloud). */
  get adsDeveloperToken() {
    return integrationKey("googleAdsDeveloperToken");
  },
  /** Google Ads attivo: l'accesso (Test/Explorer/Base) è del progetto Google Cloud. Si spegne con GOOGLE_ADS_ENABLED=false. */
  get adsEnabled() {
    return process.env.GOOGLE_ADS_ENABLED !== "false";
  },
  /** ID del centro clienti (MCC) senza trattini: serve se gli account dei clienti sono gestiti dall'MCC di Golduck. */
  get adsLoginCustomerId() {
    return integrationKey("googleAdsLoginCustomerId").replace(/\D/g, "");
  },
  /** Versione delle API Google Ads (Google ne ritira una all'anno: si aggiorna da qui o con GOOGLE_ADS_VERSION). */
  adsVersion: process.env.GOOGLE_ADS_VERSION ?? "v22",
  // Search Console, Analytics 4, Business Profile e Google Ads (se attivo)
  get scopes() {
    return [
      "openid",
      "email",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/business.manage",
      ...(this.adsEnabled ? ["https://www.googleapis.com/auth/adwords"] : []),
    ];
  },
};

export const TIKTOK = {
  get clientKey() {
    return integrationKey("tiktokClientKey");
  },
  get clientSecret() {
    return integrationKey("tiktokClientSecret");
  },
  // Profilo, statistiche e video; per pubblicare si aggiunge video.publish (Impostazioni → Integrazioni → TikTok)
  // quando il prodotto Content Posting API è attivo sull'app: gli account già collegati vanno ricollegati.
  get scopes() {
    return (integrationKey("tiktokScopes") || "user.info.basic,user.info.stats,video.list").split(",").map((s) => s.trim()).filter(Boolean);
  },
};

/** Instagram con login Instagram: per i profili professionali senza Pagina Facebook (lettura e pubblicazione). */
export const INSTAGRAM = {
  get appId() {
    return integrationKey("instagramAppId");
  },
  get appSecret() {
    return integrationKey("instagramAppSecret");
  },
  scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
};

/** LinkedIn: pagine aziendali dei clienti (Community Management API, approvata da LinkedIn sull'app). */
export const LINKEDIN = {
  get clientId() {
    return integrationKey("linkedinClientId");
  },
  get clientSecret() {
    return integrationKey("linkedinClientSecret");
  },
  // Lettura delle pagine di cui si è amministratori, statistiche e post; pubblicazione a nome della pagina
  get scopes() {
    const custom = integrationKey("linkedinScopes");
    return (custom || "r_basicprofile r_organization_admin r_organization_social w_organization_social rw_organization_admin").split(/[\s,]+/).filter(Boolean);
  },
  /** Versione delle API (AAAAMM): LinkedIn ritira le versioni dopo circa un anno, si aggiorna con LINKEDIN_API_VERSION. */
  version: process.env.LINKEDIN_API_VERSION ?? "202608",
};

export type Provider = "meta" | "google" | "tiktok" | "linkedin" | "instagram";

export function isConfigured(provider: Provider) {
  if (provider === "meta") return !!(META.appId && META.appSecret);
  if (provider === "google") return !!(GOOGLE.clientId && GOOGLE.clientSecret);
  if (provider === "tiktok") return !!(TIKTOK.clientKey && TIKTOK.clientSecret);
  if (provider === "instagram") return !!(INSTAGRAM.appId && INSTAGRAM.appSecret);
  if (provider === "linkedin") return !!(LINKEDIN.clientId && LINKEDIN.clientSecret);
  return false;
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
