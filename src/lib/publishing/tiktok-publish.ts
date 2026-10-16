import "server-only";

import { API, call } from "@/lib/integrations/tiktok";
import type { TikTokCreator, TikTokKind, TikTokOptions } from "./tiktok-rules";

// Pubblicazione su TikTok (Content Posting API, Direct Post, scope video.publish).
// I file non si caricano: TikTok li scarica dall'indirizzo pubblico di 2Target (PULL_FROM_URL),
// per questo il dominio va verificato nel portale sviluppatori di TikTok.
// Finché TikTok non approva l'app (audit), i post escono solo come privati («Solo io»).
// L'invio è in due tempi: si avvia (publish_id, salvato subito) e lo stato si controlla nei giri successivi
// dello scheduler, così un video lento non ferma le altre pubblicazioni e un nuovo tentativo non ripubblica.
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
};

/** Testo per TikTok: il video ha un solo testo (fino a 2.200), le foto un titolo breve (90) e una descrizione. */
function texts(kind: TikTokKind, caption: string) {
  if (kind === "video") return { title: caption.slice(0, 2200) };
  const firstLine = caption.split("\n").find((l) => l.trim())?.trim() ?? "";
  return { title: firstLine.slice(0, 90), description: caption.slice(0, 4000) };
}

/** Avvia la pubblicazione: TikTok scarica ed elabora il file in sottofondo. Restituisce il publish_id. */
export async function startTikTok(i: TikTokPublishInput) {
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
  return publishId;
}

export type TikTokStatus = { state: "done"; postId: string | null } | { state: "failed"; reason: string } | { state: "processing" };

/** Stato di un invio già avviato (un solo controllo). */
export async function tiktokStatus(publishId: string, token: string): Promise<TikTokStatus> {
  const r = await call<{ data: { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] } }>(`${API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ publish_id: publishId }),
  });
  const s = r.data;
  if (s.status === "PUBLISH_COMPLETE") return { state: "done", postId: s.publicaly_available_post_id?.[0] != null ? String(s.publicaly_available_post_id[0]) : null };
  if (s.status === "FAILED") return { state: "failed", reason: `TikTok non ha pubblicato il post: ${FAIL_REASONS[s.fail_reason ?? ""] ?? s.fail_reason ?? "motivo non indicato"}` };
  return { state: "processing" };
}

/** Link al post (i post privati o di foto non hanno un ID pubblico: si tiene il publish_id). */
export const tiktokResult = (publishId: string, postId: string | null, username: string, kind: TikTokKind) => ({
  externalId: postId ?? publishId,
  permalink: postId && username ? `https://www.tiktok.com/@${username}/${kind === "video" ? "video" : "photo"}/${postId}` : null,
});

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
