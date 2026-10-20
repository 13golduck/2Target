"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { clients, editorialItems, itemFeedback } from "@/db/schema";
import { approvalClientId } from "@/lib/approval";
import { audit } from "@/lib/audit";
import { releaseApproved } from "@/lib/publishing/release-approved";

// Azione pubblica (nessun accesso): vale solo con un link firmato di un cliente che ha l'approvazione attiva,
// e solo sui contenuti di quel cliente.

const Input = z.object({
  token: z.string().min(10).max(500),
  itemId: z.number().int().positive(),
  decision: z.enum(["approvato", "modifiche", "commento"]),
  author: z.string().trim().min(2).max(120),
  message: z.string().trim().max(2000).optional(),
});

export async function sendFeedback(input: z.infer<typeof Input>) {
  const p = Input.safeParse(input);
  if (!p.success) return { error: "Scrivi il tuo nome (e il messaggio, se chiedi modifiche)" };
  const v = p.data;
  if (v.decision !== "approvato" && !v.message) return { error: "Scrivi cosa vuoi cambiare" };
  const clientId = approvalClientId(v.token);
  if (!clientId) return { error: "Link scaduto o non valido: chiedi a Golduck un nuovo link" };
  const [client] = await db.select({ approvalEnabled: clients.approvalEnabled, name: clients.name }).from(clients).where(eq(clients.id, clientId));
  if (!client?.approvalEnabled) return { error: "L'approvazione via link non è più attiva per questo cliente" };
  const [item] = await db.select().from(editorialItems).where(and(eq(editorialItems.id, v.itemId), eq(editorialItems.clientId, clientId)));
  if (!item) return { error: "Contenuto non trovato" };
  if (["pubblicato", "annullato"].includes(item.status)) return { error: "Questo contenuto non si può più modificare" };

  await db.insert(itemFeedback).values({ itemId: item.id, clientId, author: v.author, decision: v.decision, message: v.message ?? null });
  // Approvato → pronto per la pubblicazione; modifiche → torna in bozza al team
  if (v.decision === "approvato") await db.update(editorialItems).set({ status: "approvato" }).where(eq(editorialItems.id, item.id));
  if (v.decision === "modifiche") await db.update(editorialItems).set({ status: "bozza" }).where(eq(editorialItems.id, item.id));
  await audit({
    userId: null,
    actorLabel: `${v.author} (cliente, link di approvazione)`,
    category: "contenuti",
    action: `approvazione.${v.decision}`,
    description: `${v.author} ha ${v.decision === "approvato" ? "approvato" : v.decision === "modifiche" ? "chiesto modifiche a" : "commentato"} «${item.title}»${v.message ? `: ${v.message.slice(0, 200)}` : ""}`,
    clientId,
    target: `pubblicazione:${item.id}`,
  });
  // Uscita chiesta prima dell'approvazione (Studio, Crea post): parte da sola alla data prevista
  if (v.decision === "approvato") await releaseApproved(item.id, null);
  revalidatePath(`/pubblicazioni/${item.id}`);
  revalidatePath("/");
  return { ok: true };
}
