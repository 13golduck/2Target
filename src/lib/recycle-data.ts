import "server-only";
import { copyFile } from "node:fs/promises";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialPosts } from "@/db/schema";
import { mediaPath, newStorageKey } from "@/lib/media";
import { engagementScore, selectRecycle, type RecycleCandidate } from "./recycle";

/** Contenuti del cliente da riproporre (vedi ./recycle per le regole). */
export async function recycleSuggestions(clientId: number, now = new Date()) {
  const items = await db
    .select({ id: editorialItems.id, title: editorialItems.title, format: editorialItems.format, evergreen: editorialItems.evergreen })
    .from(editorialItems)
    .where(and(eq(editorialItems.clientId, clientId), eq(editorialItems.status, "pubblicato")));
  if (!items.length) return [];
  const ids = items.map((i) => i.id);
  const pubs = await db
    .select({ itemId: publications.itemId, socialAccountId: publications.socialAccountId, externalId: publications.externalId, publishedAt: publications.publishedAt })
    .from(publications)
    .where(and(inArray(publications.itemId, ids), eq(publications.status, "pubblicata"), isNotNull(publications.externalId)));
  // Statistiche dei post usciti: si collegano alla pubblicazione per profilo e id del post
  const accounts = [...new Set(pubs.map((p) => p.socialAccountId))];
  const posts = accounts.length
    ? await db.select({ socialAccountId: socialPosts.socialAccountId, externalId: socialPosts.externalId, metrics: socialPosts.metrics }).from(socialPosts).where(inArray(socialPosts.socialAccountId, accounts))
    : [];
  const copies = await db
    .select({ from: editorialItems.recycledFromId, createdAt: editorialItems.createdAt })
    .from(editorialItems)
    .where(and(eq(editorialItems.clientId, clientId), isNotNull(editorialItems.recycledFromId)));

  const candidates: RecycleCandidate[] = items.flatMap((i) => {
    const mine = pubs.filter((p) => p.itemId === i.id && p.publishedAt);
    if (!mine.length) return [];
    const scores = mine
      .map((p) => engagementScore(posts.find((x) => x.socialAccountId === p.socialAccountId && x.externalId === p.externalId)?.metrics))
      .filter((x): x is number => x != null);
    const recycled = copies.filter((c) => c.from === i.id).map((c) => c.createdAt.getTime());
    return [
      {
        itemId: i.id,
        title: i.title,
        format: i.format,
        publishedAt: new Date(Math.min(...mine.map((p) => p.publishedAt!.getTime()))),
        evergreen: i.evergreen,
        lastRecycledAt: recycled.length ? new Date(Math.max(...recycled)) : null,
        score: scores.length ? Math.max(...scores) : null,
      },
    ];
  });
  return selectRecycle(candidates, now);
}

/**
 * Copia una scheda uscita in un piano, in bozza e senza data: testi, opzioni e media (i file si duplicano,
 * così la copia resta valida anche se l'originale cambia). Passa dall'approvazione come una scheda nuova.
 */
export async function copyItemForRecycle(itemId: number, planId: number, userId: number) {
  const [orig] = await db.select().from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!orig) throw new Error("Scheda non trovata");
  // Campi propri della scheda originale che NON passano alla copia
   
  const { id, createdAt, updatedAt, planId: _plan, status, scheduledAt, publishedUrl, externalPostId, internalNotes, isPaid, ...content } = orig;
  const media = await db.select().from(mediaAssets).where(eq(mediaAssets.itemId, itemId)).orderBy(mediaAssets.position);
  const [r] = await db.insert(editorialItems).values({
    ...content,
    planId,
    title: `${orig.title.replace(/ · riproposta$/, "")} · riproposta`.slice(0, 255),
    status: "bozza",
    scheduledAt: null,
    isPaid: false,
    recycledFromId: orig.id,
    // Con i media già pronti la produzione è fatta
    productionStatus: media.length ? "pronto" : orig.productionStatus,
    needsClientMaterial: media.length ? false : orig.needsClientMaterial,
  });
  const newId = r.insertId;
  for (const m of media) {
    const ext = m.storageKey.split(".").pop() ?? "bin";
    const key = newStorageKey(ext);
    await copyFile(mediaPath(m.storageKey), mediaPath(key));
     
    const { id: _mid, createdAt: _mc, storageKey: _sk, itemId: _it, createdBy: _cb, ...rest } = m;
    await db.insert(mediaAssets).values({ ...rest, itemId: newId, storageKey: key, createdBy: userId });
  }
  return { id: newId, media: media.length };
}
