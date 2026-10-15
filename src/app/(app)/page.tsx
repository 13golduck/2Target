import { and, asc, eq, gte, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, clients, editorialItems, ideas } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { clientStatus, kpisWithStatus } from "@/lib/queries";
import { canWrite, isViewer } from "@/lib/roles";
import { todayBoard } from "@/lib/today";
import { ClientsView } from "./clients-view";

export const metadata = { title: "Oggi" };

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

  // Prossima uscita e contenuti della settimana per cliente
  const now = new Date();
  const upcoming = await db
    .select({ clientId: editorialItems.clientId, at: editorialItems.scheduledAt, status: editorialItems.status })
    .from(editorialItems)
    .where(and(gte(editorialItems.scheduledAt, now), notInArray(editorialItems.status, ["pubblicato", "annullato"])))
    .orderBy(asc(editorialItems.scheduledAt));
  const toApprove = await db
    .select({ clientId: editorialItems.clientId, n: sql<number>`count(*)` })
    .from(editorialItems)
    .where(eq(editorialItems.status, "da_approvare"))
    .groupBy(editorialItems.clientId);
  const board = isViewer(me.role) ? null : await todayBoard(ids);

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
      nextAt: upcoming.find((u) => u.clientId === c.id)?.at?.toISOString() ?? null,
      week: upcoming.filter((u) => u.clientId === c.id && u.at && u.at.getTime() < now.getTime() + 7 * 86_400_000).length,
      toApprove: Number(toApprove.find((t) => t.clientId === c.id)?.n ?? 0),
      ideas: Number(openIdeas.find((i) => i.clientId === c.id)?.n ?? 0),
    };
  });

  return <ClientsView clients={data} readOnly={!canWrite(me.role)} board={board} userName={me.name} />;
}
