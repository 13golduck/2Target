import { describe, expect, it } from "vitest";

import { buildEvidence, draftPeriod, metricValue, resolveEvidence } from "../checkup-foundation";
import { CHECKUP_SECTIONS } from "../checkup-template";

const sections = {
  sintesi: {
    diagnosi: "Brand forte offline, quasi invisibile online.",
    problemi: "- Reel fermi da 6 mesi\n- Link in bio che non porta al sito\n\n- Reel fermi da 6 mesi",
    azioni: "1. Riprendere i reel con le persone del team",
  },
  swot: { s: "Prodotto premiato", w: "", o: "", t: "" },
};

describe("evidenze del check-up", () => {
  it("numera una voce per riga degli elenchi e una per i campi di testo, senza doppioni né puntini", () => {
    const ev = buildEvidence(CHECKUP_SECTIONS, sections, null);
    expect(ev.map((e) => e.id)).toEqual(["E1", "E2", "E3", "E4", "E5"]);
    expect(ev[0].text).toBe("Executive Summary › La diagnosi in una frase: Brand forte offline, quasi invisibile online.");
    expect(ev[1].text).toMatch(/: Reel fermi da 6 mesi$/);
    expect(ev[3].text).toMatch(/: Riprendere i reel con le persone del team$/);
    expect(ev.filter((e) => e.text.includes("Reel fermi"))).toHaveLength(1);
  });

  it("aggiunge verdetti dei canali e quick win del report", () => {
    const report = {
      channels: [{ name: "Instagram", current: 2, potential: 5, verdict: "miniera_d_oro", note: "Pubblico giusto" }],
      quickWins: [{ action: "Sistemare il link in bio", impact: "alto", effort: "basso", owner: "Golduck" }],
    } as never;
    const ev = buildEvidence(CHECKUP_SECTIONS, {}, report);
    expect(ev.map((e) => e.text)).toEqual([
      "Canali (report): Instagram: efficacia 2/5, potenziale 5/5, miniera d'oro. Pubblico giusto",
      "Quick win (report): Sistemare il link in bio (impatto alto, sforzo basso, Golduck)",
    ]);
  });

  it("risolve solo gli id esistenti (l'AI non può inventare evidenze)", () => {
    const ev = buildEvidence(CHECKUP_SECTIONS, sections, null);
    expect(resolveEvidence(ev, ["e2", "E99", "E2", " E1 "])).toEqual([ev[1].text, ev[0].text]);
    expect(resolveEvidence(ev, [])).toEqual([]);
  });

  it("taglia i testi troppo lunghi", () => {
    const ev = buildEvidence(CHECKUP_SECTIONS, { sintesi: { diagnosi: "x".repeat(1000) } }, null);
    expect(ev[0].text.length).toBe(280);
    expect(ev[0].text.endsWith("…")).toBe(true);
  });
});

describe("valori e periodo della bozza", () => {
  it("le percentuali si salvano come frazione", () => {
    expect(metricValue(3.5, "%")).toBeCloseTo(0.035);
    expect(metricValue(1200, "n")).toBe(1200);
    expect(metricValue(null, "%")).toBeNull();
    expect(metricValue(Number.NaN, "n")).toBeNull();
  });

  it("la bozza parte dal lunedì successivo e dura 4 settimane", () => {
    expect(draftPeriod(new Date("2026-10-16T10:00:00Z"))).toEqual({ startsOn: "2026-10-19", endsOn: "2026-11-15" });
    // Consegna di lunedì: si parte dal lunedì dopo, non dallo stesso giorno
    expect(draftPeriod(new Date("2026-10-19T10:00:00Z"))).toEqual({ startsOn: "2026-10-26", endsOn: "2026-11-22" });
    expect(draftPeriod(new Date("2026-10-18T10:00:00Z")).startsOn).toBe("2026-10-19");
  });
});
