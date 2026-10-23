import { FEATURES, isOn } from "@/lib/features";
import { clientFeatures, globalFeatures } from "@/lib/features-data";
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { channelDaily, checkups, clients, connections, editorialItems, editorialPlans, leads, socialAccounts } from "@/db/schema";
import { requireClientAccess } from "@/lib/auth";
import { itemIssues } from "@/lib/editorial-plan";
import { toPlanItem } from "@/lib/plan-adapter";
import { kpisWithStatus } from "@/lib/queries";
import { canWrite, isViewer } from "@/lib/roles";
import { OverviewView } from "./overview-view";

export const metadata = { title: "Panoramica" };

// Prima pagina del cliente: a che punto siamo e cosa fare adesso (i dettagli restano nelle schede).
export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const me = await requireClientAccess(clientId);
  if (isViewer(me.role)) redirect(`/clienti/${clientId}/kpi`);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [upcoming, approve, kpis, channels, conns, [lastCheckup], plans, [leadCount], publishedMonth] = await Promise.all([
    db
      .select()
      .from(editorialItems)
      .where(and(eq(editorialItems.clientId, clientId), gte(editorialItems.scheduledAt, now), notInArray(editorialItems.status, ["pubblicato", "annullato"])))
      .orderBy(asc(editorialItems.scheduledAt))
      .limit(6),
    db.select({ n: sql<number>`count(*)` }).from(editorialItems).where(and(eq(editorialItems.clientId, clientId), eq(editorialItems.status, "da_approvare"))),
    kpisWithStatus([clientId]),
    db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId)),
    db.select({ provider: connections.provider, status: connections.status }).from(connections).where(eq(connections.clientId, clientId)),
    db.select({ id: checkups.id, aiState: checkups.aiState, createdAt: checkups.createdAt, deliveredAt: checkups.deliveredAt }).from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id)).limit(1),
    db.select({ id: editorialPlans.id, name: editorialPlans.name, startsOn: editorialPlans.startsOn, endsOn: editorialPlans.endsOn }).from(editorialPlans).where(eq(editorialPlans.clientId, clientId)).orderBy(desc(editorialPlans.startsOn)),
    db.select({ n: sql<number>`count(*)` }).from(leads).where(and(eq(leads.clientId, clientId), gte(leads.receivedAt, monthStart))),
    db.select({ n: sql<number>`count(*)` }).from(editorialItems).where(and(eq(editorialItems.clientId, clientId), eq(editorialItems.status, "pubblicato"), gte(editorialItems.scheduledAt, monthStart))),
  ]);

  const [options] = await db.select({ reportMonthly: clients.reportMonthly, notifyPublished: clients.notifyPublished, reportEmail: clients.reportEmail, approvalEnabled: clients.approvalEnabled }).from(clients).where(eq(clients.id, clientId));
  const ids = channels.map((c) => c.id);
  const followers = ids.length
    ? await db
        .select({ id: channelDaily.socialAccountId, day: channelDaily.day, value: channelDaily.value })
        .from(channelDaily)
        .where(and(inArray(channelDaily.socialAccountId, ids), eq(channelDaily.metric, "followers")))
        .orderBy(desc(channelDaily.day))
    : [];

  const today = now.toISOString().slice(0, 10);
  const plan = plans.find((p) => p.startsOn <= today && p.endsOn >= today) ?? plans[0] ?? null;
  const planCounts = plan
    ? await db
        .select({ status: editorialItems.status, n: sql<number>`count(*)` })
        .from(editorialItems)
        .where(eq(editorialItems.planId, plan.id))
        .groupBy(editorialItems.status)
    : [];

  const social = channels.filter((c) => c.platform !== "website");
  // Funzioni per cliente: quelle spente in generale non si possono riaccendere qui
  const [globalFlags, clientFlags] = await Promise.all([globalFeatures(), clientFeatures(clientId)]);
  const features = FEATURES.filter((f) => f.perClient).map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
    on: clientFlags[f.key] !== false,
    locked: globalFlags[f.key] === false,
    lockedReason: "Spenta per tutti in Impostazioni → Funzioni",
  }));
  const allSteps = [
    { key: "checkup", label: "Fai il check-up iniziale", done: lastCheckup?.aiState === "pronto" || !!lastCheckup?.deliveredAt, href: `/clienti/${clientId}/checkup` },
    { key: "canali", label: "Collega i social del cliente", done: conns.some((c) => c.status === "attivo"), href: `/clienti/${clientId}/canali` },
    { key: "piano", label: "Prepara il piano editoriale", done: plans.length > 0, href: `/clienti/${clientId}/piano` },
    { key: "kpi", label: "Fissa i KPI da misurare", done: kpis.length > 0, href: `/clienti/${clientId}/kpi` },
  ];
  // Il check-up spento non è un passo da fare
  const steps = allSteps.filter((st) => st.key !== "checkup" || isOn("checkup", globalFlags, clientFlags));

  return (
    <OverviewView
      clientId={clientId}
      options={options}
      features={features}
      readOnly={!canWrite(me.role)}
      steps={steps}
      upcoming={upcoming.map((i) => ({
        id: i.id,
        title: i.title,
        format: i.format,
        scheduledAt: i.scheduledAt?.toISOString() ?? null,
        status: i.status,
        errors: itemIssues(toPlanItem(i)).filter((x) => x.level === "errore").length,
      }))}
      counters={{
        toApprove: Number(approve[0]?.n ?? 0),
        leads: Number(leadCount?.n ?? 0),
        publishedMonth: Number(publishedMonth[0]?.n ?? 0),
        kpiOk: kpis.filter((k) => k.evaluation.status === "bene").length,
        kpiTotal: kpis.length,
      }}
      kpis={kpis.slice(0, 6).map((k) => ({ id: k.id, label: k.label, status: k.evaluation.status, message: k.evaluation.message }))}
      channels={social.map((c) => ({
        id: c.id,
        platform: c.platform,
        name: c.name ?? c.handle,
        pictureUrl: c.pictureUrl,
        connected: c.connected,
        followers: followers.find((f) => f.id === c.id)?.value ?? null,
      }))}
      checkup={lastCheckup ? { id: lastCheckup.id, aiState: lastCheckup.aiState, delivered: !!lastCheckup.deliveredAt, createdAt: lastCheckup.createdAt.toISOString() } : null}
      plan={plan ? { ...plan, counts: Object.fromEntries(planCounts.map((p) => [p.status, Number(p.n)])) } : null}
    />
  );
}
