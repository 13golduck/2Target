import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialAccounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { errorDetail, logError } from "@/lib/error-log";
import { publicMediaUrl } from "@/lib/media";
import { decryptSecret } from "@/lib/secret-box";
import { checkPublishable, findRecentTwin, isDryRun, isUncertain, publish } from "./meta-publish";

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
    // Rimaste "in corso" senza segnali di vita da 20 minuti (riavvio a metà): esito incerto
    await db
      .update(publications)
      .set({ status: "errore", error: "ESITO INCERTO: invio interrotto (riavvio dell'app). Con «Riprova» 2Target controlla prima il profilo e non ripubblica se il post è già uscito." })
      .where(and(eq(publications.status, "in_corso"), lt(publications.updatedAt, new Date(Date.now() - 20 * 60_000))));

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
  // Presa in carico atomica: anche con due giri contemporanei (timer, cron, più processi) esce una volta sola
  const [claim] = await db
    .update(publications)
    .set({ status: "in_corso", attempts: sql`${publications.attempts} + 1`, error: null })
    .where(and(eq(publications.id, id), eq(publications.status, "programmata")));
  if (claim.affectedRows !== 1) return false;

  const [pub] = await db.select().from(publications).where(eq(publications.id, id));
  if (!pub) return false; // scheda eliminata nel frattempo (le pubblicazioni si cancellano con lei)
  const [channel] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, pub.socialAccountId));
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, pub.itemId));
  const label = channel ? `${channel.platform} @${channel.handle}` : "profilo rimosso";
  // Segnale di vita durante le attese: impedisce che l'invio venga creduto bloccato e ripetuto
  const heartbeat = async () => {
    await db.update(publications).set({ updatedAt: new Date() }).where(and(eq(publications.id, id), eq(publications.status, "in_corso")));
  };

  let result: { externalId: string; permalink: string | null; found?: boolean };
  try {
    // Controlli decisivi al momento dell'invio
    if (!channel || !item || channel.clientId !== pub.clientId || item.clientId !== pub.clientId) {
      throw new Error("Il profilo non appartiene più al cliente di questa scheda: pubblicazione bloccata");
    }
    if (item.status !== "approvato" && item.status !== "pubblicato") throw new Error("La scheda non è più approvata: pubblicazione bloccata");
    if (channel.platform !== "facebook" && channel.platform !== "instagram") throw new Error("Profilo non supportato per la pubblicazione");
    const token = decryptSecret(channel.assetTokenEnc);
    if (!channel.connected || !token || !channel.externalId) throw new Error("Il profilo non è più collegato: ricollegalo da Canali");

    const files = pub.mediaIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, pub.mediaIds)) : [];
    const ordered = pub.mediaIds.map((mid) => files.find((f) => f.id === mid)).filter((f) => !!f);
    if (ordered.length !== pub.mediaIds.length) throw new Error("Uno dei file da pubblicare è stato eliminato");
    if (ordered.some((f) => f.clientId !== pub.clientId)) throw new Error("File di un altro cliente: pubblicazione bloccata");
    const problem = checkPublishable(channel.platform, pub.format, ordered, pub.caption ?? "");
    if (problem) throw new Error(problem);

    // Nuovo tentativo: prima si controlla se il post è già uscito (esito incerto la volta precedente)
    const twin =
      (pub.attempts ?? 0) >= 2
        ? await findRecentTwin({ platform: channel.platform, accountId: channel.externalId, token, caption: pub.caption ?? "", since: pub.createdAt }).catch(() => null)
        : null;
    result = twin
      ? { ...twin, found: true }
      : await publish({
          platform: channel.platform,
          accountId: channel.externalId,
          token,
          format: pub.format,
          caption: pub.caption ?? "",
          media: ordered.map((f) => ({ kind: f.kind, mime: f.mime, url: publicMediaUrl(f.storageKey) })),
          heartbeat,
        });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const uncertain = isUncertain(e);
    const text = uncertain
      ? `ESITO INCERTO: la connessione con Meta si è interrotta (${message}). Il post potrebbe essere uscito: con «Riprova» 2Target controlla prima il profilo e non lo ripubblica se lo trova.`
      : message;
    await db.update(publications).set({ status: "errore", error: text.slice(0, 2000) }).where(eq(publications.id, id));
    await logError({
      userId: pub.createdBy,
      area: "Pubblicazione",
      message: `Pubblicazione ${uncertain ? "dall'esito incerto" : "non riuscita"} su ${label}: ${message}`,
      detail: errorDetail(e, { Pubblicazione: id, Scheda: pub.itemId, Profilo: label, Formato: pub.format, File: pub.mediaIds.length, Tentativo: pub.attempts }),
      path: `/pubblicazioni/${pub.itemId}`,
      clientId: pub.clientId,
    });
    return true;
  }

  // Da qui il post è USCITO: lo si registra subito, e niente di ciò che segue può riportarlo a "errore"
  await db
    .update(publications)
    .set({ status: "pubblicata", externalId: result.externalId, permalink: result.permalink, publishedAt: new Date(), error: null })
    .where(eq(publications.id, id));
  try {
    if (item!.status !== "pubblicato" || !item!.publishedUrl) {
      await db
        .update(editorialItems)
        .set({ status: "pubblicato", publishedUrl: item!.publishedUrl ?? result.permalink, externalPostId: item!.externalPostId ?? result.externalId })
        .where(eq(editorialItems.id, item!.id));
    }
    await audit({
      userId: null,
      actorLabel: "Sistema",
      category: "contenuti",
      action: isDryRun() ? "pubblicazione.simulata" : result.found ? "pubblicazione.ritrovata" : "pubblicazione.uscita",
      description: `${isDryRun() ? "SIMULAZIONE: " : ""}${result.found ? "ritrovata sul profilo (già uscita, non ripubblicata)" : "pubblicata"} «${item!.title}» su ${label}`,
      clientId: pub.clientId,
      target: `pubblicazione:${item!.id}`,
      meta: { profilo: label, idEsterno: result.externalId, link: result.permalink, programmataDa: pub.createdBy },
    });
  } catch (e) {
    console.error("[pubblicazioni] registrazione dopo l'uscita non riuscita:", e);
  }
  return true;
}
