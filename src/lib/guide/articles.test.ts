import { describe, expect, it } from "vitest";

import { GUIDE } from "./articles";
import { articlesFor, searchArticles } from "./types";

describe("guida", () => {
  it("slug unici e collegamenti validi", () => {
    const slugs = GUIDE.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of GUIDE) for (const r of a.related ?? []) expect(slugs, `${a.slug} → ${r}`).toContain(r);
  });
  it("ogni scheda del cliente e ogni passo iniziale ha il suo articolo", () => {
    const needed = ["panoramica-cliente", "check-up", "brand", "concorrenti", "idee", "piano-editoriale", "kpi", "lead", "seo", "canali", "profili-social", "primi-passi", "clienti", "pubblicare", "notifiche", "utenti-e-ruoli", "impostazioni", "integrazioni"];
    for (const s of needed) expect(GUIDE.map((a) => a.slug)).toContain(s);
  });
  it("ricerca senza accenti e per ruolo", () => {
    expect(searchArticles(GUIDE, "programmare post")[0]?.slug).toBe("pubblicare");
    expect(searchArticles(GUIDE, "perche").length).toBeGreaterThan(0);
    const viewer = articlesFor(GUIDE, "viewer");
    expect(viewer.every((a) => a.audience === "tutti")).toBe(true);
    expect(viewer.map((a) => a.slug)).toContain("per-il-cliente");
  });
});
