// Dati di esempio SOLO per lo sviluppo locale: Piantiny (dal check-up) e Lesioli (dal brief del piano).
// Uso: npm run db:seed   (svuota e ricarica i clienti di esempio; non tocca gli utenti, tranne quello demo)

import mysql from "mysql2/promise";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

import * as s from "../src/db/schema";

process.loadEnvFile(".env.local");
if (process.env.NODE_ENV === "production" || !/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Il seed gira solo sul database locale.");
  process.exit(1);
}

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s, mode: "default" });
const id = (r: [{ insertId: number }, unknown]) => r[0].insertId;

// Utente di prova locale (DEV_DEMO_EMAIL in .env.local). Accesso con codice: in locale, senza SMTP,
// il codice compare nel terminale di `npm run dev`.
if (process.env.DEV_DEMO_EMAIL) {
  await db
    .insert(s.users)
    .values({ email: process.env.DEV_DEMO_EMAIL, name: "Demo Golduck", role: "admin" })
    .onDuplicateKeyUpdate({ set: { active: true } });
}

const old = await db.select({ id: s.clients.id }).from(s.clients).where(inArray(s.clients.name, ["Piantiny", "Lesioli"]));
if (old.length) await db.delete(s.clients).where(inArray(s.clients.id, old.map((c) => c.id)));

// ── Piantiny ─────────────────────────────────────────────────────────
const piantiny = id(await db.insert(s.clients).values({ name: "Piantiny", sector: "Microgreens e fiori eduli (B2B HoReCa)", status: "attivo" }));
const ig = id(await db.insert(s.socialAccounts).values({ clientId: piantiny, platform: "instagram", handle: "piantiny_" }));
const fb = id(await db.insert(s.socialAccounts).values({ clientId: piantiny, platform: "facebook", handle: "Piantiny2022" }));
await db.insert(s.channelSnapshots).values([
  { socialAccountId: ig, takenAt: "2026-06-01", followers: 1820, following: 1988, postsCount: 468, postsPerMonth: 5, avgLikes: 16, avgComments: 2, engagementRate: 0.01, followerGrowth30d: 21 },
  { socialAccountId: fb, takenAt: "2026-06-01", followers: 437 },
]);
const checkup = id(await db.insert(s.checkups).values({ clientId: piantiny, period: "Giugno 2026", status: "consegnato" }));
await db.insert(s.checkupSections).values([
  { checkupId: checkup, sectionKey: "strumenti", content: {
    funziona: "Contenuto autentico e realistico\nRacconto del processo produttivo\nStorie in evidenza organizzate per temi",
    migliorabile: "Manca uno scopo comunicativo: 468 post per 1.820 follower\nReel abbandonati nel 2025\nLink in bio verso Canva invece del sito",
    contenuti_top: "I post con le persone (Luca, i soci in serra) fanno 55-75 interazioni contro una media di 18: 3-4 volte i post di solo prodotto.",
  } },
  { checkupId: checkup, sectionKey: "posizionamento", content: {
    attuale: "Produttore di micro-ortaggi, erbe aromatiche, fiori eduli e piccoli frutti per l'alta ristorazione, con metodo innovativo e sostenibile.",
    distintivi: "Il metodo (ciclo di 15 giorni, prodotto venduto vivo, zero fitofarmaci)\nLe persone (Oscar Green Coldiretti)\nLa promessa operativa: freschezza e programmazione del menu",
    criticita: "Manifesto\nMission\nPayoff\nTone of voice riconoscibile",
  } },
  { checkupId: checkup, sectionKey: "swot", content: {
    s: "Heritage di tre generazioni\nConsumo idrico 1/10\nPiano di semina mensile per l'HoReCa",
    w: "Visibilità digitale debole\nNessuna partnership scientifica visibile",
    o: "Leva heritage in un mercato di startup\nGDO bio o abbonamenti B2C",
    t: "Concorrenza diretta di Baby Greens sulla stessa area\nRischio di invisibilità competitiva",
  } },
]);
await db.insert(s.buyerPersonas).values([
  { clientId: piantiny, name: "Chef alta ristorazione", priority: 1, segment: "b2b", ageRange: "30-50", lever: "Prodotto come ingrediente tecnico, non come guarnizione", channels: "Instagram, passaparola, fiere" },
  { clientId: piantiny, name: "Grossista segmento alto", priority: 2, segment: "b2b", ageRange: "35-55", lever: "Affidabilità di fornitura e marchio che fa curriculum", channels: "LinkedIn, sito, fiere" },
  { clientId: piantiny, name: "Privato appassionato", priority: 3, segment: "b2c", ageRange: "25-55", lever: "Genuinità e prossimità", channels: "Instagram, mercato Campagna Amica" },
]);
await db.insert(s.competitors).values([
  { clientId: piantiny, name: "Profarms", location: "Bolzano", strengths: "Tecnologia proprietaria, Bio, modello replicabile" },
  { clientId: piantiny, name: "Baby Greens", location: "Franciacorta", strengths: "Posizionamento gourmet/Michelin, sostenibilità raccontata" },
]);
const aw = id(await db.insert(s.objectives).values({ clientId: piantiny, stage: "awareness", microObjectives: "Reach, notorietà presso il pubblico professionale", strategicGoal: "Far conoscere Piantiny a nuovi chef e grossisti del segmento alto", operationalStrategies: ["Raccontare il metodo", "Rimettere al centro le persone", "Tornare ai reel", "Aprire LinkedIn"] }));
const k1 = id(await db.insert(s.kpis).values({ clientId: piantiny, objectiveId: aw, metricKey: "er_reach", label: "Engagement rate Instagram", scope: "organico", platform: "instagram", baseline: 0.01, target: 0.03 }));
const k2 = id(await db.insert(s.kpis).values({ clientId: piantiny, objectiveId: aw, metricKey: "qualified_leads", label: "Contatti qualificati (chef, grossisti)", scope: "business", baseline: 0, target: 6 }));
const k3 = id(await db.insert(s.kpis).values({ clientId: piantiny, metricKey: "reach", label: "Reach mensile Instagram", scope: "organico", platform: "instagram", target: 8000 }));
await db.insert(s.kpiMeasurements).values([
  { kpiId: k1, periodStart: "2026-09-01", periodEnd: "2026-09-30", value: 0.029 },
  { kpiId: k2, periodStart: "2026-09-01", periodEnd: "2026-09-30", value: 4 },
  { kpiId: k3, periodStart: "2026-09-01", periodEnd: "2026-09-30", value: 7600 },
]);

// Search Console con dati FINTI, solo per vedere la pagina SEO e i KPI automatici in locale
const gsc = id(await db.insert(s.socialAccounts).values({ clientId: piantiny, platform: "search_console", handle: "piantiny.it", name: "piantiny.it (dati di esempio)" }));
const gscRows: { socialAccountId: number; day: string; metric: string; value: number }[] = [];
for (let d = 92; d >= 2; d--) {
  const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  const trend = 1 + (92 - d) / 120;
  const impressions = Math.round((180 + 60 * Math.sin(d / 5)) * trend);
  const clicks = Math.round(impressions * (0.035 + 0.01 * Math.cos(d / 7)));
  gscRows.push(
    { socialAccountId: gsc, day, metric: "seo_impressions", value: impressions },
    { socialAccountId: gsc, day, metric: "seo_clicks", value: clicks },
    { socialAccountId: gsc, day, metric: "seo_position", value: Number((14 - (92 - d) / 30 + Math.sin(d) * 0.8).toFixed(2)) },
  );
}
await db.insert(s.channelDaily).values(gscRows);
const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
await db.insert(s.seoSnapshots).values([
  { socialAccountId: gsc, kind: "queries", periodStart: start, periodEnd: end, rows: [
    { key: "microgreens brescia", clicks: 64, impressions: 820, ctr: 0.078, position: 3.2 },
    { key: "fiori eduli", clicks: 41, impressions: 2650, ctr: 0.015, position: 9.4 },
    { key: "micro ortaggi per ristoranti", clicks: 22, impressions: 310, ctr: 0.071, position: 4.1 },
    { key: "piantiny", clicks: 19, impressions: 40, ctr: 0.475, position: 1.0 },
    { key: "fiori commestibili dove comprarli", clicks: 8, impressions: 1210, ctr: 0.0066, position: 14.8 },
  ] },
  { socialAccountId: gsc, kind: "pages", periodStart: start, periodEnd: end, rows: [
    { key: "https://piantiny.it/", clicks: 88, impressions: 1900, ctr: 0.046, position: 6.1 },
    { key: "https://piantiny.it/fiori-eduli/", clicks: 47, impressions: 2900, ctr: 0.016, position: 10.2 },
    { key: "https://piantiny.it/ristorazione/", clicks: 19, impressions: 280, ctr: 0.068, position: 4.4 },
  ] },
]);
await db.insert(s.kpis).values({ clientId: piantiny, metricKey: "seo_clicks", label: "Clic da Google (mese)", scope: "seo", platform: "search_console", target: 300 });

// ── Lesioli ──────────────────────────────────────────────────────────
const lesioli = id(await db.insert(s.clients).values({ name: "Lesioli", sector: "Studio di architettura", status: "attivo" }));
await db.insert(s.competitors).values([
  { clientId: lesioli, name: "Francesca Culcasi", socialHandles: { tiktok: "francesca.culcasi.noi" } },
  { clientId: lesioli, name: "Andrea Benedetti Architetto", socialHandles: { instagram: "andrea_benedetti_architetto" } },
  { clientId: lesioli, name: "Sajeva Architetto", socialHandles: { instagram: "sajeva.architetto" } },
]);
const kc = id(await db.insert(s.kpis).values({ clientId: lesioli, metricKey: "cpl", label: "Costo per contatto (chiamate)", scope: "sponsorizzato", platform: "instagram", direction: "lower", target: 10, minSample: 30 }));
const kh = id(await db.insert(s.kpis).values({ clientId: lesioli, metricKey: "hook_rate", label: "Hook rate reel sponsorizzati", scope: "sponsorizzato", platform: "instagram", target: 0.3 }));
await db.insert(s.kpiMeasurements).values([
  { kpiId: kc, periodStart: "2026-09-21", periodEnd: "2026-09-30", value: 18, sample: 45 },
  { kpiId: kh, periodStart: "2026-09-21", periodEnd: "2026-09-30", value: 0.31, sample: 45 },
]);

const trasf = id(await db.insert(s.contentSeries).values({ clientId: lesioli, name: "Trasformazione di un ambiente", description: "Clip del cantiere con voiceover che spiega i passaggi" }));
await db.insert(s.contentSeries).values([
  { clientId: lesioli, name: "Reaction", description: "Reaction a un ambiente dal design particolare" },
  { clientId: lesioli, name: "Cosa cambierei", description: "Gli mostrano delle immagini e dice cosa cambierebbe o terrebbe" },
  { clientId: lesioli, name: "Cosa preferiresti?", description: "Due opzioni per arredare lo stesso spazio" },
]);

const reelIdeas = [
  "Com'è composta una giornata lavorativa tipo", "Consigli per rendere più elegante la tua casa", "Com'è composto un progetto (planimetrie)",
  "Una palette e gli interni arredati con quei colori", "Ristrutturazione completa di un appartamento", "Trasformazione di un soggiorno",
  "Scelta dei materiali: i criteri", "3 errori nelle case senza architetto", "Se ristrutturassi casa mia queste 5 cose non le farei",
  "Le agevolazioni spiegate", "I bonus spiegati", "Vuoi ristrutturare casa? Perché scegliere me",
  "Tutto quello di cui si occupa lo studio, dall'inizio alla fine", "5 punti per scegliere il tuo architetto", "A cosa serve un architetto",
  "Le verità sul cartongesso", "Ristrutturazione sbagliata: errori che paghi dopo", "Cosa non può aspettare quando ristrutturi",
  "Errori nella disposizione dei mobili (prima/dopo con AI)", "Un problema di cantiere e la sua soluzione", "Time lapse di uno schizzo",
  "Come il battiscopa cambia tutto", "Reaction a un ambiente dal design particolare", "Cosa cambierei / cosa terrei",
  "Gli stili di architettura", "Cosa non ti dicono del lavoro da architetto", "Da spazio vuoto ad arredato (render in progressione)",
  "Cosa preferiresti per arredare questo spazio?",
];
const postIdeas = [
  "Camera con soppalco", "Il bagno più piccolo è il più divertente da progettare", "Contrasti cromatici", "Divano ad isola, quando sceglierlo?",
  "I principi di una buona ristrutturazione", "Perché casa tua è ancora calda alle 3 di notte?", "Raffrescamento passivo",
  "10 dettagli che rendono la casa di lusso", "Se avessi 1 milione di euro: la villa che progetterei", "Cos'è la regola 3-30-300?",
  "Quiz time", "3 cose che forse non sai sul legno", "5 cose su cui conviene investire", "Errori invisibili quando progetti casa da zero",
  "Cose da sapere prima di rivolgersi a un architetto", "Cosa ci insegna un cantiere?", "Casi studio: ottimizzare gli spazi",
  "Come far sembrare i soffitti più alti",
];
await db.insert(s.ideas).values([
  ...reelIdeas.map((title) => ({ clientId: lesioli, title, format: "reel" as const, origin: "cliente" as const })),
  ...postIdeas.map((title) => ({ clientId: lesioli, title, format: "post" as const, origin: "cliente" as const })),
]);
const [errori] = await db.select({ id: s.ideas.id }).from(s.ideas).where(eq(s.ideas.title, "3 errori nelle case senza architetto"));
await db.update(s.ideas).set({ status: "pianificata" }).where(eq(s.ideas.id, errori.id));

const plan = id(await db.insert(s.editorialPlans).values({
  clientId: lesioli, name: "Piano settembre – gennaio", startsOn: "2026-09-21", endsOn: "2027-01-31", minPerWeek: 3,
  formatQuotas: { reel: 34, post: 18 }, platforms: ["instagram", "tiktok"], adsBudget: 1200, status: "bozza",
  brief: "Per ogni post un'idea di layout, caption, hashtag e CTA. Almeno 3 post/reel a settimana: 18 post e 34 reel. Indicare budget, numero di sponsorizzate, pulsanti e CTA (sito o telefono). Consegna in Word.",
}));
await db.insert(s.editorialItems).values([
  {
    clientId: lesioli, planId: plan, ideaId: errori.id, title: "3 errori che trovo nelle case senza architetto", platform: "instagram", crossPost: ["tiktok"],
    format: "reel", stage: "awareness", scheduledAt: new Date("2026-09-22T16:00:00Z"),
    hook: "Questi tre errori li vedo in quasi ogni casa in cui non è passato un architetto.",
    layoutNotes: "Parlato in camera in studio, testo a schermo con il numero dell'errore, B-roll di dettagli reali.",
    script: "1. Luce: un solo punto luce al centro della stanza…\n2. Proporzioni: mobili fuori scala…\n3. Percorsi: passaggi stretti tra letto e armadio…\nChiusura: se stai per ristrutturare, parliamone prima.",
    shotList: [{ scena: "Intro in studio", durata_s: 4, fonte: "cliente" }, { scena: "Dettagli dei tre errori", fonte: "ai" }, { scena: "Chiusura con CTA", durata_s: 3, fonte: "cliente" }],
    onScreenText: "Errore 1 · Errore 2 · Errore 3", audioNotes: "Musica soft, voce in primo piano",
    caption: "Ti è mai capitato di entrare in una casa e sentire che qualcosa non torna? Spesso è uno di questi tre errori.",
    hashtags: "#architetto #ristrutturazione #interiordesign #casa", cta: "Chiamami per una prima consulenza", ctaDestination: "telefono",
    needsClientMaterial: true, productionNotes: "Girare intro e chiusura in studio, luce naturale.", productionStatus: "materiale_richiesto",
    isPaid: true, adObjective: "chiamate", adButton: "Chiama ora", adBudget: 60, adDays: 7, adAudience: "Raggio 30 km, 30-60 anni, interessi casa e ristrutturazione",
    status: "da_approvare",
  },
  {
    clientId: lesioli, planId: plan, title: "Camera con soppalco", platform: "instagram", format: "carosello", stage: "consideration",
    scheduledAt: new Date("2026-09-24T07:00:00Z"), layoutNotes: "Carosello: pianta, sezione, foto finale.", status: "bozza",
  },
  {
    clientId: lesioli, planId: plan, seriesId: trasf, title: "Trasformazione di un soggiorno", platform: "instagram", crossPost: ["tiktok"],
    format: "reel", stage: "consideration", scheduledAt: new Date("2026-09-26T16:00:00Z"),
    hook: "Da così… a così.", layoutNotes: "Prima/dopo con voiceover sui passaggi.",
    shotList: [{ scena: "Clip cantiere", fonte: "cliente" }], needsClientMaterial: true, status: "bozza",
  },
]);

// Lead e costi di esempio (Lesioli): richieste di ristrutturazione
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const monthStart = (back: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
await db.update(s.clients).set({ leadToken: "esempio-lesioli-" + Math.random().toString(36).slice(2, 10) }).where(eq(s.clients.id, lesioli));
type Stage = (typeof s.LEAD_STAGES)[number];
const sampleLeads: { name: string; source: (typeof s.LEAD_SOURCES)[number]; days: number; path: Stage[]; est?: number; won?: number; lost?: string }[] = [
  { name: "Marco Bianchi", source: "meta_ads", days: 3, path: ["nuovo"], est: 28000 },
  { name: "Giulia Rossi", source: "meta_ads", days: 6, path: ["nuovo", "contattato"], est: 45000 },
  { name: "Paolo Verdi", source: "instagram", days: 8, path: ["nuovo", "contattato", "qualificato"], est: 60000 },
  { name: "Sara Neri", source: "meta_ads", days: 12, path: ["nuovo", "contattato", "qualificato", "preventivo"], est: 38000 },
  { name: "Luca Gallo", source: "sito", days: 15, path: ["nuovo", "contattato", "qualificato", "preventivo", "vinto"], won: 42000 },
  { name: "Elena Fontana", source: "passaparola", days: 20, path: ["nuovo", "contattato", "qualificato", "preventivo", "vinto"], won: 65000 },
  { name: "Andrea Costa", source: "meta_ads", days: 9, path: ["nuovo", "contattato", "perso"], lost: "Budget troppo basso" },
  { name: "Chiara Ricci", source: "meta_ads", days: 25, path: ["nuovo", "perso"], lost: "Non risponde" },
  { name: "Davide Moretti", source: "seo", days: 40, path: ["nuovo", "contattato", "qualificato", "preventivo", "vinto"], won: 51000 },
  { name: "Francesca Greco", source: "meta_ads", days: 45, path: ["nuovo", "contattato", "qualificato", "perso"], lost: "Prezzo" },
  { name: "Matteo Conti", source: "instagram", days: 50, path: ["nuovo", "contattato"], est: 20000 },
  { name: "Valentina Bruno", source: "meta_ads", days: 70, path: ["nuovo", "contattato", "qualificato", "preventivo", "vinto"], won: 36000 },
];
for (const l of sampleLeads) {
  const received = ago(l.days);
  const stage = l.path[l.path.length - 1];
  const [r] = await db.insert(s.leads).values({
    clientId: lesioli, receivedAt: received, name: l.name, email: l.name.toLowerCase().replace(" ", ".") + "@esempio.it", source: l.source,
    stage, stageChangedAt: ago(Math.max(0, l.days - l.path.length * 2)), estimatedValue: l.est ?? null, wonValue: l.won ?? null,
    wonAt: stage === "vinto" ? ago(Math.max(0, l.days - 10)) : null, lostReason: l.lost ?? null,
    message: "Richiesta di informazioni per ristrutturazione (dato di esempio)",
  });
  await db.insert(s.leadEvents).values(l.path.map((st, i) => ({ leadId: r.insertId, fromStage: i ? l.path[i - 1] : null, toStage: st, at: ago(Math.max(0, l.days - i * 2)) })));
}
await db.insert(s.marketingCosts).values([
  { clientId: lesioli, month: monthStart(0), source: "meta_ads", kind: "inserzioni", amount: 320, notes: "Campagna chiamate (esempio)" },
  { clientId: lesioli, month: monthStart(0), source: "instagram", kind: "produzione", amount: 400, notes: "Riprese reel (esempio)" },
  { clientId: lesioli, month: monthStart(1), source: "meta_ads", kind: "inserzioni", amount: 280 },
  { clientId: lesioli, month: monthStart(1), source: "sito", kind: "consulenza", amount: 250 },
  { clientId: lesioli, month: monthStart(2), source: "meta_ads", kind: "inserzioni", amount: 300 },
]);
await db.insert(s.kpis).values([
  { clientId: lesioli, metricKey: "lead_cpl", label: "Costo per lead", scope: "business", direction: "lower", target: 80 },
  { clientId: lesioli, metricKey: "cac", label: "Costo di acquisizione cliente", scope: "business", direction: "lower", target: 600 },
]);

console.log("Dati di esempio caricati: Piantiny e Lesioli.");
await pool.end();
