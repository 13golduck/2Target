import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
const { parseSignedRequest, confirmationCode } = await import("../integrations/meta-deletion");

const sign = (data: object, secret: string) => {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${sig}.${payload}`;
};

describe("eliminazione dati Meta", () => {
  it("accetta un signed_request firmato con la chiave dell'app", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "123", issued_at: 1 }, "segreto"), "segreto")).toMatchObject({ user_id: "123" });
  });
  it("rifiuta firme sbagliate, chiavi diverse e richieste malformate", () => {
    const sr = sign({ algorithm: "HMAC-SHA256", user_id: "123" }, "segreto");
    expect(parseSignedRequest(sr, "altro")).toBeNull();
    expect(parseSignedRequest(`x${sr}`, "segreto")).toBeNull();
    expect(parseSignedRequest("abc", "segreto")).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "none", user_id: "1" }, "segreto"), "segreto")).toBeNull();
  });
  it("genera codici di conferma da 12 caratteri", () => {
    expect(confirmationCode()).toMatch(/^[A-F0-9]{12}$/);
  });
});
