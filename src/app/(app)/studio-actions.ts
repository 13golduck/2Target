"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { editorialItems, editorialPlans } from "@/db/schema";
import { BudgetError } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { studioTurn } from "@/lib/ai/studio-agent";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { featureOn } from "@/lib/features-data";
import { planFor } from "@/lib/quick-post";
import { applyOps, describeChanges, EMPTY_STATE, StudioStateSchema } from "@/lib/studio/state";
import { addMessage, addVersion, clientPlatforms, currentVersion, mediaOf, messagesOf, versionState } from "@/lib/studio/studio-data";

// 2Target Studio: la scheda del post è il progetto; chat e versioni si appoggiano a essa.
// Ogni azione verifica chi scrive, l'accesso al cliente e che lo Studio sia acceso per quel cliente.

const path = (itemId: number) => `/studio/${itemId}`;

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
    });
    const next = applyOps(current.state, turn.ops);
    const changed = describeChanges(current.state, next) !== "Nessuna modifica";
    const versionN = changed ? await addVersion({ itemId: item.id, author: "ai", userId: me.id, summary: turn.summary || describeChanges(current.state, next), state: next }) : undefined;
    await addMessage({ itemId: item.id, role: "ai", text: turn.reply, userId: me.id, versionN, costEur: turn.costEur });
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
  const summary = describeChanges(current.state, p.data.state);
  if (summary === "Nessuna modifica") return { ok: true, versionN: current.n };
  const versionN = await addVersion({ itemId: ctx.item.id, author: "utente", userId: ctx.me.id, summary, state: p.data.state });
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
