import "server-only";

import { API, call } from "@/lib/integrations/tiktok";
import { ApiError } from "@/lib/integrations/http";
import type { TikTokCreator, TikTokKind, TikTokOptions } from "./tiktok-rules";

// Pubblicazione su TikTok (Content Posting API, Direct Post, scope video.publish).
// I file non si caricano: TikTok li scarica dall'indirizzo pubblico di 2Target (PULL_FROM_URL),
// per questo il dominio va verificato nel portale sviluppatori di TikTok.
// Finché TikTok non approva l'app (audit), i post escono solo come privati («Solo io»).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" });

/** Il collegamento TikTok ha il permesso di pubblicare? (account collegati prima di attivarlo vanno ricollegati) */
export const canPublishWithScopes = (scopes: string | null | undefined) => (scopes ?? "").split(/[,\s]+/).includes("video.publish");

type CreatorInfo = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

/** Informazioni aggiornate sull'account (TikTok chiede di rileggerle ogni volta che si mostra la scheda di invio). */
export async function creatorInfo(token: string): Promise<TikTokCreator> {
  const r = await call<{ data: CreatorInfo }>(`${API}/post/publish/creator_info/query/`, { method: "POST", headers: auth(token), body: "{}" });
  const d = r.data ?? {};
  return {
    nickname: d.creator_nickname ?? d.creator_username ?? "TikTok",
    username: d.creator_username ?? "",
    avatarUrl: d.creator_avatar_url ?? null,
    privacyOptions: d.privacy_level_options ?? [],
    commentDisabled: !!d.comment_disabled,
    duetDisabled: !!d.duet_disabled,
    stitchDisabled: !!d.stitch_disabled,
    maxVideoSeconds: d.max_video_post_duration_sec ?? null,
  };
}

export type TikTokPublishInput = {
  token: string;
  kind: TikTokKind;
  caption: string;
  options: TikTokOptions;
  /** Indirizzi pubblici dei file (un video, oppure le foto in ordine). */
  urls: string[];
  username: string;
  heartbeat?: () => Promise<void>;
};

/** Testo per TikTok: il video ha un solo testo (fino a 2.200), le foto un titolo breve (90) e una descrizione. */
function texts(kind: TikTokKind, caption: string) {
  if (kind === "video") return { title: caption.slice(0, 2200) };
  const firstLine = caption.split("\n").find((l) => l.trim())?.trim() ?? "";
  return { title: firstLine.slice(0, 90), description: caption.slice(0, 4000) };
}

export async function publishTikTok(i: TikTokPublishInput) {
  const o = i.options;
  const commercial = { brand_content_toggle: o.disclose && o.brandContent, brand_organic_toggle: o.disclose && o.brandOrganic };
  let publishId: string;
  if (i.kind === "video") {
    const r = await call<{ data: { publish_id: string } }>(`${API}/post/publish/video/init/`, {
      method: "POST",
      headers: auth(i.token),
      body: JSON.stringify({
        post_info: {
          ...texts("video", i.caption),
          privacy_level: o.privacyLevel,
          disable_comment: !o.allowComment,
          disable_duet: !o.allowDuet,
          disable_stitch: !o.allowStitch,
          ...commercial,
        },
        source_info: { source: "PULL_FROM_URL", video_url: i.urls[0] },
      }),
    });
    publishId = r.data.publish_id;
  } else {
    const r = await call<{ data: { publish_id: string } }>(`${API}/post/publish/content/init/`, {
      method: "POST",
      headers: auth(i.token),
      body: JSON.stringify({
        post_info: { ...texts("photo", i.caption), privacy_level: o.privacyLevel, disable_comment: !o.allowComment, auto_add_music: true, ...commercial },
        source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: i.urls },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
    });
    publishId = r.data.publish_id;
  }
  const postId = await waitPublished(publishId, i.token, i.heartbeat);
  const permalink = postId && i.username ? `https://www.tiktok.com/@${i.username}/${i.kind === "video" ? "video" : "photo"}/${postId}` : null;
  return { externalId: postId ?? publishId, permalink };
}

/** TikTok scarica ed elabora il file: si controlla lo stato ogni 5 secondi, fino a 10 minuti. */
async function waitPublished(publishId: string, token: string, heartbeat?: () => Promise<void>) {
  for (let n = 0; n < 120; n++) {
    await heartbeat?.().catch(() => undefined);
    const r = await call<{ data: { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] } }>(`${API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ publish_id: publishId }),
    });
    const s = r.data;
    if (s.status === "PUBLISH_COMPLETE") return s.publicaly_available_post_id?.[0] != null ? String(s.publicaly_available_post_id[0]) : null;
    if (s.status === "FAILED") throw new ApiError(`TikTok non ha pubblicato il post: ${FAIL_REASONS[s.fail_reason ?? ""] ?? s.fail_reason ?? "motivo non indicato"}`, 400);
    await sleep(5000);
  }
  throw new ApiError("TikTok sta ancora elaborando il post dopo 10 minuti: controlla il profilo prima di riprovare", 504);
}

const FAIL_REASONS: Record<string, string> = {
  file_format_check_failed: "formato del file non accettato",
  duration_check_failed: "video troppo lungo o troppo corto per l'account",
  frame_rate_check_failed: "frequenza dei fotogrammi non accettata",
  picture_size_check_failed: "dimensioni dell'immagine non accettate",
  internal: "errore interno di TikTok, riprova più tardi",
  video_pull_failed: "TikTok non è riuscito a scaricare il video (dominio verificato?)",
  photo_pull_failed: "TikTok non è riuscito a scaricare le foto (dominio verificato?)",
  publish_cancelled: "pubblicazione annullata",
  auth_removed: "il cliente ha revocato l'accesso: ricollega TikTok",
  spam_risk_too_many_posts: "troppi post oggi su questo account: riprova domani",
  spam_risk_user_banned_from_posting: "l'account non può pubblicare al momento",
  spam_risk_text: "il testo è stato segnalato come spam",
  spam_risk: "TikTok ha bloccato il post come possibile spam",
};

/**
 * Prima di ripetere un invio dall'esito incerto: cerca tra gli ultimi video uno uscito dopo `since`
 * con lo stesso testo (richiede video.list). Null se non lo trova o non si può controllare.
 */
export async function findTikTokTwin(o: { token: string; caption: string; since: Date; username: string }) {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 300);
  const target = norm(o.caption);
  if (!target) return null;
  const r = await call<{ data: { videos: { id: string; create_time: number; share_url?: string; video_description?: string; title?: string }[] } }>(
    `${API}/video/list/?fields=id,create_time,share_url,video_description,title`,
    { method: "POST", headers: auth(o.token), body: JSON.stringify({ max_count: 10 }) },
  );
  const hit = (r.data.videos ?? []).find((v) => v.create_time * 1000 >= o.since.getTime() - 60_000 && [v.video_description, v.title].some((t) => t && norm(t).startsWith(target.slice(0, 80))));
  return hit ? { externalId: hit.id, permalink: hit.share_url ?? (o.username ? `https://www.tiktok.com/@${o.username}/video/${hit.id}` : null) } : null;
}
