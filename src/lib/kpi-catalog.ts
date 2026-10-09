// Catalogo delle metriche: come si calcolano dai dati grezzi (post_metrics) e in che verso leggerle.

import type { FunnelStage } from "./funnel";

export interface MetricTotals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews3s: number;
  profileVisits: number;
  linkClicks: number;
  followersStart?: number;
  followersEnd?: number;
  spend: number;
  leads: number;
  purchases: number;
  revenue: number;
}

export interface MetricDef {
  key: string;
  label: string;
  scope: "organico" | "sponsorizzato" | "business";
  direction: "higher" | "lower";
  unit: "%" | "€" | "n" | "x";
  stages: FunnelStage[];
  hint: string;
  compute?: (t: MetricTotals) => number | null;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const interactions = (t: MetricTotals) => t.likes + t.comments + t.shares + t.saves;

export const METRICS: MetricDef[] = [
  // Organico
  { key: "reach", label: "Reach", scope: "organico", direction: "higher", unit: "n", stages: ["awareness"],
    hint: "Persone uniche raggiunte", compute: (t) => t.reach },
  { key: "er_reach", label: "Engagement rate (su reach)", scope: "organico", direction: "higher", unit: "%",
    stages: ["awareness", "consideration"], hint: "Interazioni / reach",
    compute: (t) => ratio(interactions(t), t.reach) },
  { key: "saves_rate", label: "Tasso di salvataggio", scope: "organico", direction: "higher", unit: "%",
    stages: ["consideration"], hint: "Salvataggi / reach: segnale di contenuto utile",
    compute: (t) => ratio(t.saves, t.reach) },
  { key: "shares_rate", label: "Tasso di condivisione", scope: "organico", direction: "higher", unit: "%",
    stages: ["awareness"], hint: "Condivisioni / reach: passaparola digitale",
    compute: (t) => ratio(t.shares, t.reach) },
  { key: "profile_visits", label: "Visite al profilo", scope: "organico", direction: "higher", unit: "n",
    stages: ["consideration"], hint: "Interesse verso il brand", compute: (t) => t.profileVisits },
  { key: "link_clicks", label: "Clic sul link", scope: "organico", direction: "higher", unit: "n",
    stages: ["consideration"], hint: "Traffico verso sito / sezione B2B", compute: (t) => t.linkClicks },
  { key: "follower_growth", label: "Crescita follower", scope: "organico", direction: "higher", unit: "%",
    stages: ["awareness"], hint: "Variazione follower nel periodo",
    compute: (t) =>
      t.followersStart && t.followersEnd != null ? (t.followersEnd - t.followersStart) / t.followersStart : null },

  // Sponsorizzato
  { key: "cpm", label: "CPM", scope: "sponsorizzato", direction: "lower", unit: "€", stages: ["awareness"],
    hint: "Costo per 1.000 impression", compute: (t) => (t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null) },
  { key: "ctr", label: "CTR", scope: "sponsorizzato", direction: "higher", unit: "%", stages: ["consideration"],
    hint: "Clic / impression", compute: (t) => ratio(t.linkClicks, t.impressions) },
  { key: "cpc", label: "CPC", scope: "sponsorizzato", direction: "lower", unit: "€", stages: ["consideration"],
    hint: "Costo per clic", compute: (t) => ratio(t.spend, t.linkClicks) },
  { key: "hook_rate", label: "Hook rate", scope: "sponsorizzato", direction: "higher", unit: "%",
    stages: ["awareness"], hint: "Visualizzazioni 3s / impression: il video ferma lo scroll?",
    compute: (t) => ratio(t.videoViews3s, t.impressions) },
  { key: "frequency", label: "Frequenza", scope: "sponsorizzato", direction: "lower", unit: "x",
    stages: ["awareness"], hint: "Impression / reach: oltre 3-4 il pubblico si stanca",
    compute: (t) => ratio(t.impressions, t.reach) },
  { key: "cpl", label: "Costo per lead", scope: "sponsorizzato", direction: "lower", unit: "€",
    stages: ["consideration", "conversion"], hint: "Spesa / contatti", compute: (t) => ratio(t.spend, t.leads) },
  { key: "cpa", label: "Costo per acquisizione", scope: "sponsorizzato", direction: "lower", unit: "€",
    stages: ["conversion"], hint: "Spesa / acquisti", compute: (t) => ratio(t.spend, t.purchases) },
  { key: "roas", label: "ROAS", scope: "sponsorizzato", direction: "higher", unit: "x", stages: ["conversion"],
    hint: "Ricavi / spesa", compute: (t) => ratio(t.revenue, t.spend) },

  // Business (inserite a mano, come nel check-up Piantiny)
  { key: "qualified_leads", label: "Contatti qualificati", scope: "business", direction: "higher", unit: "n",
    stages: ["awareness", "consideration"], hint: "Es. chef, grossisti, distributori" },
  { key: "sample_requests", label: "Richieste di campioni / assaggi", scope: "business", direction: "higher",
    unit: "n", stages: ["consideration", "conversion"], hint: "Prova fisica del prodotto" },
  { key: "new_customers", label: "Nuovi clienti acquisiti", scope: "business", direction: "higher", unit: "n",
    stages: ["conversion"], hint: "Primo ordine" },
  { key: "first_order_value", label: "Valore medio primo ordine", scope: "business", direction: "higher",
    unit: "€", stages: ["conversion"], hint: "" },
  { key: "days_to_first_order", label: "Giorni dal contatto al primo ordine", scope: "business",
    direction: "lower", unit: "n", stages: ["conversion"], hint: "" },
  { key: "reorder_rate", label: "Tasso di riordino", scope: "business", direction: "higher", unit: "%",
    stages: ["retention"], hint: "" },
  { key: "referrals", label: "Contatti da passaparola", scope: "business", direction: "higher", unit: "n",
    stages: ["retention"], hint: "Referral tra professionisti" },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));
