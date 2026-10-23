import "server-only";
import { readFile } from "node:fs/promises";

import { LINKEDIN, callbackUrl } from "./config";
import { ApiError, qs } from "./http";
import type { DailyValue, PostData } from "./meta";
import { escapeCommentary } from "./linkedin-text";

// LinkedIn: pagine aziendali dei clienti (Community Management API).
// Flusso: login LinkedIn di chi amministra la pagina → token di 60 giorni (e refresh token di un anno, se LinkedIn
// lo concede all'app) → pagine di cui è amministratore → follower, statistiche, post e pubblicazione a nome della pagina.

const REST = "https://api.linkedin.com/rest";
const DAY = 86_400_000;

type LinkedInError = { message?: string; status?: number; serviceErrorCode?: number; error?: string; error_description?: string };

/** Chiamata alle API LinkedIn (REST con versione): errori come { message, status }. */
async function li<T>(url: string, token: string, init: RequestInit = {}): Promise<{ body: T; headers: Headers }> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
    // Un'intestazione vuota (es. LinkedIn-Version per le API v2 senza versione) non viene mandata
    headers: Object.fromEntries(
      Object.entries({
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": LINKEDIN.version,
        "X-Restli-Protocol-Version": "2.0.0",
        ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined),
      }).filter(([, v]) => v !== ""),
    ),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const e = (body ?? {}) as LinkedInError;
    const msg = e.message ?? e.error_description ?? e.error ?? `HTTP ${res.status}`;
    throw new ApiError(`LinkedIn: ${msg}`, res.status, res.status === 401 || e.serviceErrorCode === 65601);
  }
  return { body: body as T, headers: res.headers };
}

export function authorizeUrl(state: string, request?: Request) {
  return `https://www.linkedin.com/oauth/v2/authorization?${qs({
    response_type: "code",
    client_id: LINKEDIN.clientId,
    redirect_uri: callbackUrl("linkedin", request),
    state,
    scope: LINKEDIN.scopes.join(" "),
  })}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string };

async function token(params: Record<string, string>) {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: LINKEDIN.clientId, client_secret: LINKEDIN.clientSecret, ...params }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & LinkedInError;
  if (!res.ok || !body.access_token) throw new ApiError(`LinkedIn: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`, res.status, body.error === "invalid_grant");
  return body;
}

export async function exchangeCode(code: string, request?: Request) {
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: callbackUrl("linkedin", request) });
  const me = await member(t.access_token);
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes: t.scope ?? LINKEDIN.scopes.join(" "),
    externalUserId: me.id,
    accountName: me.name,
  };
}

/** Nuovo token dal refresh token (solo se LinkedIn ne ha dato uno all'app). */
export async function refreshAccessToken(refreshToken: string) {
  const t = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

async function member(accessToken: string) {
  // r_basicprofile (Community Management); in alternativa OpenID Connect (userinfo)
  try {
    const { body } = await li<{ id: string; localizedFirstName?: string; localizedLastName?: string }>("https://api.linkedin.com/v2/me", accessToken, { headers: { "LinkedIn-Version": "" } });
    return { id: body.id, name: [body.localizedFirstName, body.localizedLastName].filter(Boolean).join(" ") || "LinkedIn" };
  } catch {
    const { body } = await li<{ sub: string; name?: string }>("https://api.linkedin.com/v2/userinfo", accessToken, { headers: { "LinkedIn-Version": "" } });
    return { id: body.sub, name: body.name ?? "LinkedIn" };
  }
}

/** Puoi pubblicare con questo collegamento? (w_organization_social) */
export const canPublishWithScopes = (scopes: string | null | undefined) => (scopes ?? "").split(/[\s,]+/).includes("w_organization_social");

export interface LinkedInAsset {
  kind: "linkedin";
  externalId: string;
  handle: string;
  name: string;
  pictureUrl?: string;
}

const orgUrn = (id: string) => `urn:li:organization:${id}`;
const enc = encodeURIComponent;

/** Pagine aziendali di cui l'utente collegato è amministratore. */
export async function listAssets(accessToken: string): Promise<LinkedInAsset[]> {
  const { body } = await li<{ elements?: { organization?: string; organizationTarget?: string }[] }>(
    `${REST}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100`,
    accessToken,
  );
  const ids = [...new Set((body.elements ?? []).map((e) => (e.organization ?? e.organizationTarget ?? "").split(":").pop()!).filter(Boolean))];
  const out: LinkedInAsset[] = [];
  for (const id of ids) {
    const { body: o } = await li<{ localizedName?: string; vanityName?: string }>(`${REST}/organizations/${id}`, accessToken).catch(() => ({ body: {} as { localizedName?: string; vanityName?: string } }));
    out.push({ kind: "linkedin", externalId: id, handle: o.vanityName ?? id, name: o.localizedName ?? `Pagina LinkedIn ${id}` });
  }
  return out;
}

type ShareStats = { impressionCount?: number; uniqueImpressionsCount?: number; clickCount?: number; likeCount?: number; commentCount?: number; shareCount?: number; engagement?: number };

/** Follower di oggi, statistiche giornaliere degli ultimi 28 giorni e ultimi post con le loro statistiche. */
export async function syncOrganization(orgId: string, accessToken: string) {
  const urn = orgUrn(orgId);
  const day = new Date().toISOString().slice(0, 10);
  const daily: DailyValue[] = [];

  const { body: size } = await li<{ firstDegreeSize?: number }>(`${REST}/networkSizes/${enc(urn)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, accessToken);
  if (size.firstDegreeSize != null) daily.push({ day, metric: "followers", value: size.firstDegreeSize });

  // Statistiche giornaliere della pagina (impression, copertura, clic, interazioni)
  const end = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const start = end - 28 * DAY;
  const range = `(timeRange:(start:${start},end:${end}),timeGranularityType:DAY)`;
  const { body: stats } = await li<{ elements?: { timeRange?: { start: number }; totalShareStatistics?: ShareStats }[] }>(
    `${REST}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(urn)}&timeIntervals=${range}`,
    accessToken,
  ).catch(() => ({ body: { elements: [] } }));
  for (const e of stats.elements ?? []) {
    if (!e.timeRange) continue;
    const d = new Date(e.timeRange.start).toISOString().slice(0, 10);
    const s = e.totalShareStatistics ?? {};
    daily.push({ day: d, metric: "impressions", value: s.impressionCount ?? 0 });
    daily.push({ day: d, metric: "reach", value: s.uniqueImpressionsCount ?? 0 });
    daily.push({ day: d, metric: "clicks", value: s.clickCount ?? 0 });
    daily.push({ day: d, metric: "engagement", value: (s.likeCount ?? 0) + (s.commentCount ?? 0) + (s.shareCount ?? 0) + (s.clickCount ?? 0) });
  }

  // Ultimi post della pagina
  const { body: list } = await li<{ elements?: { id: string; commentary?: string; publishedAt?: number; createdAt?: number; content?: { media?: { id?: string }; multiImage?: unknown; article?: unknown } }[] }>(
    `${REST}/posts?q=author&author=${enc(urn)}&count=30&sortBy=LAST_MODIFIED`,
    accessToken,
    { headers: { "X-RestLi-Method": "FINDER" } },
  ).catch(() => ({ body: { elements: [] } }));
  const posts: PostData[] = (list.elements ?? []).map((p) => ({
    externalId: p.id,
    mediaType: p.content?.media?.id?.includes(":video:") ? "VIDEO" : p.content?.multiImage ? "CAROUSEL_ALBUM" : p.content?.media ? "IMAGE" : p.content?.article ? "ARTICLE" : "TEXT",
    permalink: `https://www.linkedin.com/feed/update/${p.id}/`,
    caption: p.commentary?.slice(0, 2000),
    publishedAt: new Date(p.publishedAt ?? p.createdAt ?? Date.now()),
    metrics: {},
  }));

  // Statistiche dei post (complessive): share e ugcPost si chiedono separatamente
  const shares = posts.filter((p) => p.externalId.startsWith("urn:li:share:")).map((p) => p.externalId);
  const ugc = posts.filter((p) => p.externalId.startsWith("urn:li:ugcPost:")).map((p) => p.externalId);
  for (const [param, urns] of [["shares", shares], ["ugcPosts", ugc]] as const) {
    if (!urns.length) continue;
    const { body: ps } = await li<{ elements?: ({ share?: string; ugcPost?: string; totalShareStatistics?: ShareStats })[] }>(
      `${REST}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(urn)}&${param}=List(${urns.map(enc).join(",")})`,
      accessToken,
    ).catch(() => ({ body: { elements: [] } }));
    for (const e of ps.elements ?? []) {
      const post = posts.find((p) => p.externalId === (e.share ?? e.ugcPost));
      const s = e.totalShareStatistics;
      if (!post || !s) continue;
      post.metrics = {
        impressions: s.impressionCount ?? 0,
        reach: s.uniqueImpressionsCount ?? 0,
        likes: s.likeCount ?? 0,
        comments: s.commentCount ?? 0,
        shares: s.shareCount ?? 0,
        clicks: s.clickCount ?? 0,
      };
    }
  }
  return { daily, posts };
}

// ── Pubblicazione ─────────────────────────────────────────────────────

export type LinkedInMedia = { kind: string; mime: string; path: string };

async function uploadImage(owner: string, file: LinkedInMedia, token: string) {
  const { body } = await li<{ value: { uploadUrl: string; image: string } }>(`${REST}/images?action=initializeUpload`, token, {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const bytes = await readFile(file.path);
  const put = await fetch(body.value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.mime }, body: bytes, signal: AbortSignal.timeout(300_000) });
  if (!put.ok) throw new ApiError(`LinkedIn: caricamento della foto non riuscito (HTTP ${put.status})`, put.status);
  return body.value.image;
}

async function uploadVideo(owner: string, file: LinkedInMedia, token: string, heartbeat?: () => Promise<void>) {
  const bytes = await readFile(file.path);
  const { body } = await li<{ value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(
    `${REST}/videos?action=initializeUpload`,
    token,
    { method: "POST", body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } }) },
  );
  const etags: string[] = [];
  for (const part of body.value.uploadInstructions) {
    await heartbeat?.().catch(() => undefined);
    const put = await fetch(part.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes.subarray(part.firstByte, part.lastByte + 1), signal: AbortSignal.timeout(300_000) });
    if (!put.ok) throw new ApiError(`LinkedIn: caricamento del video non riuscito (HTTP ${put.status})`, put.status);
    etags.push(put.headers.get("etag") ?? "");
  }
  await li(`${REST}/videos?action=finalizeUpload`, token, {
    method: "POST",
    body: JSON.stringify({ finalizeUploadRequest: { video: body.value.video, uploadToken: body.value.uploadToken ?? "", uploadedPartIds: etags } }),
  });
  return body.value.video;
}

/** Post a nome della pagina: testo, una o più foto (fino a 20) oppure un video. */
export async function publishPost(o: { orgId: string; token: string; caption: string; media: LinkedInMedia[]; heartbeat?: () => Promise<void> }) {
  const author = orgUrn(o.orgId);
  const images = o.media.filter((m) => m.kind === "image");
  const video = o.media.find((m) => m.kind === "video");
  let content: object | undefined;
  if (video) content = { media: { id: await uploadVideo(author, video, o.token, o.heartbeat) } };
  else if (images.length === 1) content = { media: { id: await uploadImage(author, images[0], o.token) } };
  else if (images.length > 1) {
    const ids: string[] = [];
    for (const img of images) {
      await o.heartbeat?.().catch(() => undefined);
      ids.push(await uploadImage(author, img, o.token));
    }
    content = { multiImage: { images: ids.map((id) => ({ id })) } };
  }
  const { headers } = await li(`${REST}/posts`, o.token, {
    method: "POST",
    body: JSON.stringify({
      author,
      commentary: escapeCommentary(o.caption),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content && { content }),
    }),
  });
  const id = headers.get("x-restli-id") ?? headers.get("x-linkedin-id") ?? "";
  return { externalId: id || `linkedin-${Date.now()}`, permalink: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
}

