import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, editorialItems, ideas } from "@/db/schema";
import { clientStatus, kpisWithStatus } from "@/lib/queries";
import { ClientsView } from "./clients-view";

export const metadata = { title: "Clienti" };

export default async function ClientsPage() {
  const list = await db.select().from(clients).orderBy(asc(clients.name));
  const rows = await kpisWithStatus(list.map((c) => c.id));
  const items = await db
    .select({ clientId: editorialItems.clientId, n: sql<number>`count(*)` })
    .from(editorialItems)
    .groupBy(editorialItems.clientId);
  const openIdeas = await db
    .select({ clientId: ideas.clientId, n: sql<number>`count(*)` })
    .from(ideas)
    .where(eq(ideas.status, "idea"))
    .groupBy(ideas.clientId);

  const data = list.map((c) => {
    const mine = rows.filter((r) => r.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      sector: c.sector,
      status: clientStatus(rows, c.id),
      kpi: {
        total: mine.length,
        bene: mine.filter((r) => r.evaluation.status === "bene").length,
        male: mine.filter((r) => r.evaluation.status === "male").length,
        troppo_male: mine.filter((r) => r.evaluation.status === "troppo_male").length,
      },
      items: Number(items.find((i) => i.clientId === c.id)?.n ?? 0),
      ideas: Number(openIdeas.find((i) => i.clientId === c.id)?.n ?? 0),
    };
  });

  return <ClientsView clients={data} />;
}
