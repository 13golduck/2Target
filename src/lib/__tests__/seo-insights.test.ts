import { describe, expect, it } from "vitest";

import { brandSplit, brandTerms, changes, expectedCtr, isBrandQuery, opportunities, variation } from "../seo-insights";

const row = (key: string, clicks: number, impressions: number, position: number) => ({ key, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

describe("opportunità di Search Console", () => {
  it("ricerche in posizione 4-20 con visibilità, ordinate per clic recuperabili", () => {
    const rows = [row("piante grasse", 5, 2000, 8.2), row("vivaio brescia", 2, 300, 12), row("poche", 0, 20, 9), row("lontana", 0, 5000, 35)];
    const o = opportunities(rows);
    expect(o.map((x) => x.key)).toEqual(["piante grasse", "vivaio brescia"]);
    expect(o[0].extraClicks).toBe(Math.round(2000 * (0.1 - 5 / 2000)));
    expect(o[0].reason).toBe("quasi_prima_pagina");
  });

  it("in alto ma con CTR molto sotto il tipico: titolo da rivedere", () => {
    const o = opportunities([row("succulente", 10, 1000, 2), row("cactus", 140, 1000, 2)]);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ key: "succulente", reason: "ctr_basso" });
  });

  it("CTR tipico decrescente con la posizione", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(3));
    expect(expectedCtr(15)).toBe(0.01);
    expect(expectedCtr(40)).toBe(0.004);
  });
});

describe("brand e non brand", () => {
  it("parole del brand da nome, dominio e aggiunte, senza forme societarie", () => {
    const t = brandTerms("Piantiny S.r.l.", "https://www.piantiny.it", "pianty, Vivaio Rossi");
    expect(t).toEqual(expect.arrayContaining(["piantiny", "pianty", "vivaio rossi"]));
    expect(t).not.toContain("srl");
  });

  it("riconosce il brand anche scritto staccato o con accenti", () => {
    const t = brandTerms("Caffè Lesioli", null, null);
    expect(isBrandQuery("caffe lesioli orari", t)).toBe(true);
    expect(isBrandQuery("lesioli", t)).toBe(true);
    expect(isBrandQuery("caffè a brescia", t)).toBe(false);
  });

  it("somma clic e impressioni nei due gruppi", () => {
    const s = brandSplit([row("piantiny", 50, 100, 1), row("piante grasse", 5, 2000, 8)], ["piantiny"]);
    expect(s.brand).toEqual({ clicks: 50, impressions: 100, queries: 1 });
    expect(s.generic.impressions).toBe(2000);
  });
});

describe("confronto tra periodi", () => {
  it("perdite e guadagni, comprese le voci sparite o nuove", () => {
    const c = changes([row("/a", 10, 100, 3), row("/nuova", 7, 50, 5)], [row("/a", 30, 200, 2), row("/sparita", 4, 40, 6)]);
    expect(c.losers.map((x) => [x.key, x.delta])).toEqual([["/a", -20], ["/sparita", -4]]);
    expect(c.winners.map((x) => [x.key, x.delta])).toEqual([["/nuova", 7]]);
    expect(variation(110, 100)).toBeCloseTo(0.1);
    expect(variation(5, 0)).toBeNull();
  });
});
