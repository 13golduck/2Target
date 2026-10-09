import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// Cifratura dei token delle piattaforme (AES-256-GCM) e firma dello "state" OAuth.
// La chiave deriva da AUTH_SECRET. Per cambiarlo senza perdere i token salvati: nuovo valore in
// AUTH_SECRET, vecchio in AUTH_SECRET_PREVIOUS (i token cifrati col vecchio si leggono ancora).

function key(purpose: string, secret = process.env.AUTH_SECRET) {
  if (!secret) throw new Error("AUTH_SECRET non impostato");
  return Buffer.from(hkdfSync("sha256", secret, "2target", purpose, 32));
}

export function encryptSecret(plain: string, purpose = "oauth-token") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(stored: string | null | undefined, purpose = "oauth-token") {
  const [version, iv, tag, data] = String(stored ?? "").split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  const attempt = (secret?: string) => {
    if (!secret) return null;
    try {
      const d = createDecipheriv("aes-256-gcm", key(purpose, secret), Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
    } catch {
      return null;
    }
  };
  return attempt(process.env.AUTH_SECRET) ?? attempt(process.env.AUTH_SECRET_PREVIOUS);
}

/** Valore firmato e con scadenza (state OAuth): base64url(json).firma */
export function signPayload(payload: object, ttlSeconds = 600) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  const sig = createHmac("sha256", key("oauth-state")).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPayload<T>(value: string | null | undefined): T | null {
  const [body, sig] = String(value ?? "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key("oauth-state")).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Date.now() ? (data as T) : null;
  } catch {
    return null;
  }
}
