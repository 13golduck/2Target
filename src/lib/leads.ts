// Statistiche del funnel di vendita generato dal marketing.
//
// Due logiche, come nei report commerciali:
// - costi:     CPL e CAC = costi del periodo / lead (o clienti) del periodo;
// - coorte:    i tassi di conversione seguono i lead RICEVUTI nel periodo (fin dove sono arrivati).

export const STAGE_ORDER = ["nuovo", "contattato", "qualificato", "preventivo", "vinto"] as const;
export type Stage = (typeof STAGE_ORDER)[number] | "perso";

export interface LeadRow {
  id: number;
  source: string;
  stage: Stage;
  receivedAt: Date;
  wonAt?: Date | null;
  wonValue?: number | null;
  estimatedValue?: number | null;
  lostReason?: string | null;
}
export interface LeadEventRow {
  leadId: number;
  toStage: Stage;
}
export interface CostRow {
  month: string; // AAAA-MM-01
  source: string;
  kind: string;
  amount: number;
}

export interface FunnelStats {
  leads: number;
  cost: number;
  adsCost: number;
  cpl: number | null;
  reached: Record<(typeof STAGE_ORDER)[number], number>;
  qualifiedRate: number | null;
  customers: number; // vinti nel periodo
  cac: number | null;
  leadToCustomer: number | null; // della coorte
  revenue: number;
  avgDeal: number | null;
  roas: number | null; // ricavi / spesa inserzioni
  roi: number | null; // (ricavi - costi) / costi
  avgDaysToClose: number | null;
  lost: number;
  lostReasons: { reason: string; count: number }[];
  pipelineValue: number; // valore stimato dei lead ancora aperti
}

const inRange = (d: Date | null | undefined, from: Date, to: Date) => !!d && d >= from && d <= to;
const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Fase più avanzata raggiunta da un lead (anche se poi è stato perso). */
export function furthestStage(lead: LeadRow, events: LeadEventRow[]) {
  let max = lead.stage === "perso" ? 0 : STAGE_ORDER.indexOf(lead.stage);
  for (const e of events) {
    if (e.leadId !== lead.id || e.toStage === "perso") continue;
    max = Math.max(max, STAGE_ORDER.indexOf(e.toStage));
  }
  return max;
}

export function funnelStats(leads: LeadRow[], events: LeadEventRow[], costs: CostRow[], from: Date, to: Date): FunnelStats {
  const cohort = leads.filter((l) => inRange(l.receivedAt, from, to));
  const won = leads.filter((l) => l.stage === "vinto" && inRange(l.wonAt, from, to));
  const fromMonth = from.toISOString().slice(0, 7);
  const toMonth = to.toISOString().slice(0, 7);
  const periodCosts = costs.filter((c) => c.month.slice(0, 7) >= fromMonth && c.month.slice(0, 7) <= toMonth);
  const cost = periodCosts.reduce((t, c) => t + c.amount, 0);
  const adsCost = periodCosts.filter((c) => c.kind === "inserzioni").reduce((t, c) => t + c.amount, 0);

  const reached = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as FunnelStats["reached"];
  for (const l of cohort) {
    const f = furthestStage(l, events);
    for (let i = 0; i <= f; i++) reached[STAGE_ORDER[i]] += 1;
  }

  const revenue = won.reduce((t, l) => t + (l.wonValue ?? 0), 0);
  const days = won.filter((l) => l.wonAt).map((l) => (l.wonAt!.getTime() - l.receivedAt.getTime()) / 86_400_000);
  const lostLeads = cohort.filter((l) => l.stage === "perso");
  const reasons = new Map<string, number>();
  for (const l of lostLeads) {
    const r = l.lostReason?.trim() || "Non indicato";
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }

  return {
    leads: cohort.length,
    cost,
    adsCost,
    cpl: div(cost, cohort.length),
    reached,
    qualifiedRate: div(reached.qualificato, cohort.length),
    customers: won.length,
    cac: div(cost, won.length),
    leadToCustomer: div(reached.vinto, cohort.length),
    revenue,
    avgDeal: div(revenue, won.length),
    roas: div(revenue, adsCost),
    roi: cost > 0 ? (revenue - cost) / cost : null,
    avgDaysToClose: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
    lost: lostLeads.length,
    lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    pipelineValue: leads.filter((l) => !["vinto", "perso"].includes(l.stage)).reduce((t, l) => t + (l.estimatedValue ?? 0), 0),
  };
}

/** Le stesse statistiche divise per fonte (costi attribuiti alla fonte su cui sono stati spesi). */
export function funnelBySource(leads: LeadRow[], events: LeadEventRow[], costs: CostRow[], from: Date, to: Date) {
  const sources = new Set([...leads.filter((l) => inRange(l.receivedAt, from, to) || inRange(l.wonAt, from, to)).map((l) => l.source), ...costs.map((c) => c.source)]);
  return [...sources]
    .map((source) => ({
      source,
      ...funnelStats(
        leads.filter((l) => l.source === source),
        events,
        costs.filter((c) => c.source === source),
        from,
        to,
      ),
    }))
    .filter((r) => r.leads || r.cost || r.customers)
    .sort((a, b) => b.leads - a.leads || b.cost - a.cost);
}
