import { describe, expect, it } from "vitest";

import { base32Decode, base32Encode, newRecoveryCodes, totpAt, verifyTotp } from "../totp";

// Vettori di prova ufficiali RFC 6238 (SHA1, segreto "12345678901234567890"), ultime 6 cifre
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("base32 andata e ritorno", () => {
    expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
  });

  it("coincide con i vettori RFC 6238", () => {
    expect(totpAt(SECRET, 59_000)).toBe("287082");
    expect(totpAt(SECRET, 1_111_111_109_000)).toBe("081804");
    expect(totpAt(SECRET, 1_234_567_890_000)).toBe("005924");
    expect(totpAt(SECRET, 2_000_000_000_000)).toBe("279037");
  });

  it("accetta ±30 secondi e rifiuta il resto", () => {
    const t = 1_234_567_890_000;
    expect(verifyTotp(SECRET, "005924", t + 25_000)).toBe(true);
    expect(verifyTotp(SECRET, "005924", t + 95_000)).toBe(false);
    expect(verifyTotp(SECRET, "123456", t)).toBe(false);
    expect(verifyTotp(SECRET, "00 59 24", t)).toBe(true);
  });

  it("codici di recupero nel formato xxxx-xxxx", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/));
  });
});
