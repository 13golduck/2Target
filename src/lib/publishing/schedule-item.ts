import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialAccounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { platformName } from "@/lib/platforms";
import { extrasFor, extrasProblem } from "./extras";
import { checkPublishable, isDryRun } from "./meta-publish";
import { processPublication } from "./scheduler";
import { connectionsOf, publishToken, routeOf } from "./targets";
import { creatorInfo } from "./tiktok-publish";
import { checkTikTokOptions, parseTikTokOptions, tiktokKind } from "./tiktok-rules";

// Programmazione di una scheda sui profili del cliente, senza controlli di sessione: la usano le azioni
// (dopo aver verificato chi pubblica) e l'approvazione via link (a nome di chi aveva chiesto l'uscita).
// Regola di sicurezza: si pubblica SOLO sui profili collegati al cliente della scheda.

const path = (itemId: number) => `/pubblicazioni/${itemId}`;

export async function itemOf(id: number) {
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, id));
  return item ?? null;
}

export const channelLabel = (c: { platform: string; handle: string }) => `${platformName(c.platform)} @${c.handle}`;

/** Account TikTok letto dal vivo (TikTok chiede di rileggerlo prima di ogni invio). */
export async function tiktokCreatorFor(channelId: number): Promise<{ creator: Awaited<ReturnType<typeof creatorInfo>>; simulated?: boolean } | { error: string }> {
  const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, channelId));
  if (!ch || ch.platform !== "tiktok") return { error: "Profilo TikTok non trovato" };
  const [conn] = await connectionsOf([ch]);
  const route = routeOf(ch, conn);
  if ("problem" in route) return { error: `@${ch.handle} ${route.problem}` };
  if (isDryRun()) {
    // Simulazione: risposta di prova con tutte le opzioni, così la scheda si può provare senza TikTok
    return {
      creator: { nickname: ch.name ?? ch.handle, username: ch.handle, avatarUrl: ch.pictureUrl, privacyOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"], commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxVideoSeconds: 600 },
      simulated: true,
    };
  }
  try {
    return { creator: await creatorInfo(await publishToken(ch, route.route)) };
  } catch (e) {
    return { error: `TikTok: ${e instanceof Error ? e.message : "account non leggibile"}` };
  }
}

/**
 * Cuore della programmazione, condiviso dalla scheda singola e dalla programmazione del piano intero:
 * stessi controlli (scheda approvata, profili del cliente e collegati, media adatti, niente doppioni).
 */
export async function scheduleItem(me: { id: number }, itemId: number, channelIds: number[], when: "ora" | "programmata", tiktokOptions?: unknown): Promise<{ ok: true; dryRun: boolean } | { error: string }> {
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
  const conns = await connectionsOf(channels);
  for (const c of channels) {
    const route = routeOf(c, conns.find((x) => x.id === c.connectionId));
    if ("problem" in route) return { error: `${channelLabel(c)} ${route.problem}` };
  }

  const media = await db.select().from(mediaAssets).where(eq(mediaAssets.itemId, itemId)).orderBy(mediaAssets.position);
  const caption = [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join("\n\n");
  for (const c of channels) {
    const problem = checkPublishable(c.platform, item.format, media, caption) ?? extrasProblem(c.platform, extrasFor(c.platform, item.format, item));
    if (problem) return { error: `${channelLabel(c)}: ${problem}` };
  }
  // TikTok: impostazioni scelte nella scheda, verificate sull'account com'è adesso
  const options = parseTikTokOptions(tiktokOptions);
  for (const c of channels.filter((x) => x.platform === "tiktok")) {
    const info = await tiktokCreatorFor(c.id);
    if ("error" in info) return { error: info.error ?? "TikTok: account non leggibile" };
    const bad = checkTikTokOptions(options, info.creator, tiktokKind(item.format, media)!);
    if (bad) return { error: `${channelLabel(c)}: ${bad}` };
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
          options: c.platform === "tiktok" ? options : null,
          // Primo commento, coautori e sede (Instagram/Facebook), copiati dalla scheda come il testo
          extras: extrasFor(c.platform, item.format, item),
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
    meta: { quando: at.toISOString(), profili: channels.map(channelLabel), file: media.length, formato: item.format, ...(channels.some((c) => c.platform === "tiktok") && { tiktok: options }) },
  });
  if (when === "ora") for (const id of ids) await processPublication(id);
  revalidatePath(path(itemId));
  revalidatePath(`/clienti/${item.clientId}/piano`);
  return { ok: true, dryRun: isDryRun() };
}
