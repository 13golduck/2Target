import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { readFile, writeFile } from "node:fs/promises";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { generateImage, type ReferenceImage } from "@/lib/ai/image-gen";
import { ensureMediaDir, mediaPath, newStorageKey } from "@/lib/media";
import type { AspectRatio } from "./image-tools";

// Immagini AI dello Studio: le foto di riferimento si leggono dal disco, l'immagine creata finisce nel
// materiale del progetto (non nel post: entra nel post solo dentro la grafica o se la si sposta).

/** Foto del progetto da usare come riferimento: solo immagini di questo progetto, nell'ordine chiesto. */
async function referencesFor(itemId: number, ids: number[]): Promise<ReferenceImage[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: mediaAssets.id, mime: mediaAssets.mime, storageKey: mediaAssets.storageKey })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, ids), eq(mediaAssets.kind, "image"), or(eq(mediaAssets.itemId, itemId), eq(mediaAssets.studioItemId, itemId))));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const refs: ReferenceImage[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r || (r.mime !== "image/jpeg" && r.mime !== "image/png")) continue;
    refs.push({ mime: r.mime, base64: (await readFile(mediaPath(r.storageKey))).toString("base64") });
  }
  return refs;
}

/** Crea (o modifica da riferimenti) un'immagine e la salva nel materiale. Restituisce l'id del file e il costo. */
export async function createStudioImage(o: { itemId: number; clientId: number; userId: number; prompt: string; referenceIds: number[]; aspectRatio: AspectRatio }) {
  const references = await referencesFor(o.itemId, o.referenceIds);
  const image = await generateImage({ clientId: o.clientId, prompt: o.prompt, aspectRatio: o.aspectRatio, references });
  await ensureMediaDir();
  const storageKey = newStorageKey(image.mime === "image/png" ? "png" : "jpg");
  await writeFile(mediaPath(storageKey), image.bytes);
  const [r] = await db.insert(mediaAssets).values({
    clientId: o.clientId,
    itemId: null,
    studioItemId: o.itemId,
    origin: "ai",
    kind: "image",
    mime: image.mime,
    fileName: `${references.length ? "modifica" : "immagine"}-ai-${storageKey.slice(0, 6)}.${image.mime === "image/png" ? "png" : "jpg"}`,
    storageKey,
    size: image.bytes.length,
    width: image.width,
    height: image.height,
    createdBy: o.userId,
  });
  return { mediaId: r.insertId, costEur: image.costEur, edited: references.length > 0 };
}
