import { describe, expect, it } from "vitest";

import { competitorInsights, metricsFromPosts, normalizeInstagram, type CompetitorMetrics } from "./competitors";

const now = new Date("2026-10-19T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("normalizeInstagram", () => {
  it("accetta @nome, link e nome; rifiuta il resto", () => {
    expect(normalizeInstagram("@Pizzeria.Da_Mario")).toBe("pizzeria.da_mario");
    expect(normalizeInstagram("https://www.instagram.com/golduck/?hl=it")).toBe("golduck");
    expect(normalizeInstagram("nome con spazi")).toBeNull();
    expect(normalizeInstagram("")).toBeNull();
  });
});

describe("metricsFromPosts", () => {
  it("frequenza, interazioni medie, ER, reel e migliori post", () => {
    const posts = [
      { at: daysAgo(1), type: "REELS", likes: 90, comments: 10, permalink: "a" },
      { at: daysAgo(7), type: "IMAGE", likes: 40, comments: 0, permalink: "b" },
      { at: daysAgo(14), type: "REELS", likes: 50, comments: 10, permalink: "c" },
    ];
    const m = metricsFromPosts(2000, 120, posts, now);
    expect(m.postsPerWeek).toBe(1.5);
    expect(m.avgInteractions).toBe(67);
    expect(m.er).toBe(3.35);
    expect(m.reelsShare).toBe(67);
    expect(m.lastPostAt?.toISOString()).toBe(daysAgo(1));
    expect(m.topPosts.map((p) => p.permalink)).toEqual(["a", "c", "b"]);
  });
  it("senza post: tutto nullo, niente divisioni per zero", () => {
    const m = metricsFromPosts(0, 0, [], now);
    expect(m).toMatchObject({ postsPerWeek: null, avgInteractions: null, er: null, reelsShare: null, lastPostAt: null });
  });
});

const base: CompetitorMetrics = { followers: 1000, mediaCount: 100, postsPerWeek: 3, avgInteractions: 30, er: 3, reelsShare: 60, lastPostAt: new Date(daysAgo(2)), topPosts: [] };

describe("competitorInsights", () => {
  it("segnala frequenza bassa, engagement basso e pochi reel", () => {
    const client = { name: "Cliente", metrics: { ...base, postsPerWeek: 1, er: 1, reelsShare: 10 } };
    const out = competitorInsights(client, [{ name: "A", metrics: base }, { name: "B", metrics: base }], now);
    expect(out.join(" ")).toMatch(/frequenza/);
    expect(out.join(" ")).toMatch(/Engagement del cliente 1%/);
    expect(out.join(" ")).toMatch(/reel/);
  });
  it("concorrente fermo da oltre un mese e uno molto più grande", () => {
    const out = competitorInsights({ name: "Cliente", metrics: base }, [{ name: "Fermo", metrics: { ...base, lastPostAt: new Date(daysAgo(60)) } }, { name: "Gigante", metrics: { ...base, followers: 50_000 } }], now);
    expect(out).toContain("Fermo non pubblica da oltre un mese: spazio libero da occupare.");
    expect(out.join(" ")).toMatch(/Gigante ha più del triplo/);
  });
  it("cliente allineato: nessuno spunto", () => {
    expect(competitorInsights({ name: "Cliente", metrics: base }, [{ name: "A", metrics: base }], now)).toEqual([]);
  });
});
