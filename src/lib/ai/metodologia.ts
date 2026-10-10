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

type MethodVersion = { version: number; text: string; at: string; by?: number };
type MethodStore = { current: number; versions: MethodVersion[] };

const KEY = "checkup_method";

async function store(): Promise<MethodStore> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return (row?.value as MethodStore) ?? { current: 1, versions: [{ version: 1, text: DEFAULT_METHOD, at: "predefinita" }] };
}

/** Metodologia in vigore (per i nuovi check-up). */
export async function getMethodology() {
  const s = await store();
  const v = s.versions.find((x) => x.version === s.current) ?? s.versions.at(-1)!;
  return { ...v, isDefault: v.text === DEFAULT_METHOD };
}

/** Testo di una versione precisa (i check-up già avviati restano sulla loro). */
export async function methodologyText(version: number | null | undefined) {
  const s = await store();
  return (s.versions.find((x) => x.version === version) ?? s.versions.find((x) => x.version === s.current))?.text ?? DEFAULT_METHOD;
}

/** Salva una nuova versione (le ultime 30 restano nello storico). */
export async function saveMethodology(text: string, userId: number) {
  const s = await store();
  const clean = text.trim();
  if (clean === s.versions.find((x) => x.version === s.current)?.text) return s.current;
  const version = Math.max(...s.versions.map((x) => x.version)) + 1;
  const value: MethodStore = { current: version, versions: [...s.versions, { version, text: clean, at: new Date().toISOString(), by: userId }].slice(-30) };
  await db.insert(appSettings).values({ key: KEY, value, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value, updatedBy: userId } });
  return version;
}
