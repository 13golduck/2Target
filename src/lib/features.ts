// Funzioni accendibili e spegnibili: chi non usa una parte di 2Target la toglie dai menu e lavora con meno voci.
// Due livelli: generale (Impostazioni → Funzioni) e per cliente (Panoramica del cliente). Una funzione spenta
// in generale è spenta per tutti; per cliente si può solo spegnere ciò che in generale è acceso.
// Il cuore dell'app (Panoramica, Piano editoriale, KPI, Canali) è sempre acceso. Funzioni pure.

export type FeatureKey = "studio" | "checkup" | "brand" | "concorrenti" | "idee" | "lead" | "seo" | "profili" | "calendario" | "sponsorizzate" | "consumi_ai";

export type Feature = {
  key: FeatureKey;
  label: string;
  description: string;
  /** Scheda del cliente (percorso dopo /clienti/:id). */
  tab?: string;
  /** Voce del menu principale. */
  nav?: string;
  /** Si può spegnere anche per un singolo cliente. */
  perClient: boolean;
};

export const FEATURES: Feature[] = [
  { key: "studio", label: "Studio con l'AI", description: "In «Crea post», il modo in cui l'AI prepara testo, grafica e video e tu li correggi", perClient: true },
  { key: "checkup", label: "Check-up", description: "Analisi iniziale del cliente con l'AI: punti di forza, concorrenti, obiettivi", tab: "/checkup", perClient: true },
  { key: "brand", label: "Brand e studio grafico", description: "Logo, colori, brief grafici e revisione delle grafiche", tab: "/brand", perClient: true },
  { key: "concorrenti", label: "Concorrenti", description: "Confronto con i concorrenti su Instagram", tab: "/concorrenti", perClient: true },
  { key: "idee", label: "Idee", description: "Raccolta e generazione di idee per i contenuti", tab: "/idee", perClient: true },
  { key: "lead", label: "Lead", description: "Contatti arrivati da sito e moduli, con il loro percorso", tab: "/lead", perClient: true },
  { key: "seo", label: "SEO", description: "Search Console, Analytics e analisi mensile del sito", tab: "/seo", perClient: true },
  { key: "profili", label: "Profili social", description: "Completare e creare i profili social del cliente", tab: "/profili", perClient: true },
  { key: "calendario", label: "Calendario", description: "Calendario di tutti i clienti insieme", nav: "/calendario", perClient: false },
  { key: "sponsorizzate", label: "Sponsorizzate", description: "Campagne a pagamento su Meta e moduli contatti", nav: "/sponsorizzate", perClient: false },
  { key: "consumi_ai", label: "Consumi AI", description: "Spesa per l'intelligenza artificiale, per cliente e per mese", nav: "/consumi-ai", perClient: false },
];

export type FeatureFlags = Partial<Record<FeatureKey, boolean>>;

const known = new Set<string>(FEATURES.map((f) => f.key));

/** Tiene solo chiavi conosciute con valori sì/no (i dati arrivano dal browser o dal database). */
export function cleanFlags(input: unknown): FeatureFlags {
  if (!input || typeof input !== "object") return {};
  return Object.fromEntries(Object.entries(input).filter(([k, v]) => known.has(k) && typeof v === "boolean")) as FeatureFlags;
}

/** Accesa se non spenta in generale e (per le funzioni per cliente) non spenta per quel cliente. */
export function isOn(key: FeatureKey, global: FeatureFlags, client?: FeatureFlags | null) {
  if (global[key] === false) return false;
  const f = FEATURES.find((x) => x.key === key);
  return !(f?.perClient && client?.[key] === false);
}

/** Funzione che corrisponde a una sezione del cliente («checkup», «lead»…), se è spegnibile. */
export function featureOfTab(section: string) {
  return FEATURES.find((f) => f.tab === `/${section}`) ?? null;
}

export function featureOfNav(path: string) {
  return FEATURES.find((f) => f.nav === path) ?? null;
}
