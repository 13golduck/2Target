import "server-only";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { mediaPath, newStorageKey, removeMediaFile } from "@/lib/media";

// Video pronti per i social: dopo il caricamento si leggono durata, risoluzione e codec con FFmpeg e,
// se il file non è adatto a Meta/TikTok/LinkedIn, lo si converte in MP4 H.264 + AAC (in sottofondo).
// FFmpeg arriva con il pacchetto npm ffmpeg-static (GPL, usato come programma esterno, non incluso nel codice).

/** Programma FFmpeg: variabile FFMPEG_PATH, poi quello del pacchetto ffmpeg-static, poi quello di sistema. */
export function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const bundled = path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return existsSync(bundled) ? bundled : "ffmpeg";
}

export type VideoProbe = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  pixelFormat: string | null;
  fps: number | null;
  audioCodec: string | null;
  /** kb/s complessivi del file. */
  bitrateKbps: number | null;
};

/**
 * Lettura delle informazioni dall'uscita di `ffmpeg -i` (senza ffprobe, che non è nel pacchetto).
 * Funzione pura: il formato dell'uscita è stabile da anni ed è coperto dai test.
 */
export function parseProbe(stderr: string): VideoProbe {
  const dur = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const bitrate = /Duration:.*?bitrate:\s*(\d+)\s*kb\/s/.exec(stderr);
  const video = /Stream #[^\n]*?Video:\s*([a-z0-9_]+)[^\n]*/i.exec(stderr);
  const audio = /Stream #[^\n]*?Audio:\s*([a-z0-9_]+)/i.exec(stderr);
  let width: number | null = null;
  let height: number | null = null;
  let pixelFormat: string | null = null;
  let fps: number | null = null;
  if (video) {
    const line = video[0];
    const size = /,\s*(\d{2,5})x(\d{2,5})[\s,[]/.exec(line);
    if (size) [width, height] = [Number(size[1]), Number(size[2])];
    pixelFormat = /,\s*(yuv[a-z0-9]+|yuvj[a-z0-9]+|rgb[a-z0-9]+|bgr[a-z0-9]+|nv12|gray[a-z0-9]*)/i.exec(line)?.[1] ?? null;
    const f = /([\d.]+)\s*fps/.exec(line);
    fps = f ? Number(f[1]) : null;
    // Video ruotato dal telefono (rotate 90/270): larghezza e altezza mostrate si scambiano
    const rot = /rotate\s*:\s*(-?\d+)|displaymatrix: rotation of (-?[\d.]+)/i.exec(stderr);
    const deg = rot ? Math.abs(Number(rot[1] ?? rot[2])) % 180 : 0;
    if (deg === 90 && width && height) [width, height] = [height, width];
  }
  return {
    durationSec: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    width,
    height,
    videoCodec: video?.[1]?.toLowerCase() ?? null,
    pixelFormat: pixelFormat?.toLowerCase() ?? null,
    fps,
    audioCodec: audio?.[1]?.toLowerCase() ?? null,
    bitrateKbps: bitrate ? Number(bitrate[1]) : null,
  };
}

// Limiti scelti per stare dentro le regole di Instagram (25 Mbps, 60 fps, H.264/AAC), TikTok e LinkedIn
export const MAX_LONG_SIDE = 1920;
export const MAX_SHORT_SIDE = 1080;
export const MAX_FPS = 60;
export const MAX_BITRATE_KBPS = 20_000;

/** Motivi per cui il video va convertito (vuoto = va bene così). Funzione pura. */
export function conversionReasons(p: VideoProbe, mime: string) {
  const reasons: string[] = [];
  if (mime !== "video/mp4") reasons.push("formato non MP4");
  if (p.videoCodec && p.videoCodec !== "h264") reasons.push(`codifica ${p.videoCodec.toUpperCase()} invece di H.264`);
  if (p.audioCodec && p.audioCodec !== "aac") reasons.push(`audio ${p.audioCodec.toUpperCase()} invece di AAC`);
  if (p.pixelFormat && p.pixelFormat !== "yuv420p") reasons.push(`colori ${p.pixelFormat}`);
  if (p.width && p.height && (Math.max(p.width, p.height) > MAX_LONG_SIDE || Math.min(p.width, p.height) > MAX_SHORT_SIDE)) reasons.push(`risoluzione ${p.width}×${p.height}`);
  if (p.fps && p.fps > MAX_FPS + 0.5) reasons.push(`${Math.round(p.fps)} fotogrammi al secondo`);
  if (p.bitrateKbps && p.bitrateKbps > MAX_BITRATE_KBPS) reasons.push(`file troppo pesante (${Math.round(p.bitrateKbps / 1000)} Mbps)`);
  return reasons;
}

/** Argomenti di FFmpeg per la conversione (funzione pura, coperta dai test). */
export function conversionArgs(input: string, output: string, p: VideoProbe) {
  const vertical = (p.height ?? 0) >= (p.width ?? 0);
  // Ridimensiona solo se serve, mantenendo le proporzioni e dimensioni pari (richieste da H.264)
  const scale = vertical
    ? `scale='min(${MAX_SHORT_SIDE},iw)':'min(${MAX_LONG_SIDE},ih)':force_original_aspect_ratio=decrease`
    : `scale='min(${MAX_LONG_SIDE},iw)':'min(${MAX_SHORT_SIDE},ih)':force_original_aspect_ratio=decrease`;
  return [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-vf",
    `${scale},scale=trunc(iw/2)*2:trunc(ih/2)*2${p.fps && p.fps > MAX_FPS + 0.5 ? `,fps=${MAX_FPS}` : ""}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-maxrate",
    "8M",
    "-bufsize",
    "16M",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    // Il server Plesk ha poca memoria: due thread bastano e non bloccano l'app
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    // Indice all'inizio del file: Meta e TikTok lo leggono senza scaricarlo tutto
    "-movflags",
    "+faststart",
    output,
  ];
}

/** FFmpeg parte su questo server? Per /api/stato (diagnosi del deploy). */
export function ffmpegVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(ffmpegPath(), ["-version"], { timeout: 10_000 }, (err, out) => resolve(err ? null : String(out).split("\n")[0].replace(/ Copyright.*$/, "")));
  });
}

/** Il programma non è avviabile (assente, senza permessi, architettura sbagliata): non è colpa del file. */
const toolMissing = (e: unknown) => ["ENOENT", "EACCES", "ENOEXEC"].includes((e as { code?: string })?.code ?? "") || /spawn|exec format/i.test(String((e as Error)?.message));

/** Legge le informazioni del video. ffmpeg -i senza uscita termina con errore: si usa comunque lo stderr. */
export function probeVideo(file: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), ["-hide_banner", "-i", file], { timeout: 30_000, maxBuffer: 2_000_000 }, (err, _out, stderr) => {
      if (!stderr && err) return reject(err);
      resolve(parseProbe(String(stderr)));
    });
  });
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    child.stderr.on("data", (d) => {
      tail = (tail + String(d)).slice(-2000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg non è riuscito a convertire il video (codice ${code}): ${tail.split("\n").filter(Boolean).slice(-2).join(" ")}`));
    });
  });
}

// Conversioni in corso nel processo (una per file): evitano di lanciare due volte la stessa
const g = globalThis as unknown as { __videoJobs?: Set<number> };
const jobs = (g.__videoJobs ??= new Set<number>());

/**
 * Prepara un video appena caricato: legge le informazioni, converte se serve e aggiorna la scheda dei media.
 * Non lancia: un errore finisce nello stato del media («errore» con la nota), visibile nella scheda.
 */
export async function prepareVideoAsset(assetId: number) {
  if (jobs.has(assetId)) return;
  jobs.add(assetId);
  try {
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (!asset || asset.kind !== "video") return;
    const src = mediaPath(asset.storageKey);
    const probe = await probeVideo(src);
    const reasons = conversionReasons(probe, asset.mime);
    if (!reasons.length) {
      await db
        .update(mediaAssets)
        .set({ durationSec: probe.durationSec, videoCodec: probe.videoCodec, width: probe.width ?? asset.width, height: probe.height ?? asset.height, processState: "pronto", processNote: null })
        .where(eq(mediaAssets.id, assetId));
      return;
    }
    await db.update(mediaAssets).set({ processState: "in_lavorazione", processNote: `Conversione: ${reasons.join(", ")}` }).where(eq(mediaAssets.id, assetId));
    const key = newStorageKey("mp4");
    const out = mediaPath(key);
    // Tempo massimo proporzionato alla durata (minimo 5 minuti): un file bloccato non resta appeso per sempre
    await runFfmpeg(conversionArgs(src, out, probe), Math.max(5 * 60_000, (probe.durationSec ?? 60) * 20_000));
    const converted = await probeVideo(out);
    const size = (await stat(out)).size;
    await db
      .update(mediaAssets)
      .set({
        storageKey: key,
        mime: "video/mp4",
        fileName: asset.fileName.replace(/\.[^.]+$/, "") + ".mp4",
        size,
        width: converted.width,
        height: converted.height,
        durationSec: converted.durationSec,
        videoCodec: converted.videoCodec,
        processState: "pronto",
        processNote: `Convertito per i social (${reasons.join(", ")})`,
      })
      .where(eq(mediaAssets.id, assetId));
    await removeMediaFile(asset.storageKey);
  } catch (e) {
    // Senza FFmpeg sul server il video non si controlla ma resta pubblicabile come prima: non si blocca il lavoro
    const missing = toolMissing(e);
    await db
      .update(mediaAssets)
      .set(
        missing
          ? { processState: "pronto", processNote: "Video non controllato: FFmpeg non disponibile sul server" }
          : { processState: "errore", processNote: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
      )
      .where(eq(mediaAssets.id, assetId))
      .catch(() => undefined);
  } finally {
    jobs.delete(assetId);
  }
}

/** All'avvio: riprende i video rimasti a metà (il riavvio di Plesk interrompe FFmpeg). Uno alla volta. */
export async function resumeVideoPreparation() {
  const stuck = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.processState, "in_lavorazione"));
  for (const v of stuck) await prepareVideoAsset(v.id);
}

/**
 * Argomenti di FFmpeg per un video da immagini fisse (slide) con dissolvenze: ogni slide dura `seconds`,
 * la dissolvenza `fade` secondi. Uscita MP4 H.264 verticale, adatta a storie e reel. Funzione pura.
 */
export function slideshowArgs(images: string[], output: string, seconds = 2.6, fade = 0.5) {
  if (!images.length) throw new Error("Nessuna slide");
  const inputs = images.flatMap((f) => ["-loop", "1", "-t", String(seconds), "-i", f]);
  const filters: string[] = images.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,format=yuv420p,fps=30[v${i}]`);
  let last = "v0";
  for (let i = 1; i < images.length; i++) {
    const out = i === images.length - 1 ? "vout" : `x${i}`;
    // Ogni dissolvenza parte quando finisce la slide precedente, meno la durata della dissolvenza (cumulata)
    filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${(i * (seconds - fade)).toFixed(2)}[${out}]`);
    last = out;
  }
  if (images.length === 1) filters.push("[v0]null[vout]");
  return ["-hide_banner", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[vout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-threads", "2", "-movflags", "+faststart", output];
}

/** Esegue FFmpeg con gli argomenti dati (per i video generati da 2Target, es. il riepilogo del mese). */
export const renderWithFfmpeg = (args: string[], timeoutMs = 3 * 60_000) => runFfmpeg(args, timeoutMs);
