import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, signPayload, verifyPayload } from "../secret-box";

beforeAll(() => {
  process.env.AUTH_SECRET = "segreto-di-prova-abbastanza-lungo-per-il-test";
});

describe("secret-box", () => {
  it("cifra e decifra i token", () => {
    const enc = encryptSecret("EAAB-token");
    expect(enc).not.toContain("EAAB");
    expect(decryptSecret(enc)).toBe("EAAB-token");
  });

  it("legge i token cifrati con il segreto precedente", () => {
    const enc = encryptSecret("vecchio");
    process.env.AUTH_SECRET_PREVIOUS = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "nuovo-segreto-dopo-la-rotazione-della-chiave";
    expect(decryptSecret(enc)).toBe("vecchio");
  });

  it("rifiuta state alterati o scaduti", () => {
    const ok = signPayload({ clientId: 3 });
    expect(verifyPayload<{ clientId: number }>(ok)?.clientId).toBe(3);
    const [body, sig] = ok.split(".");
    const forged = Buffer.from(JSON.stringify({ clientId: 99, exp: Date.now() + 1e6 })).toString("base64url");
    expect(verifyPayload(`${forged}.${sig}`)).toBeNull();
    expect(verifyPayload(`${body}.x${sig.slice(1)}`)).toBeNull();
    expect(verifyPayload(signPayload({ a: 1 }, -1))).toBeNull();
  });
});
