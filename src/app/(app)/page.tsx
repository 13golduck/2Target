import Link from "next/link";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { StatusBadge } from "@/components/status-badge";
import { clientStatus, kpisWithStatus } from "@/lib/queries";
import { createClient } from "./actions";

export default async function ClientsPage() {
  const list = await db.select().from(clients).orderBy(asc(clients.name));
  const rows = await kpisWithStatus(list.map((c) => c.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clienti</h1>
          <p className="text-sm text-muted">Lo stato è quello del KPI peggiore nell&apos;ultimo periodo misurato.</p>
        </div>
        <form action={createClient} className="flex flex-wrap gap-2">
          <input name="name" placeholder="Nuovo cliente" required className="field w-48" />
          <input name="sector" placeholder="Settore" className="field w-48" />
          <button className="btn">Aggiungi</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const mine = rows.filter((r) => r.clientId === c.id);
          const count = (st: string) => mine.filter((r) => r.evaluation.status === st).length;
          return (
            <Link key={c.id} href={`/clienti/${c.id}`} className="card block p-5 transition hover:border-gold">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">{c.sector ?? "—"}</p>
                </div>
                <StatusBadge status={clientStatus(rows, c.id)} />
              </div>
              <p className="mt-4 text-xs text-muted">
                {mine.length} KPI · {count("bene")} bene · {count("male")} male · {count("troppo_male")} troppo male
              </p>
            </Link>
          );
        })}
        {list.length === 0 && <p className="text-sm text-muted">Nessun cliente: aggiungine uno.</p>}
      </div>
    </div>
  );
}
