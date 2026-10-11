import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { parseAuditFilters, queryAudit, type AuditFilters } from "@/lib/audit-query";
import { AuditView } from "./audit-view";

export const metadata = { title: "Audit trail" };

// Audit trail: tutte le azioni di tutti gli utenti (e del sistema). Solo Super admin e Administrator.
export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  await requireAdmin();
  const filters = parseAuditFilters(await searchParams);
  const [rows, people, clientList] = await Promise.all([
    queryAudit(filters),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name),
  ]);
  return (
    <AuditView
      filters={filters}
      people={people}
      clients={clientList}
      rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
