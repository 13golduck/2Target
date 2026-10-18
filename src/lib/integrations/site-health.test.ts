import { describe, expect, it } from "vitest";

import { isBlockedIp, registrableDomain } from "./site-health";

describe("registrableDomain", () => {
  it("tiene dominio e TLD da un sottodominio", () => {
    expect(registrableDomain("www.esempio.it")).toBe("esempio.it");
    expect(registrableDomain("shop.negozio.esempio.it")).toBe("esempio.it");
  });

  it("gestisce i domini a due livelli (co.uk e simili)", () => {
    expect(registrableDomain("www.esempio.co.uk")).toBe("esempio.co.uk");
    expect(registrableDomain("negozio.esempio.com.au")).toBe("esempio.com.au");
  });

  it("lascia invariato un dominio già registrabile", () => {
    expect(registrableDomain("esempio.it")).toBe("esempio.it");
  });

  it("ignora maiuscole e punto finale", () => {
    expect(registrableDomain("WWW.Esempio.IT.")).toBe("esempio.it");
  });
});

describe("isBlockedIp (anti-SSRF)", () => {
  it("blocca loopback, reti private, link-local e metadati cloud", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("blocca gli equivalenti IPv6 (loopback, ULA, link-local) e IPv4 mappato", () => {
    for (const ip of ["::1", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("lascia passare gli indirizzi pubblici", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "93.184.216.34", "2606:2800:220:1::1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});
