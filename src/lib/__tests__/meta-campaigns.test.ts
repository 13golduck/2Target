import { afterEach, describe, expect, it, vi } from "vitest";

const { buildObjectStorySpec, buildTargeting, createNewAd } = await import("../ads/meta-campaigns");
const { buildLeadFormParams, mapLeadFields } = await import("../ads/meta-leads");

type Call = { url: string; body: URLSearchParams };

/** Finto Graph: id progressivi; `failOn` fa fallire la chiamata il cui indirizzo finisce con quel percorso. */
function fakeGraph(failOn?: string) {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    calls.push({ url, body });
    if (failOn && url.endsWith(failOn)) return new Response(JSON.stringify({ error: { message: "Rifiutato da Meta", code: 100 } }), { status: 400 });
    return new Response(JSON.stringify({ id: `id${++n}`, success: true }), { status: 200 });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const base = { pageId: "555", message: "Testo", button: "LEARN_MORE" };

describe("creatività delle inserzioni nuove", () => {
  it("immagine singola con link e pulsante", () => {
    const s = buildObjectStorySpec({ ...base, link: "https://esempio.it", headline: "Titolo", media: [{ kind: "image", hash: "h1" }] });
    expect(s).toEqual({
      page_id: "555",
      link_data: { message: "Testo", link: "https://esempio.it", image_hash: "h1", name: "Titolo", call_to_action: { type: "LEARN_MORE", value: { link: "https://esempio.it" } } },
    });
  });

  it("senza link usa la Pagina Facebook come destinazione", () => {
    const s = buildObjectStorySpec({ ...base, media: [{ kind: "image", hash: "h1" }] }) as { link_data: { link: string } };
    expect(s.link_data.link).toBe("https://www.facebook.com/555");
  });

  it("due o più immagini diventano un carosello (massimo 10)", () => {
    const media = Array.from({ length: 12 }, (_, i) => ({ kind: "image" as const, hash: `h${i}` }));
    const s = buildObjectStorySpec({ ...base, link: "https://esempio.it", media }) as { link_data: { child_attachments: unknown[]; multi_share_optimized: boolean } };
    expect(s.link_data.child_attachments).toHaveLength(10);
    expect(s.link_data.multi_share_optimized).toBe(true);
  });

  it("video con copertina e account Instagram", () => {
    const s = buildObjectStorySpec({ ...base, instagramUserId: "ig1", headline: "Titolo", media: [{ kind: "video", videoId: "v1", thumbnailUrl: "https://t/1.jpg" }] });
    expect(s).toEqual({
      page_id: "555",
      instagram_user_id: "ig1",
      video_data: { video_id: "v1", image_url: "https://t/1.jpg", message: "Testo", title: "Titolo", call_to_action: { type: "LEARN_MORE", value: { link: "https://www.facebook.com/555" } } },
    });
  });

  it("con il modulo contatti il pulsante apre il modulo", () => {
    const s = buildObjectStorySpec({ ...base, button: "SIGN_UP", leadFormId: "form9", media: [{ kind: "image", hash: "h1" }] }) as { link_data: { call_to_action: unknown } };
    expect(s.link_data.call_to_action).toEqual({ type: "SIGN_UP", value: { lead_gen_form_id: "form9" } });
  });

  it("senza media si ferma con un messaggio chiaro", () => {
    expect(() => buildObjectStorySpec({ ...base, media: [] })).toThrow("almeno una foto o un video");
  });
});

describe("pubblico", () => {
  it("città con raggio, sesso e posizionamenti su entrambe le piattaforme", () => {
    const t = buildTargeting({ placement: "entrambi", city: { key: "c1", radiusKm: 20 }, ageMin: 25, ageMax: 54, gender: "donne" });
    expect(t.geo_locations).toEqual({ cities: [{ key: "c1", radius: 20, distance_unit: "kilometer" }] });
    expect(t.genders).toEqual([2]);
    expect(t.publisher_platforms).toEqual(["facebook", "instagram"]);
    expect(t).toHaveProperty("facebook_positions");
    expect(t).toHaveProperty("instagram_positions");
  });

  it("senza città tutta Italia, senza sesso tutti, solo Instagram", () => {
    const t = buildTargeting({ placement: "instagram", ageMin: 18, ageMax: 65 });
    expect(t.geo_locations).toEqual({ countries: ["IT"] });
    expect(t).not.toHaveProperty("genders");
    expect(t).not.toHaveProperty("facebook_positions");
  });
});

describe("lancio di un'inserzione nuova", () => {
  const input = {
    userToken: "tok",
    adAccountId: "123",
    name: "Test",
    objective: "contatti" as const,
    budget: 80,
    startAt: new Date("2026-10-20T10:00:00Z"),
    endAt: new Date("2026-10-30T10:00:00Z"),
    targeting: { placement: "facebook" as const, ageMin: 25, ageMax: 60 },
    creative: { ...base, button: "SIGN_UP", leadFormId: "form9", media: [{ kind: "image" as const, hash: "h1" }] },
  };

  it("campagna contatti: obiettivo, ottimizzazione e Pagina promossa; tutto in pausa, poi acceso dal basso", async () => {
    const calls = fakeGraph();
    const r = await createNewAd(input);
    expect(r).toEqual({ campaignId: "id1", adSetId: "id2", creativeId: "id3", adId: "id4" });
    expect(calls[0].body.get("objective")).toBe("OUTCOME_LEADS");
    expect(calls[1].body.get("optimization_goal")).toBe("LEAD_GENERATION");
    expect(calls[1].body.get("destination_type")).toBe("ON_AD");
    expect(JSON.parse(calls[1].body.get("promoted_object")!)).toEqual({ page_id: "555" });
    expect(calls[1].body.get("lifetime_budget")).toBe("8000");
    expect(calls.slice(4).map((c) => [c.url.split("/").pop(), c.body.get("status")])).toEqual([
      ["id4", "ACTIVE"],
      ["id2", "ACTIVE"],
      ["id1", "ACTIVE"],
    ]);
  });

  it("se Meta rifiuta l'inserzione cancella gruppo e campagna e non accende nulla", async () => {
    const calls = fakeGraph("act_777/ads");
    await expect(createNewAd({ ...input, adAccountId: "act_777" })).rejects.toThrow("Rifiutato da Meta");
    const deletes = calls.filter((c) => c.body.get("status") === "DELETED").map((c) => c.url.split("/").pop());
    expect(deletes).toEqual(["id2", "id1"]);
    expect(calls.some((c) => c.body.get("status") === "ACTIVE")).toBe(false);
  });
});

describe("moduli contatti", () => {
  it("domande standard, domanda libera, privacy e ringraziamento con il sito", () => {
    const p = buildLeadFormParams({
      name: "Preventivo giardino",
      fields: ["FULL_NAME", "EMAIL", "PHONE"],
      customQuestion: "Che lavoro ti serve?",
      privacyUrl: "https://esempio.it/privacy",
      website: "https://esempio.it",
    });
    expect(JSON.parse(p.questions)).toEqual([
      { type: "FULL_NAME" },
      { type: "EMAIL" },
      { type: "PHONE" },
      { type: "CUSTOM", key: "domanda_1", label: "Che lavoro ti serve?" },
    ]);
    expect(JSON.parse(p.privacy_policy).url).toBe("https://esempio.it/privacy");
    expect(JSON.parse(p.thank_you_page)).toMatchObject({ button_type: "VIEW_WEBSITE", website_url: "https://esempio.it" });
  });

  it("senza domande si ferma", () => {
    expect(() => buildLeadFormParams({ name: "x", fields: [], privacyUrl: "https://e.it/p" })).toThrow("almeno una domanda");
  });

  it("le risposte di Meta diventano i campi del lead", () => {
    const l = mapLeadFields([
      { name: "first_name", values: ["Mario"] },
      { name: "last_name", values: ["Rossi"] },
      { name: "email", values: ["mario@esempio.it"] },
      { name: "phone_number", values: ["+39 333 1234567"] },
      { name: "city", values: ["Brescia"] },
      { name: "domanda_1", values: ["Potatura siepe"] },
    ]);
    expect(l).toEqual({ name: "Mario Rossi", email: "mario@esempio.it", phone: "+39 333 1234567", company: null, message: "Città: Brescia\nRisposta: Potatura siepe" });
  });
});
