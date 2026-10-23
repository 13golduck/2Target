"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { clients, editorialItems, editorialPlans, mediaAssets, socialAccounts } from "@/db/schema";
import { BudgetError } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { draftCaption } from "@/lib/ai/caption-writer";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter, userCanPublish } from "@/lib/auth";
import { bestTimes } from "@/lib/best-times";
import { connectionsOf, PUBLISHABLE, routeOf } from "@/lib/publishing/targets";
import { rememberPendingRelease } from "@/lib/publishing/release-approved";
import { inferFormat, initialStatus, planFor, titleFromCaption } from "@/lib/quick-post";
import { schedulePublication } from "./publish-actions";

// «Crea post»: procedura guidata in tre passi (dove, cosa, quando) al posto della scheda completa.
// TikTok resta fuori: chiede di confermare a ogni video visibilità e interazioni, cosa che si fa dalla scheda.

/** Profili del cliente su cui si può pubblicare subito, orari migliori e regole di approvazione. */
export async function postTargets(clientId: number) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  const all = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, clientId), inArray(socialAccounts.platform, [...PUBLISHABLE])));
  const conns = await connectionsOf(all);
  const ready = all.filter((c) => c.platform !== "tiktok" && "route" in routeOf(c, conns.find((x) => x.id === c.connectionId)));
  const [client] = await db.select({ approvalEnabled: clients.approvalEnabled }).from(clients).where(eq(clients.id, clientId));
  return {
    channels: ready.map((c) => ({ id: c.id, platform: c.platform, handle: c.handle, name: c.name ?? c.handle, pictureUrl: c.pictureUrl })),
    tiktok: all.some((c) => c.platform === "tiktok"),
    notConnected: all.filter((c) => !ready.includes(c) && c.platform !== "tiktok").length,
    approvalEnabled: !!client?.approvalEnabled,
    canPublish: await userCanPublish(me),
    bestTimes: await bestTimes(clientId),
  };
}

const Idea = z.object({ clientId: z.number().int().positive(), idea: z.string().trim().min(3, "Scrivi in due parole di cosa parla il post").max(1000), platforms: z.array(z.string()).max(10), format: z.string().max(20) });

export async function writeCaption(input: z.infer<typeof Idea>) {
  await requireWriter();
  const p = Idea.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  await requireClientAccess(p.data.clientId);
  if (!isAiConfigured()) return { error: "L'AI non è configurata: un amministratore inserisce la chiave in Impostazioni → Integrazioni" };
  try {
    return { ok: true, ...(await draftCaption(p.data)) };
  } catch (e) {
    if (e instanceof BudgetError) return { error: e.message };
    return { error: "L'AI non ha risposto: riprova tra poco o scrivi tu il testo" };
  }
}

const Create = z.object({
  clientId: z.number().int().positive(),
  caption: z.string().trim().max(5000),
  hashtags: z.string().trim().max(1000).optional(),
  files: z.array(z.object({ kind: z.enum(["image", "video"]) })).max(20),
  channelIds: z.array(z.number().int().positive()).min(1, "Scegli almeno un profilo").max(20),
  when: z.enum(["ora", "data"]),
  scheduledAt: z.string().datetime().optional(),
});

/** Crea la pubblicazione (senza file: si caricano subito dopo, sulla scheda appena creata). */
export async function createQuickPost(input: z.infer<typeof Create>) {
  const me = await requireWriter();
  const p = Create.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  const d = p.data;
  await requireClientAccess(d.clientId);
  if (!d.caption && !d.files.length) return { error: "Scrivi il testo o carica almeno una foto o un video" };
  const when = d.when === "ora" ? new Date() : d.scheduledAt ? new Date(d.scheduledAt) : null;
  if (!when) return { error: "Scegli data e ora" };
  if (d.when === "data" && when.getTime() < Date.now() + 60_000) return { error: "La data è già passata: scegline una futura o usa «Pubblica ora»" };

  // I profili devono essere di questo cliente: gli id arrivano dal browser
  const channels = await db.select().from(socialAccounts).where(inArray(socialAccounts.id, d.channelIds));
  if (channels.length !== d.channelIds.length || channels.some((c) => c.clientId !== d.clientId)) return { error: "Uno dei profili non appartiene a questo cliente" };
  const platforms = [...new Set(channels.map((c) => c.platform))].filter((x): x is (typeof PUBLISHABLE)[number] => (PUBLISHABLE as readonly string[]).includes(x));

  const plans = await db.select({ id: editorialPlans.id, startsOn: editorialPlans.startsOn, endsOn: editorialPlans.endsOn }).from(editorialPlans).where(eq(editorialPlans.clientId, d.clientId));
  const [client] = await db.select({ approvalEnabled: clients.approvalEnabled }).from(clients).where(eq(clients.id, d.clientId));
  const status = initialStatus({ canPublish: await userCanPublish(me), approvalEnabled: !!client?.approvalEnabled });
  const format = inferFormat(d.files);
  const title = titleFromCaption(d.caption);

  const [r] = await db.insert(editorialItems).values({
    clientId: d.clientId,
    planId: planFor(plans, when),
    title,
    platform: platforms[0],
    crossPost: platforms.slice(1),
    format,
    caption: d.caption || null,
    hashtags: d.hashtags || null,
    scheduledAt: when,
    status,
    productionStatus: d.files.length ? "pronto" : "da_fare",
  });
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.crea_post", description: `Creato con «Crea post» «${title}» (${format})${status === "da_approvare" ? ", da approvare" : ""}`, clientId: d.clientId, target: `pubblicazione:${r.insertId}` });
  return { ok: true, itemId: r.insertId, status, format };
}

/** Video ancora in conversione per i social: si aspetta prima di programmare. */
export async function mediaState(itemId: number) {
  await requireWriter();
  const [item] = await db.select({ clientId: editorialItems.clientId }).from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) return { error: "Pubblicazione non trovata" };
  await requireClientAccess(item.clientId);
  const [row] = await db
    .select({ busy: sql<number>`sum(${mediaAssets.processState} = 'in_lavorazione')`, failed: sql<number>`sum(${mediaAssets.processState} = 'errore')` })
    .from(mediaAssets)
    .where(eq(mediaAssets.itemId, itemId));
  return { busy: Number(row?.busy ?? 0), failed: Number(row?.failed ?? 0) };
}

/** Ultimo passo: programma sui profili scelti (le schede «da approvare» aspettano l'approvazione). */
export async function finishQuickPost(input: { itemId: number; channelIds: number[]; when: "ora" | "data" }) {
  const me = await requireWriter();
  const [item] = await db.select({ clientId: editorialItems.clientId, status: editorialItems.status, planId: editorialItems.planId }).from(editorialItems).where(eq(editorialItems.id, input.itemId));
  if (!item) return { error: "Pubblicazione non trovata" };
  await requireClientAccess(item.clientId);
  revalidatePath(`/clienti/${item.clientId}/piano`);
  revalidatePath("/");
  if (item.status !== "approvato") {
    // All'approvazione il post uscirà da solo su questi profili, alla data scelta
    await rememberPendingRelease(input.itemId, input.channelIds, me.id);
    return { ok: true, pending: true };
  }
  const r = await schedulePublication(input.itemId, input.channelIds, input.when === "ora" ? "ora" : "programmata");
  return "error" in r ? { error: r.error } : { ok: true, pending: false, dryRun: r.dryRun };
}

const Blank = z.object({ clientId: z.number().int().positive() });

/**
 * Modo «Avanzato»: una scheda vuota nel piano in corso, da completare nella pagina della pubblicazione.
 * Niente data: la sceglie chi la compila (la scheda la salva da sola).
 */
export async function createBlankItem(input: z.infer<typeof Blank>) {
  const me = await requireWriter();
  const p = Blank.safeParse(input);
  if (!p.success) return { error: "Scegli il cliente" };
  await requireClientAccess(p.data.clientId);
  const plans = await db.select({ id: editorialPlans.id, startsOn: editorialPlans.startsOn, endsOn: editorialPlans.endsOn }).from(editorialPlans).where(eq(editorialPlans.clientId, p.data.clientId));
  const [r] = await db.insert(editorialItems).values({
    clientId: p.data.clientId,
    planId: planFor(plans, new Date()),
    title: "Nuovo post",
    platform: "instagram",
    format: "post",
    status: "bozza",
  });
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.crea_avanzata", description: "Creata una scheda vuota con «Crea post» (modo avanzato)", clientId: p.data.clientId, target: `pubblicazione:${r.insertId}` });
  return { ok: true, itemId: r.insertId };
}
