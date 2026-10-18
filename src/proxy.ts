import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

// Tutta l'app è riservata al team: senza sessione si va al login.
const { auth } = NextAuth(authConfig);

// /api/cron: sveglie pianificate, con limiti di frequenza (e chiave CRON_SECRET per gli usi immediati); /api/lead riceve i moduli dei siti dei clienti (chiave per cliente)
const PUBLIC = ["/login", "/chi-siamo", "/approva", "/report-mensile", "/api/report-video", "/privacy", "/termini", "/eliminazione-dati", "/api/auth", "/api/sso", "/api/meta/eliminazione-dati", "/api/cron", "/api/lead", "/api/stato", "/sw.js", "/manifest.webmanifest"];
const SIGNED_MEDIA = /^\/api\/media\/[\w-]{22}\/[\w-]+\.(jpg|png|mp4|mov)$/;

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  // File da pubblicare: Meta li scarica senza accesso, ma solo con l'indirizzo firmato
  if (SIGNED_MEDIA.test(pathname)) return NextResponse.next();

  if (!request.auth?.user) {
    // La home pubblica è la presentazione di 2Target (la chiedono Meta e TikTok); chi ha l'accesso vede l'elenco clienti
    if (pathname === "/") return NextResponse.rewrite(new URL("/chi-siamo", request.url));
    // Dietro nginx/Passenger l'URL interno è 127.0.0.1: il redirect usa il dominio reale
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const login = new URL("/login", `${proto}://${host}`);
    if (pathname !== "/") login.searchParams.set("da", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Viewer (cliente): solo elenco clienti e, per ogni cliente, KPI, SEO e Lead in sola lettura.
  // Il controllo su QUALI clienti può vedere è nelle pagine (dati sempre aggiornati dal DB).
  const role = (request.auth.user as { role?: string }).role;
  if (role === "viewer" && !VIEWER_PATHS.some((re) => re.test(pathname))) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  // Il percorso serve ai layout server per i controlli per sezione
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
});

const VIEWER_PATHS = [/^\/$/, /^\/api\/logo\/\d+$/, /^\/clienti\/\d+$/, /^\/clienti\/\d+\/(kpi|seo|lead)$/, /^\/report\/\d+$/, /^\/errori$/, /^\/audit(\/export)?$/, /^\/profilo$/];

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
