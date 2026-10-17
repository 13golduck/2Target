import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { decryptSecret } from "./secret-box";
import { hashRecovery, verifyTotp } from "./totp";

// Verifica del secondo fattore all'accesso: codice dell'app oppure uno dei codici di recupero (monouso).

export const TOTP_PURPOSE = "totp-secret";

export async function verifySecondFactor(user: typeof users.$inferSelect, input: string) {
  if (!user.totpEnabledAt) return true;
  const raw = input.trim();
  if (!raw) return false;
  const secret = decryptSecret(user.totpSecret, TOTP_PURPOSE);
  if (secret && verifyTotp(secret, raw)) return true;
  // Codice di recupero: si consuma
  const h = hashRecovery(raw);
  const list = user.totpRecovery ?? [];
  if (list.includes(h)) {
    await db.update(users).set({ totpRecovery: list.filter((x) => x !== h) }).where(eq(users.id, user.id));
    return true;
  }
  return false;
}
