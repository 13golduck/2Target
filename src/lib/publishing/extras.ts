// Opzioni di pubblicazione per Instagram e Facebook: primo commento, coautori (collaboratori) e sede.
// Funzioni pure: le usano il salvataggio della scheda, la programmazione e i controlli.

import type { PublishExtras } from "@/db/schema";

export const MAX_COLLABORATORS = 3;
export const MAX_COMMENT_CHARS = 2200;
const USERNAME = /^[a-z0-9._]{1,30}$/;

/** Nomi utente Instagram dal testo libero («@studio.rossi, mario_bianchi»): puliti, senza doppioni, al massimo 3. */
export function parseCollaborators(raw: string | null | undefined) {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    const name = part.trim().replace(/^@/, "").toLowerCase();
    if (!name) continue;
    if (!USERNAME.test(name)) invalid.push(part.trim());
    else if (!valid.includes(name)) valid.push(name);
  }
  return { valid: valid.slice(0, MAX_COLLABORATORS), invalid, tooMany: valid.length > MAX_COLLABORATORS };
}

type ItemExtras = { firstComment: string | null; collaborators: string[] | null; tagLocation: boolean };

/**
 * Opzioni che valgono per quel profilo e quel formato (null se nessuna):
 * Instagram tutte tranne nelle storie; Facebook solo il primo commento; le altre piattaforme nessuna.
 */
export function extrasFor(platform: string, format: string, item: ItemExtras): PublishExtras | null {
  if (format === "storia" || (platform !== "instagram" && platform !== "facebook")) return null;
  const out: PublishExtras = {};
  const comment = item.firstComment?.trim();
  if (comment) out.firstComment = comment;
  if (platform === "instagram") {
    if (item.collaborators?.length) out.collaborators = item.collaborators.slice(0, MAX_COLLABORATORS);
    if (item.tagLocation) out.tagLocation = true;
  }
  return Object.keys(out).length ? out : null;
}

/** Problema bloccante sulle opzioni, oppure null. */
export function extrasProblem(platform: string, extras: PublishExtras | null) {
  if (!extras) return null;
  if (extras.firstComment && extras.firstComment.length > MAX_COMMENT_CHARS) return "Il primo commento supera i 2.200 caratteri";
  if (platform === "instagram" && extras.firstComment) {
    const tags = (extras.firstComment.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
    if (tags > 30) return `Instagram accetta al massimo 30 hashtag anche nel primo commento (ce ne sono ${tags})`;
  }
  return null;
}
