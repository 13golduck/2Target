import { randomBytes } from "node:crypto";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { NextResponse } from "next/server";

import { auth, userCanPublish } from "@/lib/auth";
import { getClient } from "@/lib/queries";
import { signPayload } from "@/lib/secret-box";
import { appUrl, isConfigured, type Provider } from "@/lib/integrations/config";
import * as google from "@/lib/integrations/google";
import * as meta from "@/lib/integrations/meta";

// Avvio del collegamento: porta l'utente alla pagina di consenso della piattaforma.

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  await ensureIntegrationKeys();
  const { provider } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${appUrl(request)}/login`);
  // I Viewer (clienti) non collegano canali
  if ((session.user as { role?: string }).role === "viewer") return NextResponse.redirect(`${appUrl(request)}/`);

  const clientId = Number(new URL(request.url).searchParams.get("clientId"));
  // Collegare profili a un cliente è il punto in cui si può sbagliare cliente: solo chi può pubblicare
  if (!(await userCanPublish({ id: Number(session.user.id), role: String((session.user as { role?: string }).role ?? "") }))) {
    return NextResponse.redirect(`${appUrl(request)}/clienti/${clientId}/canali?errore=${encodeURIComponent("Solo gli amministratori e chi è abilitato a pubblicare possono collegare account ai clienti")}`);
  }
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return NextResponse.json({ message: "Cliente non trovato" }, { status: 404 });
  if (!["meta", "google"].includes(provider) || !isConfigured(provider as Provider)) {
    return NextResponse.redirect(`${appUrl(request)}/clienti/${clientId}/canali?errore=${encodeURIComponent(`${provider} non è ancora configurato`)}`);
  }

  // Lo state firmato lega il ritorno a questo utente e a questo cliente; il nonce nel cookie evita
  // che qualcuno faccia completare a un altro un collegamento avviato da lui (CSRF).
  const nonce = randomBytes(16).toString("base64url");
  const state = signPayload({ provider, clientId, uid: session.user.id, nonce });
  const url = provider === "meta" ? meta.authorizeUrl(state, request) : google.authorizeUrl(state, request);

  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: appUrl(request).startsWith("https"), path: "/api/connect", maxAge: 600 });
  return res;
}
