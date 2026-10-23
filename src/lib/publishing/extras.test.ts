import { describe, expect, it } from "vitest";

import { extrasFor, extrasProblem, parseCollaborators } from "./extras";

describe("coautori Instagram", () => {
  it("pulisce @, maiuscole, separatori e doppioni", () => {
    expect(parseCollaborators("@Studio.Rossi, mario_bianchi;  @studio.rossi")).toEqual({ valid: ["studio.rossi", "mario_bianchi"], invalid: [], tooMany: false });
  });
  it("scarta i nomi non validi e tiene al massimo 3", () => {
    const r = parseCollaborators("a b c d nome-con-trattino");
    expect(r.valid).toEqual(["a", "b", "c"]);
    expect(r.tooMany).toBe(true);
    expect(r.invalid).toEqual(["nome-con-trattino"]);
  });
  it("vuoto", () => {
    expect(parseCollaborators(null).valid).toEqual([]);
  });
});

describe("opzioni per profilo e formato", () => {
  const item = { firstComment: " #casa #brescia ", collaborators: ["studio.rossi"], tagLocation: true };
  it("Instagram: commento, coautori e sede", () => {
    expect(extrasFor("instagram", "reel", item)).toEqual({ firstComment: "#casa #brescia", collaborators: ["studio.rossi"], tagLocation: true });
  });
  it("Facebook: solo il primo commento", () => {
    expect(extrasFor("facebook", "post", item)).toEqual({ firstComment: "#casa #brescia" });
  });
  it("storie, TikTok e LinkedIn: niente", () => {
    expect(extrasFor("instagram", "storia", item)).toBeNull();
    expect(extrasFor("tiktok", "reel", item)).toBeNull();
    expect(extrasFor("linkedin", "post", item)).toBeNull();
  });
  it("nessuna opzione compilata: null", () => {
    expect(extrasFor("instagram", "post", { firstComment: "  ", collaborators: [], tagLocation: false })).toBeNull();
  });
});

describe("controlli sulle opzioni", () => {
  it("commento troppo lungo o con troppi hashtag", () => {
    expect(extrasProblem("facebook", { firstComment: "x".repeat(2201) })).toMatch(/2.200/);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(extrasProblem("instagram", { firstComment: tags })).toMatch(/30 hashtag/);
    expect(extrasProblem("facebook", { firstComment: tags })).toBeNull();
    expect(extrasProblem("instagram", null)).toBeNull();
  });
});
