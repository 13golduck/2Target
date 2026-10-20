import { describe, expect, it } from "vitest";

import { starterDesign } from "./design";
import { applyOps, describeChanges, EMPTY_STATE, LIMITS, normalizeHashtags, stateFromItem, StudioStateSchema } from "./state";

describe("normalizeHashtags", () => {
  it("aggiunge il # e toglie doppioni, virgole e spazi in più", () => {
    expect(normalizeHashtags("viso, #benessere  ##viso promo")).toBe("#viso #benessere #promo");
  });
  it("stringa vuota resta vuota", () => {
    expect(normalizeHashtags("  ")).toBe("");
  });
});

describe("applyOps", () => {
  it("applica le operazioni in ordine senza toccare lo stato di partenza", () => {
    const before = { ...EMPTY_STATE };
    const after = applyOps(before, [
      { op: "testo", caption: "  Promo di ottobre  " },
      { op: "hashtag", hashtags: "promo ottobre" },
      { op: "formato", format: "reel" },
    ]);
    expect(after).toEqual({ ...EMPTY_STATE, caption: "Promo di ottobre", hashtags: "#promo #ottobre", format: "reel" });
    expect(before).toEqual(EMPTY_STATE);
  });
  it("un titolo vuoto non cancella quello che c'era", () => {
    expect(applyOps(EMPTY_STATE, [{ op: "titolo", title: "   " }]).title).toBe(EMPTY_STATE.title);
  });
  it("taglia i testi oltre il limite", () => {
    expect(applyOps(EMPTY_STATE, [{ op: "testo", caption: "a".repeat(LIMITS.caption + 10) }]).caption).toHaveLength(LIMITS.caption);
  });
});

describe("describeChanges", () => {
  it("elenca i campi cambiati in italiano", () => {
    expect(describeChanges(EMPTY_STATE, { ...EMPTY_STATE, caption: "x", hashtags: "#a" })).toBe("Modifiche a testo e hashtag");
    expect(describeChanges(EMPTY_STATE, { ...EMPTY_STATE, format: "reel" })).toBe("Modifiche a formato");
    expect(describeChanges(EMPTY_STATE, EMPTY_STATE)).toBe("Nessuna modifica");
  });
});

describe("grafica", () => {
  const design = starterDesign({ size: "quadrato", pages: 1, headline: "Ciao", colors: { background: "#FFFFFF", text: "#000000", accent: "#CDA434" }, hasLogo: false });
  it("si aggiunge e si toglie con le operazioni", () => {
    const withDesign = applyOps(EMPTY_STATE, [{ op: "grafica", design }]);
    expect(withDesign.design).toEqual(design);
    expect(describeChanges(EMPTY_STATE, withDesign)).toBe("Modifiche a grafica");
    expect(applyOps(withDesign, [{ op: "grafica_rimuovi" }]).design).toBeNull();
  });
  it("le versioni salvate prima della grafica si leggono ancora", () => {
    expect(StudioStateSchema.parse({ title: "T", caption: "", hashtags: "", format: "post" }).design).toBeNull();
  });
});

describe("stateFromItem", () => {
  it("porta a «post» i formati che lo Studio non gestisce", () => {
    expect(stateFromItem({ title: "T", caption: null, hashtags: null, format: "articolo" })).toEqual({ title: "T", caption: "", hashtags: "", format: "post", design: null });
  });
});
