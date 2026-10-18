import { describe, expect, it } from "vitest";

import { cleanFlags, featureOfNav, featureOfTab, isOn } from "./features";

describe("funzioni", () => {
  it("accese di base, spente in generale per tutti, per cliente solo dove serve", () => {
    expect(isOn("lead", {})).toBe(true);
    expect(isOn("lead", { lead: false }, { lead: true })).toBe(false);
    expect(isOn("lead", {}, { lead: false })).toBe(false);
    // Il calendario è solo generale: lo spegnimento per cliente non conta
    expect(isOn("calendario", {}, { calendario: false } as never)).toBe(true);
  });
  it("pulisce i dati che arrivano da fuori", () => {
    expect(cleanFlags({ lead: false, seo: "no", inventata: false })).toEqual({ lead: false });
    expect(cleanFlags(null)).toEqual({});
  });
  it("collega sezioni e voci di menu", () => {
    expect(featureOfTab("concorrenti")?.key).toBe("concorrenti");
    expect(featureOfTab("piano")).toBeNull();
    expect(featureOfNav("/sponsorizzate")?.key).toBe("sponsorizzate");
  });
});
