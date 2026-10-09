import type { NextAuthConfig } from "next-auth";

// Configurazione senza accesso al DB: la usa anche il proxy, che deve solo leggere il cookie.
// Il login vero (email + password su MariaDB) è in ./auth.ts.

// "Ricordami": 30 giorni; altrimenti la sessione vale 12 ore dall'accesso.
const LONG_SESSION = 30 * 24 * 60 * 60;
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

export const authConfig = {
  session: { strategy: "jwt", maxAge: LONG_SESSION },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.remember = (user as { remember?: boolean }).remember === true;
        token.loginAt = Date.now();
        return token;
      }
      // Senza "Ricordami" l'accesso scade dopo 12 ore anche se il cookie è ancora valido
      if (!token.remember && Date.now() - Number(token.loginAt ?? 0) > SHORT_SESSION_MS) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      (session.user as { role?: unknown }).role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
