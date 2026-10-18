import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets, publications, socialAccounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { errorDetail, logError } from "@/lib/error-log";
import { mediaPath, publicMediaUrl } from "@/lib/media";
import * as google from "@/lib/integrations/google";
import * as linkedin from "@/lib/integrations/linkedin";
import * as pinterest from "@/lib/integrations/pinterest";
import * as threads from "@/lib/integrations/threads";
import * as youtube from "@/lib/integrations/youtube";
import { checkPublishable, findRecentTwin, isDryRun, isUncertain, publish } from "./meta-publish";
import { notifyPendingOutcomes } from "./notify";
import { connectionsOf, publishToken, routeOf } from "./targets";
import { creatorInfo, startTikTok, tiktokResult, tiktokStatus } from "./tiktok-publish";
import { checkTikTokOptions, tiktokKind } from "./tiktok-rules";

// Pubblicazioni programmate: ogni minuto (e a ogni chiamata di /api/cron/publish) si pubblicano quelle arrivate all'ora.
// Una pubblicazione si "prende" con un aggiornamento atomico: anche con due giri contemporanei esce una volta sola.
// Gli errori NON si ritentano da soli (rischio di doppio post): si riprovano a mano dalla scheda.
// TikTok elabora i file in sottofondo: l'invio resta "in corso" con il publish_id salvato e l'esito si legge nei giri dopo.

/** Oltre questo tempo un invio TikTok ancora in elaborazione diventa "esito incerto". */
const TIKTOK_MAX_MINUTES = 30;

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
    // Rimaste "in corso" senza segnali di vita da 20 minuti (riavvio a metà): esito incerto.
    // Non quelle TikTok già avviate (con publish_id): il loro esito si controlla qui sotto.
    await db
      .update(publications)
      .set({ status: "errore", error: "ESITO INCERTO: invio interrotto (riavvio dell'app). Con «Riprova» 2Target controlla prima il profilo e non ripubblica se il post è già uscito." })
      .where(and(eq(publications.status, "in_corso"), isNull(publications.remoteId), lt(publications.updatedAt, new Date(Date.now() - 20 * 60_000))));

    const processing = await db
      .select({ id: publications.id })
      .from(publications)
      .where(and(eq(publications.status, "in_corso"), isNotNull(publications.remoteId)))
      .limit(20);
    for (const { id } of processing) await checkTikTokProcessing(id).catch((e) => console.error("[pubblicazioni] stato TikTok:", e));

    const due = await db
      .select({ id: publications.id })
      .from(publications)
      .where(and(eq(publications.status, "programmata"), lte(publications.scheduledAt, new Date())))
      .orderBy(asc(publications.scheduledAt))
      .limit(10);
    let done = 0;
    for (const { id } of due) if (await processPublication(id)) done++;
    // Esiti da comunicare (email di errore al consulente, avviso di uscita al cliente): una volta per esito
    await notifyPendingOutcomes().catch((e) => console.error("[pubblicazioni] avvisi:", e));
    // Contatti dai moduli di Meta: lettura ogni 15 minuti (import dinamico: il modulo inserzioni usa questo file)
    void import("@/lib/ads/campaigns").then((m) => m.maybeSyncAllLeadForms()).catch((e) => console.error("[lead] moduli Meta:", e));
    return { skipped: false, done };
  } finally {
    g.__publishRunning = false;
  }
}

/** Pubblica subito una pubblicazione (se è ancora programmata). Restituisce true se l'ha presa in carico. */
export async function processPublication(id: number) {
  await ensureIntegrationKeys();
  // publish_id TikTok di un tentativo precedente: si toglie durante l'invio, così il controllo dello stato
  // nei giri dello scheduler non tocca questa pubblicazione finché non c'è il nuovo esito
  const [before] = await db.select({ remoteId: publications.remoteId, mediaIds: publications.mediaIds }).from(publications).where(eq(publications.id, id));
  const previousRemoteId = before?.remoteId ?? null;
  // Video ancora in conversione (FFmpeg): si lascia «programmata» e la riprende il giro successivo (ogni minuto)
  if (before?.mediaIds.length) {
    const [busy] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.id, before.mediaIds), eq(mediaAssets.processState, "in_lavorazione")))
      .limit(1);
    if (busy) return false;
  }
  // Presa in carico atomica: anche con due giri contemporanei (timer, cron, più processi) esce una volta sola
  const [claim] = await db
    .update(publications)
    .set({ status: "in_corso", attempts: sql`${publications.attempts} + 1`, error: null, remoteId: null })
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

  let result: { externalId: string; permalink: string | null; found?: boolean } | undefined;
  try {
    // Controlli decisivi al momento dell'invio
    if (!channel || !item || channel.clientId !== pub.clientId || item.clientId !== pub.clientId) {
      throw new Error("Il profilo non appartiene più al cliente di questa scheda: pubblicazione bloccata");
    }
    if (item.status !== "approvato" && item.status !== "pubblicato") throw new Error("La scheda non è più approvata: pubblicazione bloccata");
    const [conn] = await connectionsOf([channel]);
    const route = routeOf(channel, conn);
    if ("problem" in route) throw new Error(`Il profilo ${route.problem}`);
    const token = await publishToken(channel, route.route);

    const files = pub.mediaIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, pub.mediaIds)) : [];
    const ordered = pub.mediaIds.map((mid) => files.find((f) => f.id === mid)).filter((f) => !!f);
    if (ordered.length !== pub.mediaIds.length) throw new Error("Uno dei file da pubblicare è stato eliminato");
    if (ordered.some((f) => f.clientId !== pub.clientId)) throw new Error("File di un altro cliente: pubblicazione bloccata");
    const problem = checkPublishable(channel.platform, pub.format, ordered, pub.caption ?? "");
    if (problem) throw new Error(problem);

    const urls = ordered.map((f) => publicMediaUrl(f.storageKey));
    const retry = (pub.attempts ?? 0) >= 2;
    if (route.route === "tiktok") {
      const kind = tiktokKind(pub.format, ordered)!;
      // Nuovo tentativo di un invio già avviato: si chiede a TikTok com'è finito, invece di ripubblicare
      if (previousRemoteId && !isDryRun()) {
        const st = await tiktokStatus(previousRemoteId, token);
        if (st.state === "processing") {
          await db.update(publications).set({ remoteId: previousRemoteId }).where(eq(publications.id, id));
          return true; // TikTok ci sta ancora lavorando: si torna a controllare nei giri successivi
        }
        if (st.state === "done") result = { ...tiktokResult(previousRemoteId, st.postId, channel.handle, kind), found: true };
      }
      if (!result) {
        // Impostazioni ricontrollate sull'account com'è ADESSO (visibilità e interazioni possono cambiare)
        const creator = isDryRun() ? null : await creatorInfo(token);
        const bad = creator ? checkTikTokOptions(pub.options, creator, kind) : pub.options ? null : "Mancano le impostazioni di TikTok";
        if (bad) throw new Error(`${bad}. Per cambiare le impostazioni annulla questa pubblicazione e programmala di nuovo.`);
        if (isDryRun()) result = { externalId: `simulazione-${Date.now()}`, permalink: null };
        else {
          const publishId = await startTikTok({ token, kind, caption: pub.caption ?? "", options: pub.options!, urls });
          // Salvato subito: da qui l'esito si legge con il publish_id, anche dopo un riavvio
          await db.update(publications).set({ remoteId: publishId, updatedAt: new Date() }).where(eq(publications.id, id));
          return true;
        }
      }
    } else if (route.route === "linkedin") {
      // LinkedIn: i file si caricano dal disco di 2Target (non li scarica da un indirizzo pubblico)
      result = isDryRun()
        ? { externalId: `simulazione-${Date.now()}`, permalink: null }
        : await linkedin.publishPost({
            orgId: channel.externalId!,
            token,
            caption: pub.caption ?? "",
            media: ordered.map((f) => ({ kind: f.kind, mime: f.mime, path: mediaPath(f.storageKey) })),
            heartbeat,
          });
    } else if (route.route === "threads" || route.route === "pinterest" || route.route === "youtube" || route.route === "business_profile") {
      result = isDryRun() ? { externalId: `simulazione-${Date.now()}`, permalink: null } : await publishOther(route.route, { channel, item, pub, token, ordered, urls, heartbeat });
    } else {
      const host = route.route === "instagram" ? ("instagram" as const) : ("facebook" as const);
      const platform = channel.platform as "facebook" | "instagram";
      const twin = retry ? await findRecentTwin({ platform, accountId: channel.externalId!, token, caption: pub.caption ?? "", since: pub.createdAt, host }).catch(() => null) : null;
      result = twin
        ? { ...twin, found: true }
        : await publish({
            platform,
            accountId: channel.externalId!,
            token,
            host,
            format: pub.format,
            caption: pub.caption ?? "",
            media: ordered.map((f, i) => ({ kind: f.kind, mime: f.mime, url: urls[i] })),
            heartbeat,
            extras: pub.extras,
          });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const uncertain = isUncertain(e);
    const text = !uncertain
      ? message
      : channel?.platform === "tiktok"
        ? `ESITO INCERTO: la connessione con TikTok si è interrotta mentre si avviava l'invio (${message}). Prima di riprovare controlla sul profilo TikTok (anche tra i post privati) che il post non sia uscito.`
        : channel?.platform === "linkedin"
          ? `ESITO INCERTO: la connessione con LinkedIn si è interrotta (${message}). Prima di riprovare controlla sulla pagina LinkedIn che il post non sia uscito.`
          : channel && OTHER_LABEL[channel.platform]
            ? `ESITO INCERTO: la connessione con ${OTHER_LABEL[channel.platform]} si è interrotta (${message}). Prima di riprovare controlla sul profilo che il post non sia uscito.`
            : `ESITO INCERTO: la connessione con Meta si è interrotta (${message}). Il post potrebbe essere uscito: con «Riprova» 2Target controlla prima il profilo e non lo ripubblica se lo trova.`;
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

  await markPublished(id, pub, item!, label, result!);
  return true;
}

type Pub = typeof publications.$inferSelect;
type Item = typeof editorialItems.$inferSelect;
type Media = typeof mediaAssets.$inferSelect;

const OTHER_LABEL: Record<string, string> = { threads: "Threads", pinterest: "Pinterest", youtube: "YouTube", business_profile: "Google" };

/** Link del pulsante o del pin: solo un indirizzo web vero (non telefono, WhatsApp o direct). */
const webLink = (item: Item) => (item.ctaUrl && /^https?:\/\//i.test(item.ctaUrl) ? item.ctaUrl : null);

/** Threads, Pinterest, YouTube Shorts e scheda Google: un invio diretto, senza elaborazione in sottofondo da seguire. */
async function publishOther(
  route: "threads" | "pinterest" | "youtube" | "business_profile",
  o: { channel: typeof socialAccounts.$inferSelect; item: Item; pub: Pub; token: string; ordered: Media[]; urls: string[]; heartbeat: () => Promise<void> },
) {
  const caption = o.pub.caption ?? "";
  const externalId = o.channel.externalId!;
  if (route === "threads") {
    return threads.publishThreads({ userId: externalId, token: o.token, caption, media: o.ordered.map((f, i) => ({ kind: f.kind === "video" ? "video" : "image", url: o.urls[i] })), heartbeat: o.heartbeat });
  }
  if (route === "pinterest") {
    return pinterest.publishPin({ token: o.token, boardId: externalId, caption, link: webLink(o.item), imageUrls: o.urls });
  }
  if (route === "youtube") {
    const video = o.ordered[0];
    return youtube.uploadShort({ token: o.token, path: mediaPath(video.storageKey), mime: video.mime, caption, heartbeat: o.heartbeat });
  }
  return google.publishBusinessPost({ token: o.token, externalId, caption, imageUrl: o.urls[0] ?? null, link: webLink(o.item) });
}

/** Il post è USCITO: lo si registra subito, e niente di ciò che segue può riportarlo a "errore". */
async function markPublished(id: number, pub: Pub, item: Item, label: string, result: { externalId: string; permalink: string | null; found?: boolean; warning?: string }) {
  await db
    .update(publications)
    .set({ status: "pubblicata", externalId: result.externalId, permalink: result.permalink, publishedAt: new Date(), error: null })
    .where(eq(publications.id, id));
  try {
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
      action: isDryRun() ? "pubblicazione.simulata" : result.found ? "pubblicazione.ritrovata" : "pubblicazione.uscita",
      description: `${isDryRun() ? "SIMULAZIONE: " : ""}${result.found ? "ritrovata sul profilo (già uscita, non ripubblicata)" : "pubblicata"} «${item.title}» su ${label}`,
      clientId: pub.clientId,
      target: `pubblicazione:${item.id}`,
      meta: { profilo: label, idEsterno: result.externalId, link: result.permalink, programmataDa: pub.createdBy, ...(result.warning && { avviso: result.warning }) },
    });
    // Uscito, ma un passaggio facoltativo non è riuscito (primo commento, sede): resta traccia negli errori
    if (result.warning) {
      await logError({ userId: pub.createdBy, area: "Pubblicazione", message: `Uscito su ${label}, ma ${result.warning}`, path: `/pubblicazioni/${item.id}`, clientId: pub.clientId });
    }
  } catch (e) {
    console.error("[pubblicazioni] registrazione dopo l'uscita non riuscita:", e);
  }
}

/** Un controllo dello stato di un invio TikTok avviato: uscito, rifiutato o ancora in elaborazione. */
async function checkTikTokProcessing(id: number) {
  const [pub] = await db.select().from(publications).where(eq(publications.id, id));
  if (!pub || pub.status !== "in_corso" || !pub.remoteId) return;
  const [channel] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, pub.socialAccountId));
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, pub.itemId));
  const label = channel ? `${channel.platform} @${channel.handle}` : "profilo rimosso";
  const tooOld = Date.now() - pub.updatedAt.getTime() > TIKTOK_MAX_MINUTES * 60_000;
  const fail = async (text: string) => {
    await db.update(publications).set({ status: "errore", error: text.slice(0, 2000) }).where(and(eq(publications.id, id), eq(publications.status, "in_corso")));
    await logError({ userId: pub.createdBy, area: "Pubblicazione", message: `Pubblicazione non riuscita su ${label}: ${text}`, path: `/pubblicazioni/${pub.itemId}`, clientId: pub.clientId });
  };
  if (!channel || !item) return fail("Profilo o scheda rimossi durante l'elaborazione di TikTok");
  let st: Awaited<ReturnType<typeof tiktokStatus>>;
  try {
    const [conn] = await connectionsOf([channel]);
    const route = routeOf(channel, conn);
    if ("problem" in route) throw new Error(`Il profilo ${route.problem}`);
    st = await tiktokStatus(pub.remoteId, await publishToken(channel, route.route));
  } catch (e) {
    // Errore di rete o di accesso: si riprova al giro dopo, fino al limite di tempo
    if (tooOld) await fail(`ESITO INCERTO: non è stato possibile leggere da TikTok l'esito dell'invio (${e instanceof Error ? e.message : e}). Con «Riprova» 2Target chiede prima a TikTok com'è finito e non ripubblica se il post è uscito.`);
    return;
  }
  if (st.state === "failed") return fail(st.reason);
  if (st.state === "processing") {
    if (tooOld) await fail(`ESITO INCERTO: TikTok sta ancora elaborando il post dopo ${TIKTOK_MAX_MINUTES} minuti. Con «Riprova» 2Target chiede prima a TikTok com'è finito e non ripubblica se il post è uscito.`);
    return;
  }
  const files = pub.mediaIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, pub.mediaIds)) : [];
  const kind = tiktokKind(pub.format, pub.mediaIds.map((mid) => files.find((f) => f.id === mid)).filter((f) => !!f)) ?? "video";
  await markPublished(id, pub, item, label, tiktokResult(pub.remoteId, st.postId, channel.handle, kind));
}
