"use server";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { editorialItems, editorialPlans, mediaAssets, publications, socialAccounts, users } from "@/db/schema";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { removeMediaFile } from "@/lib/media";
import { extrasFor, extrasProblem } from "@/lib/publishing/extras";
import { publishWarnings } from "@/lib/publishing/media-rules";
import { checkPublishable, isDryRun } from "@/lib/publishing/meta-publish";
import { processPublication } from "@/lib/publishing/scheduler";
import { connectionsOf, PUBLISHABLE, routeOf } from "@/lib/publishing/targets";
import { platformName } from "@/lib/platforms";
import { snapshotOf, syncPendingPublications } from "@/lib/publishing/sync";
import { channelLabel, itemOf, scheduleItem, tiktokCreatorFor } from "@/lib/publishing/schedule-item";
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



/**
 * Informazioni aggiornate sull'account TikTok per la scheda di invio (nome, visibilità consentite, interazioni,
 * durata massima): TikTok chiede di rileggerle ogni volta che si mostra la scheda.
 */
export async function tiktokCreator(channelId: number) {
  // Usa il token del cliente su TikTok: solo chi può pubblicare
  const { error } = await publisher();
  if (error) return { error };
  return tiktokCreatorFor(channelId);
}

/**
 * Programma (o pubblica subito) la scheda sui profili scelti.
 * when: "ora" oppure la data della scheda.
 */
export async function schedulePublication(itemId: number, channelIds: number[], when: "ora" | "programmata", tiktokOptions?: unknown) {
  const { me, error } = await publisher();
  if (error) return { error };
  return scheduleItem(me, itemId, channelIds, when, tiktokOptions);
}


// ── Programmazione del piano intero ───────────────────────────────────

export type PlanScheduleRow = {
  itemId: number;
  title: string;
  scheduledAt: string | null;
  /** Profili su cui la scheda si può programmare adesso. */
  ready: { channelId: number; label: string }[];
  /** Già programmata o pubblicata su questi profili. */
  done: string[];
  /** Cosa impedisce la programmazione (scheda o singolo profilo). */
  problems: string[];
  /** Avvisi non bloccanti (es. video non verticale per un reel). */
  warnings: string[];
};

/**
 * Per ogni scheda del piano: dove si può programmare subito, dove è già programmata e cosa manca.
 * TikTok resta fuori: le sue regole chiedono di confermare le impostazioni post per post, dalla scheda.
 */
async function planOverview(planId: number): Promise<{ clientId: number; rows: PlanScheduleRow[] } | { error: string }> {
  const [plan] = await db.select({ clientId: editorialPlans.clientId }).from(editorialPlans).where(eq(editorialPlans.id, planId));
  if (!plan) return { error: "Piano non trovato" };
  await requireClientAccess(plan.clientId);
  const items = await db
    .select()
    .from(editorialItems)
    .where(and(eq(editorialItems.planId, planId), notInArray(editorialItems.status, ["annullato", "pubblicato"])))
    .orderBy(asc(editorialItems.scheduledAt));
  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, plan.clientId));
  const conns = await connectionsOf(channels);
  const active = items.length
    ? await db
        .select({ itemId: publications.itemId, socialAccountId: publications.socialAccountId })
        .from(publications)
        .where(and(inArray(publications.itemId, items.map((i) => i.id)), inArray(publications.status, ["programmata", "in_corso", "pubblicata"])))
    : [];
  const media = items.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.itemId, items.map((i) => i.id))).orderBy(mediaAssets.position) : [];
  const soon = Date.now() + 60_000;

  const rows: PlanScheduleRow[] = items.map((item) => {
    const row: PlanScheduleRow = { itemId: item.id, title: item.title, scheduledAt: item.scheduledAt?.toISOString() ?? null, ready: [], done: [], problems: [], warnings: [] };
    if (item.status !== "approvato") row.problems.push(item.status === "da_approvare" ? "aspetta l'approvazione del cliente" : "è ancora in bozza");
    if (!item.scheduledAt) row.problems.push("non ha data e ora");
    else if (item.scheduledAt.getTime() < soon) row.problems.push("la data è già passata");
    if (row.problems.length) return row;

    const targets = [...new Set([item.platform, ...(item.crossPost ?? [])])];
    const itemMedia = media.filter((m) => m.itemId === item.id);
    const caption = [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join("\n\n");
    for (const platform of targets) {
      const label = platformName(platform);
      if (!(PUBLISHABLE as readonly string[]).includes(platform)) {
        row.problems.push(`${label}: non si pubblica da 2Target`);
        continue;
      }
      if (platform === "tiktok") {
        row.problems.push("TikTok: si programma dalla scheda (TikTok chiede di confermare le impostazioni di ogni video)");
        continue;
      }
      const usable = channels.filter((c) => c.platform === platform && "route" in routeOf(c, conns.find((x) => x.id === c.connectionId)));
      if (!usable.length) {
        row.problems.push(`${label}: nessun profilo collegato per pubblicare`);
        continue;
      }
      if (usable.length > 1) {
        row.problems.push(`${label}: più profili collegati, scegli quale dalla scheda`);
        continue;
      }
      const ch = usable[0];
      if (active.some((a) => a.itemId === item.id && a.socialAccountId === ch.id)) {
        row.done.push(channelLabel(ch));
        continue;
      }
      const problem = checkPublishable(platform, item.format, itemMedia, caption) ?? extrasProblem(platform, extrasFor(platform, item.format, item));
      if (problem) row.problems.push(`${label}: ${problem}`);
      else {
        row.ready.push({ channelId: ch.id, label: channelLabel(ch) });
        for (const w of publishWarnings(platform, item.format, itemMedia)) if (!row.warnings.includes(w)) row.warnings.push(w);
      }
    }
    return row;
  });
  return { clientId: plan.clientId, rows };
}

export async function planScheduleOverview(planId: number) {
  const { error } = await publisher();
  if (error) return { error };
  return planOverview(planId);
}

/**
 * Programma in un colpo le schede scelte del piano, sui profili pronti calcolati qui (non dal browser).
 * Ogni scheda passa dagli stessi controlli della programmazione singola; un errore non ferma le altre.
 */
export async function schedulePlan(planId: number, itemIds: number[]) {
  const { me, error } = await publisher();
  if (error) return { error };
  const overview = await planOverview(planId);
  if ("error" in overview) return { error: overview.error };
  const wanted = new Set(itemIds);
  const results: { itemId: number; title: string; ok: boolean; message: string }[] = [];
  for (const row of overview.rows.filter((r) => wanted.has(r.itemId) && r.ready.length)) {
    const r = await scheduleItem(me, row.itemId, row.ready.map((x) => x.channelId), "programmata");
    results.push({ itemId: row.itemId, title: row.title, ok: "ok" in r, message: "error" in r ? r.error : row.ready.map((x) => x.label).join(", ") });
  }
  const scheduled = results.filter((r) => r.ok).length;
  await audit({
    userId: me.id,
    category: "contenuti",
    action: "piano.programmato",
    description: `Programmate ${scheduled} schede del piano in un colpo${results.length > scheduled ? ` (${results.length - scheduled} non riuscite)` : ""}${isDryRun() ? " (simulazione)" : ""}`,
    clientId: overview.clientId,
  });
  revalidatePath(`/clienti/${overview.clientId}/piano`);
  revalidatePath("/calendario");
  return { ok: true, scheduled, results, dryRun: isDryRun() };
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
  await requireClientAccess(m.clientId);
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
  const [item] = await db.select({ clientId: editorialItems.clientId }).from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) return { error: "Scheda non trovata" };
  await requireClientAccess(item.clientId);
  for (const [i, id] of ids.entries()) await db.update(mediaAssets).set({ position: i }).where(and(eq(mediaAssets.id, id), eq(mediaAssets.itemId, itemId)));
  await syncPendingPublications(itemId, me.id);
  revalidatePath(path(itemId));
  return { ok: true };
}
