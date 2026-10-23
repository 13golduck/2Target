import { describe, expect, it } from "vitest";

import { checkPublishable } from "@/lib/publishing/meta-publish";
import { routeOf } from "@/lib/publishing/targets";
import { gbpPostBody } from "./google";
import { pinBody } from "./pinterest";
import { threadsPlan } from "./threads";
import { shortsMetadata } from "./youtube";

const jpg = { kind: "image", mime: "image/jpeg" };
const mp4 = { kind: "video", mime: "video/mp4", durationSec: 30 };

describe("Threads", () => {
  it("testo solo, foto singola e carosello", () => {
    expect(threadsPlan("ciao", []).main).toEqual({ media_type: "TEXT", text: "ciao" });
    const one = threadsPlan("x", [{ kind: "image", url: "u1" }]);
    expect(one.children).toEqual([]);
    expect(one.main).toMatchObject({ media_type: "IMAGE", image_url: "u1", text: "x" });
    const many = threadsPlan("x", [{ kind: "image", url: "u1" }, { kind: "video", url: "v1" }]);
    expect(many.children).toHaveLength(2);
    expect(many.children[1]).toMatchObject({ media_type: "VIDEO", video_url: "v1", is_carousel_item: "true" });
    expect(many.children[0]).not.toHaveProperty("text");
    expect(many.main).toEqual({ media_type: "CAROUSEL", text: "x" });
  });
  it("taglia il testo a 500 caratteri", () => {
    expect((threadsPlan("a".repeat(600), []).main as { text: string }).text).toHaveLength(500);
  });
  it("blocca testi troppo lunghi e le storie", () => {
    expect(checkPublishable("threads", "post", [], "a".repeat(501))).toMatch(/500/);
    expect(checkPublishable("threads", "storia", [jpg], "x")).toMatch(/storie/);
    expect(checkPublishable("threads", "post", [], "ciao")).toBeNull();
  });
});

describe("Pinterest", () => {
  it("titolo dalla prima riga, link e immagini multiple", () => {
    const b = pinBody({ boardId: "1", caption: "\nTitolo pin\nresto del testo", link: "https://x.it", imageUrls: ["a", "b"] });
    expect(b.title).toBe("Titolo pin");
    expect(b.link).toBe("https://x.it");
    expect(b.media_source).toEqual({ source_type: "multiple_image_urls", items: [{ url: "a" }, { url: "b" }] });
    expect(pinBody({ boardId: "1", caption: "t", imageUrls: ["a"] }).media_source).toEqual({ source_type: "image_url", url: "a" });
  });
  it("senza immagini non pubblica", () => {
    expect(() => pinBody({ boardId: "1", caption: "t", imageUrls: [] })).toThrow();
    expect(checkPublishable("pinterest", "post", [], "t")).toMatch(/almeno una foto/);
    expect(checkPublishable("pinterest", "reel", [mp4], "t")).toMatch(/video/);
    expect(checkPublishable("pinterest", "post", [jpg], "t")).toBeNull();
  });
});

describe("YouTube Shorts", () => {
  it("aggiunge #Shorts e toglie i caratteri vietati", () => {
    const m = shortsMetadata({ caption: "Ricetta <veloce>\nIngredienti…" });
    expect(m.title).toBe("Ricetta veloce #Shorts");
    expect(m.description).toMatch(/#Shorts$/);
    expect(shortsMetadata({ caption: "Già #shorts" }).title).toBe("Già #shorts");
    expect(shortsMetadata({ caption: "a".repeat(150) }).title).toHaveLength(100);
  });
  it("un solo video fino a 3 minuti", () => {
    expect(checkPublishable("youtube", "reel", [mp4], "x")).toBeNull();
    expect(checkPublishable("youtube", "reel", [{ ...mp4, durationSec: 200 }], "x")).toMatch(/3 minuti/);
    expect(checkPublishable("youtube", "post", [jpg], "x")).toMatch(/video/);
  });
});

describe("Scheda Google", () => {
  it("testo, foto e pulsante solo se ci sono", () => {
    expect(gbpPostBody({ caption: "Novità" })).toEqual({ languageCode: "it", topicType: "STANDARD", summary: "Novità" });
    const b = gbpPostBody({ caption: "N", imageUrl: "i", link: "https://x.it" });
    expect(b.media).toEqual([{ mediaFormat: "PHOTO", sourceUrl: "i" }]);
    expect(b.callToAction).toEqual({ actionType: "LEARN_MORE", url: "https://x.it" });
  });
  it("regole", () => {
    expect(checkPublishable("business_profile", "post", [jpg], "")).toMatch(/testo/);
    expect(checkPublishable("business_profile", "post", [jpg, jpg], "x")).toMatch(/una foto/);
    expect(checkPublishable("business_profile", "post", [jpg], "x")).toBeNull();
  });
});

describe("Strade di pubblicazione", () => {
  const ch = (platform: string) => ({ platform, connected: true, externalId: "1", assetTokenEnc: null }) as never;
  const conn = (provider: string, scopes: string) => ({ provider, scopes }) as never;
  it("richiede il collegamento giusto e il permesso di pubblicare", () => {
    expect(routeOf(ch("threads"), conn("threads", "threads_basic,threads_content_publish"))).toEqual({ route: "threads" });
    expect(routeOf(ch("threads"), conn("threads", "threads_basic"))).toHaveProperty("problem");
    expect(routeOf(ch("pinterest"), conn("pinterest", "boards:read,pins:write"))).toEqual({ route: "pinterest" });
    expect(routeOf(ch("youtube"), conn("google", "openid https://www.googleapis.com/auth/youtube.readonly"))).toHaveProperty("problem");
    expect(routeOf(ch("youtube"), conn("google", "https://www.googleapis.com/auth/youtube.upload"))).toEqual({ route: "youtube" });
    expect(routeOf(ch("business_profile"), conn("google", "https://www.googleapis.com/auth/business.manage"))).toEqual({ route: "business_profile" });
    expect(routeOf(ch("pinterest"), conn("google", "pins:write"))).toHaveProperty("problem");
  });
});
