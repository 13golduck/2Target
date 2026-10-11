import "server-only";
import { and, desc, eq, gte, isNull, like, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { AUDIT_CATEGORIES, auditLogs, clients } from "@/db/schema";
import { nowDate } from "@/lib/format";

// Filtri comuni alla pagina dell'audit trail e all'esportazione CSV.

export const AUDIT_DAYS = [1, 7, 30, 90, 365] as const;

export type AuditFilters = { giorni?: string; categoria?: string; utente?: string; cliente?: string; q?: string };

export function parseAuditFilters(sp: AuditFilters) {
  const days = (AUDIT_DAYS as readonly number[]).includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;
  const category = AUDIT_CATEGORIES.find((c) => c === sp.categoria) ?? "";
  return { days, category, user: sp.utente ?? "", client: sp.cliente ?? "", q: (sp.q ?? "").trim().slice(0, 100) };
}

export async function queryAudit(f: ReturnType<typeof parseAuditFilters>, limit = 500) {
  const where: SQL[] = [gte(auditLogs.createdAt, new Date(nowDate().getTime() - f.days * 86_400_000))];
  if (f.category) where.push(eq(auditLogs.category, f.category as (typeof AUDIT_CATEGORIES)[number]));
  if (f.user === "sistema") where.push(isNull(auditLogs.userId));
  else if (f.user) where.push(eq(auditLogs.userId, Number(f.user)));
  if (f.client) where.push(eq(auditLogs.clientId, Number(f.client)));
  if (f.q) {
    const pattern = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(like(auditLogs.description, pattern), like(auditLogs.actor, pattern), like(auditLogs.action, pattern))!);
  }
  return db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      userId: auditLogs.userId,
      actor: auditLogs.actor,
      category: auditLogs.category,
      action: auditLogs.action,
      description: auditLogs.description,
      clientId: auditLogs.clientId,
      clientName: clients.name,
      target: auditLogs.target,
      meta: auditLogs.meta,
      ip: auditLogs.ip,
    })
    .from(auditLogs)
    .leftJoin(clients, eq(clients.id, auditLogs.clientId))
    .where(and(...where))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
}
