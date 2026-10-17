import { describe, expect, it } from "vitest";
import { escapeCommentary } from "./linkedin-text";

describe("escapeCommentary", () => {
  it("protegge i caratteri riservati", () => {
    expect(escapeCommentary("Prezzo (IVA esclusa) <30€> mail@golduck.it")).toBe("Prezzo \\(IVA esclusa\\) \\<30€\\> mail\\@golduck.it");
  });
  it("trasforma gli hashtag nel modello di LinkedIn", () => {
    expect(escapeCommentary("Novità #microgreens e #fiori_eduli!")).toBe("Novità {hashtag|\\#|microgreens} e {hashtag|\\#|fiori_eduli}!");
  });
  it("un # isolato resta testo", () => {
    expect(escapeCommentary("Siamo i # 1")).toBe("Siamo i \\# 1");
  });
});
