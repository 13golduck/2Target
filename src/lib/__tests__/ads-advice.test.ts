import { describe, expect, it } from "vitest";

import { buildAdvice, mainResult, type AdviceCampaign, type AdviceClient } from "../ads/advice";

const now = new Date("2026-10-20T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

const camp = (o: Partial<AdviceCampaign>): AdviceCampaign => ({
  id: 1,
  clientId: 9,
  name: "Test",
  objective: "contatti",
  status: "attiva",
  budget: 100,
  spend: 20,
  startAt: day(-2),
  endAt: day(5),
  simulated: false,
  results: { impressioni: 1000, clic: 20, contatti: 3, frequenza: 1.4 },
  ...o,
});

const client = (o: Partial<AdviceClient> = {}): AdviceClient => ({ id: 9, name: "Vivaio", monthlyCap: null, spentMonth: 0, committed: 0, leadsWaiting: 0, ...o });
const keys = (c: AdviceCampaign[], cl: AdviceClient[] = [client()]) => buildAdvice(c, cl, now).map((a) => a.key);

describe("consigli sulle sponsorizzate", () => {
  it("una campagna sana non genera avvisi", () => {
    expect(keys([camp({})])).toEqual([]);
  });

  it("pubblico saturo oltre 3,5 di frequenza", () => {
    expect(keys([camp({ results: { impressioni: 1000, clic: 20, contatti: 3, frequenza: 3.8 } })])).toContain("saturo-1");
  });

  it("pochi clic sotto lo 0,8% con almeno 2.000 impressioni (non per la notorietà)", () => {
    const low = { impressioni: 5000, clic: 20, contatti: 1, frequenza: 1.2 };
    expect(keys([camp({ results: low })])).toContain("ctr-1");
    expect(keys([camp({ objective: "notorieta", results: { ...low, copertura: 4000 } })])).not.toContain("ctr-1");
  });

  it("spende senza risultati dopo il 30% del budget", () => {
    const k = keys([camp({ spend: 35, results: { impressioni: 1500, clic: 30, contatti: 0, frequenza: 1.1 } })]);
    expect(k).toContain("zero-1");
  });

  it("spende poco rispetto al calendario dopo 2 giorni", () => {
    // 3 giorni su 10 → previsti 30 €, spesi 8 €
    expect(keys([camp({ startAt: day(-3), endAt: day(7), spend: 8 })])).toContain("lenta-1");
    // solo 1 giorno: troppo presto per giudicare
    expect(keys([camp({ startAt: day(-1), endAt: day(9), spend: 1 })])).not.toContain("lenta-1");
  });

  it("propone di spostare il budget quando una costa il doppio dell'altra", () => {
    const good = camp({ id: 1, name: "Buona", spend: 30, results: { contatti: 10, frequenza: 1 } });
    const bad = camp({ id: 2, name: "Cara", spend: 30, results: { contatti: 2, frequenza: 1 } });
    const a = buildAdvice([good, bad], [client()], now).find((x) => x.key === "sposta-2-1");
    expect(a?.title).toContain("Buona");
  });

  it("segnala il tetto mensile oltre l'80% e i contatti da richiamare", () => {
    const k = keys([], [client({ monthlyCap: 500, spentMonth: 300, committed: 120, leadsWaiting: 2 })]);
    expect(k).toEqual(["lead-9", "tetto-9"]);
  });

  it("ignora le campagne simulate e mette prima gli avvisi", () => {
    expect(keys([camp({ simulated: true, results: { frequenza: 9 } })])).toEqual([]);
    const ending = camp({ id: 3, endAt: day(1), spend: 70, results: { contatti: 5, frequenza: 4 } });
    const levels = buildAdvice([ending], [client()], now).map((a) => a.level);
    expect(levels).toEqual(["attenzione", "opportunita"]);
  });

  it("risultato principale per obiettivo", () => {
    expect(mainResult("traffico", { clic_link: 7 }).value).toBe(7);
    expect(mainResult("notorieta", { copertura: 900 }).value).toBe(900);
    expect(mainResult("interazione", null).value).toBe(0);
  });
});
