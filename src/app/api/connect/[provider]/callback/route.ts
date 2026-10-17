import { and, eq } from "drizzle-orm";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";

import { db } from "@/db";
import { connections } from "@/db/schema";
import { auth } from "@/lib/auth";
import { encryptSecret, verifyPayload } from "@/lib/secret-box";
import { appUrl } from "@/lib/integrations/config";
import * as google from "@/lib/integrations/google";
import * as instagram from "@/lib/integrations/instagram";
import * as linkedin from "@/lib/integrations/linkedin";
import * as meta from "@/lib/integrations/meta";
import * as tiktok from "@/lib/integrations/tiktok";

// Ritorno dalla piattaforma: scambia il codice con i token, li salva cifrati e apre la scelta dei canali.

const PROVIDER_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", instagram: "Instagram", linkedin: "LinkedIn" };

type State = { provider: string; clientId: number; uid: string; nonce: string };

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  await ensureIntegrationKeys();
  const { provider } = await params;
  const url = new URL(request.url);
  const base = appUrl(request);
  const session = await auth();
  const state = verifyPayload<State>(url.searchParams.get("state"));
  const nonce = (await cookies()).get("oauth_nonce")?.value;

  const back = (clientId: number | undefined, query: string) =>
    NextResponse.redirect(clientId ? `${base}/clienti/${clientId}/canali?${query}` : `${base}/`);

  if (!session?.user?.id || !state || state.provider !== provider || state.uid !== session.user.id || !nonce || nonce !== state.nonce) {
    return back(state?.clientId, `errore=${encodeURIComponent("Collegamento non valido o scaduto: riprova")}`);
  }
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) return back(state.clientId, `errore=${encodeURIComponent(denied ?? "Accesso non concesso")}`);

  try {
    const grant: { accessToken: string; refreshToken?: string | null; expiresAt: Date; scopes?: string; externalUserId: string; accountName: string } =
      provider === "meta"
        ? await meta.exchangeCode(code, request)
        : provider === "tiktok"
          ? await tiktok.exchangeCode(code, request)
          : provider === "instagram"
            ? await instagram.exchangeCode(code, request)
            : provider === "linkedin"
              ? await linkedin.exchangeCode(code, request)
              : await google.exchangeCode(code, request);
    const values = {
      clientId: state.clientId,
      provider: provider as "meta" | "google" | "tiktok" | "instagram" | "linkedin",
      externalUserId: grant.externalUserId,
      accountName: grant.accountName,
      accessTokenEnc: encryptSecret(grant.accessToken),
      refreshTokenEnc: grant.refreshToken ? encryptSecret(grant.refreshToken) : null,
      expiresAt: grant.expiresAt,
      scopes: grant.scopes ?? null,
      status: "attivo" as const,
      lastError: null,
      connectedBy: Number(session.user.id),
    };
    await db
      .insert(connections)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          accountName: values.accountName,
          accessTokenEnc: values.accessTokenEnc,
          // Google non rimanda sempre il refresh token: si tiene quello vecchio
          ...(values.refreshTokenEnc && { refreshTokenEnc: values.refreshTokenEnc }),
          expiresAt: values.expiresAt,
          // Ricollegando si aggiornano anche i permessi (es. video.publish di TikTok, business.manage di Google)
          scopes: values.scopes,
          status: "attivo",
          lastError: null,
        },
      });
    const [row] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.clientId, state.clientId), eq(connections.provider, values.provider), eq(connections.externalUserId, values.externalUserId)));
    await audit({ userId: Number(session.user.id), category: "canali", action: "collegamento.nuovo", description: `Collegato l'account ${PROVIDER_LABEL[provider] ?? provider} «${grant.accountName}»`, clientId: state.clientId, target: `collegamento:${row.id}` });
    const res = back(state.clientId, `scegli=${row.id}`);
    res.cookies.delete({ name: "oauth_nonce", path: "/api/connect" });
    return res;
  } catch (e) {
    return back(state.clientId, `errore=${encodeURIComponent((e as Error).message)}`);
  }
}
