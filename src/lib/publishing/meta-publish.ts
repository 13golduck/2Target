import "server-only";

import { META } from "@/lib/integrations/config";
import { getJson, qs } from "@/lib/integrations/http";

// Pubblicazione via Graph API su Pagine Facebook e profili Instagram professionali.
// Instagram: si crea un "contenitore" con l'indirizzo pubblico del file, si aspetta che Meta lo elabori, poi si pubblica.
// Facebook: foto (una o più), video, oppure solo testo.

export type PublishMedia = { kind: "image" | "video"; url: string; mime: string };
export type PublishInput = {
  platform: "facebook" | "instagram";
  /** ID della pagina Facebook o dell'account Instagram professionale. */
  accountId: string;
  /** Token della pagina (vale anche per l'account Instagram collegato). */
  token: string;
  format: string;
  caption: string;
  media: PublishMedia[];
  /** Chiamata durante le attese (elaborazione video): segnala che l'invio è ancora vivo. */
  heartbeat?: () => Promise<void>;
};
export type PublishResult = { externalId: string; permalink: string | null };

const graph = (p: string) => `https://graph.facebook.com/${META.version}/${p}`;
const post = <T>(p: string, params: Record<string, string | number | undefined>) =>
  getJson<T>(graph(p), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs(params) });
const get = <T>(p: string, params: Record<string, string | number | undefined>) => getJson<T>(`${graph(p)}?${qs(params)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulazione: in locale sempre, in produzione solo con PUBLISH_DRY_RUN=true. Non contatta Meta. */
export const isDryRun = () => process.env.NODE_ENV !== "production" || process.env.PUBLISH_DRY_RUN === "true";

/** Controlli prima della programmazione: cosa si può pubblicare dove. Restituisce un messaggio d'errore o null. */
export function checkPublishable(platform: string, format: string, media: { kind: string; mime: string }[], caption: string) {
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
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
  return "Per ora 2Target pubblica solo su Facebook e Instagram";
}

export async function publish(input: PublishInput): Promise<PublishResult> {
  if (isDryRun()) {
    await sleep(800);
    return { externalId: `simulazione-${Date.now()}`, permalink: null };
  }
  return input.platform === "instagram" ? publishInstagram(input) : publishFacebook(input);
}

// ── Instagram ─────────────────────────────────────────────────────────

async function waitContainer(id: string, token: string, heartbeat?: () => Promise<void>) {
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

async function igContainer(ig: string, token: string, m: PublishMedia, extra: Record<string, string | undefined>, heartbeat?: () => Promise<void>) {
  const params =
    m.kind === "image"
      ? { image_url: m.url, ...extra, access_token: token }
      : { video_url: m.url, media_type: extra.media_type ?? "REELS", ...extra, access_token: token };
  const { id } = await post<{ id: string }>(`${ig}/media`, params);
  await waitContainer(id, token, heartbeat);
  return id;
}

async function publishInstagram({ accountId: ig, token, format, caption, media, heartbeat }: PublishInput): Promise<PublishResult> {
  let creationId: string;
  if (format === "carosello") {
    const children: string[] = [];
    for (const m of media) children.push(await igContainer(ig, token, m, { is_carousel_item: "true", ...(m.kind === "video" && { media_type: "VIDEO" }) }, heartbeat));
    const { id } = await post<{ id: string }>(`${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token });
    await waitContainer(id, token, heartbeat);
    creationId = id;
  } else if (format === "storia") {
    creationId = await igContainer(ig, token, media[0], { media_type: "STORIES" }, heartbeat);
  } else {
    // Post con foto, oppure video (su Instagram i video nel feed sono reel)
    creationId = await igContainer(ig, token, media[0], { caption, ...(media[0].kind === "video" && { media_type: "REELS" }) }, heartbeat);
  }
  const { id } = await post<{ id: string }>(`${ig}/media_publish`, { creation_id: creationId, access_token: token });
  const info = await get<{ permalink?: string }>(id, { fields: "permalink", access_token: token }).catch(() => ({}) as { permalink?: string });
  return { externalId: id, permalink: info.permalink ?? null };
}

// ── Facebook ──────────────────────────────────────────────────────────

async function publishFacebook({ accountId: page, token, caption, media }: PublishInput): Promise<PublishResult> {
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
  return { externalId: postId, permalink: info.permalink_url ?? null };
}

// ── Controllo anti-doppione ───────────────────────────────────────────

const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 300);

/**
 * Cerca sul profilo un post uscito dopo `since` con la stessa didascalia: prima di ripetere un invio
 * dall'esito incerto, così non si pubblica due volte. Senza didascalia non si può confrontare (null).
 */
export async function findRecentTwin(o: { platform: "facebook" | "instagram"; accountId: string; token: string; caption: string; since: Date }): Promise<PublishResult | null> {
  if (isDryRun() || !norm(o.caption)) return null;
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
