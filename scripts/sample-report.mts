// Report di esempio SOLO per lo sviluppo locale: completa l'ultimo check-up di Piantiny con i contenuti del
// check-up reale consegnato da Golduck (giugno 2026), nel nuovo formato (Executive Summary + dati per i grafici).
// Uso: npx tsx scripts/sample-report.mts

import mysql from "mysql2/promise";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

import * as s from "../src/db/schema";
import type { CheckupReport } from "../src/lib/checkup-report";

process.loadEnvFile(".env.local");
if (process.env.NODE_ENV === "production" || !/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Lo script gira solo sul database locale.");
  process.exit(1);
}

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s, mode: "default" });

const [client] = await db.select().from(s.clients).where(eq(s.clients.name, "Piantiny"));
if (!client) throw new Error("Prima esegui npm run db:seed");
const [checkup] = await db.select().from(s.checkups).where(eq(s.checkups.clientId, client.id)).orderBy(desc(s.checkups.id)).limit(1);
const checkupId = checkup.id;

const sections: Record<string, Record<string, string>> = {
  sintesi: {
    diagnosi:
      "Piantiny ha un prodotto e un metodo da fornitore dell'alta ristorazione, ma comunica come un piccolo produttore per il pubblico privato: l'unico canale strutturato parla al target sbagliato.",
    problemi: [
      "Instagram è tarato sul privato: 468 post per 1.820 follower e ER all'1%, mentre chef e grossisti, i clienti che valgono di più, non vengono mai nominati né corteggiati.",
      "Reel abbandonati nel 2025 proprio quando l'algoritmo premia il video verticale: è una delle cause principali della crescita piatta.",
      "Nessuno strumento B2B: niente LinkedIn, newsletter o schede prodotto per la ristorazione; il link in bio porta a una pagina Canva invece che al sito.",
    ].join("\n"),
    azioni: [
      "Mettere le persone al centro dei contenuti (Luca, Silvia, i soci in serra): i post con persone fanno 3-4 volte le interazioni.",
      "Riprendere i Reel con un formato fisso sul metodo e sul piano di semina, pensato per lo chef.",
      "Nel nuovo sito: area HoReCa con schede tecniche, referenze e modulo di contatto; il link in bio punta lì.",
    ].join("\n"),
  },
  strumenti: {
    canali:
      "Instagram @piantiny_: 1.820 follower, 468 post, circa 5 post al mese, media 16 like e 2 commenti (ER circa 1%), +21 follower nell'ultimo mese.\nFacebook @Piantiny2022: 437 follower, 0 recensioni, pubblicazioni sporadiche.\nVendita diretta, consegna a domicilio e mercato Campagna Amica Coldiretti a Brescia.",
    funziona: "Contenuto autentico e realistico: si vede il vero prodotto\nRacconto del processo produttivo\nStorie in evidenza organizzate per temi\nPatrimonio di 468 contenuti già prodotti\nCanali fisici reali e funzionanti verso il territorio",
    migliorabile:
      "Manca uno scopo comunicativo: tanto sforzo che non si converte né in pubblico né in engagement\nReel abbandonati nel 2025, mentre Instagram premia il video in reach\nLink in bio verso una pagina Canva: segnale di amatorialità correggibile a costo zero\nFacebook quasi inattivo e senza narrazione",
    contenuti_top:
      "I tre contenuti più performanti (55-75 interazioni contro una media di 18) mostrano tutti delle persone: Luca con il grembiule e il prodotto, i soci in serra e in campo. I post di solo prodotto restano tra 5 e 15 interazioni: 3-4 volte meno.",
    offline:
      "Vendita diretta, consegna e mercato Coldiretti funzionano per il privato. Possono diventare canali B2B con open day per buyer e ristoratori, materiale dedicato all'HoReCa e raccolta contatti business al punto vendita.",
  },
  posizionamento: {
    attuale:
      "Produttore di micro-ortaggi, erbe aromatiche, fiori eduli e piccoli frutti \"superfood\" coltivati con metodo innovativo, controllato e sostenibile, per l'alta ristorazione.",
    distintivi:
      "Il metodo: fibra naturale, ciclo di 15 giorni, prodotto venduto vivo, luce controllata da software, zero fitofarmaci\nLe persone: Luca ha riconvertito l'azienda di famiglia; Silvia ha vinto l'Oscar Green Coldiretti per l'innovazione\nLa promessa operativa: freschezza assoluta e programmazione su misura del menu",
    criticita: "Manca un manifesto\nManca una mission esplicita\nCaratteristiche distintive non dichiarate\nNessun payoff né tone of voice riconoscibile",
    tone_of_voice:
      "Oggi caldo e divulgativo, vicino al privato. Serve un registro che tenga insieme calore umano e autorevolezza tecnica, capace di parlare allo chef stellato e al distributore.",
  },
  canali: {
    tabella: "",
    ruolo:
      "Il problema non è essere su pochi canali, ma che l'unico canale strutturato è tarato sul pubblico sbagliato. Instagram fa awareness, il sito dà credibilità, LinkedIn autorevolezza, la newsletter fidelizza, le fiere convertono con l'assaggio.",
  },
  obiettivi: {
    premessa:
      "La comunicazione non serve a \"crescere sui social\" ma a sostenere l'obiettivo di business: più ristorazione alta, fornitura stabile e un brand referenziabile tra i professionisti.",
    fasi: "",
    attese:
      "Estendere il raggio commerciale verso nuova ristorazione alta anche fuori da Brescia e Bergamo\nTrasformare la fiducia di chef e grossisti già in contatto in fornitura ricorrente\nDare voce a un posizionamento già solido\nCostruire una pipeline B2B oggi affidata al passaparola",
  },
  benchmark: {
    competitor: "",
    sintesi:
      "Il settore è frammentato e artigianale, senza un leader nazionale. La leva competitiva non è il prezzo ma la freschezza dimostrabile e la sostenibilità misurabile, comunicate con dati concreti. Le aziende più solide hanno tutte un elemento distintivo riconoscibile: per Piantiny è l'heritage di tre generazioni unito alla tecnologia.",
  },
  swot: {
    s: "Heritage di tre generazioni e credibilità agronomica\nAmbiente protetto: qualità costante\nConsumo idrico pari a un decimo della coltivazione tradizionale\nEnergia da fonti rinnovabili, zero pesticidi\nPiano di semina mensile che permette allo chef di programmare il menu\nGamma diversificata",
    w: "Visibilità digitale debole rispetto ai competitor\nNessuna partnership scientifica visibile\nComunicazione tarata sul privato",
    o: "Heritage come elemento differenziante in un mercato di startup\nEstensione verso GDO bio o abbonamenti B2C\nDomanda crescente di prodotti hyperlocal nella ristorazione stellata",
    t: "Concorrenza territoriale diretta di Baby Greens (Franciacorta)\nCosti energetici per la coltivazione indoor\nCiclicità della domanda HoReCa",
  },
  best_practice: {
    best_practice: "Raccontare il metodo con i dati (acqua, energia, ciclo di 15 giorni)\nUsare l'Oscar Green come prova esterna di innovazione\nMantenere i canali fisici come spazio di relazione",
    consigli:
      "Calendario editoriale con persone e processo, non solo prodotto\nNewsletter mensile per chef: varietà, stagionalità, disponibilità\nPagina LinkedIn aziendale con casi di collaborazione\nOpen day per buyer e ristoratori",
    priorita: "Riportare la comunicazione sul cliente che vale di più: lo chef dell'alta ristorazione e il distributore del segmento alto.",
    confronto: "Primo check-up",
  },
};

const report: CheckupReport = {
  executive: {
    headline: sections.sintesi.diagnosi,
    problems: [
      { title: "Comunicazione tarata sul pubblico sbagliato", impact: "Lo chef e il distributore non trovano contenuti per loro: il canale non genera contatti B2B." },
      { title: "Reel abbandonati", impact: "Reach organica in calo proprio quando l'algoritmo spinge il video verticale: la crescita resta piatta." },
      { title: "Nessuno strumento di credibilità B2B", impact: "Un buyer che verifica l'azienda trova una pagina Canva: occasione persa a costo zero." },
    ],
    actions: [
      { title: "Persone al centro dei contenuti", why: "Fanno 3-4 volte le interazioni del solo prodotto.", when: "Da subito" },
      { title: "Reel sul metodo e sul piano di semina", why: "Recupera reach e parla allo chef.", when: "Entro 30 giorni" },
      { title: "Area HoReCa nel nuovo sito", why: "Schede tecniche e referenze: il punto in cui il B2B verifica.", when: "Con il nuovo sito" },
    ],
  },
  storybrand: {
    hero: "Lo chef dell'alta ristorazione che vuole ingredienti rari, freschi e costanti per il suo menu",
    problem: "Fornitori poco affidabili, prodotti che arrivano già stanchi, impossibilità di programmare",
    guide: "Piantiny: tre generazioni di agricoltura e un metodo controllato, premiato per l'innovazione",
    plan: "Piano di semina mensile con 15 giorni di preavviso, prodotto vivo consegnato fresco",
    cta: "Prenota una degustazione in serra o richiedi il piano di semina",
    success: "Un menu programmato con ingredienti unici, sempre al massimo della freschezza",
    failure: "Piatti costruiti su ingredienti standard, uguali a quelli della concorrenza",
  },
  channels: [
    { name: "Instagram", current: 2, potential: 5, verdict: "da_rafforzare", note: "Costante ma tarato sul privato; è il canale di awareness a potenziale più alto." },
    { name: "Sito web", current: 1, potential: 4, verdict: "miniera_d_oro", note: "In rifacimento: può diventare la vetrina di credibilità per la ristorazione." },
    { name: "Newsletter", current: 0, potential: 4, verdict: "miniera_d_oro", note: "Assente: è lo strumento della fidelizzazione e del riordino." },
    { name: "LinkedIn", current: 0, potential: 3, verdict: "da_rafforzare", note: "Assente: serve autorevolezza verso HoReCa e distribuzione." },
    { name: "Fiere ed eventi", current: 1, potential: 4, verdict: "miniera_d_oro", note: "L'assaggio diretto è il vero motore della conversione B2B." },
    { name: "Facebook", current: 1, potential: 1, verdict: "non_prioritario", note: "Presidio a basso costo, senza investire energie." },
    { name: "Vendita diretta e mercato", current: 3, potential: 3, verdict: "efficace", note: "Funziona per il privato e il territorio; può raccogliere contatti business." },
  ],
  funnel: [
    { stage: "see", goal: "Far conoscere metodo e persone a chef e distributori che non conoscono Piantiny", kpis: ["Reach su target professionale", "Crescita follower qualificati"] },
    { stage: "think", goal: "Dimostrare affidabilità tecnica e costanza della fornitura", kpis: ["Visite all'area HoReCa del sito", "Download schede tecniche"] },
    { stage: "do", goal: "Portare il professionista alla prova del prodotto", kpis: ["Richieste di degustazione", "Nuovi clienti HoReCa al mese"] },
    { stage: "care", goal: "Trasformare il primo ordine in fornitura ricorrente", kpis: ["Tasso di riordino", "Durata media della collaborazione", "Referral tra chef"] },
  ],
  competitors: [
    {
      name: "Profarms",
      location: "Bolzano",
      website: "",
      channels: "Sito, Instagram, LinkedIn",
      community: "Non rilevata",
      er: null,
      erSource: "non disponibile",
      ads: "non_verificato",
      strengths: ["Tecnologia proprietaria per luce e irrigazione", "Certificazione Bio", "Modello replicabile tramite partner"],
      weaknesses: ["Struttura piccola e mercato regionale", "Alta intensità di capitale ed energia"],
      lever: "Raccontare la standardizzazione tecnologica come garanzia di qualità costante in ogni stagione.",
    },
    {
      name: "Ortogourmet",
      location: "Giovinazzo (BA)",
      website: "",
      channels: "Sito",
      community: "Non rilevata",
      er: null,
      erSource: "non disponibile",
      ads: "non_verificato",
      strengths: ["Competenza scientifica del founder agronomo", "Certificazione GLOBAL GAP", "Progetti di ricerca europei"],
      weaknesses: ["Profilo molto specialistico e di nicchia"],
      lever: "Usare prove esterne di credibilità tecnica: per Piantiny l'Oscar Green Coldiretti.",
    },
    {
      name: "Baby Greens",
      location: "Franciacorta (BS)",
      website: "",
      channels: "Sito, Instagram",
      community: "Non rilevata",
      er: null,
      erSource: "non disponibile",
      ads: "non_verificato",
      strengths: ["Posizionamento gourmet con clienti Michelin", "Sostenibilità raccontata con i dati", "Consegna in giornata"],
      weaknesses: ["Dipendenza da un territorio e da un solo segmento", "Vulnerabilità climatica"],
      lever: "Rendere visibile la sostenibilità con numeri concreti: acqua, energia, filiera.",
    },
  ],
  clientEr: 1,
  swot: { s: [], w: [], o: [], t: [] },
  quickWins: [
    { action: "Link in bio verso il sito", impact: "medio", effort: "basso", owner: "Cliente" },
    { action: "Contenuti con le persone in serra", impact: "alto", effort: "basso", owner: "Entrambi" },
    { action: "Format Reel sul piano di semina", impact: "alto", effort: "medio", owner: "Golduck" },
    { action: "Area HoReCa nel nuovo sito", impact: "alto", effort: "alto", owner: "Golduck" },
    { action: "Newsletter mensile per chef", impact: "alto", effort: "medio", owner: "Entrambi" },
    { action: "Riattivare Facebook con piano dedicato", impact: "basso", effort: "alto", owner: "—" },
  ],
  evidence: ["Il link in bio di Instagram rimanda a una pagina Canva invece che al sito"],
};

for (const [sectionKey, content] of Object.entries(sections)) {
  await db.insert(s.checkupSections).values({ checkupId, sectionKey, content }).onDuplicateKeyUpdate({ set: { content } });
}
await db.delete(s.buyerPersonas).where(eq(s.buyerPersonas.checkupId, checkupId));
await db.insert(s.buyerPersonas).values([
  { clientId: client.id, checkupId, name: "Lo chef dell'alta ristorazione", priority: 1, segment: "b2b", ageRange: "30-50 anni", needs: "Costanza di qualità, freschezza, varietà sensoriale, fornitura programmabile sul menu", interests: "Cucina di ricerca, ingredienti rari, filiera corta, storytelling da raccontare in sala", channels: "Instagram per lo scouting, passaparola tra chef, fiere food", values: "Eccellenza tecnica, autenticità, esclusività, affidabilità", lever: "Il prodotto come ingrediente tecnico, non come guarnizione" },
  { clientId: client.id, checkupId, name: "Il distributore del segmento alto", priority: 2, segment: "b2b", ageRange: "35-55 anni", needs: "Affidabilità di fornitura e un marchio che faccia curriculum presso i suoi clienti", interests: "Continuità, marginalità, differenziazione dell'offerta", channels: "LinkedIn e sito per verificare la credibilità, fiere", values: "Puntualità, reputazione, partnership di lungo periodo", lever: "Il marchio Piantiny come leva commerciale verso i suoi ristoranti" },
  { clientId: client.id, checkupId, name: "Il privato appassionato", priority: 3, segment: "b2c", ageRange: "30-50 anni", needs: "Prodotti sani, locali, da regalare o scoprire", interests: "Alimentazione di qualità, sostenibilità, regalistica gastronomica", channels: "Instagram, mercato Coldiretti, vendita diretta", values: "Genuinità, prossimità del produttore, economia locale", lever: "Visitare l'azienda e capire come nasce il prodotto" },
]);
await db.update(s.checkups).set({ report, status: "in_revisione", completedAt: new Date() }).where(eq(s.checkups.id, checkupId));
console.log(`Report di esempio pronto: http://localhost:3070/report/${checkupId}`);
await pool.end();
