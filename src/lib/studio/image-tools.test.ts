import { describe, expect, it } from "vitest";

import { aspectForSize, geminiImageFrom, geminiTextFrom, imageDimensions } from "./image-tools";

describe("imageDimensions", () => {
  it("legge un PNG", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 1080);
    view.setUint32(20, 1350);
    expect(imageDimensions(png)).toEqual({ width: 1080, height: 1350 });
  });
  it("legge un JPEG saltando i segmenti prima del SOF", () => {
    // SOI, APP0 di 16 byte, SOF0 con altezza 1920 e larghezza 1080
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x80, 0x04, 0x38, 0x03, 0, 0, 0, 0, 0, 0]);
    expect(imageDimensions(jpeg)).toEqual({ width: 1080, height: 1920 });
  });
  it("restituisce null per altri formati", () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("geminiImageFrom", () => {
  it("prende l'ultima immagine dei passi del modello", () => {
    const r = { steps: [{ type: "model_output", content: [{ type: "text", text: "ecco" }, { type: "image", data: "AAA", mime_type: "image/png" }, { type: "image", data: "BBB", mime_type: "image/jpeg" }] }] };
    expect(geminiImageFrom(r)).toEqual({ base64: "BBB", mime: "image/jpeg" });
  });
  it("usa output_image se non ci sono passi", () => {
    expect(geminiImageFrom({ output_image: { type: "image", data: "CCC" } })).toEqual({ base64: "CCC", mime: "image/jpeg" });
  });
  it("null se il modello ha risposto solo con testo", () => {
    const r = { steps: [{ type: "model_output", content: [{ type: "text", text: "Non posso creare questa immagine." }] }] };
    expect(geminiImageFrom(r)).toBeNull();
    expect(geminiTextFrom(r)).toBe("Non posso creare questa immagine.");
  });
});

describe("aspectForSize", () => {
  it("abbina le misure della grafica", () => {
    expect([aspectForSize("quadrato"), aspectForSize("verticale"), aspectForSize("storia")]).toEqual(["1:1", "4:5", "9:16"]);
  });
});
