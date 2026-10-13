import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Accesso con Microsoft: si simulano Microsoft (fetch), le chiavi e il database
const TENANT = "11111111-2222-3333-4444-555555555555";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
let dbUser: { id: number; email: string; active: boolean } | undefined;

vi.mock("@/lib/integrations/keys", () => ({
  ensureIntegrationKeys: async () => {},
  integrationKey: (k: string) => ({ msTenantId: TENANT, msClientId: CLIENT, msClientSecret: "segreto" })[k] ?? "",
}));
vi.mock("@/lib/integrations/config", () => ({ appUrl: () => "https://2target.it" }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (dbUser ? [dbUser] : []) }) }) }) },
}));

const { msAuthorizeUrl, msHandleCallback, consumeSsoTicket } = await import("../sso-microsoft");

const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

async function start() {
  const { url, cookie } = await msAuthorizeUrl("/clienti");
  const u = new URL(url);
  return { cookie, state: u.searchParams.get("state")!, nonce: u.searchParams.get("nonce")!, url: u };
}

function microsoftReturns(claims: object) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 })));
}

const good = (nonce: string, extra: object = {}) => ({
  aud: CLIENT,
  tid: TENANT,
  iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
  nonce,
  exp: Math.floor(Date.now() / 1000) + 600,
  preferred_username: "F.Petrali@golduck.it",
  ...extra,
});

beforeAll(() => {
  process.env.AUTH_SECRET = "segreto-di-prova-abbastanza-lungo-per-il-test";
});
beforeEach(() => {
  dbUser = { id: 7, email: "f.petrali@golduck.it", active: true };
});

describe("accesso con Microsoft", () => {
  it("chiede a Microsoft il tenant giusto con PKCE", async () => {
    const { url } = await start();
    expect(url.pathname).toBe(`/${TENANT}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://2target.it/api/sso/microsoft/callback");
  });

  it("fa entrare un utente attivo di Golduck, una sola volta per biglietto", async () => {
    const s = await start();
    microsoftReturns(good(s.nonce));
    const r = await msHandleCallback(new URLSearchParams({ code: "c", state: s.state }), s.cookie);
    expect(r.user.id).toBe(7);
    expect(r.returnTo).toBe("/clienti");
    expect(consumeSsoTicket(r.ticket)).toBe(7);
    expect(consumeSsoTicket(r.ticket)).toBeNull();
  });

  it("rifiuta un account di un'altra organizzazione", async () => {
    const s = await start();
    const other = "99999999-2222-3333-4444-555555555555";
    microsoftReturns(good(s.nonce, { tid: other, iss: `https://login.microsoftonline.com/${other}/v2.0` }));
    await expect(msHandleCallback(new URLSearchParams({ code: "c", state: s.state }), s.cookie)).rejects.toMatchObject({ code: "tenant" });
  });

  it("rifiuta state o nonce diversi", async () => {
    const s = await start();
    microsoftReturns(good(s.nonce));
    await expect(msHandleCallback(new URLSearchParams({ code: "c", state: "altro" }), s.cookie)).rejects.toMatchObject({ code: "stato" });
    microsoftReturns(good("altro-nonce"));
    await expect(msHandleCallback(new URLSearchParams({ code: "c", state: s.state }), s.cookie)).rejects.toMatchObject({ code: "stato" });
  });

  it("non fa entrare chi non è utente attivo di 2Target", async () => {
    const s = await start();
    microsoftReturns(good(s.nonce));
    dbUser = { id: 7, email: "f.petrali@golduck.it", active: false };
    await expect(msHandleCallback(new URLSearchParams({ code: "c", state: s.state }), s.cookie)).rejects.toMatchObject({ code: "nessun_utente" });
  });

  it("rifiuta biglietti falsi", () => {
    expect(consumeSsoTicket("abc.def")).toBeNull();
  });
});
