"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { clients, editorialItems, editorialPlans, mediaAssets, publications } from "@/db/schema";
import { BudgetError } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { ImageGenError, isImageAiConfigured } from "@/lib/ai/image-gen";
import { studioTurn } from "@/lib/ai/studio-agent";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter, userCanPublish } from "@/lib/auth";
import { featureOn } from "@/lib/features-data";
import { removeMediaFile } from "@/lib/media";
import { syncPendingPublications } from "@/lib/publishing/sync";
import { initialStatus, planFor } from "@/lib/quick-post";
import { placeAsBackground, sanitizeDesign } from "@/lib/studio/design";
import { ASPECT_RATIOS, aspectForSize, type AspectRatio } from "@/lib/studio/image-tools";
import { createStudioImage } from "@/lib/studio/studio-images";
import { applyOps, describeChanges, EMPTY_STATE, StudioStateSchema, type StudioState } from "@/lib/studio/state";
import { schedulePublication } from "./publish-actions";
import { addMessage, addVersion, clientBrand, clientPlatforms, currentVersion, mediaOf, messagesOf, versionState } from "@/lib/studio/studio-data";

// 2Target Studio: la scheda del post è il progetto; chat e versioni si appoggiano a essa.
// Ogni azione verifica chi scrive, l'accesso al cliente e che lo Studio sia acceso per quel cliente.

const path = (itemId: number) => `/studio/${itemId}`;

/** La grafica può usare solo le foto di questo progetto (gli id arrivano dal browser o dall'AI). */
async function safeState(itemId: number, state: StudioState): Promise<StudioState> {
  if (!state.design) return state;
  const images = (await mediaOf(itemId)).filter((m) => m.kind === "image").map((m) => m.id);
  return { ...state, design: sanitizeDesign(state.design, images) };
}

async function itemFor(itemId: number) {
  const me = await requireWriter();
  const [item] = await db.select({ id: editorialItems.id, clientId: editorialItems.clientId, title: editorialItems.title }).from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) return { error: "Pubblicazione non trovata" } as const;
  await requireClientAccess(item.clientId);
  if (!(await featureOn("studio", item.clientId))) return { error: "Lo Studio è spento per questo cliente (Panoramica → Funzioni)" } as const;
  return { me, item } as const;
}

const Create = z.object({
  clientId: z.number().int().positive(),
  brief: z.string().trim().min(5, "Scrivi in una frase cosa ti serve").max(2000, "Richiesta troppo lunga: massimo 2000 caratteri"),
});

/** Nuovo progetto: scheda in bozza nel piano in corso, versione di partenza e richiesta iniziale in chat. */
export async function createStudioProject(input: z.infer<typeof Create>) {
  const me = await requireWriter();
  const p = Create.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  const { clientId, brief } = p.data;
  await requireClientAccess(clientId);
  if (!(await featureOn("studio", clientId))) return { error: "Lo Studio è spento per questo cliente" };

  const platforms = await clientPlatforms(clientId);
  const plans = await db.select({ id: editorialPlans.id, startsOn: editorialPlans.startsOn, endsOn: editorialPlans.endsOn }).from(editorialPlans).where(eq(editorialPlans.clientId, clientId));
  const [r] = await db.insert(editorialItems).values({
    clientId,
    planId: planFor(plans, new Date()),
    title: EMPTY_STATE.title,
    platform: platforms[0] ?? "instagram",
    crossPost: platforms.slice(1),
    format: EMPTY_STATE.format,
    status: "bozza",
    internalNotes: `Creato nello Studio: ${brief}`,
  });
  const itemId = r.insertId;
  await addVersion({ itemId, author: "utente", userId: me.id, summary: "Progetto creato", state: EMPTY_STATE });
  await addMessage({ itemId, role: "utente", text: brief, userId: me.id });
  await audit({ userId: me.id, category: "contenuti", action: "studio.crea", description: "Creato un post nello Studio", clientId, target: `pubblicazione:${itemId}` });
  return { ok: true, itemId };
}

const Send = z.object({ itemId: z.number().int().positive(), text: z.string().trim().max(2000, "Messaggio troppo lungo: massimo 2000 caratteri").optional() });

/**
 * Manda una richiesta all'AI (o risponde all'ultima rimasta senza risposta, se text manca)
 * e salva le modifiche come nuova versione.
 */
export async function sendStudioMessage(input: z.infer<typeof Send>) {
  const p = Send.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  const { me, item } = ctx;
  if (!isAiConfigured()) return { error: "L'AI non è configurata: un amministratore inserisce la chiave in Impostazioni → Integrazioni" };

  const history = await messagesOf(item.id);
  const pending = history.at(-1)?.role === "utente" ? history.at(-1)!.text : null;
  const request = p.data.text || pending;
  if (!request) return { error: "Scrivi cosa vuoi cambiare" };
  if (p.data.text) await addMessage({ itemId: item.id, role: "utente", text: p.data.text, userId: me.id });

  const current = await currentVersion(item.id);
  try {
    const turn = await studioTurn({
      clientId: item.clientId,
      state: current.state,
      request,
      // La richiesta in corso va a parte: nella cronologia solo i messaggi precedenti
      history: (p.data.text ? history : history.slice(0, -1)).map((m) => ({ role: m.role, text: m.text })),
      platforms: await clientPlatforms(item.clientId),
      media: await mediaOf(item.id),
      brand: await clientBrand(item.clientId),
      imagesAvailable: isImageAiConfigured(),
    });
    let next = applyOps(current.state, turn.ops);
    // Immagini chieste dall'AI: si creano dopo le altre modifiche, così possono andare nella grafica appena fatta
    const notes: string[] = [];
    let imagesCost = 0;
    for (const req of turn.images) {
      try {
        const aspectRatio = req.page > 0 && next.design ? aspectForSize(next.design.size) : next.format === "storia" || next.format === "reel" ? "9:16" : "4:5";
        const img = await createStudioImage({ itemId: item.id, clientId: item.clientId, userId: me.id, prompt: req.prompt, referenceIds: req.referenceMediaIds, aspectRatio });
        imagesCost += img.costEur;
        if (req.page > 0 && next.design) next = { ...next, design: placeAsBackground(next.design, req.page, img.mediaId) };
      } catch (e) {
        if (!(e instanceof ImageGenError || e instanceof BudgetError)) console.error("[studio] immagine non riuscita", e);
        notes.push(e instanceof ImageGenError || e instanceof BudgetError ? e.message : "Un'immagine non si è potuta creare: riprova tra poco");
      }
    }
    next = await safeState(item.id, next);
    const changed = describeChanges(current.state, next) !== "Nessuna modifica";
    const versionN = changed ? await addVersion({ itemId: item.id, author: "ai", userId: me.id, summary: turn.summary || describeChanges(current.state, next), state: next }) : undefined;
    const reply = notes.length ? `${turn.reply}\n\n${notes.join("\n")}` : turn.reply;
    await addMessage({ itemId: item.id, role: "ai", text: reply, userId: me.id, versionN, costEur: turn.costEur + imagesCost });
    revalidatePath(path(item.id));
    return { ok: true, versionN };
  } catch (e) {
    // La richiesta resta in chat: si può riprovare senza riscriverla
    if (e instanceof BudgetError) return { error: e.message };
    console.error("[studio] turno non riuscito", e);
    return { error: "L'AI non ha risposto: riprova tra poco" };
  }
}

const Edit = z.object({ itemId: z.number().int().positive(), state: StudioStateSchema });

/** Modifica a mano: diventa una versione come quelle dell'AI (se qualcosa è cambiato davvero). */
export async function saveStudioEdit(input: z.infer<typeof Edit>) {
  const p = Edit.safeParse(input);
  if (!p.success) return { error: "Dati non validi: controlla la lunghezza di testo e hashtag" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  const current = await currentVersion(ctx.item.id);
  const state = await safeState(ctx.item.id, p.data.state);
  const summary = describeChanges(current.state, state);
  if (summary === "Nessuna modifica") return { ok: true, versionN: current.n };
  const versionN = await addVersion({ itemId: ctx.item.id, author: "utente", userId: ctx.me.id, summary, state });
  revalidatePath(path(ctx.item.id));
  return { ok: true, versionN };
}

const Restore = z.object({ itemId: z.number().int().positive(), n: z.number().int().positive() });

/** Torna a una versione precedente creandone una nuova uguale (la storia resta intera). */
export async function restoreStudioVersion(input: z.infer<typeof Restore>) {
  const p = Restore.safeParse(input);
  if (!p.success) return { error: "Versione non valida" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  const state = await versionState(ctx.item.id, p.data.n);
  if (!state) return { error: "Versione non trovata" };
  const versionN = await addVersion({ itemId: ctx.item.id, author: "utente", userId: ctx.me.id, summary: `Tornato alla versione ${p.data.n}`, state });
  revalidatePath(path(ctx.item.id));
  return { ok: true, versionN };
}

const Move = z.object({ itemId: z.number().int().positive(), mediaId: z.number().int().positive(), toPost: z.boolean() });

/** Sposta un file tra il post (si pubblica) e il materiale di lavoro (resta nello Studio). */
export async function moveStudioMedia(input: z.infer<typeof Move>) {
  const p = Move.safeParse(input);
  if (!p.success) return { error: "Dati non validi" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  const { itemId, mediaId, toPost } = p.data;
  const [m] = await db.select({ itemId: mediaAssets.itemId, studioItemId: mediaAssets.studioItemId }).from(mediaAssets).where(eq(mediaAssets.id, mediaId));
  if (!m || (m.itemId !== itemId && m.studioItemId !== itemId)) return { error: "File non trovato in questo progetto" };
  await db
    .update(mediaAssets)
    .set(toPost ? { itemId, studioItemId: null } : { itemId: null, studioItemId: itemId })
    .where(eq(mediaAssets.id, mediaId));
  await syncPendingPublications(itemId, ctx.me.id);
  revalidatePath(path(itemId));
  return { ok: true };
}

const Outputs = z.object({ itemId: z.number().int().positive(), mediaIds: z.array(z.number().int().positive()).min(1).max(10) });

/**
 * Dopo l'esportazione della grafica: le pagine appena caricate diventano i file del post, nell'ordine dato.
 * Le esportazioni precedenti si eliminano; le foto usate dentro la grafica passano nel materiale
 * (altrimenti uscirebbero due volte, da sole e dentro la grafica).
 */
export async function replaceDesignOutputs(input: z.infer<typeof Outputs>) {
  const p = Outputs.safeParse(input);
  if (!p.success) return { error: "Esportazione non valida" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  const { itemId, mediaIds } = p.data;

  // Mentre un'uscita è in corso i suoi file non si toccano
  const sending = await db.select({ id: publications.id }).from(publications).where(and(eq(publications.itemId, itemId), eq(publications.status, "in_corso")));
  if (sending.length) return { error: "Il post si sta pubblicando proprio ora: riprova tra un minuto" };

  const fresh = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(inArray(mediaAssets.id, mediaIds), eq(mediaAssets.itemId, itemId), eq(mediaAssets.origin, "grafica")));
  if (fresh.length !== mediaIds.length) return { error: "Alcune pagine esportate non sono state trovate: riprova l'esportazione" };

  const old = await db.select().from(mediaAssets).where(and(eq(mediaAssets.itemId, itemId), eq(mediaAssets.origin, "grafica"), notInArray(mediaAssets.id, mediaIds)));
  if (old.length) await db.delete(mediaAssets).where(inArray(mediaAssets.id, old.map((m) => m.id)));
  for (const m of old) await removeMediaFile(m.storageKey);

  const { state } = await currentVersion(itemId);
  const used = [...new Set((state.design?.pages ?? []).flatMap((pg) => pg.layers.flatMap((l) => (l.type === "immagine" ? [l.mediaId] : []))))];
  if (used.length) await db.update(mediaAssets).set({ itemId: null, studioItemId: itemId }).where(and(inArray(mediaAssets.id, used), eq(mediaAssets.itemId, itemId)));

  for (const [i, id] of mediaIds.entries()) await db.update(mediaAssets).set({ position: i }).where(eq(mediaAssets.id, id));
  await syncPendingPublications(itemId, ctx.me.id);
  await audit({ userId: ctx.me.id, category: "contenuti", action: "studio.grafica_esportata", description: `Grafica esportata nel post (${mediaIds.length} ${mediaIds.length === 1 ? "pagina" : "pagine"})`, clientId: ctx.item.clientId, target: `pubblicazione:${itemId}` });
  revalidatePath(path(itemId));
  return { ok: true };
}

const ImageInput = z.object({
  itemId: z.number().int().positive(),
  prompt: z.string().trim().min(5, "Descrivi l'immagine in una frase").max(2000),
  referenceIds: z.array(z.number().int().positive()).max(3, "Al massimo 3 foto di riferimento"),
  aspectRatio: z.enum(ASPECT_RATIOS),
});

/** Immagine AI chiesta a mano dal materiale: nuova, oppure modifica di una o più foto del progetto. */
export async function generateStudioImage(input: { itemId: number; prompt: string; referenceIds: number[]; aspectRatio: AspectRatio }) {
  const p = ImageInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  try {
    const img = await createStudioImage({ itemId: ctx.item.id, clientId: ctx.item.clientId, userId: ctx.me.id, prompt: p.data.prompt, referenceIds: p.data.referenceIds, aspectRatio: p.data.aspectRatio });
    await audit({ userId: ctx.me.id, category: "contenuti", action: "studio.immagine_ai", description: `Immagine AI ${img.edited ? "modificata da una foto" : "creata"} nello Studio`, clientId: ctx.item.clientId, target: `pubblicazione:${ctx.item.id}` });
    revalidatePath(path(ctx.item.id));
    return { ok: true, mediaId: img.mediaId, costEur: img.costEur };
  } catch (e) {
    if (e instanceof ImageGenError || e instanceof BudgetError) return { error: e.message };
    console.error("[studio] immagine non riuscita", e);
    return { error: "L'immagine non si è potuta creare: riprova tra poco" };
  }
}

const Publish = z.object({
  itemId: z.number().int().positive(),
  channelIds: z.array(z.number().int().positive()).min(1, "Scegli almeno un profilo").max(20),
  when: z.enum(["ora", "data"]),
  scheduledAt: z.string().datetime().optional(),
});

/**
 * Ultimo passo dello Studio: data e ora, stato secondo le regole del cliente e programmazione sui profili scelti.
 * Esce subito chi può pubblicare; va in «Da approvare» se il cliente approva via link o chi lavora non è abilitato.
 */
export async function publishFromStudio(input: z.infer<typeof Publish>) {
  const p = Publish.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  const ctx = await itemFor(p.data.itemId);
  if ("error" in ctx) return { error: ctx.error };
  const { me, item } = ctx;
  const at = p.data.when === "ora" ? new Date() : p.data.scheduledAt ? new Date(p.data.scheduledAt) : null;
  if (!at) return { error: "Scegli data e ora" };
  if (p.data.when === "data" && at.getTime() < Date.now() + 60_000) return { error: "La data è già passata: scegline una futura o usa «Pubblica ora»" };

  const [client] = await db.select({ approvalEnabled: clients.approvalEnabled }).from(clients).where(eq(clients.id, item.clientId));
  const [row] = await db.select({ status: editorialItems.status }).from(editorialItems).where(eq(editorialItems.id, item.id));
  // Già approvato (dal cliente o da un collega) resta approvato: non si rimanda in approvazione
  const status = row?.status === "approvato" ? "approvato" : initialStatus({ canPublish: await userCanPublish(me), approvalEnabled: !!client?.approvalEnabled });
  await db.update(editorialItems).set({ scheduledAt: at, status }).where(eq(editorialItems.id, item.id));
  await audit({ userId: me.id, category: "contenuti", action: "studio.pubblica", description: `Dallo Studio: ${status === "approvato" ? (p.data.when === "ora" ? "pubblicazione immediata" : "programmata") : "mandata in approvazione"}`, clientId: item.clientId, target: `pubblicazione:${item.id}` });
  revalidatePath(path(item.id));
  revalidatePath(`/clienti/${item.clientId}/piano`);
  if (status !== "approvato") return { ok: true, pending: true };

  const r = await schedulePublication(item.id, p.data.channelIds, p.data.when === "ora" ? "ora" : "programmata");
  revalidatePath(path(item.id));
  return "error" in r ? { error: r.error } : { ok: true, pending: false, dryRun: r.dryRun };
}
