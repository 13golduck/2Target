import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { checkups, clients, connections, editorialItems, publications, socialAccounts } from "@/db/schema";
import { itemIssues } from "@/lib/editorial-plan";
import { siteHealthAlerts } from "@/lib/integrations/site-health";
import { toPlanItem } from "@/lib/plan-adapter";
import { kpisWithStatus } from "@/lib/queries";

// «Oggi»: cosa richiede attenzione su tutti i clienti visibili, in un colpo d'occhio (come le Home di Hootsuite e Sprout Social).

const DAY = 86_400_000;

export type TodayItem = { id: number; clientId: number; clientName: string; title: string; format: string; scheduledAt: string | null; status: string; note?: string };

export async function todayBoard(clientIds: number[] | null) {
  const visible = clientIds ?? (await db.select({ id: clients.id }).from(clients)).map((c) => c.id);
  const empty = { inUscita: [], daApprovare: [], fallite: [], materiali: [], kpi: [], collegamenti: [], checkup: [], salute: [] };
  if (!visible.length) return empty;
  const names = new Map((await db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, visible))).map((c) => [c.id, c.name]));
  const now = new Date();

  const card = (i: typeof editorialItems.$inferSelect, note?: string): TodayItem => ({
    id: i.id,
    clientId: i.clientId,
    clientName: names.get(i.clientId) ?? "",
    title: i.title,
    format: i.format,
    scheduledAt: i.scheduledAt?.toISOString() ?? null,
    status: i.status,
    note,
  });

  // Prossimi 7 giorni: con quanto manca per essere pronti
  const week = await db
    .select()
    .from(editorialItems)
    .where(and(inArray(editorialItems.clientId, visible), gte(editorialItems.scheduledAt, now), lte(editorialItems.scheduledAt, new Date(now.getTime() + 7 * DAY)), notInArray(editorialItems.status, ["pubblicato", "annullato"])))
    .orderBy(asc(editorialItems.scheduledAt));
  const inUscita = week.map((i) => {
    const errors = itemIssues(toPlanItem(i)).filter((x) => x.level === "errore").length;
    return card(i, errors ? `${errors} da completare` : i.status === "approvato" ? "pronta" : undefined);
  });

  const daApprovare = (
    await db
      .select()
      .from(editorialItems)
      .where(and(inArray(editorialItems.clientId, visible), eq(editorialItems.status, "da_approvare")))
      .orderBy(asc(editorialItems.scheduledAt))
      .limit(30)
  ).map((i) => card(i));

  // Materiale dal cliente che manca per contenuti dei prossimi 21 giorni
  const materiali = (
    await db
      .select()
      .from(editorialItems)
      .where(
        and(
          inArray(editorialItems.clientId, visible),
          eq(editorialItems.needsClientMaterial, true),
          ne(editorialItems.productionStatus, "pronto"),
          gte(editorialItems.scheduledAt, now),
          lte(editorialItems.scheduledAt, new Date(now.getTime() + 21 * DAY)),
          notInArray(editorialItems.status, ["pubblicato", "annullato"]),
        ),
      )
      .orderBy(asc(editorialItems.scheduledAt))
  ).map((i) => card(i, i.productionNotes?.slice(0, 80) ?? undefined));

  // Pubblicazioni non riuscite negli ultimi 14 giorni
  const failed = await db
    .select({ p: publications, item: editorialItems, channel: socialAccounts.name, handle: socialAccounts.handle, platform: socialAccounts.platform })
    .from(publications)
    .innerJoin(editorialItems, eq(editorialItems.id, publications.itemId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, publications.socialAccountId))
    .where(and(inArray(publications.clientId, visible), eq(publications.status, "errore"), gte(publications.scheduledAt, new Date(now.getTime() - 14 * DAY))))
    .orderBy(desc(publications.scheduledAt));
  const fallite = failed.map((f) => card(f.item, `${f.platform} ${f.channel ?? f.handle}: ${f.p.error?.slice(0, 120) ?? "errore"}`));

  // KPI fuori obiettivo
  const kpi = (await kpisWithStatus(visible))
    .filter((k) => k.evaluation.status === "troppo_male" || k.evaluation.status === "male")
    .sort((a, b) => (a.evaluation.status === "troppo_male" ? -1 : 1) - (b.evaluation.status === "troppo_male" ? -1 : 1))
    .map((k) => ({ id: k.id, clientId: k.clientId, clientName: names.get(k.clientId) ?? "", label: k.label, status: k.evaluation.status, message: k.evaluation.message }));

  // Collegamenti da rinnovare
  const collegamenti = (
    await db
      .select({ id: connections.id, clientId: connections.clientId, provider: connections.provider, accountName: connections.accountName, status: connections.status, lastError: connections.lastError })
      .from(connections)
      .where(and(inArray(connections.clientId, visible), ne(connections.status, "attivo")))
  ).map((c) => ({ ...c, clientName: names.get(c.clientId) ?? "" }));

  // Check-up AI che aspettano il consulente (domande) o si sono fermati
  const checkup = (
    await db
      .select({ id: checkups.id, clientId: checkups.clientId, aiState: checkups.aiState, aiError: checkups.aiError })
      .from(checkups)
      .where(and(inArray(checkups.clientId, visible), inArray(checkups.aiState, ["domande", "errore", "interrotto"]), isNull(checkups.archivedAt)))
  ).map((c) => ({ ...c, clientName: names.get(c.clientId) ?? "" }));

  // Salute dei siti: SSL in scadenza/scaduto, dominio in scadenza, cambi di DNS, reindirizzamenti sospetti
  const salute = (await siteHealthAlerts(visible)).map((s) => ({
    id: s.id,
    clientId: s.clientId,
    clientName: names.get(s.clientId) ?? "",
    url: s.url,
    severity: s.severity,
    problems: (s.checks ?? []).filter((c) => c.level !== "ok").map((c) => `${c.label}: ${c.value ?? ""}`.trim()),
  }));

  return { inUscita, daApprovare, fallite, materiali, kpi, collegamenti, checkup, salute };
}
