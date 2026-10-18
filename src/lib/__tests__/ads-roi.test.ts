import { describe, expect, it } from "vitest";

import { campaignIdFromUtm, campaignRoi, utmCampaign } from "../ads/roi";

const lead = (stage: string, wonValue: number | null = null, estimatedValue: number | null = null) => ({ stage, wonValue, estimatedValue });

describe("ROI per campagna", () => {
  it("costo per contatto e per cliente, ricavi, ROAS e valore aperto", () => {
    const r = campaignRoi(300, [lead("vinto", 1200), lead("vinto", 800), lead("preventivo", null, 1500), lead("perso", null, 900), lead("nuovo")]);
    expect(r).toEqual({ spend: 300, leads: 5, customers: 2, revenue: 2000, open: 2, pipeline: 1500, cpl: 60, cac: 150, roas: 6.67 });
  });

  it("senza lead né spesa i rapporti restano vuoti", () => {
    expect(campaignRoi(0, [])).toMatchObject({ cpl: null, cac: null, roas: null, revenue: 0 });
    expect(campaignRoi(50, [])).toMatchObject({ cpl: null, cac: null, roas: 0 });
  });
});

describe("codice UTM delle campagne", () => {
  it("andata e ritorno", () => {
    expect(utmCampaign(42)).toBe("2t-42");
    expect(campaignIdFromUtm("2t-42")).toBe(42);
    expect(campaignIdFromUtm(" 2T-7 ")).toBe(7);
  });
  it("ignora codici diversi", () => {
    expect(campaignIdFromUtm("promo-autunno")).toBeNull();
    expect(campaignIdFromUtm("2t-")).toBeNull();
    expect(campaignIdFromUtm(null)).toBeNull();
  });
});
