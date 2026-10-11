import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications } from "@/db/schema";
import { audit } from "@/lib/audit";

/**
 * Le pubblicazioni ancora programmate seguono la scheda: stessa data, testo, formato e file.
 * Se la scheda non è più approvata, si annullano (non deve uscire nulla che non sia approvato).
 */
export async function syncPendingPublications(itemId: number, userId: number) {
  const pending = await db
    .select({ id: publications.id })
    .from(publications)
    .where(and(eq(publications.itemId, itemId), eq(publications.status, "programmata")));
  if (!pending.length) return;
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, itemId));
  const ids = pending.map((p) => p.id);
  if (!item || (item.status !== "approvato" && item.status !== "pubblicato") || !item.scheduledAt) {
    await db.update(publications).set({ status: "annullata", error: "Annullata: la scheda non è più approvata o non ha una data" }).where(inArray(publications.id, ids));
    await audit({ userId, category: "contenuti", action: "pubblicazione.annullata", description: `Annullate ${ids.length} pubblicazioni programmate: la scheda «${item?.title ?? itemId}» non è più approvata`, clientId: item?.clientId, target: `pubblicazione:${itemId}` });
    return;
  }
  const media = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.itemId, itemId)).orderBy(mediaAssets.position);
  await db
    .update(publications)
    .set({
      scheduledAt: item.scheduledAt,
      format: item.format,
      caption: [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join("\n\n"),
      mediaIds: media.map((m) => m.id),
    })
    .where(inArray(publications.id, ids));
}
