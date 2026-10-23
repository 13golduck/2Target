import { describe, expect, it } from "vitest";

import { inferFormat, initialStatus, planFor, titleFromCaption } from "./quick-post";

describe("Crea post", () => {
  it("deduce il formato dai file", () => {
    expect(inferFormat([])).toBe("post");
    expect(inferFormat([{ kind: "image" }])).toBe("post");
    expect(inferFormat([{ kind: "video" }])).toBe("reel");
    expect(inferFormat([{ kind: "image" }, { kind: "video" }])).toBe("carosello");
  });
  it("titolo dalla prima riga, mai vuoto", () => {
    expect(titleFromCaption("\n  Offerta di ottobre  \naltro")).toBe("Offerta di ottobre");
    expect(titleFromCaption("")).toBe("Post");
    expect(titleFromCaption("a".repeat(100))).toHaveLength(68);
  });
  it("sceglie il piano che copre il giorno, in ora italiana", () => {
    const plans = [
      { id: 1, startsOn: "2026-10-01", endsOn: "2026-10-31" },
      { id: 2, startsOn: "2026-10-15", endsOn: "2026-11-15" },
    ];
    expect(planFor(plans, new Date("2026-10-20T10:00:00Z"))).toBe(2);
    expect(planFor(plans, new Date("2026-10-05T10:00:00Z"))).toBe(1);
    // 23:30 UTC del 31 ottobre = 1 novembre in Italia (solo il piano 2)
    expect(planFor(plans, new Date("2026-10-31T23:30:00Z"))).toBe(2);
    expect(planFor(plans, new Date("2026-12-01T10:00:00Z"))).toBeNull();
  });
  it("approvazione: subito solo se si può pubblicare e il cliente non approva via link", () => {
    expect(initialStatus({ canPublish: true, approvalEnabled: false })).toBe("approvato");
    expect(initialStatus({ canPublish: true, approvalEnabled: true })).toBe("da_approvare");
    expect(initialStatus({ canPublish: false, approvalEnabled: false })).toBe("da_approvare");
  });
});
