// Struttura del Communication Check-Up Golduck (modello: Check-Up Piantiny, giugno 2026).
// Ogni sezione elenca i campi da compilare e le domande guida per il consulente e per la bozza AI.

export interface CheckupSection {
  key: string;
  title: string;
  fields: { key: string; label: string; kind: "testo" | "elenco" | "tabella" | "dati" }[];
  guide: string[];
}

export const CHECKUP_SECTIONS: CheckupSection[] = [
  {
    key: "strumenti",
    title: "Analisi degli strumenti di comunicazione esistenti",
    fields: [
      { key: "canali", label: "Numeri per canale (follower, post, frequenza, ER, crescita)", kind: "dati" },
      { key: "funziona", label: "In cosa funziona", kind: "elenco" },
      { key: "migliorabile", label: "In cosa potrebbe performare meglio", kind: "elenco" },
      { key: "contenuti_top", label: "Contenuti più performanti e perché", kind: "testo" },
      { key: "offline", label: "Canali offline (vendita diretta, mercati, eventi)", kind: "testo" },
    ],
    guide: [
      "Il rapporto post/follower indica sforzo che non si converte?",
      "Quali formati sono stati abbandonati (es. reel) e quando?",
      "Il link in bio porta al sito?",
      "Che tipo di contenuto rende di più (persone vs solo prodotto)? Di quante volte?",
    ],
  },
  {
    key: "posizionamento",
    title: "Posizionamento, brand identity e tone of voice",
    fields: [
      { key: "attuale", label: "Posizionamento attuale", kind: "testo" },
      { key: "distintivi", label: "Elementi distintivi reali (metodo, persone, promessa)", kind: "elenco" },
      { key: "criticita", label: "Criticità del brand (manifesto, mission, payoff, ToV mancanti)", kind: "elenco" },
      { key: "tone_of_voice", label: "Tone of voice attuale e registro consigliato", kind: "testo" },
    ],
    guide: ["Riconoscimenti esterni utilizzabili come prova?", "Il tono è tarato sul pubblico che vale di più?"],
  },
  {
    key: "persona",
    title: "Buyer persona",
    fields: [{ key: "personas", label: "Profili in ordine di valore strategico", kind: "tabella" }],
    guide: ["Chi è il vero destinatario se il canale indiretto pesa sul fatturato?", "Quale dato interno manca?"],
  },
  {
    key: "canali",
    title: "Canali utilizzati vs potenziale",
    fields: [
      { key: "tabella", label: "Canale · utilizzo attuale · potenziale", kind: "tabella" },
      { key: "ruolo", label: "Ruolo di ogni canale nel percorso del cliente", kind: "testo" },
    ],
    guide: ["L'unico canale strutturato parla al pubblico giusto?"],
  },
  {
    key: "obiettivi",
    title: "Obiettivi di comunicazione per fase del funnel",
    fields: [
      { key: "premessa", label: "Ruolo della comunicazione nel modello di business", kind: "testo" },
      { key: "fasi", label: "Awareness, Consideration, Conversion, Retention: obiettivo, strategie, KPI", kind: "tabella" },
      { key: "attese", label: "Cosa ci aspettiamo dal cambiamento", kind: "elenco" },
    ],
    guide: ["I KPI di ogni fase entrano nel semaforo con target e punto di partenza."],
  },
  {
    key: "benchmark",
    title: "Benchmark competitor",
    fields: [
      { key: "competitor", label: "Schede competitor con mini SWOT e best practice", kind: "tabella" },
      { key: "sintesi", label: "Sintesi del benchmark", kind: "testo" },
    ],
    guide: ["Esiste un leader? Qual è la leva competitiva vera (non il prezzo)?"],
  },
  {
    key: "swot",
    title: "Analisi SWOT",
    fields: [
      { key: "s", label: "Punti di forza", kind: "elenco" },
      { key: "w", label: "Punti di debolezza", kind: "elenco" },
      { key: "o", label: "Opportunità", kind: "elenco" },
      { key: "t", label: "Minacce", kind: "elenco" },
    ],
    guide: [],
  },
  {
    key: "best_practice",
    title: "Best practice e consigli di crescita",
    fields: [
      { key: "best_practice", label: "Best practice del cliente", kind: "elenco" },
      { key: "consigli", label: "Consigli di crescita", kind: "elenco" },
      { key: "priorita", label: "Priorità numero uno", kind: "testo" },
      { key: "confronto", label: "Cosa è cambiato rispetto al check-up precedente", kind: "testo" },
    ],
    guide: [],
  },
];
