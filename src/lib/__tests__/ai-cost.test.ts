import { describe, expect, it } from "vitest";
import { estimateCostUsd, modelFor } from "../ai/claude";

describe("AI: modelli e costi", () => {
  it("sceglie il modello per modalità e fase", () => {
    expect(modelFor("opus", "ricerca")).toBe("claude-opus-5-5");
    expect(modelFor("sonnet", "scrittura")).toBe("claude-sonnet-5-5");
    expect(modelFor("misto", "ricerca")).toBe("claude-sonnet-5-5");
    expect(modelFor("misto", "domande")).toBe("claude-sonnet-5-5");
    expect(modelFor("misto", "scrittura")).toBe("claude-opus-5-5");
  });

  it("stima il costo a listino", () => {
    // Opus 5.5: 100k in × 4 $ + 20k out × 20 $ + 50k cache × 0,20 $ + 10 ricerche × 0,01 $
    const c = estimateCostUsd("claude-opus-5-5", { input: 100_000, output: 20_000, cacheRead: 50_000, cacheWrite: 0, searches: 10 });
    expect(c).toBeCloseTo(0.4 + 0.4 + 0.01 + 0.1, 6);
    // Sonnet 5.5 costa la metà sui token
    expect(estimateCostUsd("claude-sonnet-5-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 })).toBe(2);
  });
});
