// Controlli sul piano editoriale: quote per formato, cadenza settimanale e completezza di ogni scheda.
// Modello: brief Lesioli (21 settembre → gennaio, ≥3 a settimana, 18 post + 34 reel,
// per ogni pubblicazione layout, caption, hashtag e CTA; per le sponsorizzate pulsante e destinazione).

export type ItemFormat = "reel" | "post" | "carosello" | "storia" | "video" | "articolo" | "email";
export type CtaDestination = "sito" | "telefono" | "whatsapp" | "direct" | "modulo" | "nessuna";

export interface ShotListEntry {
  scena: string;
  descrizione?: string;
  durata_s?: number;
  fonte: "cliente" | "golduck" | "ai" | "stock";
}

export interface EditorialItem {
  id: string;
  title: string;
  format: ItemFormat;
  scheduledAt: Date | null;
  status?: string;
  hook?: string | null;
  layoutNotes?: string | null;
  script?: string | null;
  shotList?: ShotListEntry[];
  caption?: string | null;
  hashtags?: string[];
  cta?: string | null;
  ctaDestination?: CtaDestination | null;
  ctaUrl?: string | null;
  isPaid?: boolean;
  adObjective?: string | null;
  adButton?: string | null;
  adBudget?: number | null;
  adDays?: number | null;
}

export interface EditorialPlan {
  startsOn: Date;
  endsOn: Date;
  minPerWeek: number;
  formatQuotas: Partial<Record<ItemFormat, number>>;
  adsBudget?: number | null;
}

export interface Issue {
  level: "errore" | "avviso";
  message: string;
  itemId?: string;
}

const VIDEO_FORMATS: ItemFormat[] = ["reel", "video", "storia"];
const isActive = (i: EditorialItem) => i.status !== "annullato";

/** Pulsanti Meta coerenti con la destinazione della CTA. */
export const AD_BUTTONS_BY_DESTINATION: Record<CtaDestination, string[]> = {
  sito: ["Scopri di più", "Prenota ora", "Richiedi preventivo"],
  telefono: ["Chiama ora"],
  whatsapp: ["Invia messaggio WhatsApp"],
  direct: ["Invia messaggio"],
  modulo: ["Iscriviti", "Richiedi preventivo", "Contattaci"],
  nessuna: [],
};

/** Campi mancanti in una singola scheda pubblicazione. */
export function itemIssues(item: EditorialItem): Issue[] {
  const out: Issue[] = [];
  const miss = (field: string, level: Issue["level"] = "errore") =>
    out.push({ level, itemId: item.id, message: `"${item.title}": manca ${field}` });

  if (!item.scheduledAt) miss("la data di pubblicazione");
  if (!item.caption?.trim()) miss("il testo del post");
  // Suggerimenti, non errori: un post semplice (es. da «Crea post») può uscire anche senza
  if (!item.hashtags?.length) miss("l'elenco hashtag", "avviso");
  if (!item.cta?.trim()) miss("l'invito all'azione", "avviso");
  if (!item.layoutNotes?.trim()) miss("l'idea di layout", "avviso");
  if (!item.hook?.trim()) miss("la frase d'apertura", "avviso");

  if (VIDEO_FORMATS.includes(item.format) && item.format !== "storia") {
    if (!item.script?.trim()) miss("lo script / voiceover");
    if (!item.shotList?.length) miss("l'elenco delle clip da girare", "avviso");
  }

  if (item.ctaDestination && ["sito", "modulo"].includes(item.ctaDestination) && !item.ctaUrl) {
    miss("il link a cui porta l'invito all'azione");
  }

  if (item.isPaid) {
    if (!item.adObjective) miss("l'obiettivo della sponsorizzata");
    if (!item.adBudget || item.adBudget <= 0) miss("il budget della sponsorizzata");
    if (!item.adDays || item.adDays <= 0) miss("la durata della sponsorizzata");
    if (!item.ctaDestination || item.ctaDestination === "nessuna") miss("la destinazione (sito, telefono, …)");
    if (!item.adButton) miss("il pulsante dell'inserzione");
    else if (item.ctaDestination && !AD_BUTTONS_BY_DESTINATION[item.ctaDestination].includes(item.adButton)) {
      out.push({
        level: "avviso",
        itemId: item.id,
        message: `"${item.title}": il pulsante "${item.adButton}" non è tipico per la destinazione "${item.ctaDestination}"`,
      });
    }
  }
  return out;
}

/** Inizio settimana (lunedì) in UTC, usato come chiave. */
function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function planIssues(plan: EditorialPlan, items: EditorialItem[], today: Date = new Date()): Issue[] {
  const out: Issue[] = [];
  const active = items.filter(isActive);

  // Quote per formato
  for (const [format, quota] of Object.entries(plan.formatQuotas) as [ItemFormat, number][]) {
    const n = active.filter((i) => i.format === format).length;
    if (n !== quota) {
      out.push({
        level: n < quota ? "errore" : "avviso",
        message: `${format}: ${n} pianificati su ${quota} richiesti`,
      });
    }
  }

  // Date fuori periodo
  for (const i of active) {
    if (i.scheduledAt && (i.scheduledAt < plan.startsOn || i.scheduledAt > endOfDay(plan.endsOn))) {
      out.push({ level: "errore", itemId: i.id, message: `"${i.title}": data fuori dal periodo del piano` });
    }
  }

  // Cadenza settimanale (si saltano le settimane parziali a inizio e fine piano e quelle già passate: non sono più correggibili)
  const counts = new Map<string, number>();
  for (const i of active) if (i.scheduledAt) counts.set(weekKey(i.scheduledAt), (counts.get(weekKey(i.scheduledAt)) ?? 0) + 1);
  const thisWeek = weekKey(today);
  const firstFull = [weekKey(addDays(plan.startsOn, 6)), thisWeek].sort()[1];
  const lastFull = weekKey(addDays(plan.endsOn, -6));
  for (let w = new Date(firstFull); w.toISOString().slice(0, 10) <= lastFull; w = addDays(w, 7)) {
    const k = w.toISOString().slice(0, 10);
    const n = counts.get(k) ?? 0;
    if (n < plan.minPerWeek) {
      out.push({ level: "avviso", message: `Settimana del ${formatIt(w)}: ${n} pubblicazioni (minimo ${plan.minPerWeek})` });
    }
  }

  // Budget sponsorizzate
  const paidTotal = active.reduce((s, i) => s + (i.isPaid ? (i.adBudget ?? 0) : 0), 0);
  if (plan.adsBudget != null && paidTotal > plan.adsBudget) {
    out.push({ level: "errore", message: `Sponsorizzate: ${paidTotal} € pianificati, oltre il budget di ${plan.adsBudget} €` });
  }

  for (const i of active) out.push(...itemIssues(i));
  return out;
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
const formatIt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
