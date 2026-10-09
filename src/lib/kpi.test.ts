import { describe, expect, it } from "vitest";
import { evaluateKpi, worstStatus } from "./kpi";
import { compareByTag, engagementRateByFollowers } from "./channel-metrics";
import { planIssues, type EditorialItem } from "./editorial-plan";

describe("evaluateKpi", () => {
  it("più alto è meglio", () => {
    expect(evaluateKpi(1000, { direction: "higher", target: 1000 }).status).toBe("bene");
    expect(evaluateKpi(750, { direction: "higher", target: 1000 }).status).toBe("male");
    expect(evaluateKpi(400, { direction: "higher", target: 1000 }).status).toBe("troppo_male");
  });

  it("costi: più basso è meglio", () => {
    expect(evaluateKpi(9, { direction: "lower", target: 10 }).status).toBe("bene");
    expect(evaluateKpi(13, { direction: "lower", target: 10 }).status).toBe("male");
    expect(evaluateKpi(18, { direction: "lower", target: 10 }).status).toBe("troppo_male");
  });

  it("non giudica sotto il campione minimo", () => {
    expect(evaluateKpi(50, { direction: "lower", target: 10, minSample: 30 }, 12).status).toBe("in_attesa");
    expect(evaluateKpi(50, { direction: "lower", target: 10, minSample: 30 }, 40).status).toBe("troppo_male");
  });

  it("soglie personalizzate", () => {
    expect(evaluateKpi(85, { direction: "higher", target: 100, warnRatio: 0.8 }).status).toBe("bene");
  });

  it("stato complessivo = peggiore", () => {
    expect(worstStatus(["bene", "male", "in_attesa"])).toBe("male");
    expect(worstStatus(["in_attesa"])).toBe("in_attesa");
  });
});

describe("channel metrics (caso Piantiny)", () => {
  it("ER ~1% e post con persone 3-4x", () => {
    const d = new Date("2026-05-01");
    const posts = [
      { likes: 60, comments: 5, publishedAt: d, tags: ["persone"] },
      { likes: 50, comments: 5, publishedAt: d, tags: ["persone"] },
      { likes: 14, comments: 2, publishedAt: d, tags: ["prodotto"] },
      { likes: 12, comments: 2, publishedAt: d, tags: ["prodotto"] },
      { likes: 15, comments: 1, publishedAt: d, tags: ["prodotto"] },
    ];
    expect(engagementRateByFollowers(posts, 1820)).toBeCloseTo(0.018, 3);
    const persone = compareByTag(posts).find((c) => c.tag === "persone")!;
    expect(persone.liftVsOthers).toBeGreaterThan(3);
  });
});

describe("planIssues (brief Lesioli)", () => {
  const plan = {
    startsOn: new Date("2026-09-21T00:00:00Z"),
    endsOn: new Date("2026-10-04T00:00:00Z"),
    minPerWeek: 3,
    formatQuotas: { reel: 2, post: 1 },
    adsBudget: 100,
  };
  const full: EditorialItem = {
    id: "1", title: "3 errori senza architetto", format: "reel", scheduledAt: new Date("2026-09-22T18:00:00Z"),
    hook: "Questi errori li vedo ovunque", layoutNotes: "Parlato in camera + B-roll cantiere",
    script: "…", shotList: [{ scena: "Intro in studio", fonte: "cliente" }], caption: "…", hashtags: ["#architetto"],
    cta: "Scrivimi per una consulenza", ctaDestination: "telefono", isPaid: true, adObjective: "chiamate",
    adButton: "Chiama ora", adBudget: 60, adDays: 7,
  };

  it("scheda completa: nessun problema sulla scheda", () => {
    expect(planIssues(plan, [full]).filter((i) => i.itemId === "1")).toHaveLength(0);
  });

  it("segnala quote, cadenza, budget e campi mancanti", () => {
    const bare: EditorialItem = { id: "2", title: "Camera con soppalco", format: "post", scheduledAt: new Date("2026-09-29T09:00:00Z"),
      isPaid: true, adBudget: 60, ctaDestination: "sito", adButton: "Chiama ora" };
    const msgs = planIssues(plan, [full, bare]).map((i) => i.message);
    expect(msgs).toContain("reel: 1 pianificati su 2 richiesti");
    expect(msgs.some((m) => m.startsWith("Settimana del 21 settembre: 1"))).toBe(true);
    expect(msgs.some((m) => m.includes("oltre il budget"))).toBe(true);
    expect(msgs).toContain('"Camera con soppalco": manca la caption');
    expect(msgs).toContain('"Camera con soppalco": manca il link di destinazione della CTA');
    expect(msgs.some((m) => m.includes('"Chiama ora" non è tipico'))).toBe(true);
  });
});
