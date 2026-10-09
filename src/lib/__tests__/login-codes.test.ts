import { beforeAll, describe, expect, it } from "vitest";
import { codeMatches, newCode, normalizeCode } from "../login-codes";
import { createHmac, hkdfSync } from "node:crypto";

beforeAll(() => {
  process.env.AUTH_SECRET = "segreto-di-prova-per-i-codici-di-accesso";
});

const hashLikeServer = (code: string) =>
  createHmac("sha256", Buffer.from(hkdfSync("sha256", process.env.AUTH_SECRET!, "2target", "login-code", 32))).update(code).digest("hex");

describe("codici di accesso", () => {
  it("sono sempre 6 cifre", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });
  it("accettano spazi e trattini inseriti dall'utente", () => {
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
  });
  it("confrontano solo con l'impronta salvata", () => {
    const stored = hashLikeServer("042719");
    expect(codeMatches("042 719", stored)).toBe(true);
    expect(codeMatches("042718", stored)).toBe(false);
    expect(codeMatches("", stored)).toBe(false);
  });
});
