import { NextResponse, type NextRequest } from "next/server";

import { msAuthorizeUrl, msSsoConfigured, SSO_COOKIE } from "@/lib/sso-microsoft";

// Avvio dell'accesso con Microsoft: si salva state/nonce/PKCE in un cookie firmato e si va da Microsoft.
export async function GET(request: NextRequest) {
  if (!(await msSsoConfigured())) return NextResponse.redirect(new URL("/login?sso=non_configurato", request.nextUrl));
  const da = request.nextUrl.searchParams.get("da") ?? "/";
  // Solo percorsi interni: niente redirect verso altri siti
  const returnTo = da.startsWith("/") && !da.startsWith("//") ? da : "/";
  const { url, cookie } = await msAuthorizeUrl(returnTo);
  const res = NextResponse.redirect(url);
  res.cookies.set(SSO_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/sso", maxAge: 600 });
  return res;
}
