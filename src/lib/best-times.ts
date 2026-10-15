import "server-only";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { socialAccounts, socialPosts } from "@/db/schema";

// Orari migliori per pubblicare: dai post del cliente negli ultimi 6 mesi, interazioni medie per giorno e ora (ora italiana).
// Servono almeno 2 post nella stessa fascia, altrimenti un singolo post fortunato falserebbe la media.

const DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

const interactions = (m: Record<string, number> | null) =>
  !m ? 0 : m.total_interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saved ?? 0);

export async function bestTimes(clientId: number) {
  const channels = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  if (!channels.length) return [];
  const posts = await db
    .select({ at: socialPosts.publishedAt, metrics: socialPosts.metrics })
    .from(socialPosts)
    .where(and(inArray(socialPosts.socialAccountId, channels.map((c) => c.id)), isNotNull(socialPosts.publishedAt), gte(socialPosts.publishedAt, new Date(Date.now() - 183 * 86_400_000))));

  const slots = new Map<string, { day: number; hour: number; total: number; n: number }>();
  for (const p of posts) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(p.at!);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((x) => x.type === "weekday")!.value);
    const hour = Number(parts.find((x) => x.type === "hour")!.value) % 24;
    const key = `${day}-${hour}`;
    const s = slots.get(key) ?? { day, hour, total: 0, n: 0 };
    s.total += interactions(p.metrics);
    s.n += 1;
    slots.set(key, s);
  }
  return [...slots.values()]
    .filter((s) => s.n >= 2)
    .map((s) => ({ day: s.day, hour: s.hour, label: `${DAYS[s.day]} ${String(s.hour).padStart(2, "0")}:00`, avg: Math.round(s.total / s.n), posts: s.n }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
}
