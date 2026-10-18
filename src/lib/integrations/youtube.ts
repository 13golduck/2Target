import "server-only";

import { getJson, qs } from "./http";
import type { DailyValue, PostData } from "./meta";

// YouTube via il collegamento Google (permessi youtube.readonly e yt-analytics.readonly).
// Canale: iscritti, visualizzazioni e numero di video; ultimi video con visualizzazioni, like e commenti;
// andamento giornaliero da YouTube Analytics (visualizzazioni, minuti guardati, iscritti guadagnati e persi).

const API = "https://www.googleapis.com/youtube/v3";
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

type Channel = {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

export type YouTubeAsset = { kind: "youtube"; externalId: string; handle: string; name: string; pictureUrl?: string };

/** Canali YouTube dell'account Google collegato (anche quelli gestiti come marchio). */
export async function listChannels(token: string): Promise<YouTubeAsset[]> {
  const r = await getJson<{ items?: Channel[] }>(`${API}/channels?${qs({ part: "snippet", mine: "true", maxResults: 50 })}`, auth(token));
  return (r.items ?? []).map((c) => ({
    kind: "youtube",
    externalId: c.id,
    handle: c.snippet?.customUrl ?? c.id,
    name: `${c.snippet?.title ?? "Canale YouTube"} · YouTube`,
    pictureUrl: c.snippet?.thumbnails?.default?.url,
  }));
}

/** Durata ISO 8601 (PT1M30S) → secondi: serve a distinguere gli Shorts (fino a 3 minuti). */
export function isoDurationSeconds(iso: string | undefined) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export async function syncYouTube(token: string, channelId: string) {
  const daily: DailyValue[] = [];
  const posts: PostData[] = [];
  const today = ymd(new Date());

  const ch = await getJson<{ items?: Channel[] }>(`${API}/channels?${qs({ part: "snippet,statistics,contentDetails", id: channelId })}`, auth(token));
  const c = ch.items?.[0];
  if (!c) throw new Error("Canale YouTube non trovato: forse l'account collegato non lo gestisce più");
  const s = c.statistics ?? {};
  if (s.subscriberCount != null && !s.hiddenSubscriberCount) daily.push({ day: today, metric: "followers", value: Number(s.subscriberCount) });
  if (s.videoCount != null) daily.push({ day: today, metric: "posts_total", value: Number(s.videoCount) });
  if (s.viewCount != null) daily.push({ day: today, metric: "views_total", value: Number(s.viewCount) });

  // Ultimi 30 video della playlist dei caricamenti, con statistiche
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) {
    const pl = await getJson<{ items?: { contentDetails?: { videoId?: string } }[] }>(
      `${API}/playlistItems?${qs({ part: "contentDetails", playlistId: uploads, maxResults: 30 })}`,
      auth(token),
    );
    const ids = (pl.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
    if (ids.length) {
      const v = await getJson<{
        items?: {
          id: string;
          snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url: string }> };
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails?: { duration?: string };
        }[];
      }>(`${API}/videos?${qs({ part: "snippet,statistics,contentDetails", id: ids.join(",") })}`, auth(token));
      for (const x of v.items ?? []) {
        const seconds = isoDurationSeconds(x.contentDetails?.duration);
        posts.push({
          externalId: x.id,
          mediaType: seconds > 0 && seconds <= 180 ? "SHORT" : "VIDEO",
          permalink: seconds > 0 && seconds <= 180 ? `https://www.youtube.com/shorts/${x.id}` : `https://www.youtube.com/watch?v=${x.id}`,
          caption: x.snippet?.title,
          thumbnailUrl: x.snippet?.thumbnails?.medium?.url ?? x.snippet?.thumbnails?.default?.url,
          publishedAt: new Date(x.snippet?.publishedAt ?? Date.now()),
          metrics: { views: Number(x.statistics?.viewCount ?? 0), likes: Number(x.statistics?.likeCount ?? 0), comments: Number(x.statistics?.commentCount ?? 0) },
        });
      }
    }
  }

  // Andamento giornaliero degli ultimi 28 giorni (YouTube Analytics; i dati arrivano con 2-3 giorni di ritardo)
  try {
    const a = await getJson<{ columnHeaders?: { name: string }[]; rows?: (string | number)[][] }>(
      `https://youtubeanalytics.googleapis.com/v2/reports?${qs({
        ids: `channel==${channelId}`,
        startDate: ymd(daysAgo(30)),
        endDate: ymd(daysAgo(1)),
        metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
        dimensions: "day",
        sort: "day",
      })}`,
      auth(token),
    );
    const cols = (a.columnHeaders ?? []).map((h) => h.name);
    const map: Record<string, string> = { views: "views", estimatedMinutesWatched: "watch_minutes", subscribersGained: "subscribers_gained", subscribersLost: "subscribers_lost" };
    for (const row of a.rows ?? []) {
      const day = String(row[cols.indexOf("day")]);
      for (const [col, metric] of Object.entries(map)) {
        const i = cols.indexOf(col);
        if (i >= 0) daily.push({ day, metric, value: Number(row[i] ?? 0) });
      }
    }
  } catch {
    // Canali appena creati o senza dati: le statistiche giornaliere arrivano quando YouTube le rende disponibili
  }

  return { daily, posts };
}
