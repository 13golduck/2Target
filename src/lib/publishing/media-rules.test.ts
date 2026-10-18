import { describe, expect, it } from "vitest";

import { countHashtags, mediaProblem, publishWarnings } from "./media-rules";

const jpg = (w: number, h: number) => ({ kind: "image", mime: "image/jpeg", width: w, height: h });
const mp4 = (w: number, h: number, durationSec: number) => ({ kind: "video", mime: "video/mp4", width: w, height: h, durationSec, processState: "pronto" });

describe("controlli sui media prima della programmazione", () => {
  it("video ancora in preparazione o non convertito", () => {
    expect(mediaProblem("facebook", "reel", [{ ...mp4(1080, 1920, 20), processState: "in_lavorazione" }], "")).toMatch(/in preparazione/);
    expect(mediaProblem("facebook", "reel", [{ ...mp4(1080, 1920, 20), processState: "errore", processNote: "file rovinato" }], "")).toMatch(/file rovinato/);
  });

  it("Instagram: foto fuori proporzione (oltre 4:5 o 1,91:1), ma non nelle storie", () => {
    expect(mediaProblem("instagram", "post", [jpg(1080, 1920)], "")).toMatch(/da 4:5/);
    expect(mediaProblem("instagram", "post", [jpg(2000, 800)], "")).toMatch(/da 4:5/);
    expect(mediaProblem("instagram", "post", [jpg(1080, 1350)], "")).toBeNull();
    expect(mediaProblem("instagram", "post", [jpg(1080, 1080)], "")).toBeNull();
    expect(mediaProblem("instagram", "storia", [jpg(1080, 1920)], "")).toBeNull();
  });

  it("Instagram: durate di reel, storie e video nel carosello", () => {
    expect(mediaProblem("instagram", "reel", [mp4(1080, 1920, 2)], "")).toMatch(/da 3 s a 15 min/);
    expect(mediaProblem("instagram", "reel", [mp4(1080, 1920, 16 * 60)], "")).toMatch(/16 min/);
    expect(mediaProblem("instagram", "storia", [mp4(1080, 1920, 75)], "")).toMatch(/1 min 15 s/);
    expect(mediaProblem("instagram", "carosello", [jpg(1080, 1080), mp4(1080, 1080, 90)], "")).toMatch(/carosello/);
    expect(mediaProblem("instagram", "reel", [mp4(1080, 1920, 45)], "")).toBeNull();
  });

  it("Instagram: massimo 30 hashtag", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(mediaProblem("instagram", "post", [jpg(1080, 1080)], `Testo\n\n${tags}`)).toMatch(/30 hashtag/);
    expect(countHashtags("Prezzo #1 e #ristrutturazione #casa_brescia, non#questo")).toBe(3);
  });

  it("TikTok almeno 3 s, LinkedIn da 3 s a 30 min", () => {
    expect(mediaProblem("tiktok", "reel", [mp4(1080, 1920, 2)], "")).toMatch(/3 secondi/);
    expect(mediaProblem("linkedin", "video", [mp4(1920, 1080, 31 * 60)], "")).toMatch(/30 min/);
    expect(mediaProblem("linkedin", "video", [mp4(1920, 1080, 90)], "")).toBeNull();
  });

  it("senza durata nota (video vecchi) non blocca", () => {
    expect(mediaProblem("instagram", "reel", [{ kind: "video", mime: "video/mp4" }], "")).toBeNull();
  });
});

describe("avvisi", () => {
  it("video orizzontale per reel e TikTok", () => {
    expect(publishWarnings("instagram", "reel", [mp4(1920, 1080, 20)])[0]).toMatch(/non verticale/);
    expect(publishWarnings("tiktok", "post", [mp4(1920, 1080, 20)])[0]).toMatch(/su TikTok/);
    expect(publishWarnings("instagram", "reel", [mp4(1080, 1920, 20)])).toEqual([]);
    expect(publishWarnings("facebook", "video", [mp4(1920, 1080, 20)])).toEqual([]);
  });

  it("foto non verticale nelle storie", () => {
    expect(publishWarnings("instagram", "storia", [jpg(1080, 1080)])[0]).toMatch(/9:16/);
  });
});
