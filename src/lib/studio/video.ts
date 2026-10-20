import { z } from "zod";

// Montaggio video dello Studio: clip (pezzi dei video caricati), scritte a tempo, musica e volume dell'audio
// originale. Il browser disegna le scritte come immagini trasparenti; il server compone il video con FFmpeg.
// Funzioni pure, testate in video.test.ts.

export const VIDEO_SIZES = {
  storia: { width: 1080, height: 1920, label: "Verticale 9:16 (reel, storie, TikTok)" },
  verticale: { width: 1080, height: 1350, label: "Verticale 4:5 (feed)" },
  quadrato: { width: 1080, height: 1080, label: "Quadrato 1:1" },
} as const;
export type VideoSize = keyof typeof VIDEO_SIZES;

export const VIDEO_LIMITS = { clips: 12, texts: 12, minClipSec: 0.5, maxTotalSec: 90, fps: 30 } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

export const ClipSchema = z.object({
  id: z.string().min(1).max(40),
  mediaId: z.number().int().positive().describe("Id di un video del materiale o del post"),
  start: z.number().min(0).describe("Secondo del video da cui parte la clip"),
  end: z.number().positive().describe("Secondo del video in cui finisce la clip"),
});
export type Clip = z.infer<typeof ClipSchema>;

export const TEXT_POSITIONS = ["alto", "centro", "basso"] as const;
export const TEXT_SIZES = { piccolo: 48, medio: 64, grande: 88 } as const;

export const VideoTextSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(200),
  from: z.number().min(0).describe("Secondo del montaggio in cui compare"),
  to: z.number().positive().describe("Secondo del montaggio in cui sparisce"),
  position: z.enum(TEXT_POSITIONS),
  size: z.enum(Object.keys(TEXT_SIZES) as [keyof typeof TEXT_SIZES, ...(keyof typeof TEXT_SIZES)[]]),
  color: z.string().regex(HEX),
  background: z.string().regex(HEX).nullable(),
});
export type VideoText = z.infer<typeof VideoTextSchema>;

export const VideoEditSchema = z.object({
  size: z.enum(Object.keys(VIDEO_SIZES) as [VideoSize, ...VideoSize[]]),
  clips: z.array(ClipSchema).min(1).max(VIDEO_LIMITS.clips),
  texts: z.array(VideoTextSchema).max(VIDEO_LIMITS.texts),
  /** Brano di sottofondo (file audio del materiale) e suo volume da 0 a 1. */
  music: z.object({ mediaId: z.number().int().positive(), volume: z.number().min(0).max(1) }).nullable(),
  /** Volume dell'audio dei video originali, da 0 (muto) a 1. */
  originalVolume: z.number().min(0).max(1),
});
export type VideoEdit = z.infer<typeof VideoEditSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export const clipLength = (c: Pick<Clip, "start" | "end">) => round2(c.end - c.start);
export const totalDuration = (edit: Pick<VideoEdit, "clips">) => round2(edit.clips.reduce((sum, c) => sum + clipLength(c), 0));

/** Dove inizia ogni clip nel montaggio (secondi). */
export function timeline(edit: Pick<VideoEdit, "clips">) {
  let at = 0;
  return edit.clips.map((c) => {
    const item = { ...c, offset: round2(at), length: clipLength(c) };
    at += item.length;
    return item;
  });
}

export type MediaInfo = { id: number; kind: string; durationSec: number | null };

/**
 * Rende il montaggio usabile: solo video e audio del progetto, tagli dentro la durata dei file (almeno mezzo
 * secondo), durata totale entro il limite, scritte dentro il montaggio. Null se non resta nessuna clip.
 */
export function sanitizeVideo(edit: VideoEdit, media: readonly MediaInfo[]): VideoEdit | null {
  const byId = new Map(media.map((m) => [m.id, m]));
  let budget: number = VIDEO_LIMITS.maxTotalSec;
  const clips: Clip[] = [];
  for (const c of edit.clips.slice(0, VIDEO_LIMITS.clips)) {
    const m = byId.get(c.mediaId);
    if (!m || m.kind !== "video" || budget < VIDEO_LIMITS.minClipSec) continue;
    const duration = m.durationSec ?? c.end;
    const start = round2(clamp(c.start, 0, Math.max(0, duration - VIDEO_LIMITS.minClipSec)));
    const end = round2(clamp(c.end, start + VIDEO_LIMITS.minClipSec, Math.min(duration, start + budget)));
    budget -= end - start;
    clips.push({ ...c, start, end });
  }
  if (!clips.length) return null;
  const total = totalDuration({ clips });
  const texts = edit.texts
    .slice(0, VIDEO_LIMITS.texts)
    .filter((t) => t.text.trim() && t.from < total)
    .map((t) => {
      const from = round2(clamp(t.from, 0, total - 0.1));
      return { ...t, text: t.text.trim(), from, to: round2(clamp(t.to, from + 0.1, total)) };
    });
  const music = edit.music && byId.get(edit.music.mediaId)?.kind === "audio" ? edit.music : null;
  return { ...edit, clips, texts, music };
}

/** Montaggio di partenza: ogni video del progetto per intero (fino al limite), senza scritte né musica. */
export function starterVideo(videos: readonly MediaInfo[], size: VideoSize = "storia"): VideoEdit | null {
  const clips = videos
    .filter((v) => v.kind === "video")
    .slice(0, VIDEO_LIMITS.clips)
    .map((v, i) => ({ id: `c${i + 1}`, mediaId: v.id, start: 0, end: v.durationSec ?? 5 }));
  return clips.length ? sanitizeVideo({ size, clips, texts: [], music: null, originalVolume: 1 }, videos) : null;
}

/** Campioni che aloop può ripetere: tutto il pezzo letto (al massimo la durata del montaggio). */
const MAX_LOOP_SAMPLES = 2_147_483_647;

export type RenderInputs = {
  edit: VideoEdit;
  /** File di ogni clip, nello stesso ordine delle clip, e se ha una traccia audio. */
  clips: { path: string; hasAudio: boolean }[];
  /** Immagine trasparente (PNG a piena misura) di ogni scritta, nello stesso ordine delle scritte. */
  overlays: string[];
  musicPath: string | null;
  output: string;
};

/**
 * Argomenti di FFmpeg per comporre il montaggio: ogni clip tagliata, ritagliata alla misura e portata a 30 fps,
 * poi concatenata; le scritte sovrapposte nei loro intervalli; musica in loop sotto l'audio originale, con
 * dissolvenza finale. Uscita MP4 H.264/AAC adatta a Instagram, Facebook e TikTok.
 */
export function videoRenderArgs(r: RenderInputs): string[] {
  const { width: W, height: H } = VIDEO_SIZES[r.edit.size];
  const total = totalDuration(r.edit);
  // -nostdin: FFmpeg non aspetta comandi dalla tastiera (lanciato dal server resterebbe fermo)
  const args: string[] = ["-hide_banner", "-nostdin", "-y"];
  const filters: string[] = [];
  let input = 0;

  // Clip: taglio veloce prima dell'ingresso; le clip senza audio ricevono un silenzio della stessa durata
  const clipInputs = r.edit.clips.map((c, i) => {
    args.push("-ss", String(c.start), "-t", String(clipLength(c)), "-i", r.clips[i].path);
    const video = input++;
    let audio: string;
    if (r.clips[i].hasAudio) audio = `${video}:a`;
    else {
      args.push("-f", "lavfi", "-t", String(clipLength(c)), "-i", "anullsrc=r=48000:cl=stereo");
      audio = `${input++}:a`;
    }
    return { video, audio };
  });
  const overlayInputs = r.overlays.map((path) => {
    args.push("-i", path);
    return input++;
  });
  let musicInput: number | null = null;
  if (r.edit.music && r.musicPath) {
    // Si legge solo la durata del montaggio (poca memoria); se il brano è più corto lo ripete aloop.
    // Niente -stream_loop: insieme a concat blocca FFmpeg senza mai chiudere il file
    args.push("-t", String(total), "-i", r.musicPath);
    musicInput = input++;
  }

  clipInputs.forEach((c, i) => {
    filters.push(`[${c.video}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${VIDEO_LIMITS.fps},format=yuv420p[v${i}]`);
    filters.push(`[${c.audio}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
  });
  filters.push(`${clipInputs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clipInputs.length}:v=1:a=1[vcat][acat]`);

  let video = "vcat";
  r.edit.texts.forEach((t, i) => {
    const out = `o${i}`;
    filters.push(`[${video}][${overlayInputs[i]}:v]overlay=0:0:enable='between(t,${t.from},${t.to})'[${out}]`);
    video = out;
  });

  const original = r.edit.originalVolume;
  let audio = "acat";
  if (musicInput !== null) {
    const fadeStart = Math.max(0, total - 1);
    filters.push(`[${musicInput}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,aloop=loop=-1:size=${MAX_LOOP_SAMPLES},atrim=0:${total},asetpts=PTS-STARTPTS,volume=${r.edit.music!.volume},afade=t=out:st=${fadeStart}:d=1[mus]`);
    filters.push(`[acat]volume=${original}[orig]`);
    filters.push(`[orig][mus]amix=inputs=2:duration=first:normalize=0[aout]`);
    audio = "aout";
  } else if (original < 1) {
    filters.push(`[acat]volume=${original}[aout]`);
    audio = "aout";
  }

  args.push("-filter_complex", filters.join(";"), "-map", `[${video}]`, "-map", `[${audio}]`, "-t", String(total));
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-profile:v", "high", "-threads", "2");
  args.push("-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", r.output);
  return args;
}
