import "server-only";
import { isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { isMailConfigured } from "./mail";
import { getStartedAt } from "./startup-status";

// Primo accesso senza codice, per configurare l'invio delle email dall'interno di 2Target.
// Vale solo se TUTTE queste condizioni sono vere:
// - l'email è quella di BOOTSTRAP_ADMIN_EMAIL (variabile su Plesk);
// - nessuno è mai entrato in 2Target;
// - l'invio email non è ancora configurato;
// - l'app è stata riavviata da meno di FIRST_ACCESS_MIN minuti.
// Dopo il primo ingresso si chiude per sempre: da lì in poi serve il codice via email.

export const FIRST_ACCESS_MIN = 60;

export async function firstAccessAllowed(emailRaw: string) {
  const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const email = emailRaw.trim().toLowerCase();
  if (!bootstrap || email !== bootstrap) return false;
  if (Date.now() - getStartedAt() > FIRST_ACCESS_MIN * 60_000) return false;
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users).where(isNotNull(users.lastLoginAt));
  if (Number(n) > 0) return false;
  return !(await isMailConfigured());
}
