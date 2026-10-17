import { describe, expect, it } from "vitest";
import { isoWeek } from "./week";

describe("isoWeek", () => {
  it("lunedì e domenica della stessa settimana", () => {
    expect(isoWeek(new Date("2026-10-12T08:00:00Z"))).toBe("2026-W42");
    expect(isoWeek(new Date("2026-10-18T20:00:00Z"))).toBe("2026-W42");
  });
  it("a cavallo d'anno vale il giovedì", () => {
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2025-12-29T12:00:00Z"))).toBe("2026-W01");
  });
});
