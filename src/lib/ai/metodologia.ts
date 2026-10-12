import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";

// Metodologia Golduck per il Communication Check-Up: istruzioni che l'AI segue in ogni fase
// (ricerca, domande, scrittura, revisione). Si modifica da Impostazioni; ogni salvataggio crea una
// nuova versione e ogni check-up ricorda quale ha usato (storico).

export const DEFAULT_METHOD = `## Obiettivo
Trasformare dati frammentati e osservazioni sui canali di comunicazione del cliente in un report strategico
strutturato, autorevole e "pronto per la vendita". Il tono è rigoroso, propositivo, consulenziale (senza fuffa),
chiaro ed estremamente attento ai dettagli di business.

## Struttura del report
Il documento si apre con un EXECUTIVE SUMMARY di una pagina (principio della piramide rovesciata): i 3 problemi
principali e le 3 azioni prioritarie da fare subito. Se il cliente legge solo quella pagina deve comunque percepire
il valore dell'intera consulenza. Seguono sempre questi 8 punti:
1. Analisi degli strumenti di comunicazione esistenti (sito, social, canali fisici): "in cosa funziona" e "in cosa
   potrebbe performare meglio", con metriche quando disponibili.
2. Posizionamento, brand identity e tone of voice: posizionamento attuale, criticità, registro linguistico.
3. Buyer persona: almeno 3 profili strategici con dati demografici, leve psicologiche, canali preferiti, valori.
4. Canali utilizzati vs potenziale: tabella di sintesi sull'efficacia attuale di ogni canale rispetto al suo
   potenziale strategico, con spiegazione qualitativa. Deve far vedere subito dove si spreca budget e dove c'è
   una "miniera d'oro" inutilizzata.
5. Obiettivi di comunicazione lungo il funnel: Awareness, Consideration, Conversion, Retention/Loyalty, con
   micro-obiettivi, strategie operative e KPI.
6. Benchmark competitor: 3-5 competitor o realtà simili (nazionali o internazionali), ciascuno con mini-SWOT.
7. Analisi SWOT del cliente.
8. Best practice e consigli di crescita: azioni prioritarie e "quick wins" per colmare i gap.

## Regole di stile
- Niente generalizzazioni. Per ogni criticità spiega SEMPRE l'impatto sul business (es. "pochi Reel riducono la
  reach organica in un momento in cui l'algoritmo privilegia i video verticali, allontanando il target under 35").
- Linguaggio tecnico ma accessibile: funnel, ROI, reach organica, buyer persona, touchpoint, brand equity.
- Approccio proattivo: per ogni problema una soluzione concreta o una best practice di riferimento.
- Registro adattato al cliente: istituzionale e formale per enti pubblici e associazioni nazionali; dinamico e
  commerciale per startup e aziende di prodotto.

## Framework da usare
- SOSTAC (PR Smith): filo logico tra analisi e azioni. Situation = punti 1, 2, 3, 7; Objectives = punto 5;
  Strategy = punti 5 e 8; Tactics = punti 4 e 5; Action = punto 8 (chi fa cosa); Control = KPI del punto 5.
- See-Think-Do-Care (Avinash Kaushik): See = Awareness (pubblico ampio, nessun intento), Think = Consideration
  (valutazione), Do = Conversion (pronto all'azione), Care = Retention (clienti ricorrenti).
- StoryBrand (Donald Miller) per posizionamento e tone of voice: il cliente non è l'eroe ma la guida che dà
  all'eroe (la buyer persona) lo strumento (prodotto o servizio) per risolvere il suo problema.

## Benchmark competitor
Non una lista di nomi ma uno studio. Per ogni competitor:
- Dati chiave: canali attivi, dimensione della community, engagement rate, se fa pubblicità attiva.
- Strengths: cosa fa eccezionalmente bene.
- Weaknesses: dove sbaglia.
- Leva strategica: la singola lezione o best practice che il cliente può copiare, adattare o migliorare.
Confronta i numeri con quelli del cliente: un ER del 4% contro l'1% dà subito la misura del gap.

## Dati e fonti (regola vincolante)
- Usa solo dati trovati online, con la fonte, oppure forniti dal consulente.
- Strumenti come SimilarWeb, Semrush, Phlanx o ShareLOV NON sono consultabili da te: non attribuire loro numeri.
  Se un dato è una tua stima, scrivilo come "stima" e spiega come l'hai ottenuta (es. interazioni visibili sugli
  ultimi 12 post / follower).
- La Libreria inserzioni di Meta è pubblica: se riesci a consultarla indica se il competitor ha inserzioni attive,
  altrimenti scrivi "non verificato".
- Se un'evidenza merita una prova visiva (es. link in bio rotto) segnalalo: il consulente allegherà lo screenshot.
`;

export const DEFAULT_PLAN_METHOD = `## Obiettivo
Un piano editoriale social pronto da produrre e pubblicare: ogni contenuto ha data, formato, pilastro, layout,
caption completa, hashtag e CTA. Nasce dal check-up (posizionamento, buyer persona, funnel, competitor, quick win)
e dalle risposte del consulente; deve far capire al cliente perché è fatto così.

## Parte introduttiva (va nel brief del piano)
- Intestazione: cliente, periodo, numero totale di contenuti divisi per formato, frequenza (es. "min. 3 a settimana,
  mai la domenica").
- Legenda e criteri: giorni fissi di pubblicazione per formato e perché (es. Reel martedì e giovedì, Post/Carosello sabato).
  Il primo contenuto presenta la pagina o il progetto, se il canale riparte o è nuovo.
- Pilastri di contenuto (5-7) con una riga ciascuno: cosa sono e a cosa servono nel funnel. Il pilastro più frequente
  è quello che il check-up indica come più efficace (anche sull'esempio dei competitor che funzionano).
- "Perché questa distribuzione": confronto con i competitor del check-up (frequenza, formati) e i pilastri che loro
  non presidiano, legati a un vantaggio reale del cliente.
- Pulsanti e call to action: bottone fisso della pagina e logica della CTA per fase (awareness = CTA leggera
  "salva / scrivici in DM"; fiducia = verso il sito o il portfolio; considerazione = DM o modulo; promo = CTA diretta
  con una scadenza vera, mai urgenza finta). Evitare "link in bio" generico per i contenuti ad alto intento.
- Budget sponsorizzate: cifra mensile indicativa (dichiarata come ipotesi se mancano dati storici), quanti contenuti
  sponsorizzare al mese, quali sono candidati (★) e perché, obiettivo della campagna per tipo di contenuto, targeting
  (raggio geografico, età, interessi), fasi di spesa nel periodo.
- Strategia di produzione: giornate di ripresa/foto consigliate e cosa raccogliere in ciascuna, materiale da chiedere
  al cliente con una scadenza.

## Calendario
- Ogni contenuto: data, formato (Reel, Post singolo, Carosello, Storia), pilastro, titolo, layout e produzione
  (inquadrature, durata, slide del carosello, testo in overlay), caption completa pronta da pubblicare, hashtag
  (8-10: brand + settore + località), CTA coerente con la fase.
- Mix dei formati secondo il check-up: video verticali per la reach, caroselli per FAQ e contenuti da salvare.
- Seguire la stagionalità reale del settore e le ricorrenze utili (non tutte: solo quelle sensate per il cliente).
- Segnare con "candidato sponsorizzazione" i contenuti più forti per la pubblicità.
- Segnalare la "criticità materiale" quando un contenuto richiede foto/video che potrebbero non esistere (es. prima/dopo),
  con il livello di rischio e la data entro cui verificare; proporre l'alternativa se il materiale manca.

## Regole di stile
- Italiano, tono di voce del cliente (dal brand kit e dal check-up). Niente frasi fatte, niente emoji in eccesso.
- Caption concrete e specifiche per il cliente: luoghi, servizi, prodotti, persone reali. Nessun dato inventato
  (prezzi, premi, anni di attività) se non viene dal check-up o dal consulente: in quel caso scrivere [da verificare].
- Ogni caption è una base di partenza che il team adatta; i consigli tecnici vanno verificati con il cliente.

## Note per il team (in fondo al brief)
- Reel sempre con sottotitoli in overlay. Coerenza cromatica con il brand kit. Rivedere il piano dopo le prime
  4 settimane sostituendo i pilastri che rendono meno.
`;

type MethodVersion = { version: number; text: string; at: string; by?: number };
type MethodStore = { current: number; versions: MethodVersion[] };

/** Testi di istruzioni versionati in app_settings: metodologia del check-up e del piano editoriale. */
function versioned(key: string, fallback: string) {
  async function store(): Promise<MethodStore> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return (row?.value as MethodStore) ?? { current: 1, versions: [{ version: 1, text: fallback, at: "predefinita" }] };
  }
  return {
    /** Versione in vigore (per i nuovi lavori). */
    async get() {
      const s = await store();
      const v = s.versions.find((x) => x.version === s.current) ?? s.versions.at(-1)!;
      return { ...v, isDefault: v.text === fallback };
    },
    /** Testo di una versione precisa (i lavori già avviati restano sulla loro). */
    async text(version: number | null | undefined) {
      const s = await store();
      return (s.versions.find((x) => x.version === version) ?? s.versions.find((x) => x.version === s.current))?.text ?? fallback;
    },
    /** Salva una nuova versione (le ultime 30 restano nello storico). */
    async save(text: string, userId: number) {
      const s = await store();
      const clean = text.trim();
      if (clean === s.versions.find((x) => x.version === s.current)?.text) return s.current;
      const version = Math.max(...s.versions.map((x) => x.version)) + 1;
      const value: MethodStore = { current: version, versions: [...s.versions, { version, text: clean, at: new Date().toISOString(), by: userId }].slice(-30) };
      await db.insert(appSettings).values({ key, value, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value, updatedBy: userId } });
      return version;
    },
  };
}

const checkupMethod = versioned("checkup_method", DEFAULT_METHOD);
export const planMethod = versioned("plan_method", DEFAULT_PLAN_METHOD);

export const getMethodology = checkupMethod.get;
export const methodologyText = checkupMethod.text;
export const saveMethodology = checkupMethod.save;
