import { describe, expect, it } from "vitest";

import { campaignsWithLeads, conversionsByEvent, landingWithLeads, pathOf } from "../ga4-insights";

const lead = (o: Partial<{ utmSource: string; utmMedium: string; utmCampaign: string; landingUrl: string; won: boolean; wonValue: number }>) => ({
  utmSource: o.utmSource ?? null,
  utmMedium: o.utmMedium ?? null,
  utmCampaign: o.utmCampaign ?? null,
  landingUrl: o.landingUrl ?? null,
  won: o.won ?? false,
  wonValue: o.wonValue ?? null,
});

describe("Analytics accanto ai Lead", () => {
  it("percorso della pagina senza dominio, parametri e barra finale", () => {
    expect(pathOf("https://www.piantiny.it/Servizi/?utm_source=x#a")).toBe("/servizi");
    expect(pathOf("/")).toBe("/");
    expect(pathOf("/contatti?x=1")).toBe("/contatti");
    expect(pathOf(null)).toBe("");
  });

  it("campagne con contatti e clienti, senza distinguere maiuscole; lead con UTM non visti da Analytics a parte", () => {
    const r = campaignsWithLeads(
      [
        { sessionSource: "facebook", sessionMedium: "paid", sessionCampaignName: "Primavera", sessions: 120 },
        { sessionSource: "(direct)", sessionMedium: "(none)", sessionCampaignName: "(not set)", sessions: 300 },
      ],
      [lead({ utmSource: "Facebook", utmMedium: "paid", utmCampaign: "primavera", won: true, wonValue: 500 }), lead({ utmSource: "facebook", utmMedium: "paid", utmCampaign: "primavera" }), lead({ utmSource: "newsletter", utmCampaign: "ottobre" }), lead({})],
    );
    expect(r.rows[0]).toMatchObject({ leads: 2, customers: 1, revenue: 500 });
    expect(r.rows[1]).toMatchObject({ leads: 0 });
    expect(r.missing).toEqual([{ source: "newsletter", medium: "", campaign: "ottobre", leads: 1, customers: 0, revenue: 0 }]);
  });

  it("pagine di atterraggio con i contatti arrivati da lì", () => {
    const r = landingWithLeads([{ landingPage: "/servizi/" }, { landingPage: "/" }], [lead({ landingUrl: "https://piantiny.it/servizi?x=1" })]);
    expect(r.map((x) => x.leads)).toEqual([1, 0]);
  });

  it("conversioni per evento con i canali in ordine", () => {
    const r = conversionsByEvent([
      { eventName: "generate_lead", sessionDefaultChannelGroup: "Organic Search", keyEvents: 3 },
      { eventName: "generate_lead", sessionDefaultChannelGroup: "Paid Social", keyEvents: 7 },
      { eventName: "click_tel", sessionDefaultChannelGroup: "Direct", keyEvents: 2 },
    ]);
    expect(r.map((e) => [e.eventName, e.total])).toEqual([["generate_lead", 10], ["click_tel", 2]]);
    expect(r[0].channels[0].channel).toBe("Paid Social");
  });
});
