import { describe, expect, it } from "vitest";
import { exitState, type PubLite } from "./exit-state";

const p = (status: PubLite["status"]): PubLite => ({ status, platform: "instagram", permalink: null, error: null });

describe("exitState", () => {
  it("senza pubblicazioni (o solo annullate) non c'è uscita automatica", () => {
    expect(exitState([])).toBeNull();
    expect(exitState([p("annullata")])).toBeNull();
  });
  it("l'errore su un profilo vince sugli altri", () => {
    expect(exitState([p("pubblicata"), p("errore")])).toBe("errore");
  });
  it("in corso prima di programmata, uscita solo se tutte uscite", () => {
    expect(exitState([p("programmata"), p("in_corso")])).toBe("in_corso");
    expect(exitState([p("pubblicata"), p("programmata")])).toBe("programmata");
    expect(exitState([p("pubblicata"), p("annullata"), p("pubblicata")])).toBe("pubblicata");
  });
});
