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
});
