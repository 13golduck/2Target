import { requireClientAccess } from "@/lib/auth";
import { canWrite } from "@/lib/roles";
import { competitorOverview } from "@/lib/competitors-data";
import { ConcorrentiView } from "./concorrenti-view";

export const metadata = { title: "Concorrenti" };

// Concorrenti del cliente su Instagram: numeri pubblici letti ogni giorno e confronto con il cliente.

export default async function ConcorrentiPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const me = await requireClientAccess(clientId);
  const data = await competitorOverview(clientId);
  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
  const plain = <T extends { lastPostAt: Date | null }>(m: T | null) => (m ? { ...m, lastPostAt: iso(m.lastPostAt) } : null);
  return (
    <ConcorrentiView
      clientId={clientId}
      canEdit={canWrite(me.role)}
      client={data.client ? { handle: data.client.handle, metrics: plain(data.client.metrics) } : null}
      rows={data.rows.map((r) => ({ ...r, metrics: plain(r.metrics) }))}
      insights={data.insights}
    />
  );
}
