import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { checkups as checkupsTable, clients, editorialItems, editorialPlans, FORMATS, PLATFORMS } from "@/db/schema";
import { planIssues } from "@/lib/editorial-plan";
import { nowDate } from "@/lib/format";
import { toPlan, toPlanItem } from "@/lib/plan-adapter";
import { PlanView } from "./plan-view";

export const metadata = { title: "Piano editoriale" };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ piano?: string; nuovo?: string }> }) {
  const clientId = Number((await params).id);
  const sp = await searchParams;
  const plans = await db.select().from(editorialPlans).where(eq(editorialPlans.clientId, clientId)).orderBy(desc(editorialPlans.startsOn));
  const plan = plans.find((p) => p.id === Number(sp.piano)) ?? plans[0];
  // Check-up completati: base per il piano generato con l'AI
  const checkups = (
    await db
      .select({ id: checkupsTable.id, title: checkupsTable.title, completedAt: checkupsTable.completedAt, createdAt: checkupsTable.createdAt })
      .from(checkupsTable)
      .where(and(eq(checkupsTable.clientId, clientId), eq(checkupsTable.aiState, "pronto"), isNull(checkupsTable.archivedAt)))
      .orderBy(desc(checkupsTable.id))
  ).map((c) => ({ id: c.id, title: c.title, at: (c.completedAt ?? c.createdAt).toISOString() }));

  if (!plan || sp.nuovo) {
    return <PlanView clientId={clientId} plans={plans.map(({ id, name }) => ({ id, name }))} plan={null} items={[]} issues={[]} formats={[...FORMATS]} platforms={[...PLATFORMS]} checkups={checkups} approval={null} />;
  }

  const rows = await db.select().from(editorialItems).where(eq(editorialItems.planId, plan.id)).orderBy(asc(editorialItems.scheduledAt));
  const issues = planIssues(toPlan(plan), rows.map(toPlanItem));
  // Approvazione via link: bozze complete dei prossimi 30 giorni e contenuti in attesa del cliente
  const [client] = await db.select({ approvalEnabled: clients.approvalEnabled }).from(clients).where(eq(clients.id, clientId));
  const now = nowDate().getTime();
  const in30 = now + 30 * 86_400_000;
  const readyCount = rows.filter(
    (i) => i.status === "bozza" && i.scheduledAt && i.scheduledAt.getTime() > now && i.scheduledAt.getTime() < in30 && !issues.some((x) => x.itemId === String(i.id) && x.level === "errore"),
  ).length;

  return (
    <PlanView
      clientId={clientId}
      plans={plans.map(({ id, name }) => ({ id, name }))}
      plan={{
        id: plan.id,
        name: plan.name,
        startsOn: plan.startsOn,
        endsOn: plan.endsOn,
        minPerWeek: plan.minPerWeek,
        formatQuotas: plan.formatQuotas ?? {},
        adsBudget: plan.adsBudget,
        brief: plan.brief,
      }}
      items={rows.map((i) => ({
        id: i.id,
        title: i.title,
        format: i.format,
        platform: i.platform,
        crossPost: i.crossPost ?? [],
        status: i.status,
        productionStatus: i.productionStatus,
        isPaid: i.isPaid,
        adBudget: i.adBudget,
        scheduledAt: i.scheduledAt?.toISOString() ?? null,
        errors: issues.filter((x) => x.itemId === String(i.id) && x.level === "errore").length,
        warnings: issues.filter((x) => x.itemId === String(i.id) && x.level === "avviso").length,
      }))}
      issues={issues.filter((i) => !i.itemId)}
      formats={[...FORMATS]}
      platforms={[...PLATFORMS]}
      checkups={checkups}
      approval={{ enabled: !!client?.approvalEnabled, readyCount, pendingCount: rows.filter((i) => i.status === "da_approvare").length }}
    />
  );
}
