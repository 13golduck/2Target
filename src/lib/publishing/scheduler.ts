import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialAccounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { errorDetail, logError } from "@/lib/error-log";
import { publicMediaUrl } from "@/lib/media";
import { decryptSecret } from "@/lib/secret-box";
import { checkPublishable, isDryRun, publish } from "./meta-publish";

// Pubblicazioni programmate: ogni minuto (e a ogni chiamata di /api/cron/publish) si pubblicano quelle arrivate all'ora.
// Una pubblicazione si "prende" con un aggiornamento atomico: anche con due giri contemporanei esce una volta sola.
// Gli errori NON si ritentano da soli (rischio di doppio post): si riprovano a mano dalla scheda.

const g = globalThis as unknown as { __publishTimer?: NodeJS.Timeout; __publishRunning?: boolean };

export function startPublishScheduler() {
  if (g.__publishTimer) return;
  g.__publishTimer = setInterval(() => void runDuePublications().catch((e) => console.error("[pubblicazioni]", e)), 60_000);
  g.__publishTimer.unref?.();
}

export async function runDuePublications() {
  if (g.__publishRunning) return { skipped: true, done: 0 };
  g.__publishRunning = true;
  try {
    // Rimaste "in corso" per un riavvio a metà: non si sa se sono uscite, si chiede di controllare
    await db
      .update(publications)
      .set({ status: "errore", error: "Pubblicazione interrotta (riavvio dell'app): controlla sul profilo se è uscita prima di riprovare." })
      .where(and(eq(publications.status, "in_corso"), lt(publications.updatedAt, new Date(Date.now() - 15 * 60_000))));

    const due = await db
      .select({ id: publications.id })
      .from(publications)
      .where(and(eq(publications.status, "programmata"), lte(publications.scheduledAt, new Date())))
      .orderBy(asc(publications.scheduledAt))
      .limit(10);
    let done = 0;
    for (const { id } of due) if (await processPublication(id)) done++;
    return { skipped: false, done };
  } finally {
    g.__publishRunning = false;
  }
}

/** Pubblica subito una pubblicazione (se è ancora programmata). Restituisce true se l'ha presa in carico. */
export async function processPublication(id: number) {
  await ensureIntegrationKeys();
  const [claim] = await db
    .update(publications)
    .set({ status: "in_corso", attempts: 1, error: null })
    .where(and(eq(publications.id, id), eq(publications.status, "programmata")));
  if (claim.affectedRows !== 1) return false;

  const [pub] = await db.select().from(publications).where(eq(publications.id, id));
  const [channel] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, pub.socialAccountId));
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, pub.itemId));
  const label = channel ? `${channel.platform} @${channel.handle}` : "profilo rimosso";

  try {
    // Controllo decisivo: il profilo deve appartenere al cliente della scheda, anche al momento dell'invio
    if (!channel || !item || channel.clientId !== pub.clientId || item.clientId !== pub.clientId) {
      throw new Error("Il profilo non appartiene più al cliente di questa scheda: pubblicazione bloccata");
    }
    if (channel.platform !== "facebook" && channel.platform !== "instagram") throw new Error("Profilo non supportato per la pubblicazione");
    const token = decryptSecret(channel.assetTokenEnc);
    if (!channel.connected || !token || !channel.externalId) throw new Error("Il profilo non è più collegato: ricollegalo da Canali");

    const files = pub.mediaIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, pub.mediaIds)) : [];
    const ordered = pub.mediaIds.map((mid) => files.find((f) => f.id === mid)).filter((f) => !!f);
    if (ordered.length !== pub.mediaIds.length) throw new Error("Uno dei file da pubblicare è stato eliminato");
    if (ordered.some((f) => f.clientId !== pub.clientId)) throw new Error("File di un altro cliente: pubblicazione bloccata");
    const problem = checkPublishable(channel.platform, pub.format, ordered, pub.caption ?? "");
    if (problem) throw new Error(problem);

    const result = await publish({
      platform: channel.platform,
      accountId: channel.externalId,
      token,
      format: pub.format,
      caption: pub.caption ?? "",
      media: ordered.map((f) => ({ kind: f.kind, mime: f.mime, url: publicMediaUrl(f.storageKey) })),
    });

    await db
      .update(publications)
      .set({ status: "pubblicata", externalId: result.externalId, permalink: result.permalink, publishedAt: new Date(), error: null })
      .where(eq(publications.id, id));
    // La scheda risulta pubblicata quando esce sul primo profilo
    if (item.status !== "pubblicato" || !item.publishedUrl) {
      await db
        .update(editorialItems)
        .set({ status: "pubblicato", publishedUrl: item.publishedUrl ?? result.permalink, externalPostId: item.externalPostId ?? result.externalId })
        .where(eq(editorialItems.id, item.id));
    }
    await audit({
      userId: null,
      actorLabel: "Sistema",
      category: "contenuti",
      action: isDryRun() ? "pubblicazione.simulata" : "pubblicazione.uscita",
      description: `${isDryRun() ? "SIMULAZIONE: " : ""}pubblicata «${item.title}» su ${label}`,
      clientId: pub.clientId,
      target: `pubblicazione:${item.id}`,
      meta: { profilo: label, idEsterno: result.externalId, link: result.permalink, programmataDa: pub.createdBy },
    });
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(publications).set({ status: "errore", error: message.slice(0, 2000) }).where(eq(publications.id, id));
    await logError({
      userId: pub.createdBy,
      area: "Pubblicazione",
      message: `Pubblicazione non riuscita su ${label}: ${message}`,
      detail: errorDetail(e, { Pubblicazione: id, Scheda: pub.itemId, Profilo: label, Formato: pub.format, File: pub.mediaIds.length }),
      path: `/pubblicazioni/${pub.itemId}`,
      clientId: pub.clientId,
    });
    return true;
  }
}
