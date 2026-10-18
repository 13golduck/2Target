import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { inArray } from "drizzle-orm";
import { parseAuditFilters, queryAudit, type AuditFilters } from "@/lib/audit-query";
import { AuditView } from "./audit-view";

export const metadata = { title: "Registro attività" };

// Audit trail, registro unico di azioni, errori e messaggi di sistema.
// Super admin e Administrator vedono tutto; gli altri utenti solo le proprie voci (azioni ed errori).
export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  const me = await requireUser();
  const admin = isAdminRole(me.role);
  const filters = parseAuditFilters(await searchParams);
  const ids = await visibleClientIds(me);
  const [rows, people, clientList] = await Promise.all([
    queryAudit(filters, 500, admin ? undefined : me.id),
    admin ? db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name) : [],
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(ids ? inArray(clients.id, ids.length ? ids : [0]) : undefined)
      .orderBy(clients.name),
  ]);
  return (
    <AuditView
      admin={admin}
      filters={filters}
      people={people}
      clients={clientList}
      rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
