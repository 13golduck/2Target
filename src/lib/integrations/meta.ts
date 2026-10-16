import "server-only";

import { META, callbackUrl } from "./config";
import { getJson, qs } from "./http";

// Meta (Facebook + Instagram) via Graph API.
// Flusso: login Facebook → token utente a lunga durata (~60 giorni) → pagine gestite con i loro
// token (non scadono) → account Instagram professionale collegato a ogni pagina.

/** Profili Instagram collegati con il login Instagram (senza Pagina Facebook): stesse chiamate su graph.instagram.com. */
export type GraphHost = "facebook" | "instagram";
const graphOn =
  (host: GraphHost) =>
  (path: string, params: Record<string, string | number | undefined> = {}) =>
    `https://graph.${host}.com/${META.version}/${path}?${qs(params)}`;
const graph = graphOn("facebook");

export function authorizeUrl(state: string, request?: Request) {
  return `https://www.facebook.com/${META.version}/dialog/oauth?${qs({
    client_id: META.appId,
    redirect_uri: callbackUrl("meta", request),
    state,
    response_type: "code",
    // Facebook Login for Business: con la configurazione i permessi sono quelli scelti in Meta for Developers
    ...(META.configId ? { config_id: META.configId, override_default_response_type: "true" } : { scope: META.scopes.join(",") }),
  })}`;
}

export async function exchangeCode(code: string, request?: Request) {
  const short = await getJson<{ access_token: string }>(
    graph("oauth/access_token", {
      client_id: META.appId,
      client_secret: META.appSecret,
      redirect_uri: callbackUrl("meta", request),
      code,
    }),
  );
  const long = await getJson<{ access_token: string; expires_in?: number }>(
    graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: META.appId,
      client_secret: META.appSecret,
      fb_exchange_token: short.access_token,
    }),
  );
  const me = await getJson<{ id: string; name: string }>(graph("me", { fields: "id,name", access_token: long.access_token }));
  return {
    accessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : new Date(Date.now() + 60 * 86_400_000),
    externalUserId: me.id,
    accountName: me.name,
  };
}

/**
 * Utente di sistema del portfolio business di Golduck (Meta Business Suite → Impostazioni → Utenti di sistema).
 * Il token non scade e non dipende dalla persona che ha collegato: le Pagine e gli account Instagram che i clienti
 * condividono con il portfolio Golduck e che vengono assegnati all'utente di sistema si leggono con me/accounts.
 */
export async function systemUser(token: string) {
  const me = await getJson<{ id: string; name: string }>(graph("me", { fields: "id,name", access_token: token }));
  // Scadenza del token: 0 = mai (controllo con il token dell'app, se le chiavi ci sono)
  let expiresAt: Date | null = null;
  if (META.appId && META.appSecret) {
    const dbg = await getJson<{ data?: { expires_at?: number; is_valid?: boolean } }>(
      graph("debug_token", { input_token: token, access_token: `${META.appId}|${META.appSecret}` }),
    ).catch(() => null);
    if (dbg?.data?.is_valid === false) throw new Error("Il token dell'utente di sistema non è valido: generane uno nuovo in Meta Business Suite");
    if (dbg?.data?.expires_at) expiresAt = new Date(dbg.data.expires_at * 1000);
  }
  return { id: me.id, name: me.name, expiresAt };
}

export interface MetaAsset {
  kind: "facebook" | "instagram";
  externalId: string;
  handle: string;
  name: string;
  pictureUrl?: string;
  pageToken: string;
}

type PagesResponse = {
  data: {
    id: string;
    name: string;
    access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
  }[];
  paging?: { next?: string };
};

/** Pagine Facebook e account Instagram che l'utente gestisce. */
export async function listAssets(userToken: string): Promise<MetaAsset[]> {
  const out: MetaAsset[] = [];
  let url: string | undefined = graph("me/accounts", {
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: 100,
    access_token: userToken,
  });
  while (url) {
    const res: PagesResponse = await getJson<PagesResponse>(url);
    for (const p of res.data) {
      out.push({ kind: "facebook", externalId: p.id, handle: p.name, name: p.name, pictureUrl: p.picture?.data?.url, pageToken: p.access_token });
      const ig = p.instagram_business_account;
      if (ig) {
        out.push({
          kind: "instagram",
          externalId: ig.id,
          handle: ig.username ?? ig.id,
          name: ig.name ?? ig.username ?? "Instagram",
          pictureUrl: ig.profile_picture_url,
          pageToken: p.access_token,
        });
      }
    }
    url = res.paging?.next;
  }
  return out;
}

// ── Sincronizzazione ─────────────────────────────────────────────────

export interface DailyValue {
  day: string;
  metric: string;
  value: number;
}
export interface PostData {
  externalId: string;
  mediaType: string;
  permalink?: string;
  caption?: string;
  thumbnailUrl?: string;
  publishedAt: Date;
  metrics: Record<string, number>;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Instagram: follower di oggi, reach giornaliera degli ultimi 28 giorni, ultimi 50 post con statistiche. */
export async function syncInstagram(igId: string, token: string, host: GraphHost = "facebook") {
  const graph = graphOn(host);
  const daily: DailyValue[] = [];
  const profile = await getJson<{ followers_count?: number; media_count?: number }>(
    graph(igId, { fields: "followers_count,media_count", access_token: token }),
  );
  if (profile.followers_count != null) daily.push({ day: today(), metric: "followers", value: profile.followers_count });
  if (profile.media_count != null) daily.push({ day: today(), metric: "posts_total", value: profile.media_count });

  const until = Math.floor(Date.now() / 1000);
  const since = until - 28 * 86_400;
  try {
    const reach = await getJson<{ data: { name: string; values: { value: number; end_time: string }[] }[] }>(
      graph(`${igId}/insights`, { metric: "reach", period: "day", since, until, access_token: token }),
    );
    for (const m of reach.data) for (const v of m.values) daily.push({ day: v.end_time.slice(0, 10), metric: m.name, value: v.value });
  } catch {
    // Alcuni account (pochi follower o appena convertiti) non hanno insight giornalieri
  }

  type Media = { id: string; caption?: string; media_type: string; media_product_type?: string; permalink?: string; thumbnail_url?: string; media_url?: string; timestamp: string; like_count?: number; comments_count?: number };
  const media = await getJson<{ data: Media[] }>(
    graph(`${igId}/media`, {
      fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
      limit: 50,
      access_token: token,
    }),
  );

  const posts: PostData[] = [];
  for (const m of media.data) {
    const metrics: Record<string, number> = { likes: m.like_count ?? 0, comments: m.comments_count ?? 0 };
    // Metriche attuali di Instagram (impressions e plays sono state dismesse da Meta)
    for (const set of ["reach,views,saved,shares,total_interactions", "reach,saved,shares", "reach"]) {
      try {
        const ins = await getJson<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
          graph(`${m.id}/insights`, { metric: set, access_token: token }),
        );
        for (const d of ins.data) metrics[d.name] = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
        break;
      } catch {
        // metrica non disponibile per questo tipo di contenuto: si riprova con meno metriche
      }
    }
    posts.push({
      externalId: m.id,
      mediaType: m.media_product_type === "REELS" ? "REEL" : m.media_type,
      permalink: m.permalink,
      caption: m.caption,
      thumbnailUrl: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url : undefined),
      publishedAt: new Date(m.timestamp),
      metrics,
    });
  }
  return { daily, posts };
}

/** Pagina Facebook: follower di oggi e ultimi 25 post con reazioni, commenti e condivisioni. */
export async function syncFacebookPage(pageId: string, token: string) {
  const daily: DailyValue[] = [];
  const page = await getJson<{ followers_count?: number; fan_count?: number }>(graph(pageId, { fields: "followers_count,fan_count", access_token: token }));
  const followers = page.followers_count ?? page.fan_count;
  if (followers != null) daily.push({ day: today(), metric: "followers", value: followers });

  type FbPost = { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string; shares?: { count: number }; reactions?: { summary?: { total_count: number } }; comments?: { summary?: { total_count: number } } };
  const postsWith = (fields: string) => getJson<{ data: FbPost[] }>(graph(`${pageId}/posts`, { fields, limit: 25, access_token: token }));
  let res: { data: FbPost[] };
  try {
    res = await postsWith("id,message,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)");
  } catch (e) {
    // Reazioni e commenti richiedono pages_read_user_content: senza, si leggono comunque i post (e le condivisioni)
    if (!(e instanceof Error && /\(#10\)|pages_read_user_content/.test(e.message))) throw e;
    res = await postsWith("id,message,created_time,permalink_url,full_picture,shares");
  }
  const posts: PostData[] = res.data.map((p) => {
    const likes = p.reactions?.summary?.total_count ?? 0;
    const comments = p.comments?.summary?.total_count ?? 0;
    const shares = p.shares?.count ?? 0;
    return {
      externalId: p.id,
      mediaType: "POST",
      permalink: p.permalink_url,
      caption: p.message,
      thumbnailUrl: p.full_picture,
      publishedAt: new Date(p.created_time),
      metrics: { likes, comments, shares, total_interactions: likes + comments + shares },
    };
  });
  return { daily, posts };
}
