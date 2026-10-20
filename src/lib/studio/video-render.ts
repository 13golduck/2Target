import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ensureMediaDir, mediaPath, newStorageKey, removeMediaFile } from "@/lib/media";
import { probeVideo, renderWithFfmpeg } from "@/lib/media-video";
import { syncPendingPublications } from "@/lib/publishing/sync";
import { totalDuration, VIDEO_SIZES, videoRenderArgs, type VideoEdit } from "./video";

// Composizione del montaggio dello Studio sul server. Il file del post nasce subito «in lavorazione» (la
// pubblicazione lo aspetta) e FFmpeg lavora in sottofondo; a lavoro finito sostituisce il montaggio precedente.

/** Tempo massimo di FFmpeg: almeno 3 minuti, poi 20 secondi per ogni secondo di video (server con 2 thread). */
const renderTimeout = (seconds: number) => Math.max(3 * 60_000, seconds * 20_000);

/**
 * Avvia la composizione. overlays: immagine trasparente di ogni scritta (stesso ordine di edit.texts).
 * Restituisce l'id del file del post, che diventa «pronto» (o «errore») quando FFmpeg ha finito.
 */
export async function startVideoRender(o: { itemId: number; clientId: number; userId: number; edit: VideoEdit; overlays: Buffer[]; tag: string }) {
  const ids = [...new Set([...o.edit.clips.map((c) => c.mediaId), ...(o.edit.music ? [o.edit.music.mediaId] : [])])];
  const files = await db.select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, kind: mediaAssets.kind }).from(mediaAssets).where(inArray(mediaAssets.id, ids));
  const byId = new Map(files.map((f) => [f.id, f]));
  const clipFiles = o.edit.clips.map((c) => byId.get(c.mediaId));
  if (clipFiles.some((f) => !f || f.kind !== "video")) throw new Error("Uno dei video del montaggio non c'è più: ricaricalo");
  const music = o.edit.music ? byId.get(o.edit.music.mediaId) : null;

  const { width, height } = VIDEO_SIZES[o.edit.size];
  await ensureMediaDir();
  const storageKey = newStorageKey("mp4");
  const [row] = await db.insert(mediaAssets).values({
    clientId: o.clientId,
    itemId: o.itemId,
    origin: "video",
    kind: "video",
    mime: "video/mp4",
    fileName: `montaggio-${o.tag}.mp4`,
    storageKey,
    size: 0,
    width,
    height,
    durationSec: totalDuration(o.edit),
    processState: "in_lavorazione",
    processNote: "Montaggio in corso",
    createdBy: o.userId,
  });
  const mediaId = row.insertId;

  // Scritte in una cartella temporanea propria, eliminata a fine lavoro
  const work = path.join(tmpdir(), `2target-montaggio-${randomBytes(6).toString("hex")}`);
  await mkdir(work, { recursive: true });
  const overlayPaths: string[] = [];
  for (const [i, png] of o.overlays.entries()) {
    const p = path.join(work, `scritta-${i}.png`);
    await writeFile(p, png);
    overlayPaths.push(p);
  }

  void (async () => {
    try {
      const clips = [];
      for (const f of clipFiles) {
        const probe = await probeVideo(mediaPath(f!.storageKey));
        clips.push({ path: mediaPath(f!.storageKey), hasAudio: !!probe.audioCodec });
      }
      const output = mediaPath(storageKey);
      await renderWithFfmpeg(videoRenderArgs({ edit: o.edit, clips, overlays: overlayPaths, musicPath: music ? mediaPath(music.storageKey) : null, output }), renderTimeout(totalDuration(o.edit)));
      const probe = await probeVideo(output);
      const size = (await stat(output)).size;
      await db.update(mediaAssets).set({ size, durationSec: probe.durationSec, videoCodec: probe.videoCodec, width: probe.width ?? width, height: probe.height ?? height, processState: "pronto", processNote: null }).where(eq(mediaAssets.id, mediaId));
      await replacePreviousOutputs(o.itemId, mediaId, o.edit);
      await syncPendingPublications(o.itemId, o.userId);
      await audit({ userId: o.userId, category: "contenuti", action: "studio.video_esportato", description: `Montaggio video esportato nel post (${Math.round(totalDuration(o.edit))} s)`, clientId: o.clientId, target: `pubblicazione:${o.itemId}` });
    } catch (e) {
      console.error("[studio] montaggio non riuscito", e);
      await removeMediaFile(storageKey);
      await db
        .update(mediaAssets)
        .set({ processState: "errore", processNote: `Montaggio non riuscito: ${(e instanceof Error ? e.message : String(e)).slice(0, 250)}` })
        .where(eq(mediaAssets.id, mediaId))
        .catch(() => undefined);
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  })();
  return mediaId;
}

/**
 * Il nuovo montaggio prende il posto dei precedenti; i video usati nel montaggio e l'eventuale grafica
 * esportata passano nel materiale (altrimenti uscirebbero insieme al video). Il montaggio va per primo.
 */
async function replacePreviousOutputs(itemId: number, mediaId: number, edit: VideoEdit) {
  const old = await db.select().from(mediaAssets).where(and(eq(mediaAssets.itemId, itemId), eq(mediaAssets.origin, "video"), ne(mediaAssets.id, mediaId)));
  if (old.length) await db.delete(mediaAssets).where(inArray(mediaAssets.id, old.map((m) => m.id)));
  for (const m of old) await removeMediaFile(m.storageKey);
  const used = [...new Set(edit.clips.map((c) => c.mediaId))];
  await db.update(mediaAssets).set({ itemId: null, studioItemId: itemId }).where(and(inArray(mediaAssets.id, used), eq(mediaAssets.itemId, itemId)));
  // Il post esce con il video oppure con la grafica: la grafica esportata torna nel materiale
  await db.update(mediaAssets).set({ itemId: null, studioItemId: itemId }).where(and(eq(mediaAssets.itemId, itemId), eq(mediaAssets.origin, "grafica")));
  await db.update(mediaAssets).set({ position: 0 }).where(eq(mediaAssets.id, mediaId));
}
