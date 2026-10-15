import { and, asc, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { clients, editorialItems } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { nowDate } from "@/lib/format";
import { canWrite, isViewer } from "@/lib/roles";
import { GlobalCalendar } from "./global-calendar";

export const metadata = { title: "Calendario" };

// Calendario unico di tutti i clienti (come il Pianificatore di Metricool): si filtra per cliente e formato.
export default async function CalendarPage() {
  const me = await requireUser();
  if (isViewer(me.role)) redirect("/");
  const ids = await visibleClientIds(me);
  const list = ids && !ids.length ? [] : await db.select({ id: clients.id, name: clients.name }).from(clients).where(ids ? inArray(clients.id, ids) : undefined).orderBy(asc(clients.name));
  const since = new Date(nowDate().getTime() - 120 * 86_400_000);
  const items = list.length
    ? await db
        .select({
          id: editorialItems.id,
          clientId: editorialItems.clientId,
          title: editorialItems.title,
          format: editorialItems.format,
          platform: editorialItems.platform,
          scheduledAt: editorialItems.scheduledAt,
          status: editorialItems.status,
          isPaid: editorialItems.isPaid,
        })
        .from(editorialItems)
        .where(and(inArray(editorialItems.clientId, list.map((c) => c.id)), isNotNull(editorialItems.scheduledAt), gte(editorialItems.scheduledAt, since), ne(editorialItems.status, "annullato")))
    : [];

  return (
    <GlobalCalendar
      clients={list}
      readOnly={!canWrite(me.role)}
      items={items.map((i) => ({ ...i, scheduledAt: i.scheduledAt!.toISOString() }))}
    />
  );
}
