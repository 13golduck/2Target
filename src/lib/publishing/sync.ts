import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialAccounts, users } from "@/db/schema";
import { canPublishWith } from "@/lib/roles";
import { audit } from "@/lib/audit";
import { checkPublishable } from "./meta-publish";

type Item = typeof editorialItems.$inferSelect;

/** Cosa si pubblica di una scheda: didascalia + hashtag, formato e file in ordine. */
export async function snapshotOf(item: Item) {
  const media = await db.select().from(mediaAssets).where(eq(mediaAssets.itemId, item.id)).orderBy(mediaAssets.position);
  return { caption: [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join("\n\n"), format: item.format, media };
}

/**
 * Le pubblicazioni ancora programmate seguono la scheda: stessa data, testo, formato e file.
 * Regole di sicurezza:
 * - scheda non più approvata (o senza data) → annullate;
 * - data spostata nel passato → NON escono da sole: errore, si riprogramma o si conferma con «Riprova»;
 * - dopo la modifica il contenuto non è più pubblicabile su quel profilo (file tolti, troppi file…) → bloccate con il motivo;
 *   in particolare un post con foto non diventa mai "solo testo" perché qualcuno ha tolto i file.
 */
export async function syncPendingPublications(itemId: number, userId: number) {
  const pending = await db
    .select({ id: publications.id, scheduledAt: publications.scheduledAt, mediaIds: publications.mediaIds, caption: publications.caption, format: publications.format, platform: socialAccounts.platform, handle: socialAccounts.handle })
    .from(publications)
    .innerJoin(socialAccounts, eq(socialAccounts.id, publications.socialAccountId))
    .where(and(eq(publications.itemId, itemId), eq(publications.status, "programmata")));
  if (!pending.length) return;
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, itemId));
  const ids = pending.map((p) => p.id);
  if (!item || (item.status !== "approvato" && item.status !== "pubblicato") || !item.scheduledAt) {
    await db.update(publications).set({ status: "annullata", error: "Annullata: la scheda non è più approvata o non ha una data" }).where(inArray(publications.id, ids));
    await audit({ userId, category: "contenuti", action: "pubblicazione.annullata", description: `Annullate ${ids.length} pubblicazioni programmate: la scheda «${item?.title ?? itemId}» non è più approvata`, clientId: item?.clientId, target: `pubblicazione:${itemId}` });
    return;
  }
  const snap = await snapshotOf(item);
  const [editor] = await db.select({ role: users.role, canPublish: users.canPublish, name: users.name }).from(users).where(eq(users.id, userId));
  const editorCanPublish = !!editor && canPublishWith(editor.role, editor.canPublish);
  const blocked: string[] = [];
  for (const p of pending) {
    const contentChanged = p.caption !== snap.caption || p.format !== snap.format || p.mediaIds.join(",") !== snap.media.map((m) => m.id).join(",");
    const movedToPast = item.scheduledAt.getTime() !== p.scheduledAt.getTime() && item.scheduledAt.getTime() < Date.now() - 60_000;
    const emptied = p.mediaIds.length > 0 && snap.media.length === 0;
    // Il contenuto di un post programmato lo cambia solo chi può pubblicare: altrimenti serve una riconferma
    const unauthorized = contentChanged && !editorCanPublish;
    const problem = unauthorized
      ? `Il contenuto è stato modificato da ${editor?.name ?? "un utente"}, che non è abilitato a pubblicare: chi pubblica deve ricontrollare la scheda e premere «Riprova».`
      : movedToPast
      ? "La data è stata spostata nel passato: non pubblicata. Imposta una nuova data o premi «Riprova» per pubblicarla adesso."
      : emptied
        ? "Sono stati tolti tutti i file: non pubblicata per non far uscire un post diverso. Ricarica i file o annullala."
        : // Un video appena caricato è «in lavorazione» per qualche minuto: non è un motivo per bloccare,
          // all'ora di uscita lo scheduler aspetta che sia pronto
          checkPublishable(p.platform, snap.format, snap.media.map((m) => (m.processState === "in_lavorazione" ? { ...m, processState: "pronto" } : m)), snap.caption);
    if (problem) {
      await db.update(publications).set({ status: "errore", error: `Bloccata dopo una modifica della scheda: ${problem}` }).where(eq(publications.id, p.id));
      blocked.push(`@${p.handle}: ${problem}`);
      continue;
    }
    await db
      .update(publications)
      .set({ scheduledAt: item.scheduledAt, format: snap.format, caption: snap.caption, mediaIds: snap.media.map((m) => m.id) })
      .where(eq(publications.id, p.id));
  }
  if (blocked.length) {
    await audit({ userId, category: "contenuti", action: "pubblicazione.bloccata", description: `Pubblicazioni bloccate dopo una modifica di «${item.title}»`, clientId: item.clientId, target: `pubblicazione:${itemId}`, meta: { motivi: blocked } });
  }
}
