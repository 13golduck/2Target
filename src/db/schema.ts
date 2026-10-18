// Schema MariaDB (Drizzle). Le migrazioni si generano con `npm run db:generate` nella cartella drizzle/
// e l'app le applica da sola all'avvio (src/instrumentation.ts).

import type { CheckupReport } from "../lib/checkup-report";
import type { CheckupFoundation } from "../lib/checkup-foundation";
import type { TikTokOptions } from "../lib/publishing/tiktok-rules";
import type { BrandKitData, CreativeBrief, DesignReview } from "../lib/design-types";
import { REASONING, REGISTERS } from "../lib/checkup-report";
import {
  mediumtext,
  boolean,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const created = () => timestamp("created_at").notNull().defaultNow();
const updated = () => timestamp("updated_at").notNull().defaultNow().onUpdateNow();
const money = (name: string) => decimal(name, { precision: 12, scale: 2, mode: "number" });
const num = (name: string) => decimal(name, { precision: 14, scale: 6, mode: "number" });

export const FUNNEL = ["awareness", "consideration", "conversion", "retention"] as const;
export const PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "newsletter"] as const;
export const FORMATS = ["reel", "post", "carosello", "storia", "video", "articolo", "email"] as const;
export const CTA_DESTINATIONS = ["sito", "telefono", "whatsapp", "direct", "modulo", "nessuna"] as const;
export const AD_OBJECTIVES = ["notorieta", "traffico", "interazione", "contatti", "messaggi", "chiamate", "vendite"] as const;
export const ITEM_STATUSES = ["bozza", "da_approvare", "approvato", "pubblicato", "annullato"] as const;
export const PRODUCTION_STATUSES = ["da_fare", "materiale_richiesto", "in_montaggio", "pronto"] as const;
export const IDEA_STATUSES = ["idea", "in_sviluppo", "approvata", "pianificata", "scartata"] as const;

// ── Team ─────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 190 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  // Facoltativa: l'accesso normale è con codice via email
  passwordHash: varchar("password_hash", { length: 255 }),
  // superadmin (titolare, intoccabile) > admin > user (operatore) > viewer (cliente, sola lettura)
  role: mysqlEnum("role", ["superadmin", "admin", "user", "viewer"]).notNull().default("user"),
  active: boolean("active").notNull().default(true),
  /** Doppio fattore (app di autenticazione): segreto cifrato; attivo solo se totpEnabledAt è valorizzato. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: datetime("totp_enabled_at"),
  /** Impronte dei codici di recupero ancora non usati. */
  totpRecovery: json("totp_recovery").$type<string[]>(),
  /** Può programmare e pubblicare sui profili dei clienti (Super admin e Administrator possono sempre). */
  canPublish: boolean("can_publish").notNull().default(false),
  /** Riepilogo settimanale via email (uscite, contenuti non usciti, prossima settimana). Non per i Viewer. */
  weeklyDigest: boolean("weekly_digest").notNull().default(true),
  lastLoginAt: datetime("last_login_at"),
  /** Ultima email di invito inviata (null = mai invitato). */
  invitedAt: datetime("invited_at"),
  createdAt: created(),
});

/** Codici di accesso monouso inviati via email (si salva solo l'impronta HMAC). */
export const loginCodes = mysqlTable(
  "login_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    attempts: int("attempts").notNull().default(0),
    usedAt: datetime("used_at"),
    requestIp: varchar("request_ip", { length: 64 }),
    /** Accesso o sblocco delle Impostazioni: i due tipi di codice non sono intercambiabili. */
    purpose: mysqlEnum("purpose", ["login", "settings"]).notNull().default("login"),
    createdAt: created(),
  },
  (t) => [index("login_codes_user_purpose").on(t.userId, t.purpose, t.createdAt)],
);

// ── Clienti ──────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  sector: varchar("sector", { length: 200 }),
  website: varchar("website", { length: 255 }),
  vatNumber: varchar("vat_number", { length: 32 }),
  city: varchar("city", { length: 120 }),
  contactName: varchar("contact_name", { length: 160 }),
  socialLinks: text("social_links"), // un profilo per riga
  notes: text("notes"), // appunti dell'incontro iniziale
  ownerId: int("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["onboarding", "attivo", "in_pausa", "chiuso"]).notNull().default("onboarding"),
  /** Chiave pubblica per ricevere i lead dai moduli del sito del cliente (POST /api/lead/<chiave>). */
  leadToken: varchar("lead_token", { length: 64 }).unique(),
  // Sponsorizzate Meta: chi paga (account del cliente o di Golduck, poi rifatturato), quale account pubblicitario, limiti
  adsPayer: mysqlEnum("ads_payer", ["cliente", "golduck"]).notNull().default("cliente"),
  adAccountId: varchar("ad_account_id", { length: 40 }),
  adAccountName: varchar("ad_account_name", { length: 200 }),
  adAccountCurrency: varchar("ad_account_currency", { length: 3 }),
  /** Tetto di spesa del mese in euro per questo cliente (null = nessuno). */
  adsMonthlyCap: money("ads_monthly_cap"),
  /** Ricarico sulla spesa quando paga Golduck e rifattura (1,15 = +15%). */
  adsMarkup: decimal("ads_markup", { precision: 5, scale: 2, mode: "number" }).notNull().default(1),
  /** Approvazione dei contenuti via link (senza account): attivabile per cliente. */
  approvalEnabled: boolean("approval_enabled").notNull().default(false),
  /** Report mensile automatico: a chi mandarlo e ultimo mese inviato (AAAA-MM), per non mandarlo due volte. */
  reportEmail: varchar("report_email", { length: 255 }),
  reportMonthly: boolean("report_monthly").notNull().default(false),
  reportLastMonth: varchar("report_last_month", { length: 7 }),
  /** Parole del brand per separare le ricerche con il nome del cliente (oltre a nome e dominio), separate da virgola. */
  brandTerms: varchar("brand_terms", { length: 500 }),
  createdAt: created(),
});

/** Clienti visibili da un utente Viewer (il cliente vede solo i propri risultati). */
export const userClients = mysqlTable(
  "user_clients",
  {
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientId] })],
);

// ── Collegamenti alle piattaforme e canali ────────────────────────────
export const PROVIDERS = ["meta", "google", "tiktok", "linkedin", "instagram"] as const;
export const CHANNEL_KINDS = [
  "instagram", "facebook", "tiktok", "linkedin", "youtube",
  "search_console", "ga4", "business_profile", "website", "google_ads",
] as const;

/** Accesso concesso da un utente su una piattaforma (token cifrati). Uno per account collegato. */
export const connections = mysqlTable(
  "connections",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    provider: mysqlEnum("provider", PROVIDERS).notNull(),
    externalUserId: varchar("external_user_id", { length: 120 }).notNull(),
    accountName: varchar("account_name", { length: 200 }),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: datetime("expires_at"),
    scopes: text("scopes"),
    status: mysqlEnum("status", ["attivo", "scaduto", "errore"]).notNull().default("attivo"),
    lastError: text("last_error"),
    connectedBy: int("connected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("connections_unique").on(t.clientId, t.provider, t.externalUserId)],
);

/** Canale del cliente: profilo social, proprietà Search Console / GA4, sito. */
export const socialAccounts = mysqlTable(
  "social_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    connectionId: int("connection_id").references(() => connections.id, { onDelete: "set null" }),
    platform: mysqlEnum("platform", CHANNEL_KINDS).notNull(),
    handle: varchar("handle", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    pictureUrl: text("picture_url"),
    externalId: varchar("external_id", { length: 255 }),
    /** Token di pagina Facebook cifrato (serve per leggere insight e pubblicare sulla pagina). */
    assetTokenEnc: text("asset_token_enc"),
    connected: boolean("connected").notNull().default(false),
    lastSyncAt: datetime("last_sync_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("social_accounts_unique").on(t.clientId, t.platform, t.handle),
    // Un profilo collegato appartiene a un solo cliente: impossibile pubblicare sul profilo di un altro
    uniqueIndex("social_accounts_external").on(t.platform, t.externalId),
  ],
);

/** Valori giornalieri per canale (follower, reach, clic SEO, sessioni…). */
export const channelDaily = mysqlTable(
  "channel_daily",
  {
    socialAccountId: int("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    metric: varchar("metric", { length: 60 }).notNull(),
    value: num("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.socialAccountId, t.day, t.metric] })],
);

/** Post letti dalle piattaforme, con le metriche più recenti; collegabili a una scheda del piano. */
export const socialPosts = mysqlTable(
  "social_posts",
  {
    id: int("id").autoincrement().primaryKey(),
    socialAccountId: int("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 120 }).notNull(),
    editorialItemId: int("editorial_item_id").references(() => editorialItems.id, { onDelete: "set null" }),
    mediaType: varchar("media_type", { length: 40 }),
    permalink: varchar("permalink", { length: 500 }),
    caption: text("caption"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: datetime("published_at"),
    metrics: json("metrics").$type<Record<string, number>>(),
    syncedAt: datetime("synced_at"),
  },
  (t) => [uniqueIndex("social_posts_unique").on(t.socialAccountId, t.externalId), index("social_posts_date").on(t.socialAccountId, t.publishedAt)],
);

/**
 * Controllo salute del sito (certificato SSL, scadenza dominio, DNS, reindirizzamenti, segnali di compromissione).
 * Una riga per ogni controllo eseguito; l'ultima riga del canale dà lo stato attuale e l'impronta da confrontare.
 */
export const siteHealthChecks = mysqlTable(
  "site_health_checks",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    socialAccountId: int("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 255 }).notNull(),
    score: smallint("score").notNull(),
    severity: mysqlEnum("severity", ["ok", "attenzione", "grave"]).notNull(),
    checks: json("checks").$type<import("../lib/integrations/site-health").HealthCheck[]>(),
    fingerprint: json("fingerprint").$type<import("../lib/integrations/site-health").SiteFingerprint>(),
    checkedAt: created(),
  },
  (t) => [index("site_health_client").on(t.clientId), index("site_health_channel_date").on(t.socialAccountId, t.checkedAt)],
);

/** Classifiche SEO del periodo (query e pagine da Search Console, punteggi PageSpeed). */
/**
 * Fotografie dei dati Google per periodo. Search Console: ricerche e pagine (periodo e periodo precedente),
 * dispositivi, totali a confronto; Analytics 4: pagine di atterraggio, campagne, conversioni;
 * Business Profile: recensioni; Google Ads: campagne; PageSpeed: punteggi.
 */
export const SEO_SNAPSHOT_KINDS = [
  "queries", "pages", "pagespeed",
  "queries_prev", "pages_prev", "devices", "summary",
  "landing_pages", "campaigns", "conversions",
  "gbp_reviews", "ads_campaigns",
] as const;

export const seoSnapshots = mysqlTable(
  "seo_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    socialAccountId: int("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", SEO_SNAPSHOT_KINDS).notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    rows: json("rows").$type<Record<string, unknown>[]>().notNull(),
    createdAt: created(),
  },
  (t) => [index("seo_snapshots_lookup").on(t.socialAccountId, t.kind, t.periodEnd)],
);

// ── 1. Check-up ──────────────────────────────────────────────────────
export const AI_MODES = ["opus", "sonnet", "misto"] as const;
export const FOUNDATION_STATES = ["nessuna", "in_corso", "pronta", "errore"] as const;
export const AI_STATES = ["da_avviare", "ricognizione", "domande", "ricerca", "scrittura", "pronto", "errore", "interrotto"] as const;

export const checkups = mysqlTable("checkups", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull().default("Communication Check-Up"),
  period: varchar("period", { length: 60 }),
  status: mysqlEnum("status", ["bozza", "in_revisione", "consegnato"]).notNull().default("bozza"),
  // Analisi a quattro mani con l'AI
  aiMode: mysqlEnum("ai_mode", AI_MODES),
  aiState: mysqlEnum("ai_state", AI_STATES).notNull().default("da_avviare"),
  aiProgress: text("ai_progress"), // ultimo messaggio di avanzamento
  aiLog: json("ai_log").$type<{ at: string; text: string }[]>(),
  aiError: text("ai_error"),
  dossier: text("dossier"), // appunti di ricerca con le fonti (testo)
  findings: json("findings").$type<{ fact: string; source?: string }[]>(),
  sources: json("sources").$type<{ url: string; title?: string }[]>(),
  questionRound: int("question_round").notNull().default(0),
  /** Check-up precedente da cui parte il confronto (check-up periodici). */
  previousId: int("previous_id"),
  /** Registro del report: lo sceglie il consulente all'avvio (auto = lo decide l'AI). */
  register: mysqlEnum("register", REGISTERS).notNull().default("auto"),
  /** Ragionamento dell'AI: veloce (meno costoso) o avanzato (più approfondito). */
  reasoning: mysqlEnum("reasoning", REASONING).notNull().default("avanzato"),
  /** Versione della metodologia Golduck usata (Impostazioni → Metodologia). */
  methodVersion: int("method_version"),
  /** Dati strutturati per il report web e il PDF (grafici, tabelle, matrici). */
  report: json("report").$type<CheckupReport>(),
  /** Fotografia dei KPI quando il check-up viene chiuso (storico). */
  kpiSnapshot: json("kpi_snapshot").$type<{ label: string; scope: string; unit: string; value: number | null; target: number; status: string }[]>(),
  completedAt: datetime("completed_at"),
  createdAt: created(),
  deliveredAt: datetime("delivered_at"),
  /** Archiviato: resta nello storico ma non compare tra quelli su cui si lavora. */
  archivedAt: datetime("archived_at"),
  /** Base di lavoro preparata alla consegna (KPI, canali, rubriche, idee, bozza di piano): stato e riepilogo. */
  foundationState: mysqlEnum("foundation_state", FOUNDATION_STATES).notNull().default("nessuna"),
  foundationProgress: text("foundation_progress"),
  foundationError: text("foundation_error"),
  foundation: json("foundation").$type<CheckupFoundation>(),
  foundationAt: datetime("foundation_at"),
});

/** Domande dell'AI al consulente e risposte, per giro. */
export const checkupQuestions = mysqlTable("checkup_questions", {
  id: int("id").autoincrement().primaryKey(),
  checkupId: int("checkup_id").notNull().references(() => checkups.id, { onDelete: "cascade" }),
  round: int("round").notNull(),
  position: int("position").notNull(),
  topic: varchar("topic", { length: 80 }),
  question: text("question").notNull(),
  why: text("why"),
  options: json("options").$type<string[]>(),
  answer: text("answer"),
  answeredAt: datetime("answered_at"),
});

/** Ogni chiamata all'AI con token e costo stimato (contatore). */
export const aiRuns = mysqlTable(
  "ai_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").references(() => clients.id, { onDelete: "cascade" }),
    checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "cascade" }),
    step: varchar("step", { length: 60 }).notNull(),
    model: varchar("model", { length: 60 }).notNull(),
    inputTokens: int("input_tokens").notNull().default(0),
    outputTokens: int("output_tokens").notNull().default(0),
    cacheReadTokens: int("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: int("cache_write_tokens").notNull().default(0),
    webSearches: int("web_searches").notNull().default(0),
    webFetches: int("web_fetches").notNull().default(0),
    costUsd: decimal("cost_usd", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
    /** Costo in euro come lo vede Golduck: listino Anthropic (USD) al cambio BCE del giorno × ricarico. Fissato al momento della chiamata. */
    costEur: decimal("cost_eur", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
    durationMs: int("duration_ms"),
    createdAt: created(),
  },
  (t) => [index("ai_runs_checkup").on(t.checkupId)],
);

/** Contenuto di una sezione: { [chiave campo]: testo }; gli elenchi sono righe separate da a capo. */
export const checkupSections = mysqlTable(
  "checkup_sections",
  {
    id: int("id").autoincrement().primaryKey(),
    checkupId: int("checkup_id").notNull().references(() => checkups.id, { onDelete: "cascade" }),
    sectionKey: varchar("section_key", { length: 60 }).notNull(),
    content: json("content").$type<Record<string, string>>().notNull(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("checkup_sections_unique").on(t.checkupId, t.sectionKey)],
);

export const channelSnapshots = mysqlTable("channel_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  socialAccountId: int("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  takenAt: date("taken_at", { mode: "string" }).notNull(),
  followers: int("followers"),
  following: int("following"),
  postsCount: int("posts_count"),
  postsPerMonth: num("posts_per_month"),
  avgLikes: num("avg_likes"),
  avgComments: num("avg_comments"),
  engagementRate: num("engagement_rate"),
  followerGrowth30d: int("follower_growth_30d"),
  source: mysqlEnum("source", ["manuale", "api"]).notNull().default("manuale"),
});

export const buyerPersonas = mysqlTable("buyer_personas", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  /** Check-up che l'ha prodotto (null = inserito a mano). */
  checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  priority: int("priority").notNull().default(1),
  segment: mysqlEnum("segment", ["b2b", "b2c"]),
  ageRange: varchar("age_range", { length: 40 }),
  needs: text("needs"),
  interests: text("interests"),
  channels: text("channels"),
  values: text("values"),
  lever: text("lever"),
  createdAt: created(),
});

export const competitors = mysqlTable("competitors", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  /** Check-up che l'ha prodotto (null = inserito a mano). */
  checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  location: varchar("location", { length: 160 }),
  profile: text("profile"),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  opportunities: text("opportunities"),
  threats: text("threats"),
  bestPractices: text("best_practices"),
  socialHandles: json("social_handles").$type<Partial<Record<(typeof PLATFORMS)[number], string>>>(),
  createdAt: created(),
});

// ── 2. Strategia ─────────────────────────────────────────────────────
export const objectives = mysqlTable("objectives", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  /** Check-up che l'ha prodotto (null = inserito a mano). */
  checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
  stage: mysqlEnum("stage", FUNNEL).notNull(),
  microObjectives: text("micro_objectives"),
  strategicGoal: text("strategic_goal").notNull(),
  operationalStrategies: json("operational_strategies").$type<string[]>(),
  createdAt: created(),
});

export const kpis = mysqlTable(
  "kpis",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    objectiveId: int("objective_id").references(() => objectives.id, { onDelete: "set null" }),
    metricKey: varchar("metric_key", { length: 60 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    scope: mysqlEnum("scope", ["organico", "sponsorizzato", "seo", "business"]).notNull(),
    platform: varchar("platform", { length: 30 }),
    direction: mysqlEnum("direction", ["higher", "lower"]).notNull().default("higher"),
    baseline: num("baseline"),
    target: num("target").notNull(),
    warnRatio: num("warn_ratio").notNull().default(0.9),
    criticalRatio: num("critical_ratio").notNull().default(0.6),
    minSample: num("min_sample"),
    active: boolean("active").notNull().default(true),
    /** Check-up che l'ha proposto (null = inserito a mano) e le evidenze del check-up da cui nasce. */
    checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
    evidence: text("evidence"),
    createdAt: created(),
  },
  (t) => [index("kpis_client").on(t.clientId)],
);

export const kpiMeasurements = mysqlTable(
  "kpi_measurements",
  {
    id: int("id").autoincrement().primaryKey(),
    kpiId: int("kpi_id").notNull().references(() => kpis.id, { onDelete: "cascade" }),
    campaignId: int("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    value: num("value").notNull(),
    sample: num("sample"),
    source: mysqlEnum("source", ["manuale", "api", "import"]).notNull().default("manuale"),
    createdAt: created(),
  },
  (t) => [index("kpi_measurements_kpi").on(t.kpiId, t.periodEnd)],
);

// ── 3. Brainstorming ─────────────────────────────────────────────────
export const contentPillars = mysqlTable("content_pillars", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  /** Check-up che l'ha proposta (null = inserita a mano) e le evidenze da cui nasce. */
  checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
  evidence: text("evidence"),
});

export const ideas = mysqlTable(
  "ideas",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    format: mysqlEnum("format", FORMATS),
    status: mysqlEnum("status", IDEA_STATUSES).notNull().default("idea"),
    stage: mysqlEnum("stage", FUNNEL),
    personaId: int("persona_id").references(() => buyerPersonas.id, { onDelete: "set null" }),
    pillarId: int("pillar_id").references(() => contentPillars.id, { onDelete: "set null" }),
    origin: mysqlEnum("origin", ["team", "ai", "cliente"]).notNull().default("team"),
    parentId: int("parent_id"),
    /** Check-up che l'ha proposta (null = del team o del piano AI) e le evidenze da cui nasce. */
    checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
    evidence: text("evidence"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ideas_client").on(t.clientId, t.status)],
);

export const ideaComments = mysqlTable("idea_comments", {
  id: int("id").autoincrement().primaryKey(),
  ideaId: int("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
  authorId: int("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: created(),
});

export const ideaVotes = mysqlTable(
  "idea_votes",
  {
    ideaId: int("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.userId] })],
);

// ── 4. Piano editoriale ──────────────────────────────────────────────
export const editorialPlans = mysqlTable("editorial_plans", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  endsOn: date("ends_on", { mode: "string" }).notNull(),
  minPerWeek: int("min_per_week").notNull().default(3),
  formatQuotas: json("format_quotas").$type<Partial<Record<(typeof FORMATS)[number], number>>>(),
  platforms: json("platforms").$type<string[]>(),
  adsBudget: money("ads_budget"),
  brief: text("brief"),
  status: mysqlEnum("status", ["bozza", "da_approvare", "approvato", "in_corso", "chiuso"]).notNull().default("bozza"),
  /** Bozza preparata dal check-up alla consegna (null = creato dal team o dal piano AI). */
  checkupId: int("checkup_id").references(() => checkups.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const contentSeries = mysqlTable("content_series", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
});

export interface ShotListEntry {
  scena: string;
  descrizione?: string;
  durata_s?: number;
  fonte: "cliente" | "golduck" | "ai" | "stock";
}

export const editorialItems = mysqlTable(
  "editorial_items",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    planId: int("plan_id").references(() => editorialPlans.id, { onDelete: "cascade" }),
    ideaId: int("idea_id").references(() => ideas.id, { onDelete: "set null" }),
    seriesId: int("series_id").references(() => contentSeries.id, { onDelete: "set null" }),
    personaId: int("persona_id").references(() => buyerPersonas.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    platform: mysqlEnum("platform", PLATFORMS).notNull().default("instagram"),
    crossPost: json("cross_post").$type<string[]>(),
    format: mysqlEnum("format", FORMATS).notNull(),
    stage: mysqlEnum("stage", FUNNEL),
    scheduledAt: datetime("scheduled_at"),

    // Contenuto
    hook: text("hook"),
    layoutNotes: text("layout_notes"),
    script: text("script"),
    shotList: json("shot_list").$type<ShotListEntry[]>(),
    onScreenText: text("on_screen_text"),
    audioNotes: text("audio_notes"),
    caption: text("caption"),
    hashtags: text("hashtags"),
    cta: text("cta"),
    ctaDestination: mysqlEnum("cta_destination", CTA_DESTINATIONS),
    ctaUrl: varchar("cta_url", { length: 500 }),
    referencesUrls: text("references_urls"),
    /** Brief grafico del Senior Graphic Designer AI (concept, layout, slide, palette, Canva/Adobe). */
    creativeBrief: json("creative_brief").$type<CreativeBrief>(),

    // Produzione
    needsClientMaterial: boolean("needs_client_material").notNull().default(false),
    productionNotes: text("production_notes"),
    productionStatus: mysqlEnum("production_status", PRODUCTION_STATUSES).notNull().default("da_fare"),

    // Sponsorizzazione
    isPaid: boolean("is_paid").notNull().default(false),
    adObjective: mysqlEnum("ad_objective", AD_OBJECTIVES),
    adButton: varchar("ad_button", { length: 60 }),
    adBudget: money("ad_budget"),
    adDays: int("ad_days"),
    adAudience: text("ad_audience"),

    status: mysqlEnum("status", ITEM_STATUSES).notNull().default("bozza"),
    internalNotes: text("internal_notes"),
    publishedUrl: varchar("published_url", { length: 500 }),
    externalPostId: varchar("external_post_id", { length: 120 }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("editorial_items_plan").on(t.planId, t.scheduledAt), index("editorial_items_client").on(t.clientId)],
);

// ── 5. Campagne e metriche ───────────────────────────────────────────
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  kind: mysqlEnum("kind", ["organico", "sponsorizzato"]).notNull(),
  platform: varchar("platform", { length: 30 }).notNull(),
  objective: varchar("objective", { length: 60 }),
  stage: mysqlEnum("stage", FUNNEL),
  budget: money("budget"),
  startsOn: date("starts_on", { mode: "string" }),
  endsOn: date("ends_on", { mode: "string" }),
  externalId: varchar("external_id", { length: 120 }),
  status: mysqlEnum("status", ["pianificata", "attiva", "in_pausa", "conclusa"]).notNull().default("pianificata"),
  createdAt: created(),
});

export const campaignItems = mysqlTable(
  "campaign_items",
  {
    campaignId: int("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    editorialItemId: int("editorial_item_id").notNull().references(() => editorialItems.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.editorialItemId] })],
);

export const postMetrics = mysqlTable("post_metrics", {
  id: int("id").autoincrement().primaryKey(),
  editorialItemId: int("editorial_item_id").notNull().references(() => editorialItems.id, { onDelete: "cascade" }),
  measuredAt: datetime("measured_at").notNull(),
  impressions: int("impressions"),
  reach: int("reach"),
  likes: int("likes"),
  comments: int("comments"),
  shares: int("shares"),
  saves: int("saves"),
  videoViews3s: int("video_views_3s"),
  profileVisits: int("profile_visits"),
  linkClicks: int("link_clicks"),
  spend: money("spend"),
  leads: int("leads"),
  purchases: int("purchases"),
  revenue: money("revenue"),
  source: mysqlEnum("source", ["manuale", "api", "import"]).notNull().default("manuale"),
});

// ── 6. Lead e funnel di vendita ──────────────────────────────────────
export const LEAD_STAGES = ["nuovo", "contattato", "qualificato", "preventivo", "vinto", "perso"] as const;
export const LEAD_SOURCES = [
  "meta_ads", "instagram", "facebook", "tiktok", "linkedin", "google_ads", "seo",
  "sito", "whatsapp", "telefono", "email", "passaparola", "evento", "altro",
] as const;
export const COST_KINDS = ["inserzioni", "produzione", "consulenza", "strumenti", "eventi", "altro"] as const;

export const leads = mysqlTable(
  "leads",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    receivedAt: datetime("received_at").notNull(),
    name: varchar("name", { length: 200 }),
    company: varchar("company", { length: 200 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 60 }),
    message: text("message"),
    source: mysqlEnum("source", LEAD_SOURCES).notNull().default("altro"),
    campaignId: int("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    editorialItemId: int("editorial_item_id").references(() => editorialItems.id, { onDelete: "set null" }),
    utmSource: varchar("utm_source", { length: 120 }),
    utmMedium: varchar("utm_medium", { length: 120 }),
    utmCampaign: varchar("utm_campaign", { length: 200 }),
    landingUrl: varchar("landing_url", { length: 500 }),
    stage: mysqlEnum("stage", LEAD_STAGES).notNull().default("nuovo"),
    stageChangedAt: datetime("stage_changed_at"),
    lostReason: varchar("lost_reason", { length: 255 }),
    estimatedValue: money("estimated_value"),
    wonValue: money("won_value"),
    wonAt: datetime("won_at"),
    assignedTo: int("assigned_to").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    externalId: varchar("external_id", { length: 120 }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("leads_client").on(t.clientId, t.receivedAt), uniqueIndex("leads_external").on(t.clientId, t.externalId)],
);

/** Storico dei passaggi di fase: serve per i tempi medi del funnel. */
export const leadEvents = mysqlTable("lead_events", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  fromStage: mysqlEnum("from_stage", LEAD_STAGES),
  toStage: mysqlEnum("to_stage", LEAD_STAGES).notNull(),
  at: datetime("at").notNull(),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
});

/** Costi di marketing per mese e fonte (inserzioni, produzione contenuti, consulenza…). */
export const marketingCosts = mysqlTable(
  "marketing_costs",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(), // primo giorno del mese
    source: mysqlEnum("source", LEAD_SOURCES).notNull(),
    kind: mysqlEnum("kind", COST_KINDS).notNull().default("inserzioni"),
    amount: money("amount").notNull(),
    campaignId: int("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    notes: varchar("notes", { length: 255 }),
    createdAt: created(),
  },
  (t) => [index("marketing_costs_client").on(t.clientId, t.month)],
);

// ── Impostazioni dell'app (limiti di spesa AI, interruttori) ─────────
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: json("value").notNull(),
  updatedBy: int("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updated(),
});

// ── Studio grafico ───────────────────────────────────────────────────
/** Brand kit del cliente: la base di ogni brief e di ogni revisione grafica. */
export const brandKits = mysqlTable("brand_kits", {
  clientId: int("client_id").primaryKey().references(() => clients.id, { onDelete: "cascade" }),
  data: json("data").$type<BrandKitData>().notNull(),
  /** Logo come data URL (PNG/SVG/JPG/WebP), già rifilato e compresso nel browser. */
  logo: mediumtext("logo"),
  /** Icona quadrata 256×256 ricavata dal logo (menu, elenchi). */
  icon: mediumtext("icon"),
  updatedBy: int("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updated(),
});

/** Revisioni delle grafiche fatte dall'AI (l'immagine non si conserva, solo una miniatura). */
export const designReviews = mysqlTable(
  "design_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    itemId: int("item_id").references(() => editorialItems.id, { onDelete: "set null" }),
    fileName: varchar("file_name", { length: 200 }),
    thumb: mediumtext("thumb"),
    result: json("result").$type<DesignReview>().notNull(),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("design_reviews_client").on(t.clientId, t.createdAt)],
);

// Audit trail: unico registro di azioni, errori e messaggi di sistema. Chi ha fatto cosa, su quale cliente, quando e da dove. Le voci non si modificano né si cancellano dall'app.
export const AUDIT_CATEGORIES = ["accesso", "utenti", "impostazioni", "clienti", "checkup", "contenuti", "lead", "canali", "grafica", "errori", "avvisi", "sistema"] as const;

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Nome ed email al momento dell'azione: restano leggibili anche se l'utente cambia o viene disattivato. */
    actor: varchar("actor", { length: 200 }),
    category: mysqlEnum("category", AUDIT_CATEGORIES).notNull(),
    /** Codice dell'azione, es. "checkup.avvio", "utente.ruolo". */
    action: varchar("action", { length: 60 }).notNull(),
    description: varchar("description", { length: 600 }).notNull(),
    clientId: int("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Oggetto toccato, es. "checkup:12", "lead:40". */
    target: varchar("target", { length: 80 }),
    /** Dettagli (valori prima/dopo). Mai segreti. */
    meta: json("meta").$type<Record<string, unknown>>(),
    ip: varchar("ip", { length: 64 }),
    /** Browser e sistema operativo. */
    userAgent: varchar("user_agent", { length: 300 }),
    /** Pagina da cui è partita l'azione. */
    path: varchar("path", { length: 300 }),
    createdAt: created(),
  },
  (t) => [
    index("audit_created").on(t.createdAt),
    index("audit_user").on(t.userId, t.createdAt),
    index("audit_client").on(t.clientId, t.createdAt),
    index("audit_category").on(t.category, t.createdAt),
  ],
);

// ── Pubblicazione sui social ─────────────────────────────────────────

/** Foto e video caricati per una scheda del piano: file su disco (MEDIA_DIR), serviti a Meta da un indirizzo con chiave. */
export const mediaAssets = mysqlTable(
  "media_assets",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    itemId: int("item_id").references(() => editorialItems.id, { onDelete: "set null" }),
    kind: mysqlEnum("kind", ["image", "video"]).notNull(),
    mime: varchar("mime", { length: 60 }).notNull(),
    fileName: varchar("file_name", { length: 200 }).notNull(),
    /** Nome del file su disco (casuale). */
    storageKey: varchar("storage_key", { length: 80 }).notNull().unique(),
    size: int("size").notNull(),
    width: int("width"),
    height: int("height"),
    /** Ordine nel carosello. */
    position: int("position").notNull().default(0),
    /** Video: durata letta da FFmpeg e codifica. */
    durationSec: decimal("duration_sec", { precision: 10, scale: 2, mode: "number" }),
    videoCodec: varchar("video_codec", { length: 30 }),
    /** Video: conversione per i social (in_lavorazione finché FFmpeg non ha finito). */
    processState: mysqlEnum("process_state", ["pronto", "in_lavorazione", "errore"]).notNull().default("pronto"),
    processNote: varchar("process_note", { length: 300 }),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("media_assets_item").on(t.itemId, t.position)],
);

export const PUBLICATION_STATUSES = ["programmata", "in_corso", "pubblicata", "errore", "annullata"] as const;

/** Una pubblicazione = una scheda su un profilo, a un'ora. Il profilo deve appartenere al cliente della scheda. */
export const publications = mysqlTable(
  "publications",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => editorialItems.id, { onDelete: "cascade" }),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    socialAccountId: int("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", PUBLICATION_STATUSES).notNull().default("programmata"),
    scheduledAt: datetime("scheduled_at").notNull(),
    /** Fotografia di ciò che si pubblica (formato, testo, file) al momento della programmazione. */
    format: mysqlEnum("format", FORMATS).notNull(),
    caption: text("caption"),
    mediaIds: json("media_ids").$type<number[]>().notNull(),
    /** Impostazioni scelte per la piattaforma (TikTok: visibilità, interazioni, contenuto commerciale). */
    options: json("options").$type<TikTokOptions>(),
    attempts: int("attempts").notNull().default(0),
    /** TikTok: publish_id dell'invio avviato, per controllarne l'esito (e non ripubblicare) nei giri successivi. */
    remoteId: varchar("remote_id", { length: 120 }),
    externalId: varchar("external_id", { length: 120 }),
    permalink: varchar("permalink", { length: 500 }),
    error: text("error"),
    publishedAt: datetime("published_at"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("publications_due").on(t.status, t.scheduledAt), index("publications_item").on(t.itemId)],
);


// ── Sponsorizzate (Meta Marketing API) ───────────────────────────────
export const AD_CAMPAIGN_STATUSES = ["in_avvio", "attiva", "in_pausa", "terminata", "errore"] as const;
/**
 * boost: promozione di un post già pubblicato; campagna: inserzione nuova creata dalla scheda del piano
 * (anche mai pubblicata sul profilo); contatti: campagna con modulo contatti di Meta (lead ads).
 */
export const AD_CAMPAIGN_KINDS = ["boost", "campagna", "contatti"] as const;
export const AD_PLACEMENTS = ["facebook", "instagram", "entrambi"] as const;

/** Testi e media di un'inserzione nuova (campagna o contatti). */
export type AdCreative = {
  format: "immagine" | "carosello" | "video";
  /** media_assets della scheda, nell'ordine del carosello. */
  mediaIds: number[];
  message: string;
  headline?: string;
  description?: string;
  link?: string;
  /** Tipo di pulsante Meta (LEARN_MORE, CONTACT_US, BOOK_TRAVEL…). */
  button: string;
};

export type AdTargeting = {
  city?: { key: string; name: string; radiusKm: number };
  ageMin: number;
  ageMax: number;
  gender?: "tutti" | "uomini" | "donne";
};

/** Una sponsorizzazione: post pubblicato messo in promozione, oppure inserzione nuova (anche con modulo contatti). */
export const adCampaigns = mysqlTable(
  "ad_campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", AD_CAMPAIGN_KINDS).notNull().default("boost"),
    name: varchar("name", { length: 200 }),
    itemId: int("item_id").references(() => editorialItems.id, { onDelete: "set null" }),
    publicationId: int("publication_id").references(() => publications.id, { onDelete: "set null" }),
    platform: mysqlEnum("platform", AD_PLACEMENTS).notNull(),
    creative: json("creative").$type<AdCreative>(),
    leadFormId: int("lead_form_id").references(() => adLeadForms.id, { onDelete: "set null" }),
    /** Chi paga, fissato al lancio (non cambia se poi cambia l'impostazione del cliente). */
    payer: mysqlEnum("payer", ["cliente", "golduck"]).notNull(),
    adAccountId: varchar("ad_account_id", { length: 40 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    objective: mysqlEnum("objective", AD_OBJECTIVES).notNull(),
    /** Budget totale (nella valuta dell'account) e periodo. */
    budget: money("budget").notNull(),
    startAt: datetime("start_at").notNull(),
    endAt: datetime("end_at").notNull(),
    targeting: json("targeting").$type<AdTargeting>().notNull(),
    status: mysqlEnum("status", AD_CAMPAIGN_STATUSES).notNull().default("in_avvio"),
    simulated: boolean("simulated").notNull().default(false),
    metaCampaignId: varchar("meta_campaign_id", { length: 40 }),
    metaAdSetId: varchar("meta_adset_id", { length: 40 }),
    metaAdId: varchar("meta_ad_id", { length: 40 }),
    metaCreativeId: varchar("meta_creative_id", { length: 40 }),
    /** Ultimi totali letti da Meta. */
    spend: money("spend").notNull().default(0),
    results: json("results").$type<Record<string, number>>(),
    error: text("error"),
    lastSyncAt: datetime("last_sync_at"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ad_campaigns_client").on(t.clientId, t.status)],
);

/**
 * Modulo contatti di Meta (lead ads) creato sulla Pagina Facebook del cliente. I contatti raccolti
 * vengono letti dalla sincronizzazione e finiscono nei Lead del cliente (fonte Meta Ads).
 */
export const LEAD_FORM_FIELDS = ["FULL_NAME", "EMAIL", "PHONE", "CITY"] as const;

export const adLeadForms = mysqlTable(
  "ad_lead_forms",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    pageId: varchar("page_id", { length: 40 }).notNull(),
    metaFormId: varchar("meta_form_id", { length: 40 }),
    name: varchar("name", { length: 200 }).notNull(),
    /** Domande standard precompilate da Meta (nome, email, telefono, città). */
    fields: json("fields").$type<(typeof LEAD_FORM_FIELDS)[number][]>().notNull(),
    /** Domanda libera facoltativa (es. «Che servizio ti interessa?»). */
    customQuestion: varchar("custom_question", { length: 300 }),
    intro: varchar("intro", { length: 500 }),
    privacyUrl: varchar("privacy_url", { length: 500 }).notNull(),
    thankYou: varchar("thank_you", { length: 300 }),
    simulated: boolean("simulated").notNull().default(false),
    leadsCount: int("leads_count").notNull().default(0),
    lastLeadsSyncAt: datetime("last_leads_sync_at"),
    error: text("error"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("ad_lead_forms_client").on(t.clientId)],
);

/** Spesa giornaliera per sponsorizzazione (in euro): serve a tetti mensili e rifatturazione. */
export const adSpendDaily = mysqlTable(
  "ad_spend_daily",
  {
    campaignId: int("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    spendEur: money("spend_eur").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.day] })],
);

// ── Analisi SEO con l'AI ─────────────────────────────────────────────
/** Analisi mensile (o su richiesta) dei dati Google del cliente: priorità e idee di contenuto. */
export interface SeoAnalysisData {
  headline: string;
  summary: string;
  priorities: { title: string; area: string; impact: "alto" | "medio" | "basso"; effort: "alto" | "medio" | "basso"; why: string; action: string; data: string }[];
  ideas: { title: string; body: string; format: string; stage: string; query: string }[];
  /** Fonti che c'erano (Search Console, Analytics 4, scheda Google, Google Ads, PageSpeed). */
  sources: string[];
}

export const seoAnalyses = mysqlTable(
  "seo_analyses",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    data: json("data").$type<SeoAnalysisData>().notNull(),
    /** Idee create nella bacheca da questa analisi. */
    ideasCreated: int("ideas_created").notNull().default(0),
    trigger: mysqlEnum("trigger", ["manuale", "mensile"]).notNull().default("manuale"),
    createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("seo_analyses_client").on(t.clientId, t.createdAt)],
);

// ── Approvazione del cliente via link ────────────────────────────────
export const FEEDBACK_DECISIONS = ["approvato", "modifiche", "commento"] as const;

/** Risposte del cliente sui contenuti (dalla pagina pubblica /approva/<link>). */
export const itemFeedback = mysqlTable(
  "item_feedback",
  {
    id: int("id").autoincrement().primaryKey(),
    itemId: int("item_id").notNull().references(() => editorialItems.id, { onDelete: "cascade" }),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    author: varchar("author", { length: 120 }).notNull(),
    decision: mysqlEnum("decision", FEEDBACK_DECISIONS).notNull(),
    message: text("message"),
    createdAt: created(),
  },
  (t) => [index("item_feedback_item").on(t.itemId, t.createdAt)],
);

// ── Profili social: creazione guidata e completezza ─────────────────
export const PROFILE_PLATFORMS = ["facebook", "instagram", "tiktok", "google_business"] as const;

/** Kit di creazione (testi, scelte) e ultimo controllo di completezza per piattaforma. */
export const profileSetups = mysqlTable(
  "profile_setups",
  {
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    platform: mysqlEnum("platform", PROFILE_PLATFORMS).notNull(),
    /** Testi e scelte del kit (nome, username, categoria, bio, pulsante, primi post…). */
    kit: json("kit").$type<Record<string, unknown>>(),
    /** Passi della procedura già fatti. */
    steps: json("steps").$type<Record<string, boolean>>(),
    /** Ultimo controllo del profilo collegato. */
    health: json("health").$type<{ score: number; checkedAt: string; items: { key: string; label: string; ok: boolean; value?: string | null; fixable?: boolean; hint?: string }[] }>(),
    updatedBy: int("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.platform] })],
);
