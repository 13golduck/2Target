import type { NextAuthConfig } from "next-auth";

// Configurazione senza accesso al DB: la usa anche il proxy, che deve solo leggere il cookie.
// Il login vero (email + password su MariaDB) è in ./auth.ts.

export const authConfig = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      (session.user as { role?: unknown }).role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
