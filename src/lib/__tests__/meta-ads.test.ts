import { afterEach, describe, expect, it, vi } from "vitest";

const { boostPost } = await import("../ads/meta-ads");

type Call = { url: string; body: URLSearchParams };

/** Finto Graph: risponde con id progressivi; `failOn` fa fallire la chiamata che contiene quel percorso. */
function fakeGraph(failOn?: string) {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    calls.push({ url, body });
    if (failOn && url.includes(failOn)) return new Response(JSON.stringify({ error: { message: "Rifiutato da Meta", code: 100 } }), { status: 400 });
    return new Response(JSON.stringify({ id: `id${++n}`, success: true }), { status: 200 });
  });
  return calls;
}

const input = {
  userToken: "tok",
  adAccountId: "123",
  platform: "facebook" as const,
  postId: "999",
  pageId: "555",
  name: "Test",
  objective: "interazione",
  budget: 50,
  startAt: new Date("2026-10-20T10:00:00Z"),
  endAt: new Date("2026-10-27T10:00:00Z"),
  ageMin: 25,
  ageMax: 55,
};

afterEach(() => vi.unstubAllGlobals());

describe("sponsorizzazione di un post", () => {
  it("crea tutto in pausa e accende solo alla fine, dall'inserzione alla campagna", async () => {
    const calls = fakeGraph();
    const r = await boostPost(input);
    expect(r).toEqual({ campaignId: "id1", adSetId: "id2", adId: "id4" });
    expect(calls[0].url).toContain("act_123/campaigns");
    expect(calls[0].body.get("status")).toBe("PAUSED");
    expect(calls[1].body.get("lifetime_budget")).toBe("5000");
    expect(calls[1].body.get("status")).toBe("PAUSED");
    expect(calls[2].body.get("object_story_id")).toBe("555_999");
    expect(calls[3].body.get("status")).toBe("PAUSED");
    expect(calls.slice(4).map((c) => [c.url.split("/").pop(), c.body.get("status")])).toEqual([
      ["id4", "ACTIVE"],
      ["id2", "ACTIVE"],
      ["id1", "ACTIVE"],
    ]);
  });

  it("se Meta rifiuta un passaggio cancella ciò che aveva creato", async () => {
    const calls = fakeGraph("/adcreatives");
    await expect(boostPost(input)).rejects.toThrow("Rifiutato da Meta");
    const deletes = calls.filter((c) => c.body.get("status") === "DELETED").map((c) => c.url.split("/").pop());
    expect(deletes).toEqual(["id2", "id1"]);
    expect(calls.some((c) => c.body.get("status") === "ACTIVE")).toBe(false);
  });

  it("Instagram: creatività dal contenuto pubblicato con pagina e account collegati", async () => {
    const calls = fakeGraph();
    await boostPost({ ...input, platform: "instagram", instagramUserId: "ig1", postId: "media7" });
    expect(Object.fromEntries(["object_id", "instagram_user_id", "source_instagram_media_id"].map((k) => [k, calls[2].body.get(k)]))).toEqual({
      object_id: "555",
      instagram_user_id: "ig1",
      source_instagram_media_id: "media7",
    });
    expect(JSON.parse(calls[1].body.get("targeting")!).publisher_platforms).toEqual(["instagram"]);
  });
});
