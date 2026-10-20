import "server-only";

import { TIKTOK, callbackUrl } from "./config";
import { ApiError, qs } from "./http";
import type { DailyValue, PostData } from "./meta";

// TikTok via Login Kit + Display API (v2).
// Flusso: login TikTok del cliente → token di accesso (24 ore) e refresh token (365 giorni, si rinnova
// a ogni uso) → profilo, statistiche e ultimi video. Un collegamento = un account TikTok.

export const API = "https://open.tiktokapis.com/v2";

type TikTokError = { error?: { code?: string; message?: string; log_id?: string }; error_description?: string };

/**
 * Errori di TikTok spiegati in italiano: il messaggio originale è spesso un generico «leggi le linee guida».
 * Fonte: documentazione Content Posting API (codici di errore), ottobre 2026.
 */
const ERROR_TEXT: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    "finché TikTok non approva l'app si può pubblicare solo su account TikTok privati. Sul telefono del cliente: TikTok → Profilo → ☰ → Impostazioni e privacy → Privacy → «Account privato», poi riprova",
  privacy_level_option_mismatch: "la visibilità scelta non è tra quelle consentite dall'account: scegline un'altra",
  spam_risk_too_many_posts: "troppi post oggi su questo account: riprova domani",
  spam_risk_too_many_pending_share: "ci sono troppi invii in attesa su questo account: riprova tra qualche ora",
  spam_risk_user_banned_from_posting: "l'account non può pubblicare al momento",
  url_ownership_unverified: "il dominio da cui TikTok scarica il video non è verificato nell'app TikTok",
  reached_active_user_cap: "l'app ha raggiunto il limite di utenti attivi consentito prima dell'approvazione",
  scope_not_authorized: "manca il permesso di pubblicare: ricollega l'account TikTok da Canali",
  access_token_invalid: "accesso scaduto: ricollega l'account TikTok da Canali",
};

/** Chiamata alle API TikTok: gli errori arrivano come { error: { code, message } } anche con HTTP 200. */
export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as T & TikTokError & { error?: string | TikTokError["error"] };
  const err = typeof body.error === "string" ? { code: body.error, message: body.error_description } : body.error;
  if (!res.ok || (err?.code && err.code !== "ok")) {
    const code = err?.code ?? `HTTP ${res.status}`;
    const expired = res.status === 401 || ["access_token_invalid", "invalid_grant", "scope_not_authorized"].includes(code);
    const known = ERROR_TEXT[code];
    throw new ApiError(`TikTok: ${known ?? err?.message ?? code}${known ? "" : ` [${code}]`}${err?.log_id ? ` (log ${err.log_id})` : ""}`, res.status, expired);
  }
  return body;
}

export function authorizeUrl(state: string, request?: Request) {
  return `https://www.tiktok.com/v2/auth/authorize/?${qs({
    client_key: TIKTOK.clientKey,
    scope: TIKTOK.scopes.join(","),
    response_type: "code",
    redirect_uri: callbackUrl("tiktok", request),
    state,
    // Mostra sempre la scelta dell'account: evita di collegare per errore il TikTok di chi è già loggato
    disable_auto_auth: 1,
  })}`;
}

type TokenResponse = { access_token: string; expires_in: number; open_id: string; refresh_token: string; refresh_expires_in: number; scope: string };

async function token(params: Record<string, string>) {
  return call<TokenResponse>(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ client_key: TIKTOK.clientKey, client_secret: TIKTOK.clientSecret, ...params }),
  });
}

export async function exchangeCode(code: string, request?: Request) {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: callbackUrl("tiktok", request) });
  const me = await userInfo(t.access_token);
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes: t.scope,
    externalUserId: t.open_id,
    accountName: me.username ? `@${me.username}` : (me.display_name ?? "TikTok"),
  };
}

/** Nuovo token di accesso dal refresh token (TikTok può restituire anche un nuovo refresh token). */
export async function refreshAccessToken(refreshToken: string) {
  const t = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

type User = {
  open_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
};

async function userInfo(accessToken: string) {
  // username richiede user.info.profile (non lo chiediamo: il firewall di Plesk blocca «.profile» nel ritorno da TikTok),
  // le statistiche user.info.stats: a ogni errore si ripiega su meno campi
  const stats = "follower_count,following_count,likes_count,video_count";
  for (const fields of [`open_id,username,display_name,avatar_url,${stats}`, `open_id,display_name,avatar_url,${stats}`, "open_id,display_name,avatar_url"]) {
    try {
      const r = await call<{ data: { user: User } }>(`${API}/user/info/?${qs({ fields })}`, { headers: { authorization: `Bearer ${accessToken}` } });
      return r.data.user;
    } catch (e) {
      if (fields.startsWith("open_id,display_name")) throw e;
    }
  }
  throw new ApiError("TikTok: profilo non leggibile", 500);
}

export interface TikTokAsset {
  kind: "tiktok";
  externalId: string;
  handle: string;
  name: string;
  pictureUrl?: string;
}

/** Il collegamento TikTok corrisponde a un solo account: quello con cui il cliente ha fatto l'accesso. */
export async function listAssets(accessToken: string): Promise<TikTokAsset[]> {
  const u = await userInfo(accessToken);
  return [{ kind: "tiktok", externalId: u.open_id, handle: u.username ?? u.display_name ?? u.open_id, name: u.display_name ?? u.username ?? "TikTok", pictureUrl: u.avatar_url }];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Profilo TikTok: follower, like totali e numero video di oggi; ultimi 60 video con visualizzazioni e interazioni. */
export async function syncTikTok(accessToken: string) {
  const u = await userInfo(accessToken);
  const daily: DailyValue[] = [];
  if (u.follower_count != null) daily.push({ day: today(), metric: "followers", value: u.follower_count });
  if (u.video_count != null) daily.push({ day: today(), metric: "posts_total", value: u.video_count });
  if (u.likes_count != null) daily.push({ day: today(), metric: "likes_total", value: u.likes_count });

  type Video = { id: string; create_time: number; cover_image_url?: string; share_url?: string; video_description?: string; title?: string; duration?: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };
  const posts: PostData[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 3; page++) {
    let r: { data: { videos: Video[]; cursor: number; has_more: boolean } };
    try {
      r = await call(`${API}/video/list/?${qs({ fields: "id,create_time,cover_image_url,share_url,video_description,title,duration,view_count,like_count,comment_count,share_count" })}`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ max_count: 20, ...(cursor && { cursor }) }),
      });
    } catch (e) {
      // Senza lo scope video.list si tengono comunque le statistiche del profilo
      if (page === 0 && e instanceof ApiError && !e.expired) break;
      throw e;
    }
    for (const v of r.data.videos ?? []) {
      posts.push({
        externalId: v.id,
        mediaType: "VIDEO",
        permalink: v.share_url,
        caption: v.video_description || v.title,
        thumbnailUrl: v.cover_image_url,
        publishedAt: new Date(v.create_time * 1000),
        metrics: { views: v.view_count ?? 0, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0 },
      });
    }
    if (!r.data.has_more) break;
    cursor = r.data.cursor;
  }
  return { daily, posts };
}
