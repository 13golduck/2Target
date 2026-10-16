// Regole di TikTok per la pubblicazione (Content Sharing Guidelines): le controlla la scheda nel browser e,
// di nuovo, il server alla programmazione e al momento dell'invio. Modulo senza dipendenze dal server.

/** Impostazioni scelte dal consulente per un post TikTok (salvate sulla pubblicazione). */
export interface TikTokOptions {
  /** Una delle opzioni restituite da TikTok per quell'account: nessun valore predefinito. */
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** «Indica che è un contenuto commerciale». */
  disclose: boolean;
  /** Promuove il brand del cliente stesso (etichetta «Contenuto promozionale»). */
  brandOrganic: boolean;
  /** Contenuto sponsorizzato per conto di terzi (etichetta «Partnership retribuita»). */
  brandContent: boolean;
}

/** Ciò che TikTok dice dell'account al momento (creator_info): va riletto ogni volta che si apre la scheda. */
export interface TikTokCreator {
  nickname: string;
  username: string;
  avatarUrl: string | null;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoSeconds: number | null;
}

export const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Tutti",
  MUTUAL_FOLLOW_FRIENDS: "Amici (follower che segui)",
  FOLLOWER_OF_CREATOR: "Follower",
  SELF_ONLY: "Solo io (privato)",
};

export type TikTokKind = "video" | "photo";

/** Video o foto: TikTok non pubblica storie né post di solo testo. */
export function tiktokKind(format: string, media: { kind: string }[]): TikTokKind | null {
  if (format === "storia" || !media.length) return null;
  if (media.length === 1 && media[0].kind === "video") return "video";
  if (media.every((m) => m.kind === "image")) return "photo";
  return null;
}

/** Controlli sui file e sul testo, come per Meta (checkPublishable). */
export function checkTikTokMedia(format: string, media: { kind: string; mime: string }[], caption: string) {
  if (format === "storia") return "TikTok non pubblica storie da 2Target";
  if (!media.length) return "TikTok richiede un video oppure delle foto";
  const kind = tiktokKind(format, media);
  if (!kind) return "Su TikTok: un solo video, oppure solo foto (non insieme)";
  if (kind === "video" && !["video/mp4", "video/quicktime", "video/webm"].includes(media[0].mime)) return "TikTok accetta video MP4, MOV o WebM";
  if (kind === "photo") {
    if (media.length > 35) return "Un post di foto su TikTok ha al massimo 35 immagini";
    if (media.some((m) => !["image/jpeg", "image/webp"].includes(m.mime))) return "TikTok accetta foto JPEG o WebP";
  }
  if (caption.length > (kind === "video" ? 2200 : 4000)) return `Il testo per TikTok supera i ${kind === "video" ? "2.200" : "4.000"} caratteri`;
  return null;
}

/**
 * Impostazioni valide per quell'account e quel tipo di post? Restituisce l'errore da mostrare, o null.
 * Regole TikTok: visibilità scelta tra quelle consentite, interazioni disattivate dall'account non attivabili,
 * con l'indicazione di contenuto commerciale almeno una delle due voci, e il contenuto sponsorizzato non può essere privato.
 */
export function checkTikTokOptions(o: TikTokOptions | null | undefined, creator: Pick<TikTokCreator, "privacyOptions" | "commentDisabled" | "duetDisabled" | "stitchDisabled">, kind: TikTokKind) {
  if (!o) return "Mancano le impostazioni di TikTok: scegli visibilità e interazioni nella scheda";
  if (!o.privacyLevel) return "Scegli chi può vedere il post su TikTok";
  if (!creator.privacyOptions.includes(o.privacyLevel)) return "La visibilità scelta non è più disponibile per questo account TikTok: sceglila di nuovo";
  if (o.allowComment && creator.commentDisabled) return "L'account TikTok non consente i commenti";
  if (kind === "video" && o.allowDuet && creator.duetDisabled) return "L'account TikTok non consente i duetti";
  if (kind === "video" && o.allowStitch && creator.stitchDisabled) return "L'account TikTok non consente gli stitch";
  if (o.disclose && !o.brandOrganic && !o.brandContent) return "Hai indicato un contenuto commerciale: scegli «Il tuo brand», «Contenuto sponsorizzato» o entrambi";
  if (o.disclose && o.brandContent && o.privacyLevel === "SELF_ONLY") return "Un contenuto sponsorizzato non può essere privato: scegli un'altra visibilità";
  return null;
}

/** Normalizza ciò che arriva dal browser (solo i campi attesi, booleani veri). */
export function parseTikTokOptions(raw: unknown): TikTokOptions | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const disclose = r.disclose === true;
  return {
    privacyLevel: typeof r.privacyLevel === "string" ? r.privacyLevel.slice(0, 40) : "",
    allowComment: r.allowComment === true,
    allowDuet: r.allowDuet === true,
    allowStitch: r.allowStitch === true,
    disclose,
    brandOrganic: disclose && r.brandOrganic === true,
    brandContent: disclose && r.brandContent === true,
  };
}

/** Etichetta che TikTok mostrerà sul post, da far vedere prima dell'invio. */
export function tiktokLabel(o: Pick<TikTokOptions, "disclose" | "brandOrganic" | "brandContent">) {
  if (!o.disclose) return null;
  if (o.brandContent) return "Partnership retribuita";
  if (o.brandOrganic) return "Contenuto promozionale";
  return null;
}
