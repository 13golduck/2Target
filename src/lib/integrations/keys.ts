import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

// Chiavi delle integrazioni (Meta, Google) inserite in Impostazioni: cifrate nel database.
// Hanno la precedenza sulle variabili d'ambiente di Plesk, che restano come riserva.
// Si tengono in memoria (globalThis: lo stesso processo serve pagine, azioni e instrumentation)
// e si ricaricano all'avvio e a ogni salvataggio.

const KEY = "integrations";
const PURPOSE = "integrations";

export type IntegrationKeys = {
  metaAppId: string;
  metaAppSecret: string;
  metaConfigId: string;
  /** Utente di sistema del portfolio business di Golduck: token che non scade, per i clienti che danno accesso al portfolio. */
  metaSystemUserToken: string;
  googleClientId: string;
  googleClientSecret: string;
  googlePageSpeedKey: string;
  anthropicApiKey: string;
  /** TikTok for Developers: app 2Target (Login Kit + Display API). */
  tiktokClientKey: string;
  tiktokClientSecret: string;
  /** Permessi chiesti a TikTok (vuoto = predefiniti): con la pubblicazione attiva si aggiunge video.publish. */
  tiktokScopes: string;
  /** Instagram con login Instagram (clienti senza Pagina Facebook): ID e chiave dell'app Instagram, diversi da quelli di Meta. */
  instagramAppId: string;
  instagramAppSecret: string;
  /** Google Ads: developer token del centro clienti (MCC) di Golduck e, se gli account dei clienti sono sotto l'MCC, il suo ID. */
  googleAdsDeveloperToken: string;
  googleAdsLoginCustomerId: string;
  /** LinkedIn: app 2Target con il prodotto Community Management API (pagine aziendali dei clienti). */
  linkedinClientId: string;
  linkedinClientSecret: string;
  /** Permessi chiesti a LinkedIn (vuoto = predefiniti, separati da spazio o virgola). */
  linkedinScopes: string;
  /** Accesso con Microsoft (SSO Golduck): app registrata in Microsoft Entra, un solo tenant. */
  msTenantId: string;
  msClientId: string;
  msClientSecret: string;
  /** Dominio su cui la pubblicazione reale è attiva (vuoto = simulazione). Si imposta con l'interruttore in Impostazioni. */
  publishLiveHost: string;
  /** Threads: ID e chiave dell'app Threads (caso d'uso «Accedi all'API Threads» dell'app Meta: valori propri). */
  threadsAppId: string;
  threadsAppSecret: string;
  /** Pinterest: app su developers.pinterest.com (scrittura dei pin dopo l'approvazione «Standard access»). */
  pinterestAppId: string;
  pinterestAppSecret: string;
  /** «true» = chiede a Google anche il caricamento su YouTube (Shorts): da attivare dopo la verifica Google. */
  googleYoutubeUpload: string;
  /** Google AI Studio (Gemini API): immagini create o modificate dall'AI nello Studio. Progetto Google dedicato. */
  geminiApiKey: string;
  /** Modello Gemini per le immagini (vuoto = predefinito). */
  geminiImageModel: string;
};

export const SECRET_FIELDS = ["metaAppSecret", "metaSystemUserToken", "googleClientSecret", "googlePageSpeedKey", "anthropicApiKey", "msClientSecret", "tiktokClientSecret", "instagramAppSecret", "googleAdsDeveloperToken", "linkedinClientSecret", "threadsAppSecret", "pinterestAppSecret", "geminiApiKey"] as const;
const ENV: Record<keyof IntegrationKeys, string> = {
  metaAppId: "META_APP_ID",
  metaAppSecret: "META_APP_SECRET",
  metaConfigId: "META_CONFIG_ID",
  metaSystemUserToken: "META_SYSTEM_USER_TOKEN",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
  googlePageSpeedKey: "GOOGLE_PAGESPEED_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  tiktokClientKey: "TIKTOK_CLIENT_KEY",
  tiktokClientSecret: "TIKTOK_CLIENT_SECRET",
  tiktokScopes: "TIKTOK_SCOPES",
  instagramAppId: "INSTAGRAM_APP_ID",
  googleAdsDeveloperToken: "GOOGLE_ADS_DEVELOPER_TOKEN",
  googleAdsLoginCustomerId: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  instagramAppSecret: "INSTAGRAM_APP_SECRET",
  linkedinClientId: "LINKEDIN_CLIENT_ID",
  linkedinClientSecret: "LINKEDIN_CLIENT_SECRET",
  linkedinScopes: "LINKEDIN_SCOPES",
  msTenantId: "MS_TENANT_ID",
  msClientId: "MS_CLIENT_ID",
  msClientSecret: "MS_CLIENT_SECRET",
  publishLiveHost: "PUBLISH_LIVE_HOST",
  threadsAppId: "THREADS_APP_ID",
  threadsAppSecret: "THREADS_APP_SECRET",
  pinterestAppId: "PINTEREST_APP_ID",
  pinterestAppSecret: "PINTEREST_APP_SECRET",
  googleYoutubeUpload: "GOOGLE_YOUTUBE_UPLOAD",
  geminiApiKey: "GEMINI_API_KEY",
  geminiImageModel: "GEMINI_IMAGE_MODEL",
};
export const FIELDS = Object.keys(ENV) as (keyof IntegrationKeys)[];

const g = globalThis as unknown as { __integrationKeys?: Partial<IntegrationKeys> };

/** Valore effettivo: Impostazioni, altrimenti variabile d'ambiente. Sincrono (dalla memoria). */
export function integrationKey(field: keyof IntegrationKeys) {
  return g.__integrationKeys?.[field] || process.env[ENV[field]]?.trim() || "";
}

type Stored = Partial<Record<keyof IntegrationKeys, string>>;

async function readStored(): Promise<Stored> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return (row?.value as Stored) ?? {};
}

/** Ricarica in memoria le chiavi salvate (all'avvio e dopo ogni modifica). */
export async function loadIntegrationKeys() {
  const stored = await readStored();
  const plain: Partial<IntegrationKeys> = {};
  for (const f of FIELDS) {
    const v = stored[f];
    if (!v) continue;
    plain[f] = (SECRET_FIELDS as readonly string[]).includes(f) ? (decryptSecret(v, PURPOSE) ?? "") : v;
  }
  g.__integrationKeys = plain;
  return plain;
}

/** Stato per la pagina Impostazioni: mai i segreti, solo da dove arriva ogni valore. */
export async function integrationStatus() {
  const stored = await readStored();
  return Object.fromEntries(
    FIELDS.map((f) => {
      const secret = (SECRET_FIELDS as readonly string[]).includes(f);
      const fromApp = !!stored[f];
      const fromEnv = !fromApp && !!process.env[ENV[f]]?.trim();
      return [f, { source: fromApp ? "app" : fromEnv ? "plesk" : "mancante", value: secret ? null : fromApp ? stored[f] : fromEnv ? process.env[ENV[f]] : "", env: ENV[f] }];
    }),
  ) as Record<keyof IntegrationKeys, { source: "app" | "plesk" | "mancante"; value: string | null; env: string }>;
}

/** Salva: i campi segreti vuoti restano com'erano; "clear" li cancella (si torna alla variabile di Plesk). */
export async function saveIntegrationKeys(input: Partial<IntegrationKeys>, clear: (keyof IntegrationKeys)[], userId: number) {
  const prev = await readStored();
  const next: Stored = { ...prev };
  for (const f of FIELDS) {
    if (clear.includes(f)) {
      delete next[f];
      continue;
    }
    const v = input[f]?.trim();
    if (v === undefined) continue;
    const secret = (SECRET_FIELDS as readonly string[]).includes(f);
    if (secret) {
      if (v) next[f] = encryptSecret(v, PURPOSE);
    } else if (v) next[f] = v;
    else delete next[f];
  }
  await db.insert(appSettings).values({ key: KEY, value: next, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value: next, updatedBy: userId } });
  await loadIntegrationKeys();
  return FIELDS.filter((f) => (prev[f] ?? null) !== (next[f] ?? null));
}

/** Carica le chiavi se non sono ancora in memoria (es. primo uso dopo un riavvio). */
export async function ensureIntegrationKeys() {
  if (!g.__integrationKeys) await loadIntegrationKeys().catch(() => undefined);
}
