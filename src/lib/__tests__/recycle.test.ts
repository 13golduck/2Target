import { describe, expect, it } from "vitest";

import { engagementScore, selectRecycle, type RecycleCandidate } from "../recycle";

const now = new Date("2026-10-20T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const cand = (o: Partial<RecycleCandidate>): RecycleCandidate => ({ itemId: 1, title: "Post", format: "post", publishedAt: daysAgo(120), evergreen: false, lastRecycledAt: null, score: null, ...o });

describe("punteggio di un post", () => {
  it("interazioni sulla copertura, se nota", () => {
    expect(engagementScore({ likes: 40, comments: 10, reach: 1000 })).toBeCloseTo(0.05);
    expect(engagementScore({ total_interactions: 30 })).toBe(30);
    expect(engagementScore({})).toBeNull();
    expect(engagementScore(null)).toBeNull();
  });
});

describe("contenuti da riproporre", () => {
  it("i «sempre validi» usciti da almeno 3 mesi", () => {
    const r = selectRecycle([cand({ itemId: 1, evergreen: true }), cand({ itemId: 2, evergreen: true, publishedAt: daysAgo(30) })], now);
    expect(r.map((x) => [x.itemId, x.reason])).toEqual([[1, "sempre valido"]]);
  });

  it("il quarto migliore per punteggio, con almeno 4 post", () => {
    const list = [0.09, 0.02, 0.03, 0.01, 0.04, 0.02, 0.05, 0.01].map((score, i) => cand({ itemId: i + 1, score }));
    expect(selectRecycle(list, now).map((x) => x.itemId)).toEqual([1, 7]);
    // Con 3 post il confronto non vale
    expect(selectRecycle(list.slice(0, 3), now)).toEqual([]);
  });

  it("non ripropone ciò che è stato riproposto negli ultimi 3 mesi", () => {
    const r = selectRecycle([cand({ itemId: 1, evergreen: true, lastRecycledAt: daysAgo(40) }), cand({ itemId: 2, evergreen: true, lastRecycledAt: daysAgo(100) })], now);
    expect(r.map((x) => x.itemId)).toEqual([2]);
  });

  it("prima i «sempre validi», al massimo 6", () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => cand({ itemId: i + 1, score: 1 - i * 0.1 })),
      cand({ itemId: 99, evergreen: true, score: 0 }),
    ];
    const r = selectRecycle(list, now);
    expect(r[0]).toMatchObject({ itemId: 99, reason: "sempre valido" });
    expect(r.length).toBeLessThanOrEqual(6);
  });
});
