// Controlli prima della programmazione che dipendono dai dati dei media (durata, proporzioni, stato della
// conversione) e dal testo (hashtag). Funzioni pure: le usano la scheda, «Programma il piano» e l'invio,
// così un post che Meta, TikTok o LinkedIn rifiuterebbero all'ora di uscita si blocca prima.

export type RuleMedia = {
  kind: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  processState?: string | null;
  processNote?: string | null;
};

// Regole delle piattaforme (documentazione delle API, ottobre 2026)
export const IG_IMAGE_RATIO = { min: 0.8, max: 1.91 }; // da 4:5 a 1,91:1
export const IG_REEL_SECONDS = { min: 3, max: 15 * 60 };
export const IG_STORY_MAX_SECONDS = 60;
export const IG_CAROUSEL_VIDEO_MAX_SECONDS = 60;
export const IG_MAX_HASHTAGS = 30;
export const TIKTOK_MIN_SECONDS = 3;
export const LINKEDIN_VIDEO_SECONDS = { min: 3, max: 30 * 60 };
/** Sotto questo rapporto larghezza/altezza il video è considerato verticale (9:16 = 0,5625). */
export const VERTICAL_RATIO = 0.6;

const ratio = (m: RuleMedia) => (m.width && m.height ? m.width / m.height : null);
const seconds = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} min${n % 60 ? ` ${Math.round(n % 60)} s` : ""}` : `${Math.round(n)} s`);
export const countHashtags = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;

/** Problema bloccante, oppure null. */
export function mediaProblem(platform: string, format: string, media: RuleMedia[], caption: string): string | null {
  if (media.some((m) => m.processState === "in_lavorazione")) return "Il video è ancora in preparazione: riprova tra qualche minuto";
  const failed = media.find((m) => m.processState === "errore");
  if (failed) return `Il video non è stato preparato per i social: ${failed.processNote ?? "ricaricalo"}`;

  const videos = media.filter((m) => m.kind === "video");
  const images = media.filter((m) => m.kind === "image");

  if (platform === "instagram") {
    if (countHashtags(caption) > IG_MAX_HASHTAGS) return `Instagram accetta al massimo ${IG_MAX_HASHTAGS} hashtag (ce ne sono ${countHashtags(caption)})`;
    if (format !== "storia") {
      const wrong = images.find((m) => {
        const r = ratio(m);
        return r != null && (r < IG_IMAGE_RATIO.min - 0.01 || r > IG_IMAGE_RATIO.max + 0.01);
      });
      if (wrong) return `Instagram accetta foto da 4:5 (verticale) a 1,91:1 (orizzontale): questa è ${wrong.width}×${wrong.height}, ritagliala`;
    }
    for (const v of videos) {
      const d = v.durationSec;
      if (d == null) continue;
      if (format === "storia" && d > IG_STORY_MAX_SECONDS) return `Una storia Instagram dura al massimo ${IG_STORY_MAX_SECONDS} s (il video ne dura ${seconds(d)})`;
      if (format === "carosello" && d > IG_CAROUSEL_VIDEO_MAX_SECONDS) return `Nel carosello Instagram i video durano al massimo ${IG_CAROUSEL_VIDEO_MAX_SECONDS} s (questo ${seconds(d)})`;
      if (format !== "storia" && format !== "carosello" && (d < IG_REEL_SECONDS.min || d > IG_REEL_SECONDS.max)) return `Un reel Instagram dura da 3 s a 15 min (il video ne dura ${seconds(d)})`;
    }
  }
  if (platform === "tiktok") {
    const short = videos.find((v) => v.durationSec != null && v.durationSec < TIKTOK_MIN_SECONDS);
    if (short) return `TikTok richiede video di almeno ${TIKTOK_MIN_SECONDS} secondi`;
  }
  if (platform === "linkedin") {
    const bad = videos.find((v) => v.durationSec != null && (v.durationSec < LINKEDIN_VIDEO_SECONDS.min || v.durationSec > LINKEDIN_VIDEO_SECONDS.max));
    if (bad) return `Su LinkedIn un video dura da 3 s a 30 min (questo ${seconds(bad.durationSec!)})`;
  }
  return null;
}

/** Avvisi non bloccanti: il post esce, ma probabilmente non come ci si aspetta. */
export function publishWarnings(platform: string, format: string, media: RuleMedia[]): string[] {
  const out: string[] = [];
  const wantsVertical = format === "reel" || format === "storia" || platform === "tiktok";
  if (wantsVertical) {
    const horizontal = media.find((m) => m.kind === "video" && ratio(m) != null && ratio(m)! > VERTICAL_RATIO);
    if (horizontal) out.push(`Il video è ${horizontal.width}×${horizontal.height}, non verticale 9:16: ${platform === "tiktok" ? "su TikTok" : `nel ${format === "storia" ? "formato storia" : "reel"}`} comparirà con bande o ritagliato`);
  }
  if (format === "storia") {
    const img = media.find((m) => m.kind === "image" && ratio(m) != null && ratio(m)! > VERTICAL_RATIO);
    if (img) out.push(`La foto è ${img.width}×${img.height}: nelle storie rende meglio verticale 9:16 (1080×1920)`);
  }
  return out;
}
