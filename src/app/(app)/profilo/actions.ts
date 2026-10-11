"use server";

import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { hashRecovery, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { TOTP_PURPOSE, verifySecondFactor } from "@/lib/two-factor";

// Doppio fattore dell'utente collegato: attivazione con QR code, conferma, codici di recupero, disattivazione.

async function me() {
  const u = await requireUser();
  const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
  return row;
}

/** Prepara l'attivazione: nuovo segreto (non ancora attivo) e QR code da inquadrare con l'app. */
export async function startTotpSetup() {
  const user = await me();
  if (user.totpEnabledAt) return { error: "Il doppio fattore è già attivo" };
  const secret = newTotpSecret();
  await db.update(users).set({ totpSecret: encryptSecret(secret, TOTP_PURPOSE), totpEnabledAt: null }).where(eq(users.id, user.id));
  const qr = await QRCode.toDataURL(otpauthUrl(user.email, secret), { margin: 1, width: 220 });
  return { ok: true, qr, secret: secret.match(/.{1,4}/g)!.join(" ") };
}

/** Conferma con il primo codice dell'app: si attiva e si danno i codici di recupero (mostrati una volta sola). */
export async function confirmTotp(code: string) {
  const user = await me();
  const secret = decryptSecret(user.totpSecret, TOTP_PURPOSE);
  if (!secret) return { error: "Riavvia l'attivazione" };
  if (!verifyTotp(secret, code)) return { error: "Codice non valido: controlla che l'ora del telefono sia giusta e riprova" };
  const codes = newRecoveryCodes();
  await db.update(users).set({ totpEnabledAt: new Date(), totpRecovery: codes.map(hashRecovery) }).where(eq(users.id, user.id));
  revalidatePath("/profilo");
  revalidatePath("/utenti");
  return { ok: true, codes };
}

/** Disattiva: serve un codice dell'app (o di recupero). */
export async function disableTotp(code: string) {
  const user = await me();
  if (!user.totpEnabledAt) return { ok: true };
  if (!(await verifySecondFactor(user, code))) return { error: "Codice non valido" };
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpRecovery: null }).where(eq(users.id, user.id));
  revalidatePath("/profilo");
  revalidatePath("/utenti");
  return { ok: true };
}

/** Nuovi codici di recupero (i vecchi smettono di funzionare). */
export async function regenerateRecovery(code: string) {
  const user = await me();
  if (!user.totpEnabledAt) return { error: "Il doppio fattore non è attivo" };
  const secret = decryptSecret(user.totpSecret, TOTP_PURPOSE);
  if (!secret || !verifyTotp(secret, code)) return { error: "Codice dell'app non valido" };
  const codes = newRecoveryCodes();
  await db.update(users).set({ totpRecovery: codes.map(hashRecovery) }).where(eq(users.id, user.id));
  revalidatePath("/profilo");
  return { ok: true, codes };
}
