import "server-only";

import { INSTAGRAM, META, callbackUrl } from "./config";
import { ApiError, getJson, qs } from "./http";

// Instagram con login Instagram (Instagram API with Instagram Login): per i profili professionali
// (Business o Creator) che non hanno una Pagina Facebook. Flusso: login Instagram del cliente → codice →
// token breve (1 ora) → token lungo (60 giorni), rinnovato da 2Target prima della scadenza.
// Le chiamate vanno su graph.instagram.com (non graph.facebook.com) con il token dell'utente Instagram.

const GRAPH = "https://graph.instagram.com";

export function authorizeUrl(state: string, request?: Request) {
  return `https://www.instagram.com/oauth/authorize?${qs({
    client_id: INSTAGRAM.appId,
    redirect_uri: callbackUrl("instagram", request),
    response_type: "code",
    scope: INSTAGRAM.scopes.join(","),
    state,
    // Chiede sempre le credenziali: evita di collegare per errore l'Instagram di chi è già loggato
    force_reauth: "true",
  })}`;
}

type ShortToken = { access_token: string; user_id: number | string; permissions?: string | string[] };

/** Codice → token breve → token lungo; poi il profilo, per il nome del collegamento. */
export async function exchangeCode(code: string, request?: Request) {
  // Instagram aggiunge «#_» in coda al codice nel ritorno
  const clean = code.replace(/#_$/, "");
  const raw = await getJson<ShortToken | { data: ShortToken[] }>("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({ client_id: INSTAGRAM.appId, client_secret: INSTAGRAM.appSecret, grant_type: "authorization_code", redirect_uri: callbackUrl("instagram", request), code: clean }),
  });
  const short = "data" in raw ? raw.data[0] : raw;
  if (!short?.access_token) throw new ApiError("Instagram non ha restituito un token: riprova", 400);
  const long = await getJson<{ access_token: string; expires_in: number }>(
    `${GRAPH}/access_token?${qs({ grant_type: "ig_exchange_token", client_secret: INSTAGRAM.appSecret, access_token: short.access_token })}`,
  );
  const me = await profile(long.access_token);
  return {
    accessToken: long.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
    scopes: Array.isArray(short.permissions) ? short.permissions.join(",") : (short.permissions ?? INSTAGRAM.scopes.join(",")),
    externalUserId: me.user_id,
    accountName: `@${me.username}`,
  };
}

/** Nuovo token lungo (altri 60 giorni): si può rinnovare solo un token valido e vecchio di almeno 24 ore. */
export async function refreshAccessToken(accessToken: string) {
  const t = await getJson<{ access_token: string; expires_in: number }>(`${GRAPH}/refresh_access_token?${qs({ grant_type: "ig_refresh_token", access_token: accessToken })}`);
  return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

type Me = { user_id: string; username: string; name?: string; profile_picture_url?: string; account_type?: string };

async function profile(accessToken: string): Promise<Me> {
  const me = await getJson<Me & { user_id: string | number }>(
    `${GRAPH}/${META.version}/me?${qs({ fields: "user_id,username,name,profile_picture_url,account_type", access_token: accessToken })}`,
  );
  return { ...me, user_id: String(me.user_id) };
}

export interface InstagramAsset {
  kind: "instagram";
  externalId: string;
  handle: string;
  name: string;
  pictureUrl?: string;
}

/** Il collegamento corrisponde a un solo profilo: quello con cui il cliente ha fatto l'accesso. */
export async function listAssets(accessToken: string): Promise<InstagramAsset[]> {
  const me = await profile(accessToken);
  return [{ kind: "instagram", externalId: me.user_id, handle: me.username, name: me.name || me.username, pictureUrl: me.profile_picture_url }];
}
