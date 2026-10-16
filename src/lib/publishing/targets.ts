import "server-only";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { connections, socialAccounts } from "@/db/schema";
import { accessToken } from "@/lib/integrations/sync";
import { decryptSecret } from "@/lib/secret-box";
import { canPublishWithScopes } from "./tiktok-publish";
import { canPublishWithScopes as linkedinCanPublish } from "@/lib/integrations/linkedin";

// Da quale strada passa la pubblicazione su un profilo:
// - Pagina Facebook e Instagram collegato alla Pagina: token della Pagina (Meta)
// - Instagram con login Instagram (senza Pagina): token dell'utente Instagram, su graph.instagram.com
// - TikTok: token dell'utente TikTok, con il permesso video.publish
// - LinkedIn: token di chi amministra la pagina aziendale, con il permesso w_organization_social

type Channel = typeof socialAccounts.$inferSelect;
type Connection = typeof connections.$inferSelect;

export const PUBLISHABLE = ["facebook", "instagram", "tiktok", "linkedin"] as const;

export type Route = "meta" | "instagram" | "tiktok" | "linkedin";

/** Il profilo è pronto per pubblicare? Restituisce la strada, oppure il motivo per cui non lo è. */
export function routeOf(ch: Channel, conn: Connection | null | undefined): { route: Route } | { problem: string } {
  if (!ch.connected || !ch.externalId) return { problem: "non è collegato: collegalo da Canali" };
  if (ch.platform === "tiktok") {
    if (conn?.provider !== "tiktok") return { problem: "non è collegato a TikTok: collegalo da Canali" };
    if (!canPublishWithScopes(conn.scopes)) return { problem: "è collegato senza il permesso di pubblicare: ricollega TikTok da Canali" };
    return { route: "tiktok" };
  }
  if (ch.platform === "linkedin") {
    if (conn?.provider !== "linkedin") return { problem: "non è collegata a LinkedIn: collegala da Canali" };
    if (!linkedinCanPublish(conn.scopes)) return { problem: "è collegata senza il permesso di pubblicare: ricollega LinkedIn da Canali" };
    return { route: "linkedin" };
  }
  if (ch.platform === "instagram" && conn?.provider === "instagram") return { route: "instagram" };
  if ((ch.platform === "facebook" || ch.platform === "instagram") && ch.assetTokenEnc) return { route: "meta" };
  return { problem: "non è collegato per la pubblicazione: collegalo da Canali" };
}

/** Collegamenti dei profili indicati (per routeOf). */
export async function connectionsOf(channels: Channel[]) {
  const ids = [...new Set(channels.map((c) => c.connectionId).filter((x): x is number => !!x))];
  return ids.length ? await db.select().from(connections).where(inArray(connections.id, ids)) : [];
}

/** Token per inviare il post: della Pagina (Meta) o dell'utente (Instagram diretto e TikTok, rinnovati se serve). */
export async function publishToken(ch: Channel, route: Route) {
  if (route === "meta") {
    const token = decryptSecret(ch.assetTokenEnc);
    if (!token) throw new Error("Il profilo non è più collegato: ricollegalo da Canali");
    return token;
  }
  const [conn] = ch.connectionId ? await db.select().from(connections).where(eq(connections.id, ch.connectionId)) : [];
  if (!conn) throw new Error("Collegamento non trovato: ricollega il profilo da Canali");
  return accessToken(conn);
}
