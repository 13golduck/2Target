// Guida di 2Target (wiki): articoli scritti per chi usa l'app, non per chi la sviluppa.
// Ogni articolo è fatto di blocchi semplici, così il testo resta leggibile anche nel codice.

export type GuideBlock =
  | { h: string } // sottotitolo
  | { p: string } // paragrafo
  | { steps: string[] } // passi numerati da seguire in ordine
  | { list: string[] } // elenco puntato
  | { tip: string } // consiglio
  | { warn: string }; // attenzione

export type GuideCategory = "inizia" | "clienti" | "contenuti" | "pubblicazione" | "risultati" | "canali" | "amministrazione" | "problemi";

export type GuideArticle = {
  slug: string;
  title: string;
  category: GuideCategory;
  icon: string;
  /** Una frase: cosa si impara. */
  summary: string;
  /** Chi lo vede: tutti (anche i clienti con accesso in sola lettura), il team, solo gli amministratori. */
  audience: "tutti" | "team" | "admin";
  /** Dove si apre in 2Target (percorso fisso) o la sezione del cliente (es. "piano"). */
  open?: { path?: string; clientTab?: string; label: string };
  /** Parole in più per la ricerca (sinonimi, termini che l'utente potrebbe cercare). */
  keywords?: string[];
  blocks: GuideBlock[];
  related?: string[];
};

export const CATEGORY_LABEL: Record<GuideCategory, string> = {
  inizia: "Per iniziare",
  clienti: "Clienti e strategia",
  contenuti: "Contenuti e piano editoriale",
  pubblicazione: "Pubblicazione",
  risultati: "Risultati",
  canali: "Canali e collegamenti",
  amministrazione: "Amministrazione",
  problemi: "Problemi e domande frequenti",
};

export const CATEGORY_ORDER: GuideCategory[] = ["inizia", "clienti", "contenuti", "pubblicazione", "risultati", "canali", "amministrazione", "problemi"];

/** Testo semplice dell'articolo, per la ricerca. Funzione pura. */
export function articleText(a: GuideArticle) {
  const parts = [a.title, a.summary, ...(a.keywords ?? [])];
  for (const b of a.blocks) {
    if ("h" in b) parts.push(b.h);
    else if ("p" in b) parts.push(b.p);
    else if ("tip" in b) parts.push(b.tip);
    else if ("warn" in b) parts.push(b.warn);
    else if ("steps" in b) parts.push(...b.steps);
    else parts.push(...b.list);
  }
  return parts.join(" ");
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Articoli che contengono tutte le parole cercate, prima quelli con le parole nel titolo. Funzione pura. */
export function searchArticles(articles: GuideArticle[], query: string) {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return articles;
  return articles
    .map((a) => ({ a, text: fold(articleText(a)), title: fold(`${a.title} ${(a.keywords ?? []).join(" ")}`) }))
    .filter((x) => words.every((w) => x.text.includes(w)))
    .sort((x, y) => words.filter((w) => y.title.includes(w)).length - words.filter((w) => x.title.includes(w)).length)
    .map((x) => x.a);
}

/** Articoli visibili al ruolo. */
export function articlesFor(articles: GuideArticle[], role: "superadmin" | "admin" | "user" | "viewer" | string) {
  const admin = role === "superadmin" || role === "admin";
  return articles.filter((a) => a.audience === "tutti" || (a.audience === "team" && role !== "viewer") || (a.audience === "admin" && admin));
}
