import { describe, expect, it } from "vitest";

import { duplicate, sanitizeVideo, splitAt, starterVideo, timeline, totalDuration, VIDEO_LIMITS, VideoEditSchema, videoRenderArgs, type VideoEdit } from "./video";

const media = [
  { id: 1, kind: "video", durationSec: 10 },
  { id: 2, kind: "video", durationSec: 4 },
  { id: 3, kind: "image", durationSec: null },
  { id: 9, kind: "audio", durationSec: 120 },
];

const edit = (over: Partial<VideoEdit> = {}): VideoEdit => ({
  size: "storia",
  clips: [
    { id: "c1", mediaId: 1, start: 2, end: 6 },
    { id: "c2", mediaId: 2, start: 0, end: 4 },
  ],
  texts: [],
  audio: [],
  originalVolume: 1,
  ...over,
});

describe("timeline e durata", () => {
  it("somma le clip e calcola dove inizia ognuna", () => {
    expect(totalDuration(edit())).toBe(8);
    expect(timeline(edit()).map((c) => c.offset)).toEqual([0, 4]);
  });
});

describe("sanitizeVideo", () => {
  it("toglie clip di file che non sono video del progetto", () => {
    const e = sanitizeVideo(edit({ clips: [{ id: "a", mediaId: 3, start: 0, end: 2 }, { id: "b", mediaId: 99, start: 0, end: 2 }, { id: "c", mediaId: 2, start: 0, end: 2 }] }), media);
    expect(e?.clips.map((c) => c.id)).toEqual(["c"]);
  });
  it("riporta i tagli dentro la durata del file, con almeno mezzo secondo", () => {
    const e = sanitizeVideo(edit({ clips: [{ id: "a", mediaId: 2, start: 3.9, end: 50 }] }), media)!;
    expect(e.clips[0].start).toBe(3.5);
    expect(e.clips[0].end).toBe(4);
  });
  it("rispetta la durata massima del montaggio", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, mediaId: 1, start: 0, end: 10 }));
    expect(totalDuration(sanitizeVideo(edit({ clips: many }), media)!)).toBeLessThanOrEqual(VIDEO_LIMITS.maxTotalSec);
  });
  it("taglia le scritte che escono dal montaggio e scarta l'audio che non è un file audio", () => {
    const e = sanitizeVideo(
      edit({
        texts: [
          { id: "t1", text: " Ciao ", from: 6, to: 30, position: "basso", size: "medio", color: "#FFFFFF", background: null },
          { id: "t2", text: "fuori", from: 20, to: 25, position: "alto", size: "medio", color: "#FFFFFF", background: null },
        ],
        audio: [{ id: "a1", mediaId: 3, start: 0, end: 5, at: 0, volume: 0.5 }],
      }),
      media,
    )!;
    expect(e.texts).toEqual([{ id: "t1", text: "Ciao", from: 6, to: 8, position: "basso", size: "medio", color: "#FFFFFF", background: null }]);
    expect(e.audio).toEqual([]);
  });
  it("null se non resta nessuna clip", () => {
    expect(sanitizeVideo(edit({ clips: [{ id: "a", mediaId: 3, start: 0, end: 1 }] }), media)).toBeNull();
  });
});

describe("starterVideo", () => {
  it("mette in fila i video del progetto per intero", () => {
    expect(starterVideo(media)?.clips.map((c) => [c.mediaId, c.start, c.end])).toEqual([
      [1, 0, 10],
      [2, 0, 4],
    ]);
  });
  it("null senza video", () => {
    expect(starterVideo([{ id: 3, kind: "image", durationSec: null }])).toBeNull();
  });
});

describe("videoRenderArgs", () => {
  const base = { clips: [{ path: "/a.mp4", hasAudio: true }, { path: "/b.mp4", hasAudio: false }], overlays: [], audio: [], output: "/out.mp4" };

  it("taglia le clip prima dell'ingresso e dà un silenzio a quelle senza audio", () => {
    const args = videoRenderArgs({ ...base, edit: edit() });
    expect(args.slice(3, 9)).toEqual(["-ss", "2", "-t", "4", "-i", "/a.mp4"]);
    expect(args.join(" ")).toContain("-f lavfi -t 4 -i anullsrc=r=48000:cl=stereo");
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(graph).toContain("[2:a]aresample");
    expect(graph).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[vcat][acat]");
    expect(args.at(-1)).toBe("/out.mp4");
    expect(args).toContain("+faststart");
  });

  it("sovrappone le scritte e mette ogni spezzone audio al suo secondo, senza -stream_loop", () => {
    const e = edit({
      texts: [{ id: "t1", text: "Ciao", from: 1, to: 3, position: "basso", size: "medio", color: "#FFFFFF", background: null }],
      audio: [
        { id: "a1", mediaId: 9, start: 10, end: 14, at: 0, volume: 0.4 },
        { id: "a2", mediaId: 9, start: 0, end: 2, at: 5.5, volume: 1 },
      ],
      originalVolume: 0.2,
    });
    const args = videoRenderArgs({ ...base, edit: e, overlays: ["/t1.png"], audio: ["/m.mp3", "/m.mp3"] });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[vcat][3:v]overlay=0:0:enable='between(t,1,3)'[o0]");
    expect(args.join(" ")).toContain("-ss 10 -t 4 -i /m.mp3");
    expect(graph).toContain("volume=0.4,afade=t=in:d=0.15,afade=t=out:st=3.85:d=0.15,adelay=0|0[m0]");
    expect(graph).toContain("adelay=5500|5500[m1]");
    expect(graph).toContain("[acat]volume=0.2[orig]");
    expect(graph).toContain("[orig][m0][m1]amix=inputs=3:duration=first:normalize=0[aout]");
    expect(args).not.toContain("-stream_loop");
    expect(args).toEqual(expect.arrayContaining(["-map", "[o0]", "-map", "[aout]"]));
  });

});

describe("traccia audio", () => {
  it("converte i montaggi salvati con un solo brano", () => {
    const old = { size: "storia", clips: [{ id: "c1", mediaId: 1, start: 0, end: 6 }], texts: [], music: { mediaId: 9, volume: 0.3 }, originalVolume: 1 };
    expect(VideoEditSchema.parse(old).audio).toEqual([{ id: "a1", mediaId: 9, start: 0, end: 6, at: 0, volume: 0.3 }]);
  });
  it("taglia lo spezzone alla fine del montaggio e del brano", () => {
    const e = sanitizeVideo(edit({ audio: [{ id: "a1", mediaId: 9, start: 115, end: 200, at: 6, volume: 1 }] }), media)!;
    expect(e.audio[0]).toMatchObject({ at: 6, start: 115, end: 117 });
  });
});

describe("dividi e duplica", () => {
  it("divide una clip al cursore in due parti consecutive", () => {
    const e = splitAt(edit(), "c2", 6, "c3");
    expect(e.clips.map((c) => [c.id, c.start, c.end])).toEqual([
      ["c1", 2, 6],
      ["c2", 0, 2],
      ["c3", 2, 4],
    ]);
  });
  it("non divide troppo vicino ai bordi", () => {
    expect(splitAt(edit(), "c1", 0.2, "x")).toEqual(edit());
  });
  it("divide uno spezzone audio mantenendo la posizione nel tempo", () => {
    const e = splitAt(edit({ audio: [{ id: "a1", mediaId: 9, start: 10, end: 16, at: 1, volume: 1 }] }), "a1", 4, "a2");
    expect(e.audio).toEqual([
      { id: "a1", mediaId: 9, start: 10, end: 13, at: 1, volume: 1 },
      { id: "a2", mediaId: 9, start: 13, end: 16, at: 4, volume: 1 },
    ]);
  });
  it("duplica uno spezzone audio subito dopo sé stesso", () => {
    const e = duplicate(edit({ audio: [{ id: "a1", mediaId: 9, start: 0, end: 3, at: 2, volume: 1 }] }), "a1", "a2");
    expect(e.audio[1]).toEqual({ id: "a2", mediaId: 9, start: 0, end: 3, at: 5, volume: 1 });
  });
  it("duplica una clip subito dopo", () => {
    expect(duplicate(edit(), "c1", "c9").clips.map((c) => c.id)).toEqual(["c1", "c9", "c2"]);
  });
});
