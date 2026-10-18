import { describe, expect, it } from "vitest";

import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("traduce gli errori tipici dei social e dell'AI", () => {
    expect(friendlyError("Error validating access token: Session has expired on Monday").text).toMatch(/ricollega/);
    expect(friendlyError("(#10) Application does not have permission for this action").text).toMatch(/permesso/);
    expect(friendlyError("fetch failed").text).toMatch(/non ha risposto/);
    expect(friendlyError("The aspect ratio is not supported.").text).toMatch(/file/);
    expect(friendlyError("Overloaded").text).toMatch(/AI/);
  });
  it("lascia i messaggi già chiari e tiene il dettaglio", () => {
    expect(friendlyError("Il profilo non è collegato: collegalo da Canali")).toEqual({ text: "Il profilo non è collegato: collegalo da Canali", detail: null });
    const r = friendlyError("Unexpected error code 2207026");
    expect(r.detail).toBe("Unexpected error code 2207026");
    expect(friendlyError(null).text).toMatch(/sconosciuto/);
    const uncertain = "ESITO INCERTO: la connessione con Meta si è interrotta (fetch failed). Con «Riprova» 2Target controlla prima il profilo.";
    expect(friendlyError(uncertain)).toEqual({ text: uncertain, detail: null });
  });
});
