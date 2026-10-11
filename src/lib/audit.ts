import "server-only";
import { eq, lt } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { AUDIT_CATEGORIES, auditLogs, users } from "@/db/schema";

// Audit trail: registra chi ha fatto cosa (accessi, utenti, impostazioni, check-up, contenuti, lead, canali…).
// Come il registro errori non deve mai far fallire l'operazione che lo chiama. Si conserva 2 anni.
// Non si registrano mai segreti: solo descrizioni e valori "prima/dopo" non sensibili.

const RETENTION_DAYS = 730;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

type AuditInput = {
  /** Chi ha agito; null = sistema (es. lead arrivato dal sito, lavoro AI concluso). */
  userId: number | null;
  category: AuditCategory;
  action: string;
  description: string;
  clientId?: number | null;
  target?: string | null;
  meta?: Record<string, unknown> | null;
  /** Per gli accessi falliti: l'email scritta (l'utente può non esistere). */
  actorLabel?: string;
};

async function requestIp() {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  } catch {
    return null; // fuori da una richiesta (lavori in background)
  }
}

export async function audit(o: AuditInput) {
  try {
    let actor = o.actorLabel ?? null;
    if (o.userId && !actor) {
      const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, o.userId)).limit(1);
      if (u) actor = `${u.name} <${u.email}>`;
    }
    await db.insert(auditLogs).values({
      userId: o.userId,
      actor: actor?.slice(0, 200) ?? null,
      category: o.category,
      action: o.action.slice(0, 60),
      description: o.description.slice(0, 600),
      clientId: o.clientId ?? null,
      target: o.target?.slice(0, 80) ?? null,
      meta: o.meta ?? null,
      ip: (await requestIp())?.slice(0, 64) ?? null,
    });
    if (Math.random() < 0.01) {
      await db.delete(auditLogs).where(lt(auditLogs.createdAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000)));
    }
  } catch (e) {
    console.error("[audit] impossibile registrare:", e);
  }
}
