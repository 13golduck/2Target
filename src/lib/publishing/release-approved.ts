import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { userCanPublish } from "@/lib/auth";
import { pushToUsers } from "@/lib/push";
import { scheduleItem } from "./schedule-item";

// Uscita automatica dopo l'approvazione. Quando un post creato con lo Studio o con «Crea post» va in approvazione,
// la scheda ricorda i profili scelti e chi ha chiesto l'uscita. All'approvazione (del cliente dal link o di un
// collega nel team) il post si programma da solo, alla data della scheda.

/** Margine sotto il quale la data è considerata passata: un'uscita «adesso» dopo l'approvazione non si fa da sola. */
const MIN_LEAD_MS = 60_000;

export type ReleaseResult = { released: true; channels: number } | { released: false; reason: string | null };

/** Prima scelta chi approva (se è del team e può pubblicare), altrimenti chi aveva chiesto l'uscita. */
async function publisherFor(approverId: number | null, requesterId: number | null) {
  for (const id of [approverId, requesterId]) {
    if (!id) continue;
    const [u] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id));
    if (u && (await userCanPublish(u))) return u.id;
  }
  return null;
}

/**
 * Da chiamare subito dopo che un post diventa «Approvato». Non fa nulla se non c'era un'uscita in attesa.
 * approverId: utente del team che ha approvato (null se ha approvato il cliente dal link).
 */
export async function releaseApproved(itemId: number, approverId: number | null): Promise<ReleaseResult> {
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, itemId));
  const channels = item?.pendingChannelIds ?? [];
  if (!item || item.status !== "approvato" || !channels.length) return { released: false, reason: null };

  const notify = item.pendingBy ? [item.pendingBy] : [];
  const clear = () => db.update(editorialItems).set({ pendingChannelIds: null, pendingBy: null }).where(eq(editorialItems.id, itemId));

  if (!item.scheduledAt || item.scheduledAt.getTime() < Date.now() + MIN_LEAD_MS) {
    await clear();
    const reason = "Approvato, ma la data di uscita è già passata: scegline una nuova e programmalo";
    await pushToUsers(notify, { title: `«${item.title}» approvato in ritardo`, body: reason, url: `/studio/${itemId}` });
    return { released: false, reason };
  }

  const publisherId = await publisherFor(approverId, item.pendingBy);
  if (!publisherId) {
    // Nessuno abilitato a pubblicare: resta approvato e in attesa, lo programma un collega abilitato
    const reason = "Approvato, ma serve un collega abilitato a pubblicare per programmarlo";
    await pushToUsers(notify, { title: `«${item.title}» approvato`, body: reason, url: `/studio/${itemId}` });
    return { released: false, reason };
  }

  const r = await scheduleItem({ id: publisherId }, itemId, channels, "programmata");
  await clear();
  if ("error" in r) {
    await pushToUsers(notify, { title: `«${item.title}» approvato ma non programmato`, body: r.error, url: `/studio/${itemId}` });
    return { released: false, reason: r.error };
  }
  await audit({
    userId: publisherId,
    category: "contenuti",
    action: "pubblicazione.dopo_approvazione",
    description: `«${item.title}» programmato da solo dopo l'approvazione, su ${channels.length} ${channels.length === 1 ? "profilo" : "profili"}`,
    clientId: item.clientId,
    target: `pubblicazione:${itemId}`,
  });
  await pushToUsers(notify, { title: `«${item.title}» approvato e programmato`, body: `Uscirà come previsto su ${channels.length} ${channels.length === 1 ? "profilo" : "profili"}.`, url: `/studio/${itemId}` });
  return { released: true, channels: channels.length };
}

/** Ricorda l'uscita chiesta mentre il post va in approvazione. */
export async function rememberPendingRelease(itemId: number, channelIds: number[], requesterId: number) {
  await db.update(editorialItems).set({ pendingChannelIds: [...new Set(channelIds)], pendingBy: requesterId }).where(eq(editorialItems.id, itemId));
}
