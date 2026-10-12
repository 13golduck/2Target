import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { CHANNEL_KINDS, clients, socialAccounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { extractProfiles } from "@/lib/social-reader";
import { syncChannel } from "./sync";

// Sito e profili social scritti nella scheda del cliente (o nell'analisi iniziale) diventano canali da soli:
// non vanno inseriti una seconda volta in Canali. Sono canali "a mano" (non collegati): con «Collega Meta»
// il profilo con lo stesso nome viene poi promosso a collegato.

type Kind = (typeof CHANNEL_KINDS)[number];

function websiteHandle(raw: string | null) {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Crea i canali mancanti dal sito e dai profili della scheda cliente. Restituisce quanti ne ha aggiunti. */
export async function ensureChannelsFromClient(clientId: number, userId: number | null = null) {
  const [client] = await db.select({ website: clients.website, socialLinks: clients.socialLinks }).from(clients).where(eq(clients.id, clientId));
  if (!client) return 0;
  const existing = await db.select({ platform: socialAccounts.platform, handle: socialAccounts.handle }).from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  const has = (platform: Kind, handle: string) => existing.some((e) => e.platform === platform && e.handle.toLowerCase() === handle.toLowerCase());

  const wanted: { platform: Kind; handle: string }[] = [];
  const site = websiteHandle(client.website);
  if (site) wanted.push({ platform: "website", handle: site });
  for (const p of extractProfiles(client.socialLinks ?? "")) {
    const handle = p.platform === "youtube" || p.platform === "linkedin" ? p.url : p.handle;
    if ((CHANNEL_KINDS as readonly string[]).includes(p.platform)) wanted.push({ platform: p.platform as Kind, handle });
  }

  const added: string[] = [];
  for (const w of wanted) {
    if (has(w.platform, w.handle)) continue;
    await db.insert(socialAccounts).values({ clientId, platform: w.platform, handle: w.handle, name: w.handle }).onDuplicateKeyUpdate({ set: { name: w.handle } });
    added.push(`${w.platform} ${w.handle}`);
    // Il sito si analizza subito (PageSpeed), senza bloccare chi ha salvato
    if (w.platform === "website") {
      const [ch] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.clientId, clientId), eq(socialAccounts.platform, "website"), eq(socialAccounts.handle, w.handle)));
      if (ch) void syncChannel(ch).catch(() => undefined);
    }
  }
  if (added.length) {
    await audit({ userId, category: "canali", action: "canali.da_scheda", description: `Aggiunti in Canali dalla scheda del cliente: ${added.join(", ")}`, clientId });
  }
  return added.length;
}
