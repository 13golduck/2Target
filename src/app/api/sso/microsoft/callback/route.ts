import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { signIn } from "@/lib/auth";
import { appUrl } from "@/lib/integrations/config";
import { msHandleCallback, SSO_COOKIE, SsoError } from "@/lib/sso-microsoft";

// Ritorno da Microsoft: se l'account è di Golduck e corrisponde a un utente attivo, si apre la sessione di 2Target.
export async function GET(request: NextRequest) {
  let result;
  try {
    result = await msHandleCallback(request.nextUrl.searchParams, request.cookies.get(SSO_COOKIE)?.value);
  } catch (e) {
    const code = e instanceof SsoError ? e.code : "microsoft";
    const message = e instanceof Error ? e.message : String(e);
    if (code !== "annullato") {
      await audit({
        userId: null,
        actorLabel: (e instanceof SsoError && e.email) || "Accesso con Microsoft",
        category: "accesso",
        action: "accesso.sso_negato",
        description: `Accesso con Microsoft non riuscito: ${message}`.slice(0, 500),
      });
    }
    const res = NextResponse.redirect(new URL(`/login?sso=${code}`, appUrl()));
    res.cookies.delete({ name: SSO_COOKIE, path: "/api/sso" });
    return res;
  }
  // signIn imposta il cookie di sessione e reindirizza (lancia il redirect: non va intercettato)
  return signIn("credentials", { ssoTicket: result.ticket, redirectTo: result.returnTo });
}
