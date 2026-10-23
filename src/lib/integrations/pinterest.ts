import "server-only";

import { callbackUrl, PINTEREST } from "./config";
import { ApiError, getJson, qs } from "./http";
import { PIN_DESCRIPTION_MAX, PIN_MAX_IMAGES, PIN_TITLE_MAX } from "./limits";
import type { DailyValue, PostData } from "./meta";

// Pinterest API v5 con login Pinterest del cliente: token di 30 giorni + refresh token di un anno.
// Ogni bacheca è un canale a sé (si pubblica su una bacheca precisa); le statistiche sono quelle dei pin della bacheca.
// Si pubblicano pin con immagine (o più immagini) e link al sito: i video richiedono un caricamento a parte, non gestito.

const API = "https://api.pinterest.com/v5";

export function authorizeUrl(state: string, request?: Request) {
  return `https://www.pinterest.com/oauth/?${qs({
    client_id: PINTEREST.appId,
    redirect_uri: callbackUrl("pinterest", request),
    response_type: "code",
    scope: PINTEREST.scopes.join(","),
    state,
  })}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

// Pinterest vuole le credenziali dell'app in Basic auth, non nel corpo
const tokenRequest = (params: Record<string, string>) =>
  getJson<TokenResponse>(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${PINTEREST.appId}:${PINTEREST.appSecret}`).toString("base64")}`,
    },
    body: qs(params),
  });

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

type Me = { username: string; profile_image?: string; business_name?: string };

export async function exchangeCode(code: string, request?: Request) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: callbackUrl("pinterest", request) });
  if (!t?.access_token) throw new ApiError("Pinterest non ha restituito un token: riprova", 400);
  const me = await getJson<Me>(`${API}/user_account`, auth(t.access_token));
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes: t.scope ?? PINTEREST.scopes.join(","),
    externalUserId: me.username,
    accountName: me.business_name || `@${me.username}`,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

export type PinterestAsset = { kind: "pinterest"; externalId: string; handle: string; name: string; pictureUrl?: string };

type Board = { id: string; name: string; privacy?: string; follower_count?: number; pin_count?: number; media?: { image_cover_url?: string } };

/** Le bacheche pubbliche del profilo: le segrete non servono a farsi trovare. */
export async function listAssets(token: string): Promise<PinterestAsset[]> {
  const me = await getJson<Me>(`${API}/user_account`, auth(token));
  const boards = await getJson<{ items: Board[] }>(`${API}/boards?${qs({ page_size: 100 })}`, auth(token));
  return boards.items
    .filter((b) => b.privacy !== "SECRET")
    .map((b) => ({ kind: "pinterest", externalId: b.id, handle: `${me.username}/${b.name}`.slice(0, 255), name: b.name, pictureUrl: b.media?.image_cover_url ?? me.profile_image }));
}

type Pin = { id: string; created_at: string; title?: string; description?: string; link?: string; media?: { media_type?: string; images?: Record<string, { url: string }> } };

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Follower e pin della bacheca (valore di oggi) più gli ultimi pin con impressioni, salvataggi e clic degli ultimi 90 giorni. */
export async function syncBoard(token: string, boardId: string) {
  const daily: DailyValue[] = [];
  const posts: PostData[] = [];
  const today = day(new Date());
  const board = await getJson<Board>(`${API}/boards/${boardId}`, auth(token));
  if (board.follower_count != null) daily.push({ day: today, metric: "followers", value: board.follower_count });
  if (board.pin_count != null) daily.push({ day: today, metric: "pins", value: board.pin_count });
  const pins = await getJson<{ items: Pin[] }>(`${API}/boards/${boardId}/pins?${qs({ page_size: 25 })}`, auth(token));
  // Le statistiche dei pin coprono al massimo gli ultimi 90 giorni
  const range = { start_date: day(new Date(Date.now() - 89 * 86_400_000)), end_date: today };
  for (const p of pins.items) {
    const a = await getJson<{ all?: { summary_metrics?: Record<string, number> } }>(
      `${API}/pins/${p.id}/analytics?${qs({ ...range, metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK" })}`,
      auth(token),
    ).catch(() => ({}) as { all?: { summary_metrics?: Record<string, number> } });
    const m = a.all?.summary_metrics ?? {};
    const saves = m.SAVE ?? 0;
    const clicks = (m.PIN_CLICK ?? 0) + (m.OUTBOUND_CLICK ?? 0);
    const images = p.media?.images ?? {};
    posts.push({
      externalId: p.id,
      mediaType: p.media?.media_type ?? "image",
      permalink: `https://www.pinterest.com/pin/${p.id}/`,
      caption: [p.title, p.description].filter(Boolean).join(" — ") || undefined,
      thumbnailUrl: (images["600x"] ?? images["400x300"] ?? Object.values(images)[0])?.url,
      publishedAt: new Date(p.created_at),
      metrics: { impressions: m.IMPRESSION ?? 0, saved: saves, clicks, outbound_clicks: m.OUTBOUND_CLICK ?? 0, total_interactions: saves + clicks },
    });
  }
  return { daily, posts };
}

/**
 * Corpo del pin: titolo (la prima riga del testo, se manca), descrizione, link e immagini.
 * Funzione pura, coperta dai test.
 */
export function pinBody(o: { boardId: string; title?: string | null; caption: string; link?: string | null; imageUrls: string[]; altText?: string | null }) {
  if (!o.imageUrls.length) throw new Error("Pinterest pubblica solo pin con almeno un'immagine");
  const firstLine = o.caption.split("\n").find((l) => l.trim())?.trim() ?? "";
  const images = o.imageUrls.slice(0, PIN_MAX_IMAGES);
  return {
    board_id: o.boardId,
    title: (o.title?.trim() || firstLine).slice(0, PIN_TITLE_MAX),
    description: o.caption.slice(0, PIN_DESCRIPTION_MAX),
    ...(o.link && { link: o.link }),
    ...(o.altText && { alt_text: o.altText.slice(0, 500) }),
    media_source: images.length === 1 ? { source_type: "image_url", url: images[0] } : { source_type: "multiple_image_urls", items: images.map((url) => ({ url })) },
  };
}

export async function publishPin(o: { token: string } & Parameters<typeof pinBody>[0]) {
  const { token, ...rest } = o;
  const pin = await getJson<{ id: string }>(`${API}/pins`, {
    method: "POST",
    headers: { ...auth(token).headers, "Content-Type": "application/json" },
    body: JSON.stringify(pinBody(rest)),
  });
  return { externalId: pin.id, permalink: `https://www.pinterest.com/pin/${pin.id}/` };
}
