import { describe, expect, it } from "vitest";

import { brandColors, DesignSchema, newId, sanitizeDesign, starterDesign, type Design } from "./design";

const colors = { background: "#FFFFFF", text: "#111111", accent: "#CDA434" };

describe("starterDesign", () => {
  it("crea una pagina per slide, valida, con il titolo solo sulla prima", () => {
    const d = starterDesign({ size: "verticale", pages: 3, headline: "Nuova collezione", colors, hasLogo: true });
    expect(DesignSchema.parse(d)).toEqual(d);
    expect(d.pages).toHaveLength(3);
    const texts = d.pages.map((p) => p.layers.find((l) => l.type === "testo"));
    expect(texts.map((t) => (t?.type === "testo" ? t.text : null))).toEqual(["Nuova collezione", "", ""]);
    expect(d.pages[0].layers.some((l) => l.type === "logo")).toBe(true);
  });
  it("senza logo non aggiunge il livello del logo", () => {
    const d = starterDesign({ size: "quadrato", pages: 1, headline: "x", colors, hasLogo: false });
    expect(d.pages[0].layers.some((l) => l.type === "logo")).toBe(false);
  });
});

describe("sanitizeDesign", () => {
  const base = (): Design => ({
    size: "quadrato",
    pages: [
      {
        id: "p1",
        background: "#FFFFFF",
        layers: [
          { id: "a", type: "immagine", mediaId: 7, fit: "riempi", x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
          { id: "a", type: "immagine", mediaId: 99, fit: "riempi", x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
          { id: "a", type: "logo", x: 5000, y: -5000, width: 100, height: 100, rotation: 0, opacity: 1 },
        ],
      },
    ],
  });

  it("toglie le immagini di file estranei al progetto", () => {
    const d = sanitizeDesign(base(), [7]);
    expect(d.pages[0].layers.filter((l) => l.type === "immagine")).toHaveLength(1);
  });
  it("rende unici gli id dei livelli", () => {
    const ids = sanitizeDesign(base(), [7, 99]).pages[0].layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("riporta in pagina i livelli finiti fuori", () => {
    const logo = sanitizeDesign(base(), [7]).pages[0].layers.find((l) => l.type === "logo")!;
    expect(logo.x).toBeLessThanOrEqual(1080 - 20);
    expect(logo.y).toBeGreaterThanOrEqual(-logo.height + 20);
  });
});

describe("brandColors", () => {
  it("usa i ruoli del brand kit e ignora i colori non validi", () => {
    expect(brandColors([{ hex: "#000000", role: "Testo" }, { hex: "rosso", role: "sfondo" }, { hex: "#AA5500", role: "Primario" }])).toEqual({ background: "#FFFFFF", text: "#000000", accent: "#AA5500" });
  });
  it("senza kit restituisce colori neutri", () => {
    expect(brandColors(undefined).accent).toBe("#CDA434");
  });
});

describe("newId", () => {
  it("trova il primo numero libero", () => {
    expect(newId("l", ["l1", "l2", "l4"])).toBe("l3");
  });
});
