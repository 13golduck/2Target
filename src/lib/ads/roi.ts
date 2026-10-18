// ROI delle sponsorizzate: quanto ha reso ogni campagna, dai lead che ha portato fino ai clienti acquisiti.
// Funzione pura: riceve spesa (in euro) e lead già attribuiti alla campagna.

export type RoiLead = { stage: string; wonValue: number | null; estimatedValue: number | null };

export type CampaignRoi = {
  spend: number;
  leads: number;
  customers: number;
  revenue: number;
  /** Lead ancora aperti (né vinti né persi) e il loro valore stimato. */
  open: number;
  pipeline: number;
  cpl: number | null;
  cac: number | null;
  /** Ricavi / spesa: sopra 1 la campagna si ripaga. */
  roas: number | null;
};

const div = (a: number, b: number) => (b > 0 ? a / b : null);
const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

/** Prefisso del codice UTM delle campagne di 2Target nei link: utm_campaign=2t-<id>. */
export const UTM_PREFIX = "2t-";
export const utmCampaign = (id: number) => `${UTM_PREFIX}${id}`;
/** Id della sponsorizzata dal codice utm_campaign, oppure null. */
export function campaignIdFromUtm(utm: string | null | undefined) {
  const m = /^2t-(\d{1,9})$/.exec((utm ?? "").trim().toLowerCase());
  return m ? Number(m[1]) : null;
}

export function campaignRoi(spendEur: number, leads: RoiLead[]): CampaignRoi {
  const won = leads.filter((l) => l.stage === "vinto");
  const revenue = won.reduce((t, l) => t + (l.wonValue ?? 0), 0);
  const openLeads = leads.filter((l) => l.stage !== "vinto" && l.stage !== "perso");
  const pipeline = openLeads.reduce((t, l) => t + (l.estimatedValue ?? 0), 0);
  return {
    spend: round2(spendEur)!,
    leads: leads.length,
    customers: won.length,
    revenue: round2(revenue)!,
    open: openLeads.length,
    pipeline: round2(pipeline)!,
    cpl: round2(div(spendEur, leads.length)),
    cac: round2(div(spendEur, won.length)),
    roas: round2(div(revenue, spendEur)),
  };
}
