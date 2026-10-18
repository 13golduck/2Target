import "server-only";

import { appUrl, META } from "@/lib/integrations/config";
import { integrationKey } from "@/lib/integrations/keys";
import { getJson, qs } from "@/lib/integrations/http";
import type { PublishExtras } from "@/db/schema";
import { mediaProblem, type RuleMedia } from "./media-rules";
import { checkTikTokMedia } from "./tiktok-rules";

// Pubblicazione via Graph API su Pagine Facebook e profili Instagram professionali.
// Instagram: si crea un "contenitore" con l'indirizzo pubblico del file, si aspetta che Meta lo elabori, poi si pubblica.
// Facebook: foto (una o più), video, oppure solo testo.

export type PublishMedia = { kind: "image" | "video"; url: string; mime: string };
export type PublishInput = {
  platform: "facebook" | "instagram";
  /** ID della pagina Facebook o dell'account Instagram professionale. */
  accountId: string;
  /** Token della pagina (vale anche per l'account Instagram collegato), o dell'utente Instagram con il login Instagram. */
  token: string;
  /** Instagram collegato con il login Instagram (senza Pagina Facebook): le chiamate vanno su graph.instagram.com. */
  host?: "facebook" | "instagram";
  format: string;
  caption: string;
  media: PublishMedia[];
  /** Chiamata durante le attese (elaborazione video): segnala che l'invio è ancora vivo. */
  heartbeat?: () => Promise<void>;
  /** Primo commento, coautori e sede (vedi ./extras). */
  extras?: PublishExtras | null;
};
/** warning: il post è uscito, ma un passaggio facoltativo (primo commento, sede) non è riuscito. */
export type PublishResult = { externalId: string; permalink: string | null; warning?: string };

type Host = "facebook" | "instagram";
const graph = (host: Host, p: string) => `https://graph.${host}.com/${META.version}/${p}`;
const api = (host: Host = "facebook") => ({
  post: <T>(p: string, params: Record<string, string | number | undefined>) =>
    getJson<T>(graph(host, p), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs(params) }),
  get: <T>(p: string, params: Record<string, string | number | undefined>) => getJson<T>(`${graph(host, p)}?${qs(params)}`),
});
const { post, get } = api();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulazione (non contatta Meta) salvo attivazione esplicita: la pubblicazione è reale solo se in Impostazioni
 * l'interruttore «Pubblicazione reale» è acceso PER QUESTO dominio. Una copia del database usata su un altro
 * indirizzo (prova, staging) resta quindi sempre in simulazione. In locale è sempre simulazione.
 */
export function isDryRun() {
  if (process.env.NODE_ENV !== "production" || process.env.PUBLISH_DRY_RUN === "true") return true;
  const liveHost = integrationKey("publishLiveHost");
  let host = "";
  try {
    host = new URL(appUrl()).host;
  } catch {
    return true;
  }
  return !liveHost || liveHost !== host;
}

/** Controlli prima della programmazione: cosa si può pubblicare dove. Restituisce un messaggio d'errore o null. */
export function checkPublishable(platform: string, format: string, media: RuleMedia[], caption: string) {
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  // Durata, proporzioni, hashtag e stato della conversione dei video (regole comuni, vedi media-rules)
  const mediaIssue = mediaProblem(platform, format, media, caption);
  if (mediaIssue) return mediaIssue;
  // Il formato della scheda vale su tutti i profili: un reel senza video o un carosello senza foto non deve
  // uscire come post di solo testo (Facebook e LinkedIn lo accetterebbero)
  if ((format === "reel" || format === "video") && !videos.length) return `Il ${format} richiede un video: caricalo nella scheda`;
  if (format === "carosello" && images.length + videos.length < 2) return "Il carosello va da 2 a 10 foto o video: caricali nella scheda";
  if (platform === "instagram") {
    if (!media.length) return "Instagram richiede almeno una foto o un video";
    if (images.some((m) => m.mime !== "image/jpeg")) return "Instagram accetta solo foto JPEG: ricarica le immagini (2Target le converte da sola)";
    if (format === "carosello") {
      if (media.length < 2 || media.length > 10) return "Il carosello di Instagram va da 2 a 10 elementi";
    } else if (media.length > 1) return `Per «${format}» su Instagram serve un solo file (per più foto scegli il formato carosello)`;
    if (format === "reel" && !videos.length) return "Il reel richiede un video";
    if (caption.length > 2200) return "La didascalia di Instagram supera i 2.200 caratteri";
    return null;
  }
  if (platform === "facebook") {
    if (format === "storia") return "Le storie della Pagina Facebook non si pubblicano da 2Target: pubblicale su Instagram";
    if (videos.length > 1 || (videos.length && images.length)) return "Su Facebook: un solo video, oppure solo foto";
    if (!media.length && !caption.trim()) return "Scrivi un testo o carica una foto";
    return null;
  }
  if (platform === "tiktok") return checkTikTokMedia(format, media, caption);
  if (platform === "linkedin") {
    if (format === "storia") return "LinkedIn non ha le storie";
    if (videos.length > 1 || (videos.length && images.length)) return "Su LinkedIn: un solo video, oppure da 1 a 20 foto";
    if (images.length > 20) return "Su LinkedIn al massimo 20 foto per post";
    if (!media.length && !caption.trim()) return "Scrivi un testo o carica una foto";
    if (caption.length > 3000) return "Il testo per LinkedIn supera i 3.000 caratteri";
    return null;
  }
  return "Per ora 2Target pubblica su Facebook, Instagram, TikTok e LinkedIn";
}

export async function publish(input: PublishInput): Promise<PublishResult> {
  if (isDryRun()) {
    await sleep(800);
    return { externalId: `simulazione-${Date.now()}`, permalink: null };
  }
  return input.platform === "instagram" ? publishInstagram(input) : publishFacebook(input);
}

// ── Instagram ─────────────────────────────────────────────────────────

async function waitContainer(id: string, token: string, heartbeat?: () => Promise<void>, host: Host = "facebook") {
  const { get } = api(host);
  // I video richiedono l'elaborazione di Meta: si controlla ogni 5 secondi, fino a 5 minuti
  for (let i = 0; i < 60; i++) {
    await heartbeat?.().catch(() => undefined);
    const s = await get<{ status_code?: string; status?: string }>(id, { fields: "status_code,status", access_token: token });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram non ha accettato il file: ${s.status ?? s.status_code}`);
    await sleep(5000);
  }
  throw new Error("Instagram sta ancora elaborando il video dopo 5 minuti: riprova più tardi");
}

async function igContainer(ig: string, token: string, m: PublishMedia, extra: Record<string, string | undefined>, heartbeat?: () => Promise<void>, host: Host = "facebook") {
  const { post } = api(host);
  const params =
    m.kind === "image"
      ? { image_url: m.url, ...extra, access_token: token }
      : { video_url: m.url, media_type: extra.media_type ?? "REELS", ...extra, access_token: token };
  const { id } = await post<{ id: string }>(`${ig}/media`, params);
  await waitContainer(id, token, heartbeat, host);
  return id;
}

/**
 * Sede da taggare: la Pagina Facebook collegata, se ha un indirizzo (Instagram accetta come luogo l'id di una
 * Pagina con posizione). Solo con l'accesso tramite Pagina: con il login Instagram diretto non c'è una Pagina.
 */
async function pageLocationId(token: string, host: Host) {
  if (host !== "facebook") return null;
  const me = await get<{ id: string; location?: { street?: string; city?: string } }>("me", { fields: "id,location", access_token: token }).catch(() => null);
  return me?.location && (me.location.street || me.location.city) ? me.id : null;
}

/** Primo commento sul post appena uscito. Non lancia: se non riesce, il post resta pubblicato. */
async function postFirstComment(postId: string, message: string, token: string, host: Host = "facebook") {
  try {
    await api(host).post(`${postId}/comments`, { message, access_token: token });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /permission|#10|#200|manage_comments|pages_manage_engagement/i.test(msg)
      ? "primo commento non pubblicato: manca il permesso di Meta per i commenti (da approvare con l'App Review)"
      : `primo commento non pubblicato: ${msg}`;
  }
}

async function publishInstagram({ accountId: ig, token, format, caption, media, heartbeat, host = "facebook", extras }: PublishInput): Promise<PublishResult> {
  const { post, get } = api(host);
  const warnings: string[] = [];
  // Coautori e sede valgono per post, reel e caroselli (non per le storie): vanno sul contenitore principale
  const tagged: Record<string, string> = {};
  if (format !== "storia" && extras?.collaborators?.length) tagged.collaborators = JSON.stringify(extras.collaborators);
  if (format !== "storia" && extras?.tagLocation) {
    const location = await pageLocationId(token, host);
    if (location) tagged.location_id = location;
    else warnings.push("sede non taggata: la Pagina Facebook collegata non ha un indirizzo");
  }
  let creationId: string;
  if (format === "carosello") {
    const children: string[] = [];
    for (const m of media) children.push(await igContainer(ig, token, m, { is_carousel_item: "true", ...(m.kind === "video" && { media_type: "VIDEO" }) }, heartbeat, host));
    const { id } = await post<{ id: string }>(`${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, ...tagged, access_token: token });
    await waitContainer(id, token, heartbeat, host);
    creationId = id;
  } else if (format === "storia") {
    creationId = await igContainer(ig, token, media[0], { media_type: "STORIES" }, heartbeat, host);
  } else {
    // Post con foto, oppure video (su Instagram i video nel feed sono reel)
    creationId = await igContainer(ig, token, media[0], { caption, ...tagged, ...(media[0].kind === "video" && { media_type: "REELS" }) }, heartbeat, host);
  }
  const { id } = await post<{ id: string }>(`${ig}/media_publish`, { creation_id: creationId, access_token: token });
  const info = await get<{ permalink?: string }>(id, { fields: "permalink", access_token: token }).catch(() => ({}) as { permalink?: string });
  if (extras?.firstComment && format !== "storia") {
    const w = await postFirstComment(id, extras.firstComment, token, host);
    if (w) warnings.push(w);
  }
  return { externalId: id, permalink: info.permalink ?? null, ...(warnings.length && { warning: warnings.join("; ") }) };
}

// ── Facebook ──────────────────────────────────────────────────────────

async function publishFacebook({ accountId: page, token, caption, media, extras }: PublishInput): Promise<PublishResult> {
  let postId: string;
  const video = media.find((m) => m.kind === "video");
  if (video) {
    const { id } = await post<{ id: string }>(`${page}/videos`, { file_url: video.url, description: caption, access_token: token });
    postId = id;
  } else if (media.length === 1) {
    const r = await post<{ id: string; post_id?: string }>(`${page}/photos`, { url: media[0].url, caption, access_token: token });
    postId = r.post_id ?? r.id;
  } else if (media.length > 1) {
    // Più foto: si caricano senza pubblicarle, poi un solo post con tutte
    const ids: string[] = [];
    for (const m of media) ids.push((await post<{ id: string }>(`${page}/photos`, { url: m.url, published: "false", access_token: token })).id);
    const params: Record<string, string> = { message: caption, access_token: token };
    ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    postId = (await post<{ id: string }>(`${page}/feed`, params)).id;
  } else {
    postId = (await post<{ id: string }>(`${page}/feed`, { message: caption, access_token: token })).id;
  }
  const info = await get<{ permalink_url?: string }>(postId, { fields: "permalink_url", access_token: token }).catch(() => ({}) as { permalink_url?: string });
  const warning = extras?.firstComment ? await postFirstComment(postId, extras.firstComment, token) : null;
  return { externalId: postId, permalink: info.permalink_url ?? null, ...(warning && { warning }) };
}

// ── Controllo anti-doppione ───────────────────────────────────────────

const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 300);

/**
 * Cerca sul profilo un post uscito dopo `since` con la stessa didascalia: prima di ripetere un invio
 * dall'esito incerto, così non si pubblica due volte. Senza didascalia non si può confrontare (null).
 */
export async function findRecentTwin(o: { platform: "facebook" | "instagram"; accountId: string; token: string; caption: string; since: Date; host?: Host }): Promise<PublishResult | null> {
  if (isDryRun() || !norm(o.caption)) return null;
  const { get } = api(o.host);
  const target = norm(o.caption);
  if (o.platform === "instagram") {
    const r = await get<{ data: { id: string; caption?: string; timestamp: string; permalink?: string }[] }>(`${o.accountId}/media`, { fields: "id,caption,timestamp,permalink", limit: 10, access_token: o.token });
    const hit = r.data.find((m) => Date.parse(m.timestamp) >= o.since.getTime() - 60_000 && norm(m.caption ?? "") === target);
    return hit ? { externalId: hit.id, permalink: hit.permalink ?? null } : null;
  }
  const r = await get<{ data: { id: string; message?: string; created_time: string; permalink_url?: string }[] }>(`${o.accountId}/posts`, { fields: "id,message,created_time,permalink_url", limit: 10, access_token: o.token });
  const hit = r.data.find((p) => Date.parse(p.created_time) >= o.since.getTime() - 60_000 && norm(p.message ?? "") === target);
  return hit ? { externalId: hit.id, permalink: hit.permalink_url ?? null } : null;
}

/** Errori di rete o di tempo: la richiesta potrebbe essere arrivata a Meta comunque. */
export function isUncertain(e: unknown) {
  const err = e as { name?: string; message?: string; cause?: { code?: string } };
  return err?.name === "TimeoutError" || err?.name === "AbortError" || /fetch failed|ECONNRESET|socket hang up|network/i.test(err?.message ?? "") || !!err?.cause?.code;
}
