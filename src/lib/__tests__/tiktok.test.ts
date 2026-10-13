import { afterEach, describe, expect, it, vi } from "vitest";

// TikTok: lettura di profilo e video simulando le risposte delle API
vi.mock("@/lib/integrations/keys", () => ({ integrationKey: (k: string) => ({ tiktokClientKey: "ck", tiktokClientSecret: "cs" })[k] ?? "" }));

const { syncTikTok, listAssets, refreshAccessToken } = await import("../integrations/tiktok");

const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: "ok", message: "" } }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("TikTok", () => {
  it("legge profilo e video con le statistiche", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/user/info/")
          ? ok({ user: { open_id: "o1", username: "lesioli", display_name: "Lesioli", follower_count: 1200, video_count: 34, likes_count: 9000 } })
          : ok({ videos: [{ id: "v1", create_time: 1790000000, share_url: "https://tiktok.com/@lesioli/video/v1", video_description: "Prima e dopo", view_count: 5400, like_count: 300, comment_count: 12, share_count: 7 }], cursor: 0, has_more: false }),
      ),
    );
    const r = await syncTikTok("tok");
    expect(r.daily.map((d) => d.metric).sort()).toEqual(["followers", "likes_total", "posts_total"]);
    expect(r.posts[0]).toMatchObject({ externalId: "v1", mediaType: "VIDEO", metrics: { views: 5400, likes: 300, comments: 12, shares: 7 } });
    const [a] = await listAssets("tok");
    expect(a).toMatchObject({ kind: "tiktok", externalId: "o1", handle: "lesioli" });
  });

  it("segnala il token scaduto come da ricollegare", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "access_token_invalid", message: "token expired" } }), { status: 401 })));
    await expect(syncTikTok("tok")).rejects.toMatchObject({ expired: true });
  });

  it("rinnova il token con il refresh token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "new", refresh_token: "r2", expires_in: 86400, open_id: "o1", refresh_expires_in: 31536000, scope: "user.info.basic" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = await refreshAccessToken("r1");
    expect(t).toMatchObject({ accessToken: "new", refreshToken: "r2" });
    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_key=ck");
  });
});
