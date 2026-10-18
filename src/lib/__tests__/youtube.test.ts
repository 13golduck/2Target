import { afterEach, describe, expect, it, vi } from "vitest";

const { isoDurationSeconds, syncYouTube } = await import("../integrations/youtube");

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("YouTube", () => {
  it("converte la durata ISO in secondi (per riconoscere gli Shorts)", () => {
    expect(isoDurationSeconds("PT45S")).toBe(45);
    expect(isoDurationSeconds("PT2M30S")).toBe(150);
    expect(isoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationSeconds(undefined)).toBe(0);
  });

  it("legge iscritti, video (Shorts compresi) e andamento giornaliero", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/channels?"))
        return json({ items: [{ id: "UC1", statistics: { subscriberCount: "1200", viewCount: "50000", videoCount: "40" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] });
      if (url.includes("/playlistItems?")) return json({ items: [{ contentDetails: { videoId: "v1" } }, { contentDetails: { videoId: "v2" } }] });
      if (url.includes("/videos?"))
        return json({
          items: [
            { id: "v1", snippet: { title: "Lungo", publishedAt: "2026-10-01T10:00:00Z" }, statistics: { viewCount: "900", likeCount: "30", commentCount: "4" }, contentDetails: { duration: "PT8M" } },
            { id: "v2", snippet: { title: "Breve", publishedAt: "2026-10-02T10:00:00Z" }, statistics: { viewCount: "3000" }, contentDetails: { duration: "PT40S" } },
          ],
        });
      if (url.includes("youtubeanalytics"))
        return json({ columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "subscribersGained" }, { name: "subscribersLost" }], rows: [["2026-10-10", 100, 250, 5, 1]] });
      return new Response("{}", { status: 404 });
    });
    const r = await syncYouTube("tok", "UC1");
    expect(r.daily).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "followers", value: 1200 }),
      expect.objectContaining({ metric: "posts_total", value: 40 }),
      { day: "2026-10-10", metric: "views", value: 100 },
      { day: "2026-10-10", metric: "watch_minutes", value: 250 },
      { day: "2026-10-10", metric: "subscribers_gained", value: 5 },
    ]));
    expect(r.posts.map((p) => [p.externalId, p.mediaType, p.metrics.views])).toEqual([["v1", "VIDEO", 900], ["v2", "SHORT", 3000]]);
    expect(r.posts[1].permalink).toBe("https://www.youtube.com/shorts/v2");
  });
});
