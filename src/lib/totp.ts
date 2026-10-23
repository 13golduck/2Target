import "server-only";
import { createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Doppio fattore con app di autenticazione (TOTP, RFC 6238): Google Authenticator, Microsoft Authenticator, 1Password…
// Codici di 6 cifre ogni 30 secondi. Il segreto si salva cifrato (secret-box); i codici di recupero solo come impronta.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Segreto non valido");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

/** Codice TOTP per un dato istante (passi di 30 secondi). */
export function totpAt(secret: string, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** Verifica con tolleranza di ±1 passo (orologio del telefono un po' sfasato). */
export function verifyTotp(secret: string, code: string, time = Date.now()) {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return false;
  return [-1, 0, 1].some((d) => {
    const expected = Buffer.from(totpAt(secret, time + d * 30_000));
    const given = Buffer.from(c);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

export const otpauthUrl = (email: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(`2Target:${email}`)}?secret=${secret}&issuer=2Target&algorithm=SHA1&digits=6&period=30`;

// ── Codici di recupero (se si perde il telefono) ─────────────────────

function recoveryKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET non impostato");
  return Buffer.from(hkdfSync("sha256", secret, "2target", "totp-recovery", 32));
}

export const hashRecovery = (code: string) => createHmac("sha256", recoveryKey()).update(code.replace(/[^a-z0-9]/gi, "").toLowerCase()).digest("hex");

export function newRecoveryCodes(n = 8) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const s = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
