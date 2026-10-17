import { describe, expect, it } from "vitest";
import { adsMonthlySpend } from "./ads-costs";

const row = (day: string, value: number, metric = "ads_spend") => ({ day, metric, value });

describe("adsMonthlySpend", () => {
  it("salta il primo mese se la finestra parte a metà mese", () => {
    const m = adsMonthlySpend([row("2026-07-17", 10), row("2026-08-01", 5), row("2026-08-31", 5), row("2026-10-15", 3)], "2026-07-17");
    expect([...m.entries()]).toEqual([["2026-08-01", 10], ["2026-10-01", 3]]);
  });
  it("tiene il primo mese se la finestra parte il giorno 1", () => {
    const m = adsMonthlySpend([row("2026-07-01", 10), row("2026-07-02", 2)], "2026-07-01");
    expect(m.get("2026-07-01")).toBe(12);
  });
  it("ignora le altre metriche e passa di anno", () => {
    const m = adsMonthlySpend([row("2026-12-20", 9), row("2027-01-03", 4), row("2027-01-03", 100, "ads_clicks")], "2026-12-20");
    expect([...m.entries()]).toEqual([["2027-01-01", 4]]);
  });
});
