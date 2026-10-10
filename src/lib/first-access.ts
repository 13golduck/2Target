import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { isMailConfigured } from "./mail";
import { getStartedAt } from "./startup-status";

// Primo accesso: la pagina di login chiede di creare l'account master inserendo solo l'email,
// poi si entra senza codice e si configura l'invio delle email in Impostazioni.
// È aperto solo se TUTTE queste condizioni sono vere:
// - nessuno è mai entrato in 2Target;
// - l'invio email non è ancora configurato;
// - l'app è stata riavviata da meno di FIRST_ACCESS_MIN minuti.
// Dopo il primo ingresso si chiude per sempre: da lì in poi serve il codice via email.

export const FIRST_ACCESS_MIN = 60;

export async function setupOpen() {
  if (Date.now() - getStartedAt() > FIRST_ACCESS_MIN * 60_000) return false;
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users).where(isNotNull(users.lastLoginAt));
  if (Number(n) > 0) return false;
  return !(await isMailConfigured());
}

/** Crea l'account master (se non c'è nessun utente) o riconosce l'amministratore già creato. */
export async function claimFirstAccess(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !(await setupOpen())) return null;

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.role, "admin"), eq(users.active, true)))
    .limit(1);
  if (existing) return existing;

  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (Number(n) > 0) return null; // c'è già un amministratore iniziale con un'altra email
  await db.insert(users).values({ email, name: email.split("@")[0], role: "admin", active: true });
  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Se due richieste arrivano insieme vince solo la prima
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(users);
  return Number(total) === 1 ? created : null;
}
