import "server-only";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { authConfig } from "./auth.config";
import { verifyPassword } from "./password";

// Blocco dopo troppi tentativi falliti (in memoria: basta per un solo processo Node su Plesk)
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const failures = new Map<string, { count: number; first: number }>();
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`;

function isLocked(email: string) {
  const e = failures.get(email);
  if (!e) return false;
  if (Date.now() - e.first > LOCK_MS) {
    failures.delete(email);
    return false;
  }
  return e.count >= MAX_FAILURES;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password || isLocked(email)) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        // Verifica anche se l'utente non esiste, per non rivelarlo dai tempi di risposta
        const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user?.active || !ok) {
          const e = failures.get(email);
          if (e) e.count += 1;
          else failures.set(email, { count: 1, first: Date.now() });
          return null;
        }
        failures.delete(email);
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return { id: String(user.id), email: user.email, name: user.name, role: user.role };
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
