import { and, asc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { clients, editorialItems, publications, socialAccounts } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { nowDate } from "@/lib/format";
import { exitState } from "@/lib/publishing/exit-state";
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

  // Stato reale dell'uscita: dalle pubblicazioni sui profili (programmata, in corso, uscita, non uscita)
  const pubs = items.length
    ? await db
        .select({ itemId: publications.itemId, status: publications.status, permalink: publications.permalink, error: publications.error, platform: socialAccounts.platform, handle: socialAccounts.handle })
        .from(publications)
        .innerJoin(socialAccounts, eq(socialAccounts.id, publications.socialAccountId))
        .where(and(inArray(publications.itemId, items.map((i) => i.id)), ne(publications.status, "annullata")))
    : [];

  return (
    <GlobalCalendar
      clients={list}
      readOnly={!canWrite(me.role)}
      items={items.map((i) => {
        const mine = pubs.filter((p) => p.itemId === i.id);
        return {
          ...i,
          scheduledAt: i.scheduledAt!.toISOString(),
          exit: exitState(mine),
          channels: mine.map((p) => ({ platform: p.platform, handle: p.handle, status: p.status, permalink: p.permalink, error: p.error?.slice(0, 200) ?? null })),
        };
      })}
    />
  );
}
