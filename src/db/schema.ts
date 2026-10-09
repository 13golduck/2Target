// Schema MariaDB (Drizzle). Le migrazioni si generano con `npm run db:generate` nella cartella drizzle/
// e l'app le applica da sola all'avvio (src/instrumentation.ts).

import {
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
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "consulente"]).notNull().default("consulente"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: datetime("last_login_at"),
  createdAt: created(),
});

// ── Clienti ──────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  sector: varchar("sector", { length: 200 }),
  website: varchar("website", { length: 255 }),
  notes: text("notes"),
  ownerId: int("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["onboarding", "attivo", "in_pausa", "chiuso"]).notNull().default("onboarding"),
  createdAt: created(),
});

export const socialAccounts = mysqlTable(
  "social_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    platform: mysqlEnum("platform", PLATFORMS).notNull(),
    handle: varchar("handle", { length: 120 }).notNull(),
    externalId: varchar("external_id", { length: 120 }),
    connected: boolean("connected").notNull().default(false),
    createdAt: created(),
  },
  (t) => [uniqueIndex("social_accounts_unique").on(t.clientId, t.platform, t.handle)],
);

// ── 1. Check-up ──────────────────────────────────────────────────────
export const checkups = mysqlTable("checkups", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull().default("Communication Check-Up"),
  period: varchar("period", { length: 60 }),
  status: mysqlEnum("status", ["bozza", "in_revisione", "consegnato"]).notNull().default("bozza"),
  createdAt: created(),
  deliveredAt: datetime("delivered_at"),
});

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
    scope: mysqlEnum("scope", ["organico", "sponsorizzato", "business"]).notNull(),
    platform: varchar("platform", { length: 30 }),
    direction: mysqlEnum("direction", ["higher", "lower"]).notNull().default("higher"),
    baseline: num("baseline"),
    target: num("target").notNull(),
    warnRatio: num("warn_ratio").notNull().default(0.9),
    criticalRatio: num("critical_ratio").notNull().default(0.6),
    minSample: num("min_sample"),
    active: boolean("active").notNull().default(true),
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
