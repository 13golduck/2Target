import { describe, expect, it } from "vitest";

import { checkPublishable } from "./meta-publish";

const jpg = { kind: "image", mime: "image/jpeg" };
const png = { kind: "image", mime: "image/png" };
const mp4 = { kind: "video", mime: "video/mp4" };

describe("checkPublishable", () => {
  it("Instagram: serve almeno un file", () => {
    expect(checkPublishable("instagram", "post", [], "ciao")).toMatch(/almeno una foto/);
  });
  it("Instagram: solo JPEG", () => {
    expect(checkPublishable("instagram", "post", [png], "")).toMatch(/JPEG/);
    expect(checkPublishable("instagram", "post", [jpg], "")).toBeNull();
  });
  it("Instagram: carosello da 2 a 10", () => {
    expect(checkPublishable("instagram", "carosello", [jpg], "")).toMatch(/da 2 a 10/);
    expect(checkPublishable("instagram", "carosello", [jpg, jpg, mp4], "")).toBeNull();
    expect(checkPublishable("instagram", "carosello", Array(11).fill(jpg), "")).toMatch(/da 2 a 10/);
  });
  it("Instagram: un solo file fuori dal carosello, reel solo video", () => {
    expect(checkPublishable("instagram", "post", [jpg, jpg], "")).toMatch(/un solo file/);
    expect(checkPublishable("instagram", "reel", [jpg], "")).toMatch(/video/);
    expect(checkPublishable("instagram", "reel", [mp4], "")).toBeNull();
  });
  it("Instagram: didascalia massimo 2.200 caratteri", () => {
    expect(checkPublishable("instagram", "post", [jpg], "x".repeat(2201))).toMatch(/2.200/);
  });
  it("Facebook: testo da solo sì, storie no, niente foto e video insieme", () => {
    expect(checkPublishable("facebook", "post", [], "Solo testo")).toBeNull();
    expect(checkPublishable("facebook", "post", [], " ")).toMatch(/testo/);
    expect(checkPublishable("facebook", "storia", [jpg], "")).toMatch(/storie/);
    expect(checkPublishable("facebook", "post", [jpg, mp4], "")).toMatch(/un solo video/);
    expect(checkPublishable("facebook", "carosello", [jpg, png, jpg], "")).toBeNull();
  });
  it("TikTok: un video oppure solo foto", () => {
    expect(checkPublishable("tiktok", "reel", [mp4], "")).toBeNull();
    expect(checkPublishable("tiktok", "post", [jpg, mp4], "")).toMatch(/un solo video/);
  });
  it("LinkedIn: testo, foto (fino a 20) o un video; niente storie", () => {
    expect(checkPublishable("linkedin", "post", [jpg], "")).toBeNull();
    expect(checkPublishable("linkedin", "post", [], "Solo testo")).toBeNull();
    expect(checkPublishable("linkedin", "post", [], " ")).toMatch(/Scrivi un testo/);
    expect(checkPublishable("linkedin", "post", [jpg, mp4], "")).toMatch(/un solo video/);
    expect(checkPublishable("linkedin", "storia", [jpg], "")).toMatch(/non ha le storie/);
    expect(checkPublishable("linkedin", "post", [], "x".repeat(3001))).toMatch(/3\.000/);
    expect(checkPublishable("youtube", "post", [jpg], "")).toMatch(/TikTok e LinkedIn/);
  });
});
