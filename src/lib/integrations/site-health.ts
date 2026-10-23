import "server-only";

import { Resolver } from "node:dns/promises";
import tls from "node:tls";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { siteHealthChecks } from "@/db/schema";

// Controllo salute del sito del cliente: certificato SSL, scadenza del dominio, reindirizzamenti,
// cambi di DNS/puntamento e segnali di compromissione. Usa solo dati pubblici (TLS, DNS, RDAP, HTTP):
// non serve alcun accesso al sito. Pensato per avvisare nella Home «Oggi» con un semaforo.

export type HealthLevel = "ok" | "attenzione" | "grave";
export type HealthCheck = { key: string; label: string; level: HealthLevel; value?: string | null; hint?: string };
/** Dati confrontabili tra un controllo e il successivo, per accorgersi dei cambiamenti. */
export type SiteFingerprint = { ips: string[]; ns: string[]; certFingerprint: string | null; finalHost: string | null };
export type SiteHealthResult = { url: string; score: number; severity: HealthLevel; checks: HealthCheck[]; fingerprint: SiteFingerprint };

const DAY = 86_400_000;
const TIMEOUT = 15_000;

/**
 * Indirizzo IP da non contattare: loopback, reti private, link-local, CGNAT, multicast/riservati e
 * gli equivalenti IPv6. Serve a non trasformare il controllo salute in un modo per raggiungere
 * i servizi interni del server (app, database, pannello) partendo da un sito che reindirizza là (SSRF).
 */
export function isBlockedIp(ip: string): boolean {
  const addr = ip.toLowerCase();
  // IPv6
  if (addr.includes(":") && !addr.startsWith("::ffff:")) {
    if (addr === "::1" || addr === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // ULA fc00::/7
    if (addr.startsWith("fe80:")) return true; // link-local
    if (addr.startsWith("2001:db8:")) return true; // documentazione
    return false;
  }
  const v4 = addr.startsWith("::ffff:") ? addr.slice(7) : addr; // IPv4 mappato in IPv6
  const p = v4.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // non valido: blocca
  const [a, b] = p;
  if (a === 0 || a === 127 || a === 10 || a >= 224) return true; // "questo host", loopback, privata, multicast/riservati
  if (a === 169 && b === 254) return true; // link-local (incluso 169.254.169.254: metadati cloud)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0.0/24 (IETF)
  return false;
}

/**
 * Il nome punta solo a indirizzi pubblici? Risolve A/AAAA e blocca se non risolve o se anche un solo
 * indirizzo è interno. Attenua l'SSRF prima di aprire qualsiasi connessione verso quell'host.
 */
async function hostIsPublic(hostname: string): Promise<boolean> {
  const resolver = new Resolver({ timeout: TIMEOUT, tries: 1 });
  const [v4, v6] = await Promise.all([resolver.resolve4(hostname).catch(() => [] as string[]), resolver.resolve6(hostname).catch(() => [] as string[])]);
  const ips = [...v4, ...v6];
  return ips.length > 0 && ips.every((ip) => !isBlockedIp(ip));
}

// eTLD a due livelli più comuni per i clienti italiani ed europei: serve a ricavare il dominio registrabile
// (es. "shop.esempio.co.uk" → "esempio.co.uk") per l'interrogazione RDAP e il confronto dei reindirizzamenti.
const MULTI_LEVEL_TLDS = new Set(["co.uk", "org.uk", "me.uk", "com.au", "co.nz", "co.jp", "com.br", "co.za", "gov.it", "edu.it"]);

/** Dominio registrabile (eTLD+1) a partire da un hostname. Euristica prudente, sufficiente per il confronto. */
export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_LEVEL_TLDS.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
}

/** Legge il certificato TLS presentato dal sito. Non lancia: in caso di errore lo restituisce come stringa. */
type CertResult = { validTo?: Date; issuer?: string; authorized: boolean; fingerprint?: string; error?: string };
async function readCertificate(host: string): Promise<CertResult> {
  // Prima di aprire la connessione: l'host deve puntare solo a indirizzi pubblici (contro l'SSRF)
  if (!(await hostIsPublic(host))) return { authorized: false, error: "indirizzo non pubblico" };
  return new Promise<CertResult>((resolve) => {
    let done = false;
    const finish = (r: CertResult) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    const socket = tls.connect({ host, port: 443, servername: host, timeout: TIMEOUT }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) return finish({ authorized: false, error: "nessun certificato" });
      const issuerField = cert.issuer?.O ?? cert.issuer?.CN;
      finish({
        validTo: new Date(cert.valid_to),
        issuer: Array.isArray(issuerField) ? issuerField[0] : issuerField,
        authorized: socket.authorized,
        fingerprint: cert.fingerprint256,
        error: socket.authorized ? undefined : (socket.authorizationError as unknown as string)?.toString(),
      });
    });
    socket.once("timeout", () => finish({ authorized: false, error: "timeout" }));
    socket.once("error", (e) => finish({ authorized: false, error: (e as Error).message }));
  });
}

/** Risolve A/AAAA e nameserver del dominio. Non lancia: liste vuote se non risolve. */
async function resolveDns(hostname: string, domain: string): Promise<{ ips: string[]; ns: string[] }> {
  const resolver = new Resolver({ timeout: TIMEOUT, tries: 2 });
  const [v4, v6, ns] = await Promise.all([
    resolver.resolve4(hostname).catch(() => [] as string[]),
    resolver.resolve6(hostname).catch(() => [] as string[]),
    resolver.resolveNs(domain).catch(() => [] as string[]),
  ]);
  return { ips: [...v4, ...v6].sort(), ns: ns.map((n) => n.toLowerCase()).sort() };
}

/** Data di scadenza del dominio via RDAP (standard pubblico, senza chiave). null se non disponibile. */
async function domainExpiry(domain: string): Promise<Date | null> {
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json" },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: "follow",
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const ev = data.events?.find((e) => e.eventAction === "expiration");
    return ev?.eventDate ? new Date(ev.eventDate) : null;
  } catch {
    return null;
  }
}

/** Segue i reindirizzamenti a mano (max 8) e restituisce l'URL finale, lo stato e la catena. */
async function followRedirects(startUrl: string): Promise<{ finalUrl: string; status: number; chain: string[]; error?: string }> {
  let url = startUrl;
  const chain: string[] = [];
  try {
    for (let i = 0; i < 8; i++) {
      // Ogni salto (incluso il primo) deve puntare a un host pubblico: così un reindirizzamento
      // non può spingere la richiesta verso i servizi interni del server (SSRF).
      if (!(await hostIsPublic(new URL(url).hostname))) return { finalUrl: url, status: 0, chain, error: "indirizzo non pubblico" };
      const r = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": "2Target-SiteHealth/1.0" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        const next = new URL(r.headers.get("location")!, url).toString();
        chain.push(next);
        url = next;
        continue;
      }
      return { finalUrl: url, status: r.status, chain };
    }
    return { finalUrl: url, status: 0, chain, error: "troppi reindirizzamenti" };
  } catch (e) {
    return { finalUrl: url, status: 0, chain, error: (e as Error).message };
  }
}

const worst = (levels: HealthLevel[]): HealthLevel => (levels.includes("grave") ? "grave" : levels.includes("attenzione") ? "attenzione" : "ok");

/**
 * Esegue tutti i controlli sul sito. `previous` è l'impronta dell'ultimo controllo riuscito,
 * per segnalare i cambiamenti di IP e nameserver (possibile dirottamento del dominio).
 */
export async function checkSiteHealth(rawUrl: string, previous: SiteFingerprint | null = null): Promise<SiteHealthResult> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const hostname = new URL(url).hostname;
  const domain = registrableDomain(hostname);
  const now = Date.now();

  const [cert, dns, expiry, redirect] = await Promise.all([
    readCertificate(hostname),
    resolveDns(hostname, domain),
    domainExpiry(domain),
    followRedirects(url),
  ]);

  const checks: HealthCheck[] = [];

  // Raggiungibilità
  const reachable = redirect.status >= 200 && redirect.status < 400;
  checks.push({
    key: "reachable",
    label: "Il sito risponde",
    level: reachable ? "ok" : "grave",
    value: redirect.status ? `HTTP ${redirect.status}` : (redirect.error ?? "irraggiungibile"),
  });

  // Certificato SSL
  if (cert.validTo && cert.authorized) {
    const days = Math.round((cert.validTo.getTime() - now) / DAY);
    checks.push({
      key: "ssl",
      label: "Certificato SSL",
      level: days <= 0 ? "grave" : days < 14 ? "attenzione" : "ok",
      value: days <= 0 ? `scaduto il ${cert.validTo.toLocaleDateString("it-IT")}` : `valido ancora ${days} giorni${cert.issuer ? ` (${cert.issuer})` : ""}`,
      hint: days > 0 && days < 14 ? "Di solito si rinnova da solo: se tra pochi giorni è ancora così, controlla l'hosting" : undefined,
    });
  } else {
    checks.push({ key: "ssl", label: "Certificato SSL", level: "grave", value: cert.error ?? "non valido", hint: "Il browser mostrerà un avviso di sicurezza ai visitatori" });
  }

  // Scadenza del dominio
  if (expiry) {
    const days = Math.round((expiry.getTime() - now) / DAY);
    checks.push({
      key: "domain",
      label: "Scadenza del dominio",
      level: days <= 0 ? "grave" : days < 30 ? "attenzione" : "ok",
      value: days <= 0 ? `scaduto il ${expiry.toLocaleDateString("it-IT")}` : `rinnovo entro il ${expiry.toLocaleDateString("it-IT")} (${days} giorni)`,
      hint: days > 0 && days < 30 ? "Rinnova il dominio per non perderlo" : undefined,
    });
  }

  // Reindirizzamento verso un altro dominio (possibile compromissione)
  const finalHost = reachable ? hostOf(redirect.finalUrl) : null;
  if (finalHost && registrableDomain(finalHost) !== domain) {
    checks.push({
      key: "offsite",
      label: "Reindirizzamento fuori dominio",
      level: "grave",
      value: `porta a ${finalHost}`,
      hint: "Il sito manda i visitatori su un altro dominio: verifica che sia voluto, altrimenti potrebbe essere compromesso",
    });
  } else if (reachable && url.startsWith("https://") && redirect.finalUrl.startsWith("http://")) {
    checks.push({ key: "https", label: "Connessione sicura (HTTPS)", level: "attenzione", value: "il sito ricade su HTTP non sicuro" });
  }

  // Cambi di DNS rispetto all'ultimo controllo
  if (dns.ns.length) {
    if (previous?.ns?.length && previous.ns.join(",") !== dns.ns.join(",")) {
      checks.push({
        key: "ns_changed",
        label: "Nameserver del dominio cambiati",
        level: "grave",
        value: `${dns.ns.join(", ")}`,
        hint: "Chi gestisce il dominio è cambiato: se non è stato voluto, il dominio potrebbe essere stato dirottato",
      });
    }
  }
  if (dns.ips.length && previous?.ips?.length && previous.ips.join(",") !== dns.ips.join(",")) {
    checks.push({
      key: "ip_changed",
      label: "Indirizzo del server cambiato",
      level: "attenzione",
      value: `${dns.ips.join(", ")}`,
      hint: "Il sito punta a un server diverso: normale dopo un cambio hosting, da controllare se inatteso",
    });
  }

  const severity = worst(checks.map((c) => c.level));
  const score = Math.max(0, 100 - checks.reduce((t, c) => t + (c.level === "grave" ? 40 : c.level === "attenzione" ? 15 : 0), 0));
  const fingerprint: SiteFingerprint = { ips: dns.ips, ns: dns.ns, certFingerprint: cert.fingerprint ?? null, finalHost };

  return { url, score, severity, checks, fingerprint };
}

/** Ultimo controllo salvato per un canale sito (per confronto e per mostrare lo stato attuale). */
export async function latestSiteHealth(socialAccountId: number) {
  const [row] = await db
    .select()
    .from(siteHealthChecks)
    .where(eq(siteHealthChecks.socialAccountId, socialAccountId))
    .orderBy(desc(siteHealthChecks.checkedAt))
    .limit(1);
  return row ?? null;
}

/** Esegue il controllo confrontandolo con l'ultimo salvato e registra il risultato. */
export async function runAndStoreSiteHealth(channel: { id: number; clientId: number; handle: string }) {
  const previous = await latestSiteHealth(channel.id);
  const result = await checkSiteHealth(channel.handle, previous?.fingerprint ?? null);
  await db.insert(siteHealthChecks).values({
    clientId: channel.clientId,
    socialAccountId: channel.id,
    url: result.url,
    score: result.score,
    severity: result.severity,
    checks: result.checks,
    fingerprint: result.fingerprint,
  });
  return result;
}

/** Siti dei clienti indicati con qualcosa che non va, dall'ultimo controllo di ciascun canale (per la Home «Oggi»). */
export async function siteHealthAlerts(clientIds: number[]) {
  if (!clientIds.length) return [];
  const rows = await db
    .select()
    .from(siteHealthChecks)
    .where(inArray(siteHealthChecks.clientId, clientIds))
    .orderBy(desc(siteHealthChecks.checkedAt));
  // Dalla lista ordinata dal più recente, tiene il primo (quindi l'ultimo controllo) per ciascun canale
  const seen = new Set<number>();
  const out: typeof rows = [];
  for (const r of rows) {
    if (r.socialAccountId == null || seen.has(r.socialAccountId)) continue;
    seen.add(r.socialAccountId);
    if (r.severity !== "ok") out.push(r);
  }
  return out;
}
