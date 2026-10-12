import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, clients, editorialItems, ideas } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { clientStatus, kpisWithStatus } from "@/lib/queries";
import { canWrite } from "@/lib/roles";
import { ClientsView } from "./clients-view";

export const metadata = { title: "Clienti" };

export default async function ClientsPage() {
  const me = await requireUser();
  const ids = await visibleClientIds(me);
  const list =
    ids && !ids.length
      ? []
      : await db.select().from(clients).where(ids ? inArray(clients.id, ids) : undefined).orderBy(asc(clients.name));
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

  // Data del logo per cliente (solo se c'è un logo): l'immagine arriva da /api/logo
  const kits = list.length
    ? await db.select({ clientId: brandKits.clientId, at: brandKits.updatedAt }).from(brandKits).where(and(inArray(brandKits.clientId, list.map((c) => c.id)), isNotNull(brandKits.logo)))
    : [];

  const data = list.map((c) => {
    const mine = rows.filter((r) => r.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      sector: c.sector,
      logo: (() => {
        const k = kits.find((x) => x.clientId === c.id);
        return k ? `/api/logo/${c.id}?tipo=icona&v=${k.at.getTime()}` : null;
      })(),
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

  return <ClientsView clients={data} readOnly={!canWrite(me.role)} />;
}
