import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { appUrl } from "@/lib/integrations/config";

// Foto e video delle pubblicazioni. Stanno su disco FUORI dalla cartella dell'app (che ogni deploy sovrascrive):
// MEDIA_DIR se impostata, altrimenti ../private/2target-media accanto a httpdocs (cartella privata di Plesk).
// Meta scarica i file da un indirizzo pubblico con firma: /api/media/<chiave>.<firma>

export const MEDIA_LIMITS = {
  image: 8 * 1024 * 1024, // Instagram: JPEG fino a 8 MB
  // Plesk (nginx) di solito accetta caricamenti fino a 128 MB
  video: 100 * 1024 * 1024,
  // Musica di sottofondo per i montaggi dello Studio
  audio: 30 * 1024 * 1024,
};

export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
/** Solo materiale dello Studio: la musica non si pubblica da sola. */
export const AUDIO_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a" };

export function mediaDir() {
  return process.env.MEDIA_DIR || path.resolve(process.cwd(), "..", "private", "2target-media");
}

export async function ensureMediaDir() {
  await mkdir(mediaDir(), { recursive: true });
  return mediaDir();
}

export const newStorageKey = (ext: string) => `${randomBytes(18).toString("base64url")}.${ext}`;

export const mediaPath = (storageKey: string) => {
  if (!/^[\w-]+\.(jpg|png|mp4|mov|mp3|m4a)$/.test(storageKey)) throw new Error("Nome file non valido");
  return path.join(mediaDir(), storageKey);
};

export async function removeMediaFile(storageKey: string) {
  await rm(mediaPath(storageKey), { force: true }).catch(() => undefined);
}

export async function mediaFileInfo(storageKey: string) {
  return stat(mediaPath(storageKey));
}

export const mediaStream = (storageKey: string, range?: { start: number; end: number }) => createReadStream(mediaPath(storageKey), range);

// Firma dell'indirizzo pubblico: chi non ha il link non può scaricare i file
function sign(storageKey: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET non impostato");
  return createHmac("sha256", secret).update(`media:${storageKey}`).digest("base64url").slice(0, 22);
}

export const verifyMediaSignature = (storageKey: string, signature: string) => {
  const expected = sign(storageKey);
  return signature.length === expected.length && signature === expected;
};

/** Indirizzo pubblico del file (lo usa Meta per scaricarlo). */
export const publicMediaUrl = (storageKey: string) => `${appUrl()}/api/media/${sign(storageKey)}/${storageKey}`;

/** Indirizzo interno per le anteprime nell'app (richiede l'accesso). */
export const previewMediaUrl = (id: number) => `/api/media/anteprima/${id}`;
