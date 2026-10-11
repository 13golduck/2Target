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

/** Da dove arriva l'azione: IP, browser e pagina (fuori da una richiesta, es. lavori in background, è tutto vuoto). */
async function requestContext() {
  try {
    const h = await headers();
    let path = h.get("x-pathname");
    const ref = h.get("referer");
    if (ref) {
      try {
        const u = new URL(ref);
        path = `${u.pathname}${u.search}`;
      } catch {
        /* referer non valido */
      }
    }
    return {
      ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent"),
      path,
    };
  } catch {
    return { ip: null, userAgent: null, path: null };
  }
}

const short = (v: unknown) => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v.length > 300) return `${v.slice(0, 300)}… (${v.length} caratteri)`;
  return v ?? null;
};

// Vuoto è vuoto: null, "", [] e {} non contano come modifica
const norm = (v: unknown) => {
  if (v instanceof Date) return v.toISOString();
  if (v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) return null;
  return v;
};

/**
 * Campi cambiati tra prima e dopo, per i dettagli dell'audit: { campo: { prima, dopo } }.
 * I testi lunghi vengono accorciati; con `labels` si danno nomi leggibili ai campi.
 */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>, labels: Record<string, string> = {}) {
  const out: Record<string, { prima: unknown; dopo: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    const old = before?.[k];
    const same = JSON.stringify(norm(old)) === JSON.stringify(norm(v));
    if (!same) out[labels[k] ?? k] = { prima: short(old), dopo: short(v) };
  }
  return out;
}

export async function audit(o: AuditInput) {
  try {
    const ctx = await requestContext();
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
      ip: ctx.ip?.slice(0, 64) ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      path: ctx.path?.slice(0, 300) ?? null,
    });
    if (Math.random() < 0.01) {
      await db.delete(auditLogs).where(lt(auditLogs.createdAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000)));
    }
  } catch (e) {
    console.error("[audit] impossibile registrare:", e);
  }
}
