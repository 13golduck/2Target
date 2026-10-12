"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialAccounts, users } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { removeMediaFile } from "@/lib/media";
import { checkPublishable, isDryRun } from "@/lib/publishing/meta-publish";
import { processPublication } from "@/lib/publishing/scheduler";
import { snapshotOf, syncPendingPublications } from "@/lib/publishing/sync";
import { canPublishWith } from "@/lib/roles";

// Pubblicazione dalle schede del piano. Regola di sicurezza: si pubblica SOLO sui profili collegati al cliente
// della scheda (controllato qui e di nuovo al momento dell'invio).

const path = (itemId: number) => `/pubblicazioni/${itemId}`;

async function publisher() {
  const me = await requireWriter();
  const [u] = await db.select({ canPublish: users.canPublish }).from(users).where(eq(users.id, me.id));
  if (!canPublishWith(me.role, u?.canPublish)) return { me, error: "Non sei abilitato a pubblicare: chiedi a un amministratore (Utenti → Può pubblicare)." };
  return { me, error: null };
}

async function itemOf(id: number) {
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, id));
  return item ?? null;
}

const channelLabel = (c: { platform: string; handle: string }) => `${c.platform === "instagram" ? "Instagram" : "Facebook"} @${c.handle}`;

/**
 * Programma (o pubblica subito) la scheda sui profili scelti.
 * when: "ora" oppure la data della scheda.
 */
export async function schedulePublication(itemId: number, channelIds: number[], when: "ora" | "programmata") {
  const { me, error } = await publisher();
  if (error) return { error };
  const item = await itemOf(itemId);
  if (!item) return { error: "Scheda non trovata" };
  if (item.status !== "approvato" && item.status !== "pubblicato") return { error: "Si programma solo una scheda «Approvata»: cambia lo stato e salva la scheda." };
  if (!channelIds.length) return { error: "Scegli almeno un profilo" };
  const at = when === "ora" ? new Date() : item.scheduledAt;
  if (!at) return { error: "La scheda non ha data e ora di pubblicazione" };
  if (when === "programmata" && at.getTime() < Date.now() - 60_000) return { error: "La data della scheda è già passata: aggiornala o usa «Pubblica ora»" };

  const channels = await db.select().from(socialAccounts).where(inArray(socialAccounts.id, channelIds));
  if (channels.length !== channelIds.length) return { error: "Profilo non trovato" };
  // Il controllo che evita il profilo sbagliato
  const foreign = channels.find((c) => c.clientId !== item.clientId);
  if (foreign) return { error: `${channelLabel(foreign)} non appartiene a questo cliente: pubblicazione bloccata` };
  const notReady = channels.find((c) => !c.connected || !c.assetTokenEnc || !c.externalId || !["facebook", "instagram"].includes(c.platform));
  if (notReady) return { error: `${channelLabel(notReady)} non è collegato a Meta: collegalo da Canali` };

  const media = await db.select().from(mediaAssets).where(eq(mediaAssets.itemId, itemId)).orderBy(mediaAssets.position);
  const caption = [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join("\n\n");
  for (const c of channels) {
    const problem = checkPublishable(c.platform, item.format, media, caption);
    if (problem) return { error: `${channelLabel(c)}: ${problem}` };
  }
  // Controllo dei doppioni e inserimento in un'unica transazione, con la scheda bloccata:
  // due persone (o due finestre) non possono programmare lo stesso post sullo stesso profilo
  let ids: number[];
  try {
    ids = await db.transaction(async (tx) => {
      await tx.select({ id: editorialItems.id }).from(editorialItems).where(eq(editorialItems.id, itemId)).for("update");
      const active = await tx
        .select({ socialAccountId: publications.socialAccountId })
        .from(publications)
        .where(and(eq(publications.itemId, itemId), inArray(publications.status, ["programmata", "in_corso", "pubblicata"])));
      const dup = channels.find((c) => active.some((a) => a.socialAccountId === c.id));
      if (dup) throw new Error(`Su ${channelLabel(dup)} questa scheda è già programmata o pubblicata`);
      const out: number[] = [];
      for (const c of channels) {
        const [r] = await tx.insert(publications).values({
          itemId,
          clientId: item.clientId,
          socialAccountId: c.id,
          scheduledAt: at,
          format: item.format,
          caption,
          mediaIds: media.map((m) => m.id),
          createdBy: me.id,
        });
        out.push(r.insertId);
      }
      return out;
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Programmazione non riuscita" };
  }
  await audit({
    userId: me.id,
    category: "contenuti",
    action: when === "ora" ? "pubblicazione.subito" : "pubblicazione.programmata",
    description: `${when === "ora" ? "Pubblicazione immediata" : "Programmata"} «${item.title}» su ${channels.map(channelLabel).join(", ")}${isDryRun() ? " (simulazione)" : ""}`,
    clientId: item.clientId,
    target: `pubblicazione:${itemId}`,
    meta: { quando: at.toISOString(), profili: channels.map(channelLabel), file: media.length, formato: item.format },
  });
  if (when === "ora") for (const id of ids) await processPublication(id);
  revalidatePath(path(itemId));
  revalidatePath(`/clienti/${item.clientId}/piano`);
  return { ok: true, dryRun: isDryRun() };
}

/** Annulla una pubblicazione non ancora uscita. */
export async function cancelPublication(id: number) {
  const { me, error } = await publisher();
  if (error) return { error };
  const [p] = await db.select().from(publications).where(eq(publications.id, id));
  if (!p) return { error: "Pubblicazione non trovata" };
  if (p.status !== "programmata" && p.status !== "errore") return { error: "Si annulla solo una pubblicazione programmata o non riuscita" };
  // Se nel frattempo l'invio è partito, l'annullamento non vale: lo si dice chiaramente
  const [res] = await db.update(publications).set({ status: "annullata" }).where(and(eq(publications.id, id), inArray(publications.status, ["programmata", "errore"])));
  if (res.affectedRows !== 1) {
    revalidatePath(path(p.itemId));
    return { error: "Troppo tardi: la pubblicazione è già in corso. Controlla l'esito tra qualche istante." };
  }
  const [c] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, p.socialAccountId));
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.annullata", description: `Annullata la pubblicazione su ${c ? channelLabel(c) : "profilo"}`, clientId: p.clientId, target: `pubblicazione:${p.itemId}` });
  revalidatePath(path(p.itemId));
  return { ok: true };
}

/** Riprova una pubblicazione non riuscita (dopo aver controllato che non sia uscita). */
export async function retryPublication(id: number) {
  const { me, error } = await publisher();
  if (error) return { error };
  const [p] = await db.select().from(publications).where(eq(publications.id, id));
  if (!p || p.status !== "errore") return { error: "Si riprova solo una pubblicazione non riuscita" };
  const item = await itemOf(p.itemId);
  if (!item || (item.status !== "approvato" && item.status !== "pubblicato")) return { error: "La scheda non è approvata: approvala e salvala prima di riprovare" };
  // Si riprova con il contenuto ATTUALE della scheda (testo, formato e file), non con quello del primo tentativo
  const [channel] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, p.socialAccountId));
  const snap = await snapshotOf(item);
  const problem = channel ? checkPublishable(channel.platform, snap.format, snap.media, snap.caption) : "Profilo rimosso";
  if (problem) return { error: problem };
  const [res] = await db
    .update(publications)
    .set({ status: "programmata", scheduledAt: new Date(), error: null, format: snap.format, caption: snap.caption, mediaIds: snap.media.map((m) => m.id) })
    .where(and(eq(publications.id, id), eq(publications.status, "errore")));
  if (res.affectedRows !== 1) return { error: "La pubblicazione è già stata ripresa" };
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.riprova", description: "Nuovo tentativo di pubblicazione", clientId: p.clientId, target: `pubblicazione:${p.itemId}`, meta: { erroreDiPrima: p.error } });
  await processPublication(id);
  revalidatePath(path(p.itemId));
  return { ok: true };
}

/** Elimina un file caricato: le pubblicazioni programmate si aggiornano (non se si sta pubblicando in quel momento). */
export async function deleteMedia(id: number) {
  const me = await requireWriter();
  const [m] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!m) return { ok: true };
  const busy = m.itemId
    ? await db.select({ mediaIds: publications.mediaIds }).from(publications).where(and(eq(publications.itemId, m.itemId), eq(publications.status, "in_corso")))
    : [];
  if (busy.some((p) => p.mediaIds.includes(id))) return { error: "Il file si sta pubblicando proprio ora: riprova tra un minuto" };
  await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  await removeMediaFile(m.storageKey);
  if (m.itemId) await syncPendingPublications(m.itemId, me.id);
  await audit({ userId: me.id, category: "contenuti", action: "media.eliminato", description: `Eliminato il file «${m.fileName}»`, clientId: m.clientId, target: m.itemId ? `pubblicazione:${m.itemId}` : null });
  if (m.itemId) revalidatePath(path(m.itemId));
  return { ok: true };
}

/** Nuovo ordine dei file (carosello). */
export async function reorderMedia(itemId: number, ids: number[]) {
  const me = await requireWriter();
  for (const [i, id] of ids.entries()) await db.update(mediaAssets).set({ position: i }).where(and(eq(mediaAssets.id, id), eq(mediaAssets.itemId, itemId)));
  await syncPendingPublications(itemId, me.id);
  revalidatePath(path(itemId));
  return { ok: true };
}
