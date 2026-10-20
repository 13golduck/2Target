import { and, eq, max } from "drizzle-orm";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { db } from "@/db";
import { editorialItems, mediaAssets } from "@/db/schema";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prepareVideoAsset } from "@/lib/media-video";
import { syncPendingPublications } from "@/lib/publishing/sync";
import { ensureMediaDir, IMAGE_TYPES, MEDIA_LIMITS, mediaPath, newStorageKey, removeMediaFile, VIDEO_TYPES } from "@/lib/media";

// Caricamento di una foto o di un video per una scheda del piano. Il file arriva "grezzo" nel corpo della richiesta
// (niente moduli: i video possono essere grandi) e si scrive su disco a pezzi, con limite di dimensione.
//   POST /api/media/carica?scheda=<id>&nome=<nome file>&w=<larghezza>&h=<altezza>   Content-Type: image/jpeg | video/mp4 …

export const maxDuration = 300;

export async function POST(request: Request) {
  const me = await requireWriter();
  const url = new URL(request.url);
  const itemId = Number(url.searchParams.get("scheda"));
  const [item] = await db.select({ id: editorialItems.id, clientId: editorialItems.clientId }).from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) return Response.json({ error: "Scheda non trovata" }, { status: 404 });
  // Si carica solo sulle schede dei clienti che si possono vedere
  await requireClientAccess(item.clientId);

  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const kind = IMAGE_TYPES[mime] ? "image" : VIDEO_TYPES[mime] ? "video" : null;
  if (!kind) return Response.json({ error: "Formato non supportato: foto JPEG o PNG, video MP4 o MOV" }, { status: 415 });
  const limit = MEDIA_LIMITS[kind];
  const declared = Number(request.headers.get("content-length"));
  if (declared > limit) return Response.json({ error: `File troppo grande: massimo ${Math.round(limit / 1024 / 1024)} MB` }, { status: 413 });
  if (!request.body) return Response.json({ error: "File vuoto" }, { status: 400 });

  await ensureMediaDir();
  const storageKey = newStorageKey(IMAGE_TYPES[mime] ?? VIDEO_TYPES[mime]);
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > limit) cb(new Error("TOO_BIG"));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), counter, createWriteStream(mediaPath(storageKey)));
  } catch (e) {
    await removeMediaFile(storageKey);
    if ((e as Error).message === "TOO_BIG") return Response.json({ error: `File troppo grande: massimo ${Math.round(limit / 1024 / 1024)} MB` }, { status: 413 });
    throw e;
  }
  if (!size) {
    await removeMediaFile(storageKey);
    return Response.json({ error: "File vuoto" }, { status: 400 });
  }

  const dim = (k: string) => {
    const n = Number(url.searchParams.get(k));
    return Number.isInteger(n) && n > 0 && n < 20000 ? n : null;
  };
  const [{ last }] = await db.select({ last: max(mediaAssets.position) }).from(mediaAssets).where(and(eq(mediaAssets.itemId, itemId)));
  const fileName = (url.searchParams.get("nome") ?? "file").slice(0, 200);
  const [r] = await db.insert(mediaAssets).values({
    clientId: item.clientId,
    itemId,
    kind,
    mime,
    fileName,
    storageKey,
    size,
    width: dim("w"),
    height: dim("h"),
    position: (last ?? -1) + 1,
    // I video restano «in lavorazione» finché FFmpeg non li ha controllati (e convertiti se serve)
    processState: kind === "video" ? "in_lavorazione" : "pronto",
    createdBy: me.id,
  });
  await audit({ userId: me.id, category: "contenuti", action: "media.caricato", description: `Caricato ${kind === "image" ? "l'immagine" : "il video"} «${fileName}» (${(size / 1024 / 1024).toFixed(1)} MB)`, clientId: item.clientId, target: `pubblicazione:${itemId}` });
  await syncPendingPublications(itemId, me.id);
  // Controllo e conversione del video in sottofondo: la risposta al browser non aspetta FFmpeg
  if (kind === "video") void prepareVideoAsset(r.insertId);
  return Response.json({ ok: true, id: r.insertId, processing: kind === "video" });
}
