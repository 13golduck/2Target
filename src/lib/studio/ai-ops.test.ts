import { describe, expect, it } from "vitest";

import { toStudioOps } from "./ai-ops";
import { starterDesign } from "./design";

const design = starterDesign({ size: "quadrato", pages: 2, headline: "Ciao", colors: { background: "#FFFFFF", text: "#000000", accent: "#CDA434" }, hasLogo: true });

describe("toStudioOps", () => {
  it("converte la grafica da testo JSON a oggetto controllato", () => {
    const r = toStudioOps([{ op: "testo", caption: "x" }, { op: "grafica", designJson: JSON.stringify(design) }]);
    expect(r.rejected).toBe(false);
    expect(r.ops).toEqual([{ op: "testo", caption: "x" }, { op: "grafica", design }]);
  });
  it("scarta una grafica non valida ma tiene le altre modifiche", () => {
    const r = toStudioOps([{ op: "grafica", designJson: '{"size":"enorme","pages":[]}' }, { op: "hashtag", hashtags: "#a" }]);
    expect(r.rejected).toBe(true);
    expect(r.ops).toEqual([{ op: "hashtag", hashtags: "#a" }]);
  });
  it("scarta un JSON rotto", () => {
    expect(toStudioOps([{ op: "grafica", designJson: "{non json" }]).rejected).toBe(true);
  });
  it("converte il montaggio da JSON e scarta quello non valido", () => {
    const video = { size: "storia", clips: [{ id: "c1", mediaId: 4, start: 0, end: 3 }], texts: [], audio: [], originalVolume: 1 };
    expect(toStudioOps([{ op: "video", videoJson: JSON.stringify(video) }]).ops).toEqual([{ op: "video", video }]);
    expect(toStudioOps([{ op: "video", videoJson: '{"clips":[]}' }]).rejected).toBe(true);
  });
  it("separa le richieste di immagine, con al massimo 3 riferimenti e 2 immagini per turno", () => {
    const img = { op: "immagine" as const, prompt: "vase on a table", referenceMediaIds: [1, 1, 2, 3, 4], page: 1 };
    const r = toStudioOps([img, img, img]);
    expect(r.ops).toEqual([]);
    expect(r.images).toHaveLength(2);
    expect(r.images[0].referenceMediaIds).toEqual([1, 2, 3]);
  });
});
