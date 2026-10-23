import "server-only";

import { callbackUrl, THREADS } from "./config";
import { ApiError, getJson, qs } from "./http";
import { THREADS_MAX_CAROUSEL, THREADS_MAX_CHARS } from "./limits";
import type { DailyValue, PostData } from "./meta";

// Threads (Meta) con login Threads del cliente: token breve → token lungo (60 giorni, rinnovabile).
// Lettura (profilo, follower, visualizzazioni, post) e pubblicazione su graph.threads.net con il token dell'utente.
// Pubblicare è in due passi come Instagram: contenitore (testo/foto/video) → pubblicazione.

const API = "https://graph.threads.net";
const V = `${API}/v1.0`;

export function authorizeUrl(state: string, request?: Request) {
  return `https://threads.net/oauth/authorize?${qs({
    client_id: THREADS.appId,
    redirect_uri: callbackUrl("threads", request),
    scope: THREADS.scopes.join(","),
    response_type: "code",
    state,
  })}`;
}

type Me = { id: string; username: string; name?: string; threads_profile_picture_url?: string };

async function profile(token: string): Promise<Me> {
  return getJson<Me>(`${V}/me?${qs({ fields: "id,username,name,threads_profile_picture_url", access_token: token })}`);
}

/** Codice → token breve → token lungo (60 giorni); poi il profilo per il nome del collegamento. */
export async function exchangeCode(code: string, request?: Request) {
  const short = await getJson<{ access_token: string; user_id: string | number }>(`${API}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({ client_id: THREADS.appId, client_secret: THREADS.appSecret, grant_type: "authorization_code", redirect_uri: callbackUrl("threads", request), code: code.replace(/#_$/, "") }),
  });
  if (!short?.access_token) throw new ApiError("Threads non ha restituito un token: riprova", 400);
  const long = await getJson<{ access_token: string; expires_in: number }>(`${API}/access_token?${qs({ grant_type: "th_exchange_token", client_secret: THREADS.appSecret, access_token: short.access_token })}`);
  const me = await profile(long.access_token);
  return {
    accessToken: long.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
    scopes: THREADS.scopes.join(","),
    externalUserId: String(me.id),
    accountName: `@${me.username}`,
  };
}

/** Nuovo token lungo (altri 60 giorni): si rinnova un token valido e vecchio di almeno 24 ore. */
export async function refreshAccessToken(accessToken: string) {
  const t = await getJson<{ access_token: string; expires_in: number }>(`${API}/refresh_access_token?${qs({ grant_type: "th_refresh_token", access_token: accessToken })}`);
  return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

export type ThreadsAsset = { kind: "threads"; externalId: string; handle: string; name: string; pictureUrl?: string };

/** Il collegamento corrisponde al solo profilo con cui il cliente ha fatto l'accesso. */
export async function listAssets(token: string): Promise<ThreadsAsset[]> {
  const me = await profile(token);
  return [{ kind: "threads", externalId: String(me.id), handle: me.username, name: me.name || me.username, pictureUrl: me.threads_profile_picture_url }];
}

type Insight = { name: string; values?: { value: number; end_time: string }[]; total_value?: { value: number } };

/** Follower e visualizzazioni giornaliere degli ultimi 30 giorni, più gli ultimi post con le loro statistiche. */
export async function syncThreads(token: string, userId: string) {
  const daily: DailyValue[] = [];
  const posts: PostData[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const since = Math.floor((Date.now() - 30 * 86_400_000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const ins = await getJson<{ data: Insight[] }>(`${V}/${userId}/threads_insights?${qs({ metric: "views,likes,replies,reposts,followers_count", since, until, access_token: token })}`);
  for (const m of ins.data) {
    if (m.name === "followers_count" && m.total_value) daily.push({ day: today, metric: "followers", value: m.total_value.value });
    if (m.name === "views") for (const v of m.values ?? []) daily.push({ day: v.end_time.slice(0, 10), metric: "views", value: v.value });
  }
  const list = await getJson<{ data: { id: string; text?: string; timestamp: string; permalink?: string; media_type?: string; thumbnail_url?: string; media_url?: string }[] }>(
    `${V}/${userId}/threads?${qs({ fields: "id,text,timestamp,permalink,media_type,thumbnail_url,media_url", limit: 25, access_token: token })}`,
  );
  for (const p of list.data) {
    const m = await getJson<{ data: Insight[] }>(`${V}/${p.id}/insights?${qs({ metric: "views,likes,replies,reposts,quotes", access_token: token })}`).catch(() => ({ data: [] as Insight[] }));
    const metric = (k: string) => m.data.find((x) => x.name === k)?.values?.[0]?.value ?? m.data.find((x) => x.name === k)?.total_value?.value ?? 0;
    const likes = metric("likes");
    const comments = metric("replies");
    const shares = metric("reposts") + metric("quotes");
    posts.push({
      externalId: p.id,
      mediaType: p.media_type ?? "TEXT",
      permalink: p.permalink,
      caption: p.text,
      thumbnailUrl: p.thumbnail_url ?? (p.media_type === "IMAGE" ? p.media_url : undefined),
      publishedAt: new Date(p.timestamp),
      metrics: { views: metric("views"), likes, comments, shares, total_interactions: likes + comments + shares },
    });
  }
  return { daily, posts };
}

export type ThreadsMedia = { kind: "image" | "video"; url: string };

/**
 * Contenitori da creare per un post: un solo contenitore (testo, foto o video) oppure un carosello
 * (figli + contenitore padre). Funzione pura, coperta dai test.
 */
export function threadsPlan(caption: string, media: ThreadsMedia[]) {
  const text = caption.slice(0, THREADS_MAX_CHARS);
  const item = (m: ThreadsMedia, child: boolean) => ({
    media_type: m.kind === "video" ? "VIDEO" : "IMAGE",
    ...(m.kind === "video" ? { video_url: m.url } : { image_url: m.url }),
    ...(child ? { is_carousel_item: "true" } : { text }),
  });
  if (!media.length) return { children: [], main: { media_type: "TEXT", text } };
  if (media.length === 1) return { children: [], main: item(media[0], false) };
  return { children: media.slice(0, THREADS_MAX_CAROUSEL).map((m) => item(m, true)), main: { media_type: "CAROUSEL", text } };
}

async function waitContainer(id: string, token: string, heartbeat?: () => Promise<void>) {
  for (let i = 0; i < 60; i++) {
    await heartbeat?.().catch(() => undefined);
    const s = await getJson<{ status?: string; error_message?: string }>(`${V}/${id}?${qs({ fields: "status,error_message", access_token: token })}`);
    if (s.status === "FINISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") throw new Error(`Threads non ha accettato il file: ${s.error_message ?? s.status}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Threads sta ancora elaborando il file dopo 5 minuti: riprova più tardi");
}

const post = <T>(path: string, params: Record<string, string | undefined>) =>
  getJson<T>(`${V}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs(params) });

export async function publishThreads(o: { userId: string; token: string; caption: string; media: ThreadsMedia[]; heartbeat?: () => Promise<void> }) {
  const plan = threadsPlan(o.caption, o.media);
  const children: string[] = [];
  for (const c of plan.children) {
    const { id } = await post<{ id: string }>(`${o.userId}/threads`, { ...c, access_token: o.token });
    await waitContainer(id, o.token, o.heartbeat);
    children.push(id);
  }
  const { id: creation } = await post<{ id: string }>(`${o.userId}/threads`, { ...plan.main, ...(children.length && { children: children.join(",") }), access_token: o.token });
  if (plan.main.media_type !== "TEXT") await waitContainer(creation, o.token, o.heartbeat);
  const { id } = await post<{ id: string }>(`${o.userId}/threads_publish`, { creation_id: creation, access_token: o.token });
  const info = await getJson<{ permalink?: string }>(`${V}/${id}?${qs({ fields: "permalink", access_token: o.token })}`).catch(() => ({}) as { permalink?: string });
  return { externalId: id, permalink: info.permalink ?? null };
}
