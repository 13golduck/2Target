import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Lettura diretta del sito del cliente, fatta da 2Target (non dall'AI) prima della ricognizione.
// Serve quando il sito non è indicizzato o la ricerca web non lo trova: si entra nel sito e si leggono
// homepage, pagine principali e sitemap, con alcuni controlli tecnici (noindex, robots, canonical, CMS).
// Il risultato è testo in markdown per l'AI: fonte primaria, con l'indirizzo di ogni pagina.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 2Target-checkup";
const MAX_PAGES = 10;
const PAGE_TEXT = 3500;
const TOTAL_TEXT = 26_000;

// Pagine più utili per capire un'azienda, in ordine di priorità
const PRIORITY = [
  /chi-?siamo|about|azienda|company|storia|team/i,
  /servizi|services|prodott|products|soluzioni|solutions|cosa-facciamo|offerta|catalog/i,
  /shop|negozio|store|collezion|collection/i,
  /b2b|rivenditor|dealer|partner|aziende|business|ingrosso/i,
  /prezz|pricing|listino|tariff/i,
  /contatt|contact|dove-siamo/i,
  /blog|news|magazine/i,
  /faq|domande/i,
];

type Page = { url: string; status: number; title: string; description: string; headings: string[]; text: string; links: string[] };
export type SiteReading = { ok: boolean; markdown: string; pages: number; problem: string | null; socialLinks: string[] };

const SOCIAL = /^https?:\/\/(www\.|m\.|it-it\.)?(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|x\.com|twitter\.com|pinterest\.[a-z.]+|threads\.net)\//i;

function isPrivate(ip: string) {
  return (
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.)/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

/** Solo siti pubblici: niente indirizzi interni del server. */
async function assertPublic(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("indirizzo non web");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local")) throw new Error("indirizzo interno");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (ips.some(isPrivate)) throw new Error("indirizzo interno");
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function fetchText(url: string, accept = "text/html,application/xhtml+xml") {
  const u = new URL(url);
  await assertPublic(u);
  const res = await fetch(u, {
    headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "it-IT,it;q=0.9,en;q=0.6" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  // Anche dopo i reindirizzamenti si resta su indirizzi pubblici
  if (res.url) await assertPublic(new URL(res.url));
  const type = res.headers.get("content-type") ?? "";
  const body = /html|xml|text/.test(type) || !type ? (await res.text()).slice(0, 1_500_000) : "";
  return { status: res.status, finalUrl: res.url || url, body, headers: res.headers, type };
}

function parsePage(url: string, status: number, html: string): Page {
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? html.slice(0, 20_000);
  const title = clean(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = clean(
    head.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
      head.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ??
      "",
  );
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const headings = [...body.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `H${m[1]}: ${clean(m[2])}`).filter((h) => h.length > 4).slice(0, 25);
  const text = clean(body.replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n"));
  const base = new URL(url);
  const links = [
    ...new Set(
      [...body.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)]
        .map((m) => {
          try {
            const u = new URL(decode(m[1]), base);
            u.hash = "";
            return u.toString();
          } catch {
            return null;
          }
        })
        .filter((u): u is string => !!u),
    ),
  ];
  return { url, status, title, description, headings, text, links };
}

/** Segnali tecnici utili al check-up (indicizzazione, CMS, sito solo JavaScript). */
function technicalNotes(html: string, headers: Headers, page: Page) {
  const notes: string[] = [];
  const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1];
  if (robotsMeta && /noindex/i.test(robotsMeta)) notes.push(`La homepage ha il meta robots «${robotsMeta}»: chiede a Google di NON indicizzarla (causa probabile della mancata indicizzazione).`);
  const xRobots = headers.get("x-robots-tag");
  if (xRobots && /noindex/i.test(xRobots)) notes.push(`Il server invia l'intestazione X-Robots-Tag «${xRobots}»: blocca l'indicizzazione.`);
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1];
  if (canonical) notes.push(`Canonical: ${canonical}`);
  const lang = html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1];
  if (lang) notes.push(`Lingua dichiarata: ${lang}`);
  const cms = [
    [/wp-content|wp-includes/i, "WordPress"],
    [/cdn\.shopify\.com|Shopify\.theme/i, "Shopify"],
    [/static\.wixstatic\.com|wix\.com/i, "Wix"],
    [/squarespace/i, "Squarespace"],
    [/prestashop/i, "PrestaShop"],
    [/Joomla/i, "Joomla"],
    [/webflow/i, "Webflow"],
    [/__NEXT_DATA__|\/_next\//, "Next.js"],
  ].find(([re]) => (re as RegExp).test(html));
  if (cms) notes.push(`Piattaforma probabile: ${cms[1]}`);
  if (/googletagmanager\.com|gtag\(/.test(html)) notes.push("Presente Google Tag Manager / Google Analytics");
  if (/connect\.facebook\.net|fbq\(/.test(html)) notes.push("Presente il Pixel di Meta");
  if (page.text.length < 400 && /<div[^>]+id=["'](root|app|__next)["']/i.test(html))
    notes.push("Il testo della pagina è quasi vuoto senza JavaScript: il sito si costruisce nel browser, e i motori di ricerca potrebbero leggerlo male.");
  if (!page.description) notes.push("Manca la meta description della homepage.");
  if (!page.headings.some((h) => h.startsWith("H1"))) notes.push("La homepage non ha un titolo H1.");
  return notes;
}

async function sitemapUrls(origin: string) {
  const out: string[] = [];
  let robots = "";
  try {
    const r = await fetchText(`${origin}/robots.txt`, "text/plain");
    if (r.status === 200) robots = r.body.slice(0, 5000);
  } catch {
    /* robots.txt assente */
  }
  const maps = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  if (!maps.length) maps.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
  for (const map of maps.slice(0, 3)) {
    try {
      const r = await fetchText(map, "application/xml,text/xml");
      if (r.status !== 200) continue;
      const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
      // Indice di sitemap: si apre la prima sottosezione
      if (/<sitemapindex/i.test(r.body) && locs[0]) {
        const sub = await fetchText(locs[0], "application/xml,text/xml").catch(() => null);
        if (sub?.status === 200) out.push(...[...sub.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1])));
      } else out.push(...locs);
      if (out.length) break;
    } catch {
      /* sitemap non disponibile */
    }
  }
  const blocksAll = /^user-agent:\s*\*[\s\S]*?^disallow:\s*\/\s*$/im.test(robots);
  return { urls: [...new Set(out)].slice(0, 500), robots, blocksAll };
}

function pageMarkdown(p: Page) {
  const text = p.text.length > PAGE_TEXT ? `${p.text.slice(0, PAGE_TEXT)}… [testo tagliato]` : p.text;
  return [
    `### ${p.title || "(senza titolo)"} — ${p.url}`,
    p.description && `Meta description: ${p.description}`,
    p.headings.length && `Titoli: ${p.headings.slice(0, 15).join(" · ")}`,
    `Testo: ${text || "(nessun testo leggibile)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const why = (e: unknown) => {
  const err = e as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "il sito non ha risposto entro 20 secondi";
  const code = err?.cause?.code ?? err?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "il dominio non esiste o non ha un indirizzo (DNS)";
  if (code === "ECONNREFUSED") return "il server del sito rifiuta la connessione";
  if (code && /CERT|SSL|TLS/.test(code)) return `certificato HTTPS non valido (${code})`;
  return err?.message ?? String(e);
};

/** Legge il sito del cliente. Non lancia mai: in caso di problemi spiega il motivo concreto. */
export async function readSite(website: string): Promise<SiteReading> {
  let start: URL;
  try {
    start = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return { ok: false, pages: 0, socialLinks: [], problem: "indirizzo del sito non valido", markdown: `Indirizzo del sito non valido: «${website}».` };
  }

  // Homepage: si prova l'indirizzo dato, poi con/senza www e in http
  const variants = [start.toString()];
  const alt = new URL(start);
  alt.hostname = start.hostname.startsWith("www.") ? start.hostname.slice(4) : `www.${start.hostname}`;
  variants.push(alt.toString());
  const http = new URL(start);
  http.protocol = "http:";
  variants.push(http.toString());

  let home: Awaited<ReturnType<typeof fetchText>> | null = null;
  const errors: string[] = [];
  for (const v of variants) {
    try {
      const r = await fetchText(v);
      if (r.status < 400 && r.body) {
        home = r;
        break;
      }
      errors.push(`${v} → HTTP ${r.status}${r.status === 403 || r.status === 429 ? " (il sito blocca le visite automatiche)" : ""}`);
    } catch (e) {
      errors.push(`${v} → ${why(e)}`);
    }
  }
  if (!home) {
    return {
      ok: false,
      pages: 0,
      socialLinks: [],
      problem: errors[0] ?? "sito non raggiungibile",
      markdown: `Lettura diretta del sito NON riuscita. Tentativi:\n${errors.map((e) => `- ${e}`).join("\n")}\nUsa questo motivo preciso nel check-up (non scrivere genericamente che il sito "non si legge").`,
    };
  }

  const homePage = parsePage(home.finalUrl, home.status, home.body);
  const origin = new URL(home.finalUrl).origin;
  const notes = technicalNotes(home.body, home.headers, homePage);
  const sitemap = await sitemapUrls(origin);
  if (sitemap.blocksAll) notes.push("robots.txt blocca tutto il sito ai motori di ricerca (Disallow: /): causa diretta della mancata indicizzazione.");
  notes.push(sitemap.urls.length ? `Sitemap trovata: ${sitemap.urls.length} indirizzi.` : "Nessuna sitemap XML trovata (né in robots.txt né in /sitemap.xml).");
  if (start.origin !== origin) notes.push(`L'indirizzo ${start.origin} porta a ${origin}.`);

  // Pagine interne: dai link della homepage e dalla sitemap, le più utili per prime
  const internal = [...new Set([...homePage.links, ...sitemap.urls])].filter((u) => {
    try {
      const x = new URL(u);
      return x.origin === origin && !/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|css|js|xml)(\?|$)/i.test(x.pathname) && x.pathname !== "/" && !/(cart|carrello|checkout|account|login|wp-admin|feed|tag\/|page\/\d)/i.test(x.pathname);
    } catch {
      return false;
    }
  });
  const score = (u: string) => {
    const i = PRIORITY.findIndex((re) => re.test(new URL(u).pathname));
    return (i === -1 ? PRIORITY.length : i) * 10 + new URL(u).pathname.split("/").length;
  };
  const chosen: string[] = [];
  for (const u of internal.sort((a, b) => score(a) - score(b))) {
    if (chosen.length >= MAX_PAGES - 1) break;
    chosen.push(u);
  }

  const pages: Page[] = [homePage];
  for (const u of chosen) {
    try {
      const r = await fetchText(u);
      if (r.status < 400 && r.body) pages.push(parsePage(r.finalUrl, r.status, r.body));
    } catch {
      /* pagina saltata */
    }
  }

  let md = `Sito letto direttamente da 2Target il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} (${pages.length} pagine). È la fonte primaria sul sito: vale anche se il dominio non è indicizzato dai motori di ricerca.

### Controlli tecnici
${notes.map((n) => `- ${n}`).join("\n")}

${pages.map(pageMarkdown).join("\n\n")}`;
  if (sitemap.urls.length) md += `\n\n### Altre pagine nella sitemap (solo indirizzi)\n${sitemap.urls.filter((u) => !pages.some((p) => p.url === u)).slice(0, 60).join("\n")}`;
  if (md.length > TOTAL_TEXT) md = `${md.slice(0, TOTAL_TEXT)}\n… [lettura tagliata per lunghezza]`;
  // Profili social linkati dal sito (header, footer, contatti): li legge poi social-reader
  const socialLinks = [...new Set(pages.flatMap((p) => p.links).filter((l) => SOCIAL.test(l)))].slice(0, 30);
  return { ok: true, pages: pages.length, problem: null, markdown: md, socialLinks };
}
