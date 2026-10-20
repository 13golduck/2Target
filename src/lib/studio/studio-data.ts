import "server-only";
import { and, asc, desc, eq, inArray, max, or } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, PLATFORMS, socialAccounts, studioMessages, studioVersions } from "@/db/schema";
import { syncPendingPublications } from "@/lib/publishing/sync";
import { PUBLISHABLE } from "@/lib/publishing/targets";
import { stateFromItem, StudioStateSchema, type StudioState } from "./state";

// Lettura e scrittura del progetto dello Studio. Le versioni si numerano dentro una transazione con la scheda
// bloccata: due finestre aperte sullo stesso post non producono due «versione 4».

export type Author = "ai" | "utente";

/** Versione in uso: la più alta. Se la scheda non ne ha ancora, lo stato si ricava dalla scheda stessa. */
export async function currentVersion(itemId: number) {
  const [v] = await db.select().from(studioVersions).where(eq(studioVersions.itemId, itemId)).orderBy(desc(studioVersions.n)).limit(1);
  if (v) return { n: v.n, state: StudioStateSchema.parse(v.state) };
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) throw new Error("Pubblicazione non trovata");
  return { n: 0, state: stateFromItem(item) };
}

/**
 * Salva una nuova versione e allinea la scheda (titolo, testo, hashtag, formato), così programmazione,
 * approvazione e pubblicazione vedono sempre l'ultima versione. Restituisce il numero della versione.
 */
export async function addVersion(o: { itemId: number; author: Author; userId: number; summary: string; state: StudioState }) {
  const state = StudioStateSchema.parse(o.state);
  const n = await db.transaction(async (tx) => {
    await tx.select({ id: editorialItems.id }).from(editorialItems).where(eq(editorialItems.id, o.itemId)).for("update");
    const [row] = await tx.select({ last: max(studioVersions.n) }).from(studioVersions).where(eq(studioVersions.itemId, o.itemId));
    const next = (row?.last ?? 0) + 1;
    await tx.insert(studioVersions).values({ itemId: o.itemId, n: next, author: o.author, userId: o.userId, summary: o.summary.slice(0, 255), state });
    await tx
      .update(editorialItems)
      .set({ title: state.title, caption: state.caption || null, hashtags: state.hashtags || null, format: state.format })
      .where(eq(editorialItems.id, o.itemId));
    return next;
  });
  // Le pubblicazioni già programmate prendono il testo nuovo (come quando si salva la scheda)
  await syncPendingPublications(o.itemId, o.userId);
  return n;
}

export async function addMessage(o: { itemId: number; role: Author; text: string; userId: number; versionN?: number; costEur?: number }) {
  await db.insert(studioMessages).values({ itemId: o.itemId, role: o.role, text: o.text, userId: o.userId, versionN: o.versionN ?? null, costEur: o.costEur ?? null });
}

export async function messagesOf(itemId: number) {
  return db.select().from(studioMessages).where(eq(studioMessages.itemId, itemId)).orderBy(asc(studioMessages.id));
}

export async function versionsOf(itemId: number) {
  return db
    .select({ n: studioVersions.n, author: studioVersions.author, summary: studioVersions.summary, createdAt: studioVersions.createdAt })
    .from(studioVersions)
    .where(eq(studioVersions.itemId, itemId))
    .orderBy(desc(studioVersions.n));
}

export async function versionState(itemId: number, n: number) {
  const [v] = await db.select({ state: studioVersions.state }).from(studioVersions).where(and(eq(studioVersions.itemId, itemId), eq(studioVersions.n, n)));
  return v ? StudioStateSchema.parse(v.state) : null;
}

/** File del progetto: quelli del post (inPost) e il materiale di lavoro dello Studio. */
export async function mediaOf(itemId: number) {
  const rows = await db
    .select({
      id: mediaAssets.id,
      itemId: mediaAssets.itemId,
      kind: mediaAssets.kind,
      origin: mediaAssets.origin,
      fileName: mediaAssets.fileName,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationSec: mediaAssets.durationSec,
      processState: mediaAssets.processState,
    })
    .from(mediaAssets)
    .where(or(eq(mediaAssets.itemId, itemId), eq(mediaAssets.studioItemId, itemId)))
    .orderBy(asc(mediaAssets.position), asc(mediaAssets.id));
  return rows.map(({ itemId: owner, ...m }) => ({ ...m, inPost: owner === itemId }));
}

/** Piattaforme su cui il cliente ha profili per pubblicare (per il tono e la lunghezza del testo). */
export async function clientPlatforms(clientId: number) {
  const rows = await db.selectDistinct({ platform: socialAccounts.platform }).from(socialAccounts).where(and(eq(socialAccounts.clientId, clientId), inArray(socialAccounts.platform, [...PUBLISHABLE])));
  return rows.map((r) => r.platform as string).filter((p): p is (typeof PLATFORMS)[number] => (PLATFORMS as readonly string[]).includes(p));
}
