import "server-only";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { META } from "@/lib/integrations/config";
import { decryptSecret } from "@/lib/secret-box";
import { safeFetch } from "@/lib/safe-fetch";

// Lettura dei profili social del cliente fatta da 2Target nel check-up: i dati base non si chiedono al consulente.
// - Instagram: API ufficiale "Business Discovery" di Meta (follower, post, ultimo post, reel, link in bio), che
//   funziona per i profili professionali e richiede un account Instagram collegato a 2Target qualsiasi (fa da "lente");
//   in alternativa i numeri pubblici della pagina del profilo.
// - Facebook, TikTok, YouTube: i dati pubblici dell'anteprima della pagina (follower, like, iscritti).
// I link arrivano da quelli indicati nella scheda cliente e da quelli trovati sul sito.

const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type Profile = { platform: string; handle: string; url: string };

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#064;/g, "@")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const RESERVED = /^(p|reel|reels|explore|stories|tv|share|sharer|sharer\.php|watch|hashtag|groups|events|plugins|dialog|tr|profile\.php|pages|intent|home|login|search|results|channel)$/i;

/** Estrae i profili dai link (scheda cliente + sito), uno per piattaforma e nome. */
export function extractProfiles(text: string, links: string[] = []): Profile[] {
  const found = new Map<string, Profile>();
  const candidates = [...links, ...(text.match(/https?:\/\/[^\s,;)"'<>]+/g) ?? [])];
  // Anche "@nome" scritto da solo nella scheda: si considera Instagram
  for (const m of text.matchAll(/(?:^|\s)@([a-z0-9._]{2,30})\b/gi)) candidates.push(`https://www.instagram.com/${m[1]}/`);
  for (const raw of candidates) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^(www\.|m\.|it-it\.)/, "");
    const seg = u.pathname.split("/").filter(Boolean);
    let p: Profile | null = null;
    if (host === "instagram.com" && seg[0] && !RESERVED.test(seg[0]) && /^[a-z0-9._]{1,30}$/i.test(seg[0])) p = { platform: "instagram", handle: seg[0].toLowerCase(), url: `https://www.instagram.com/${seg[0]}/` };
    else if ((host === "facebook.com" || host === "fb.com") && seg[0] && !RESERVED.test(seg[0])) p = { platform: "facebook", handle: seg[0], url: `https://www.facebook.com/${seg[0]}` };
    else if (host === "facebook.com" && seg[0] === "profile.php" && u.searchParams.get("id")) p = { platform: "facebook", handle: u.searchParams.get("id")!, url: `https://www.facebook.com/profile.php?id=${u.searchParams.get("id")}` };
    else if (host === "tiktok.com" && seg[0]?.startsWith("@")) p = { platform: "tiktok", handle: seg[0].slice(1).toLowerCase(), url: `https://www.tiktok.com/${seg[0]}` };
    else if (host === "youtube.com" && seg[0] && (seg[0].startsWith("@") || ["c", "channel", "user"].includes(seg[0])))
      p = { platform: "youtube", handle: seg[0].startsWith("@") ? seg[0] : `${seg[0]}/${seg[1] ?? ""}`, url: `https://www.youtube.com/${seg[0].startsWith("@") ? seg[0] : `${seg[0]}/${seg[1] ?? ""}`}` };
    else if (host === "linkedin.com" && ["company", "in", "school"].includes(seg[0]) && seg[1]) p = { platform: "linkedin", handle: `${seg[0]}/${seg[1]}`, url: `https://www.linkedin.com/${seg[0]}/${seg[1]}/` };
    if (p) found.set(`${p.platform}:${p.handle.toLowerCase()}`, p);
  }
  return [...found.values()].slice(0, 12);
}

async function fetchMeta(url: string, ua = CRAWLER_UA) {
  const res = await safeFetch(url, { userAgent: ua, maxBytes: 2_000_000, timeoutMs: 20_000 });
  const html = res.body;
  const meta = (prop: string) =>
    decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1] ?? "");
  return { status: res.status, html, title: meta("og:title"), description: meta("og:description") || meta("description") };
}

// ── Instagram: API ufficiale (Business Discovery) ────────────────────

type Discovery = {
  business_discovery?: {
    username: string;
    name?: string;
    biography?: string;
    website?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    media?: { data: { timestamp: string; media_type: string; media_product_type?: string; like_count?: number; comments_count?: number; permalink?: string }[] };
  };
};

/** Un account Instagram professionale collegato a 2Target (di qualsiasi cliente, o di Golduck) da usare come lente. */
export async function discoveryLens() {
  const [lens] = await db
    .select({ externalId: socialAccounts.externalId, token: socialAccounts.assetTokenEnc })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.platform, "instagram"), eq(socialAccounts.connected, true), isNotNull(socialAccounts.assetTokenEnc), isNotNull(socialAccounts.externalId)))
    .orderBy(desc(socialAccounts.lastSyncAt))
    .limit(1);
  const token = lens ? decryptSecret(lens.token) : null;
  return lens?.externalId && token ? { igId: lens.externalId, token } : null;
}

export async function instagramDiscovery(username: string, lens: { igId: string; token: string }) {
  // Il nome entra nell'espressione dei campi dell'API: solo caratteri ammessi da Instagram
  if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new Error("nome del profilo non valido");
  const fields = `business_discovery.username(${username}){username,name,biography,website,followers_count,follows_count,media_count,media.limit(12){timestamp,media_type,media_product_type,like_count,comments_count,permalink}}`;
  const url = `https://graph.facebook.com/${META.version}/${lens.igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(lens.token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const body = (await res.json()) as Discovery & { error?: { message?: string } };
  if (!res.ok || !body.business_discovery) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.business_discovery;
}

const fmt = (n?: number | null) => (n == null ? "n.d." : n.toLocaleString("it-IT"));
const day = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

async function readInstagram(p: Profile, lens: Awaited<ReturnType<typeof discoveryLens>>) {
  if (lens) {
    try {
      const d = await instagramDiscovery(p.handle, lens);
      const posts = d.media?.data ?? [];
      const reels = posts.filter((m) => m.media_product_type === "REELS").length;
      const carousels = posts.filter((m) => m.media_type === "CAROUSEL_ALBUM").length;
      const avgEng = posts.length ? Math.round(posts.reduce((t, m) => t + (m.like_count ?? 0) + (m.comments_count ?? 0), 0) / posts.length) : null;
      const er = avgEng != null && d.followers_count ? ((avgEng / d.followers_count) * 100).toFixed(2) : null;
      const span = posts.length > 1 ? Math.round((Date.parse(posts[0].timestamp) - Date.parse(posts[posts.length - 1].timestamp)) / 86_400_000) : null;
      return [
        `**Instagram @${d.username}** (${p.url}) — fonte: API ufficiale di Meta (Business Discovery)`,
        `- Nome: ${d.name ?? "n.d."}`,
        `- Follower: ${fmt(d.followers_count)} · Seguiti: ${fmt(d.follows_count)} · Post totali: ${fmt(d.media_count)}`,
        posts[0] ? `- Ultimo post: ${day(posts[0].timestamp)} (${posts[0].permalink ?? ""})` : "- Nessun post pubblicato",
        posts.length ? `- Ultimi ${posts.length} post: ${reels} reel, ${carousels} caroselli, ${posts.length - reels - carousels} foto/video${span != null ? `, pubblicati in ${span} giorni (circa ${(posts.length / Math.max(1, span / 7)).toFixed(1)} a settimana)` : ""}` : "",
        avgEng != null ? `- Interazioni medie (like + commenti) sugli ultimi post: ${fmt(avgEng)}${er ? ` · engagement rate ≈ ${er}%` : ""}` : "",
        `- Link in bio: ${d.website || "nessuno"}`,
        d.biography ? `- Bio: ${d.biography.replace(/\s+/g, " ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (e) {
      // Profilo personale (non professionale) o non trovato: si passa ai numeri pubblici
      const why = e instanceof Error ? e.message : String(e);
      const pub = await readInstagramPublic(p);
      return `${pub}\n- Nota: l'API di Meta non ha restituito il profilo (${why.slice(0, 160)}); probabilmente non è un account professionale.`;
    }
  }
  return `${await readInstagramPublic(p)}\n- Ultimo post, reel e link in bio non sono nella pagina pubblica: si leggono con l'API di Meta quando a 2Target è collegato almeno un account Instagram professionale (Canali di un cliente, anche quello di Golduck).`;
}

async function readInstagramPublic(p: Profile) {
  const m = await fetchMeta(p.url);
  const d = m.description;
  const nums = d.match(/([\d.,]+\s*[kmKM]?)\s*follower[s]?,\s*([\d.,]+\s*[kmKM]?)\s*(?:seguiti|following),\s*([\d.,]+\s*[kmKM]?)\s*post/i);
  if (m.status >= 400 || !d) return `**Instagram @${p.handle}** (${p.url}) — profilo non leggibile (HTTP ${m.status}): verifica che il nome sia giusto e che il profilo sia pubblico.`;
  return [
    `**Instagram @${p.handle}** (${p.url}) — fonte: pagina pubblica del profilo`,
    `- ${m.title.replace(/\s*•.*$/, "")}`,
    nums ? `- Follower: ${nums[1]} · Seguiti: ${nums[2]} · Post totali: ${nums[3]}` : `- Anteprima: ${d}`,
  ].join("\n");
}

async function readPublicPreview(p: Profile) {
  const label = { facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" }[p.platform] ?? p.platform;
  try {
    const m = await fetchMeta(p.url, p.platform === "youtube" ? BROWSER_UA : CRAWLER_UA);
    if (m.status >= 400) return `**${label} ${p.handle}** (${p.url}) — pagina non leggibile (HTTP ${m.status})`;
    const extra: string[] = [];
    if (p.platform === "youtube") {
      const subs = m.html.match(/subscriberCountText"[^}]*?"label":"([^"]+)"/)?.[1];
      if (subs) extra.push(`- Iscritti: ${decode(subs)}`);
    }
    if (p.platform === "linkedin" && !m.description) return `**LinkedIn ${p.handle}** (${p.url}) — LinkedIn non mostra i dati senza accesso: da verificare con la ricerca web.`;
    const desc = m.description.replace(/\s+/g, " ");
    return [`**${label} ${p.handle}** (${p.url}) — fonte: anteprima pubblica della pagina`, m.title && `- ${m.title}`, desc && `- ${desc.length > 400 ? `${desc.slice(0, 400)}…` : desc}`, ...extra].filter(Boolean).join("\n");
  } catch (e) {
    return `**${label} ${p.handle}** (${p.url}) — non raggiungibile (${e instanceof Error ? e.message : e})`;
  }
}

export type SocialReading = { markdown: string; profiles: number };

/** Legge i profili social trovati. Non lancia mai. */
export async function readSocials(clientSocialText: string, siteLinks: string[]): Promise<SocialReading> {
  await ensureIntegrationKeys();
  const profiles = extractProfiles(clientSocialText ?? "", siteLinks);
  if (!profiles.length) return { profiles: 0, markdown: "Nessun profilo social indicato nella scheda cliente né trovato sul sito." };
  const lens = await discoveryLens().catch(() => null);
  const parts: string[] = [];
  for (const p of profiles) {
    try {
      parts.push(p.platform === "instagram" ? await readInstagram(p, lens) : await readPublicPreview(p));
    } catch (e) {
      parts.push(`**${p.platform} ${p.handle}** (${p.url}) — lettura non riuscita (${e instanceof Error ? e.message : e})`);
    }
  }
  return {
    profiles: profiles.length,
    markdown: `Profili letti direttamente da 2Target il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}. Sono dati pubblici e verificati: usali e non chiederli al consulente.\n\n${parts.join("\n\n")}`,
  };
}
