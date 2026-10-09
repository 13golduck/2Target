import { describe, expect, it } from "vitest";
import { buildPlanDocx, deliverableItems, fmtWhen, planFileName } from "../plan-docx";

type Items = Parameters<typeof deliverableItems>[0];
const item = (id: number, scheduledAt: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, title: `Pubblicazione ${id}`, format: "reel", platform: "instagram", status: "bozza", isPaid: false, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, ...extra }) as unknown as Items[number];

describe("piano in Word", () => {
  it("toglie le annullate e ordina per data, le non programmate in fondo", () => {
    const list = deliverableItems([
      item(1, null),
      item(2, "2026-09-26T16:00:00Z"),
      item(3, "2026-09-22T16:00:00Z"),
      item(4, "2026-09-20T16:00:00Z", { status: "annullato" }),
    ]);
    expect(list.map((i) => i.id)).toEqual([3, 2, 1]);
  });

  it("scrive data e ora nel fuso di Roma", () => {
    expect(fmtWhen(new Date("2026-09-22T16:00:00Z"))).toBe("Martedì 22 settembre 2026 alle ore 18:00");
    expect(fmtWhen(new Date("2026-12-01T16:00:00Z"))).toContain("17:00"); // ora solare
    expect(fmtWhen(null)).toBe("Da programmare");
  });

  it("dà un nome file pulito", () => {
    expect(planFileName("Lesioli", "Piano settembre – gennaio")).toBe("Piano editoriale - Lesioli - Piano settembre - gennaio.docx");
  });

  it("genera un .docx", async () => {
    const plan = { id: 1, name: "Piano", startsOn: "2026-09-21", endsOn: "2027-01-31", minPerWeek: 3, formatQuotas: { reel: 34, post: 18 }, platforms: ["instagram"], adsBudget: 1200, brief: "Brief" };
    const buf = await buildPlanDocx({
      clientName: "Lesioli",
      plan: plan as unknown as Parameters<typeof buildPlanDocx>[0]["plan"],
      items: [item(1, "2026-09-22T16:00:00Z", { isPaid: true, adBudget: 60, adButton: "Chiama ora", shotList: [{ scena: "Intro", fonte: "cliente" }] })],
    });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(5000);
  });
});
