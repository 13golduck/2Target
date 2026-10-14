import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { channelDaily, connections, socialAccounts, socialPosts } from "@/db/schema";

// Callback di eliminazione dei dati di Meta: quando una persona rimuove 2Target dalle sue integrazioni
// Facebook, Meta invia un signed_request firmato con la chiave segreta dell'app. Si verifica la firma
// e si cancellano token, statistiche e post scaricati per i collegamenti di quella persona.

/** Verifica il signed_request (HMAC-SHA256 con la chiave segreta dell'app) e ne restituisce il contenuto. */
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string; algorithm?: string } | null {
  const [sig, payload] = String(signedRequest ?? "").split(".");
  if (!sig || !payload || !appSecret) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return String(data.algorithm ?? "").toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch {
    return null;
  }
}

/** Cancella i dati collegati a un utente Meta. Restituisce quanti collegamenti e canali ha toccato. */
export async function deleteMetaUserData(userId: string) {
  const conns = await db.select({ id: connections.id, clientId: connections.clientId }).from(connections).where(eq(connections.externalUserId, userId));
  const connIds = conns.filter(Boolean).map((c) => c.id);
  if (!connIds.length) return { connections: 0, channels: 0, clientIds: [] as number[] };
  const channels = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(inArray(socialAccounts.connectionId, connIds));
  const channelIds = channels.map((c) => c.id);
  if (channelIds.length) {
    await db.delete(socialPosts).where(inArray(socialPosts.socialAccountId, channelIds));
    await db.delete(channelDaily).where(inArray(channelDaily.socialAccountId, channelIds));
    // Il canale resta come voce manuale (nome e indirizzo), senza token né dati scaricati
    await db.update(socialAccounts).set({ connectionId: null, assetTokenEnc: null, connected: false, lastSyncAt: null, lastSyncError: null }).where(inArray(socialAccounts.id, channelIds));
  }
  await db.delete(connections).where(inArray(connections.id, connIds));
  return { connections: connIds.length, channels: channelIds.length, clientIds: [...new Set(conns.map((c) => c.clientId))] };
}

export const confirmationCode = () => randomBytes(6).toString("hex").toUpperCase();
