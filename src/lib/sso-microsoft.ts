import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/integrations/config";
import { ensureIntegrationKeys, integrationKey } from "@/lib/integrations/keys";
import { signPayload, verifyPayload } from "@/lib/secret-box";

// Accesso con l'account Microsoft di Golduck (SSO, OpenID Connect con PKCE).
// Solo il tenant configurato in Impostazioni: un account Microsoft di un'altra organizzazione non entra.
// Entra solo chi esiste già in 2Target come utente attivo con la stessa email: nessun utente viene creato da qui.
// Alla fine si emette un "biglietto" firmato, valido 60 secondi e usabile una volta, che il provider
// Credentials di Auth.js trasforma nella sessione normale di 2Target.

export const SSO_COOKIE = "2t_sso";
const b64url = (b: Buffer) => b.toString("base64url");

export async function msSsoConfigured() {
  await ensureIntegrationKeys();
  return Boolean(integrationKey("msTenantId") && integrationKey("msClientId") && integrationKey("msClientSecret"));
}

const redirectUri = () => `${appUrl()}/api/sso/microsoft/callback`;

/** Indirizzo di Microsoft a cui mandare l'utente, più il cookie firmato con state, nonce e verificatore PKCE. */
export async function msAuthorizeUrl(returnTo: string, loginHint?: string) {
  await ensureIntegrationKeys();
  const tenant = integrationKey("msTenantId");
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: integrationKey("msClientId"),
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(loginHint && { login_hint: loginHint }),
  }).toString();
  return { url: url.toString(), cookie: signPayload({ state, nonce, verifier, returnTo }, 600) };
}

type IdClaims = { aud?: string; iss?: string; tid?: string; nonce?: string; exp?: number; preferred_username?: string; email?: string; name?: string; oid?: string };

export class SsoError extends Error {
  constructor(
    public code: "annullato" | "stato" | "microsoft" | "configurazione" | "tenant" | "nessun_utente",
    message: string,
    public email?: string,
  ) {
    super(message);
  }
}

/** Ritorno da Microsoft: verifica state, scambia il codice, controlla il token e trova l'utente di 2Target. */
export async function msHandleCallback(params: URLSearchParams, cookieValue: string | undefined) {
  await ensureIntegrationKeys();
  const saved = verifyPayload<{ state: string; nonce: string; verifier: string; returnTo: string }>(cookieValue);
  if (params.get("error")) {
    throw new SsoError("annullato", `Microsoft: ${params.get("error_description")?.split("\r\n")[0] ?? params.get("error")}`);
  }
  if (!saved || !params.get("state") || saved.state !== params.get("state")) throw new SsoError("stato", "Accesso scaduto o non valido: riprova");

  const tenant = integrationKey("msTenantId");
  const clientId = integrationKey("msClientId");
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: integrationKey("msClientSecret"),
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      redirect_uri: redirectUri(),
      code_verifier: saved.verifier,
      scope: "openid profile email",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.id_token) {
    // Segreto sbagliato (spesso l'ID al posto del valore) o scaduto, app non trovata: è la configurazione, non l'utente
    const config = /AADSTS(7000215|7000222|700016|90002)/.test(String(data.error_description ?? ""));
    throw new SsoError(config ? "configurazione" : "microsoft", `Microsoft: ${data.error ?? res.status} ${String(data.error_description ?? "").split("\r\n")[0]}`.trim());
  }

  // Il token arriva direttamente da Microsoft su HTTPS, autenticati con il segreto client:
  // la firma è garantita dal canale (OpenID Connect Core 3.1.3.7); si controllano i contenuti.
  let claims: IdClaims;
  try {
    claims = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    throw new SsoError("microsoft", "Risposta di Microsoft non leggibile");
  }
  const tid = claims.tid ?? "";
  if (claims.aud !== clientId) throw new SsoError("microsoft", "Token non destinato a 2Target");
  if (tid.toLowerCase() !== tenant.toLowerCase() || claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
    throw new SsoError("tenant", "Questo account Microsoft non appartiene a Golduck");
  }
  if (claims.nonce !== saved.nonce) throw new SsoError("stato", "Accesso non valido: riprova");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new SsoError("stato", "Accesso scaduto: riprova");

  const email = (claims.preferred_username || claims.email || "").trim().toLowerCase();
  const [user] = email ? await db.select().from(users).where(eq(users.email, email)).limit(1) : [];
  if (!user?.active) throw new SsoError("nessun_utente", `${email || "Questo account"} non è un utente attivo di 2Target`, email);

  const ticket = signPayload({ sso: "microsoft", uid: user.id, jti: b64url(randomBytes(16)) }, 60);
  return { ticket, user, returnTo: saved.returnTo, name: claims.name };
}

// Biglietti già usati (un solo processo Node su Plesk; scadono comunque in 60 secondi)
const g = globalThis as unknown as { __ssoUsed?: Map<string, number> };
const used = (g.__ssoUsed ??= new Map<string, number>());

/** Per il provider Credentials: biglietto valido e mai usato → id utente. */
export function consumeSsoTicket(ticket: string) {
  const p = verifyPayload<{ sso: string; uid: number; jti: string; exp: number }>(ticket);
  if (!p || p.sso !== "microsoft" || !p.jti || used.has(p.jti)) return null;
  for (const [k, exp] of used) if (exp < Date.now()) used.delete(k);
  used.set(p.jti, p.exp);
  return p.uid;
}
