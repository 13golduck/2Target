import { describe, expect, it } from "vitest";

import { sanitizeVideo, starterVideo, timeline, totalDuration, VIDEO_LIMITS, videoRenderArgs, type VideoEdit } from "./video";

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
  music: null,
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
  it("taglia le scritte che escono dal montaggio e scarta musica che non è audio", () => {
    const e = sanitizeVideo(
      edit({
        texts: [
          { id: "t1", text: " Ciao ", from: 6, to: 30, position: "basso", size: "medio", color: "#FFFFFF", background: null },
          { id: "t2", text: "fuori", from: 20, to: 25, position: "alto", size: "medio", color: "#FFFFFF", background: null },
        ],
        music: { mediaId: 3, volume: 0.5 },
      }),
      media,
    )!;
    expect(e.texts).toEqual([{ id: "t1", text: "Ciao", from: 6, to: 8, position: "basso", size: "medio", color: "#FFFFFF", background: null }]);
    expect(e.music).toBeNull();
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
  const base = { clips: [{ path: "/a.mp4", hasAudio: true }, { path: "/b.mp4", hasAudio: false }], overlays: [], musicPath: null, output: "/out.mp4" };

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

  it("sovrappone le scritte nei loro intervalli e mixa la musica, senza -stream_loop", () => {
    const e = edit({
      texts: [{ id: "t1", text: "Ciao", from: 1, to: 3, position: "basso", size: "medio", color: "#FFFFFF", background: null }],
      music: { mediaId: 9, volume: 0.4 },
      originalVolume: 0.2,
    });
    const args = videoRenderArgs({ ...base, edit: e, overlays: ["/t1.png"], musicPath: "/m.mp3" });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[vcat][3:v]overlay=0:0:enable='between(t,1,3)'[o0]");
    expect(graph).toContain("[4:a]aresample=48000");
    expect(graph).toContain("aloop=loop=-1");
    expect(graph).toContain("atrim=0:8");
    expect(graph).toContain("volume=0.4,afade=t=out:st=7:d=1[mus]");
    expect(graph).toContain("[acat]volume=0.2[orig]");
    expect(args).not.toContain("-stream_loop");
    expect(args.join(" ")).toContain("-t 8 -i /m.mp3");
    expect(args).toEqual(expect.arrayContaining(["-map", "[o0]", "-map", "[aout]"]));
  });
});
