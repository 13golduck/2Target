import { describe, expect, it } from "vitest";
import { authConfig } from "../auth.config";

type JwtArgs = Parameters<typeof authConfig.callbacks.jwt>[0];
const jwt = (args: Partial<JwtArgs>) => authConfig.callbacks.jwt(args as JwtArgs);
const HOUR = 3_600_000;

describe("sessione e Ricordami", () => {
  it("al login salva ruolo, ricordami e ora di accesso", () => {
    const t = jwt({ token: {}, user: { id: "1", role: "admin", remember: true } as JwtArgs["user"] });
    expect(t).toMatchObject({ role: "admin", remember: true });
    expect(typeof (t as { loginAt: number }).loginAt).toBe("number");
  });

  it("senza Ricordami la sessione scade dopo 12 ore", () => {
    expect(jwt({ token: { remember: false, loginAt: Date.now() - 11 * HOUR } })).not.toBeNull();
    expect(jwt({ token: { remember: false, loginAt: Date.now() - 13 * HOUR } })).toBeNull();
  });

  it("con Ricordami resta valida (fino ai 30 giorni del cookie)", () => {
    expect(jwt({ token: { remember: true, loginAt: Date.now() - 20 * 24 * HOUR } })).not.toBeNull();
    expect(authConfig.session.maxAge).toBe(30 * 24 * 60 * 60);
  });
});
