import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isPublicIp, safeFetch } from "./safe-fetch";

const opts = { userAgent: "test", timeoutMs: 5000 };

describe("isPublicIp", () => {
  it("blocca indirizzi interni e riservati", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "fe80::1", "fd00::1", "64:ff9b::7f00:1"])
      expect(isPublicIp(ip), ip).toBe(false);
  });
  it("lascia passare indirizzi pubblici", () => {
    for (const ip of ["8.8.8.8", "94.143.154.25", "2a00:1450:4002:410::200e"]) expect(isPublicIp(ip), ip).toBe(true);
  });
});

describe("safeFetch", () => {
  // Server locale che reindirizza verso un indirizzo interno: non deve mai essere raggiunto
  let server: http.Server;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end("interno"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  });
  afterAll(() => server.close());

  it("rifiuta IPv6 che nasconde localhost", async () => {
    await expect(safeFetch("http://[::ffff:127.0.0.1]/", opts)).rejects.toThrow(/interno/);
  });
  it("rifiuta localhost per nome e per IP", async () => {
    await expect(safeFetch("http://localhost/", opts)).rejects.toThrow(/interno/);
    await expect(safeFetch("http://127.0.0.1/", opts)).rejects.toThrow(/interno/);
  });
  it("rifiuta porte non standard (es. pannello Plesk)", async () => {
    await expect(safeFetch("https://example.com:8443/", opts)).rejects.toThrow(/interno/);
    const port = (server.address() as { port: number }).port;
    await expect(safeFetch(`http://127.0.0.1:${port}/`, opts)).rejects.toThrow(/interno/);
  });
  it("rifiuta schemi diversi da http/https", async () => {
    await expect(safeFetch("file:///etc/passwd", opts)).rejects.toThrow(/interno/);
  });
});
