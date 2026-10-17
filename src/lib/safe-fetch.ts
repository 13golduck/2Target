import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";

// Download di pagine web PUBBLICHE per conto del check-up (siti e profili social dei clienti).
// Protezioni contro l'uso di 2Target per raggiungere servizi interni (SSRF):
// - l'indirizzo IP si controlla al momento della connessione (niente "DNS rebinding");
// - ogni reindirizzamento si segue a mano e si ricontrolla (massimo 5);
// - bloccati indirizzi privati, locali, riservati e le forme IPv6 che li nascondono (::ffff:127.0.0.1 ecc.);
// - solo http/https sulle porte standard; limite di dimensione e di tempo.

// Due liste separate: in Node le regole IPv6 su ::ffff:0:0/96 colpirebbero anche tutti gli IPv4
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked6.addSubnet(net, bits, "ipv6");

/** true se l'indirizzo è pubblico e raggiungibile in sicurezza. */
export function isPublicIp(address: string) {
  const v = isIP(address);
  if (v === 4) return !blocked4.check(address, "ipv4");
  // IPv6: bloccati anche tutti gli IPv4 "travestiti" (::ffff:…), che nessun sito pubblico usa
  if (v === 6) return !blocked6.check(address, "ipv6");
  return false;
}

export class BlockedAddressError extends Error {
  code = "BLOCKED_ADDRESS";
  constructor() {
    super("indirizzo interno o riservato: non consentito");
  }
}

// Risoluzione DNS che rifiuta gli indirizzi non pubblici: è quella usata davvero per la connessione
function safeLookup(hostname: string, options: object, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = (addresses as LookupAddress[]).filter((a) => isPublicIp(a.address));
    if (!list.length) return callback(new BlockedAddressError(), "", 0);
    const opts = options as { all?: boolean };
    if (opts.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export type SafeResponse = { status: number; url: string; headers: Record<string, string>; body: string; truncated: boolean };

type Options = { userAgent: string; accept?: string; maxBytes?: number; timeoutMs?: number; maxRedirects?: number };

function requestOnce(url: URL, o: Required<Options>, deadline: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") return reject(new BlockedAddressError());
    if (url.port && !["80", "443"].includes(url.port)) return reject(new BlockedAddressError());
    if (url.username || url.password) return reject(new BlockedAddressError());
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPublicIp(host)) return reject(new BlockedAddressError());
    const lib = url.protocol === "https:" ? https : http;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(Object.assign(new Error("tempo scaduto"), { name: "TimeoutError" }));
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        headers: { "User-Agent": o.userAgent, Accept: o.accept, "Accept-Language": "it-IT,it;q=0.9,en;q=0.6", "Accept-Encoding": "gzip, deflate, br" },
        timeout: Math.min(remaining, o.timeoutMs),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // Reindirizzamento: non si legge il corpo, ci pensa il chiamante
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, headers: res.headers, body: "", truncated: false });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        stream.on("data", (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > o.maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, c.length - (size - o.maxBytes)));
            req.destroy();
            resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated });
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => !truncated && resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated }));
        stream.on("error", (e) => !truncated && reject(e));
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("tempo scaduto"), { name: "TimeoutError" })));
    req.on("error", reject);
    req.end();
  });
}

/** GET sicuro di una pagina pubblica, con reindirizzamenti controllati uno per uno. */
export async function safeFetch(rawUrl: string, options: Options): Promise<SafeResponse> {
  const o: Required<Options> = { accept: "text/html,application/xhtml+xml", maxBytes: 2_000_000, timeoutMs: 20_000, maxRedirects: 5, ...options };
  const deadline = Date.now() + o.timeoutMs;
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= o.maxRedirects; hop++) {
    const r = await requestOnce(url, o, deadline);
    const location = r.headers.location;
    if (r.status >= 300 && r.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.headers)) if (v != null) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
    return { status: r.status, url: url.toString(), headers, body: r.body, truncated: r.truncated };
  }
  throw new Error("troppi reindirizzamenti");
}
