import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

// Tutta l'app è riservata al team: senza sessione si va al login.
const { auth } = NextAuth(authConfig);

// /api/cron ha una sua chiave (CRON_SECRET); /api/lead riceve i moduli dei siti dei clienti (chiave per cliente)
const PUBLIC = ["/login", "/api/auth", "/api/cron", "/api/lead"];

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (!request.auth?.user) {
    // Dietro nginx/Passenger l'URL interno è 127.0.0.1: il redirect usa il dominio reale
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const login = new URL("/login", `${proto}://${host}`);
    if (pathname !== "/") login.searchParams.set("da", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
