import { describe, expect, it } from "vitest";

import { checkTikTokMedia, checkTikTokOptions, parseTikTokOptions, tiktokKind, tiktokLabel, type TikTokOptions } from "../publishing/tiktok-rules";

const creator = { privacyOptions: ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: false };
const base: TikTokOptions = { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: true, disclose: false, brandOrganic: false, brandContent: false };
const jpg = { kind: "image", mime: "image/jpeg" };
const png = { kind: "image", mime: "image/png" };
const mp4 = { kind: "video", mime: "video/mp4" };

describe("regole TikTok", () => {
  it("un video oppure solo foto; niente storie", () => {
    expect(tiktokKind("reel", [mp4])).toBe("video");
    expect(tiktokKind("carosello", [jpg, jpg])).toBe("photo");
    expect(tiktokKind("post", [jpg, mp4])).toBeNull();
    expect(tiktokKind("storia", [mp4])).toBeNull();
    expect(checkTikTokMedia("post", [png], "")).toMatch(/JPEG o WebP/);
    expect(checkTikTokMedia("reel", [mp4], "x".repeat(2201))).toMatch(/2.200/);
    expect(checkTikTokMedia("post", [], "")).toMatch(/video oppure delle foto/);
  });

  it("la visibilità va scelta tra quelle dell'account, senza valore predefinito", () => {
    expect(checkTikTokOptions(null, creator, "video")).toMatch(/Mancano/);
    expect(checkTikTokOptions({ ...base, privacyLevel: "" }, creator, "video")).toMatch(/chi può vedere/);
    expect(checkTikTokOptions({ ...base, privacyLevel: "MUTUAL_FOLLOW_FRIENDS" }, creator, "video")).toMatch(/non è più disponibile/);
    expect(checkTikTokOptions(base, creator, "video")).toBeNull();
  });

  it("le interazioni disattivate dall'account non si attivano (i duetti contano solo per i video)", () => {
    expect(checkTikTokOptions({ ...base, allowDuet: true }, creator, "video")).toMatch(/duetti/);
    expect(checkTikTokOptions({ ...base, allowDuet: true }, creator, "photo")).toBeNull();
    expect(checkTikTokOptions(base, { ...creator, commentDisabled: true }, "photo")).toMatch(/commenti/);
  });

  it("contenuto commerciale: almeno una voce, e lo sponsorizzato non può essere privato", () => {
    expect(checkTikTokOptions({ ...base, disclose: true }, creator, "video")).toMatch(/Il tuo brand/);
    expect(checkTikTokOptions({ ...base, disclose: true, brandOrganic: true }, creator, "video")).toBeNull();
    expect(checkTikTokOptions({ ...base, disclose: true, brandContent: true, privacyLevel: "SELF_ONLY" }, creator, "video")).toMatch(/non può essere privato/);
    expect(tiktokLabel({ disclose: true, brandOrganic: true, brandContent: false })).toBe("Contenuto promozionale");
    expect(tiktokLabel({ disclose: true, brandOrganic: true, brandContent: true })).toBe("Partnership retribuita");
    expect(tiktokLabel({ disclose: false, brandOrganic: true, brandContent: true })).toBeNull();
  });

  it("dal browser si accettano solo i campi attesi; senza indicazione commerciale le due voci si azzerano", () => {
    expect(parseTikTokOptions("x")).toBeNull();
    expect(parseTikTokOptions({ privacyLevel: "SELF_ONLY", allowComment: "true", brandContent: true, extra: 1 })).toEqual({
      privacyLevel: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, disclose: false, brandOrganic: false, brandContent: false,
    });
  });
});
