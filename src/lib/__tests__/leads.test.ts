import { describe, expect, it } from "vitest";
import { funnelBySource, funnelStats, type LeadRow } from "../leads";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
const from = d("2026-09-01");
const to = new Date("2026-09-30T23:59:59Z");

const leads: LeadRow[] = [
  { id: 1, source: "meta_ads", stage: "vinto", receivedAt: d("2026-09-02"), wonAt: d("2026-09-12"), wonValue: 1200 },
  { id: 2, source: "meta_ads", stage: "perso", receivedAt: d("2026-09-03"), lostReason: "Prezzo" },
  { id: 3, source: "meta_ads", stage: "preventivo", receivedAt: d("2026-09-10"), estimatedValue: 800 },
  { id: 4, source: "sito", stage: "contattato", receivedAt: d("2026-09-15") },
  { id: 5, source: "sito", stage: "vinto", receivedAt: d("2026-08-20"), wonAt: d("2026-09-05"), wonValue: 600 }, // ricevuto ad agosto
];
const events = [
  { leadId: 2, toStage: "qualificato" as const }, // poi perso: conta comunque come qualificato
  { leadId: 2, toStage: "perso" as const },
];
const costs = [
  { month: "2026-09-01", source: "meta_ads", kind: "inserzioni", amount: 300 },
  { month: "2026-09-01", source: "sito", kind: "produzione", amount: 100 },
  { month: "2026-08-01", source: "meta_ads", kind: "inserzioni", amount: 999 }, // fuori periodo
];

describe("funnelStats", () => {
  const s = funnelStats(leads, events, costs, from, to);

  it("CPL e CAC sui costi del periodo", () => {
    expect(s.leads).toBe(4);
    expect(s.cost).toBe(400);
    expect(s.cpl).toBe(100);
    expect(s.customers).toBe(2); // vinti a settembre, anche se uno era di agosto
    expect(s.cac).toBe(200);
  });

  it("funnel della coorte con la fase più avanzata raggiunta", () => {
    expect(s.reached).toEqual({ nuovo: 4, contattato: 4, qualificato: 3, preventivo: 2, vinto: 1 });
    expect(s.qualifiedRate).toBe(0.75);
    expect(s.leadToCustomer).toBe(0.25);
  });

  it("ricavi, ROAS, ROI, tempi e motivi di perdita", () => {
    expect(s.revenue).toBe(1800);
    expect(s.roas).toBe(6); // 1800 / 300 di inserzioni
    expect(s.roi).toBe(3.5); // (1800 - 400) / 400
    expect(s.avgDaysToClose).toBeCloseTo(13, 1); // 10 e 16 giorni
    expect(s.lostReasons).toEqual([{ reason: "Prezzo", count: 1 }]);
    expect(s.pipelineValue).toBe(800);
  });

  it("divide per fonte", () => {
    const rows = funnelBySource(leads, events, costs, from, to);
    const meta = rows.find((r) => r.source === "meta_ads")!;
    expect(meta.leads).toBe(3);
    expect(meta.cpl).toBe(100);
    expect(meta.cac).toBe(300);
    expect(rows.find((r) => r.source === "sito")!.customers).toBe(1);
  });
});
