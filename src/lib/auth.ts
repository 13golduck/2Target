import "server-only";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { userClients, users } from "@/db/schema";
import { canWrite, isAdminRole, isViewer } from "./roles";
import { authConfig } from "./auth.config";
import { claimFirstAccess } from "./first-access";
import { checkLoginCode, consumeLoginCode, failLoginAttempt } from "./login-codes";
import { verifySecondFactor } from "./two-factor";
import { audit } from "./audit";

// Accesso senza password: email + codice di 6 cifre ricevuto via email (vedi ./login-codes).
// I limiti (scadenza, tentativi, richieste) stanno nella tabella login_codes, quindi valgono
// anche dopo un riavvio dell'app.

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, code: {}, totp: {}, remember: {}, firstAccess: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const code = String(credentials?.code ?? "");
        let user;
        if (credentials?.firstAccess === "true") user = await claimFirstAccess(email);
        else {
          // Prima si controlla il codice email, poi il secondo fattore; il codice si consuma solo se tutto è giusto
          const candidate = await checkLoginCode(email, code);
          if (!candidate) return null;
          if (!(await verifySecondFactor(candidate, String(credentials?.totp ?? "")))) {
            await failLoginAttempt(candidate.id);
            await audit({ userId: candidate.id, category: "accesso", action: "accesso.2fa_errato", description: "Accesso non riuscito: codice del doppio fattore errato" });
            return null;
          }
          user = await consumeLoginCode(email, code);
        }
        if (!user) return null;
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        const remember = ["on", "true", "1"].includes(String(credentials?.remember ?? ""));
        await audit({
          userId: user.id,
          category: "accesso",
          action: credentials?.firstAccess === "true" ? "accesso.primo" : "accesso.ok",
          description: credentials?.firstAccess === "true" ? "Primo accesso: creato l'account master" : `Accesso effettuato${user.totpEnabledAt ? " con doppio fattore" : ""}${remember ? " (ricordami)" : ""}`,
        });
        return { id: String(user.id), email: user.email, name: user.name, role: user.role, remember };
      },
    }),
  ],
});

/** Per pagine e azioni: utente loggato e ancora attivo nel DB, altrimenti al login. */
export async function requireUser() {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!id) redirect("/login");
  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user?.active) redirect("/login");
  return user;
}

/** Per le azioni che modificano dati: vietate ai Viewer (sola lettura). */
export async function requireWriter() {
  const user = await requireUser();
  if (!canWrite(user.role)) throw new Error("Il tuo profilo è in sola lettura");
  return user;
}

/** Super admin o Administrator, altrimenti alla home. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/");
  return user;
}

/** Clienti visibili a un Viewer (per gli altri ruoli: null = tutti). */
export async function visibleClientIds(user: { id: number; role: string }) {
  if (!isViewer(user.role)) return null;
  const rows = await db.select({ id: userClients.clientId }).from(userClients).where(eq(userClients.userId, user.id));
  return rows.map((r) => r.id);
}

/** Pagine di un cliente: un Viewer vede solo i clienti a lui assegnati. */
export async function requireClientAccess(clientId: number) {
  const user = await requireUser();
  const ids = await visibleClientIds(user);
  if (ids && !ids.includes(clientId)) notFound();
  return user;
}
