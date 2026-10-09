import "server-only";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { authConfig } from "./auth.config";
import { consumeLoginCode } from "./login-codes";

// Accesso senza password: email + codice di 6 cifre ricevuto via email (vedi ./login-codes).
// I limiti (scadenza, tentativi, richieste) stanno nella tabella login_codes, quindi valgono
// anche dopo un riavvio dell'app.

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, code: {}, remember: {} },
      async authorize(credentials) {
        const user = await consumeLoginCode(String(credentials?.email ?? ""), String(credentials?.code ?? ""));
        if (!user) return null;
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        const remember = ["on", "true", "1"].includes(String(credentials?.remember ?? ""));
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
