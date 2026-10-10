import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { buyerPersonas, checkupSections, checkups, clients, objectives } from "@/db/schema";
import { requireClientAccess } from "@/lib/auth";
import { CHECKUP_SECTIONS } from "@/lib/checkup-template";
import { canWrite } from "@/lib/roles";
import { ReportView } from "./report-view";

// Report del check-up: pagina dedicata, consultabile sul web (grafici e indice) e scaricabile in PDF (stampa A4).
// Fuori dal menu dell'app, così si può mostrare al cliente in call. Il Viewer la vede solo se il check-up è consegnato.

export async function generateMetadata({ params }: { params: Promise<{ checkupId: string }> }) {
  const [c] = await db
    .select({ name: clients.name, period: checkups.period })
    .from(checkups)
    .innerJoin(clients, eq(clients.id, checkups.clientId))
    .where(eq(checkups.id, Number((await params).checkupId)));
  return { title: c ? `Check-up ${c.name}${c.period ? ` · ${c.period}` : ""}` : "Report" };
}

export default async function ReportPage({ params }: { params: Promise<{ checkupId: string }> }) {
  const id = Number((await params).checkupId);
  const [checkup] = await db.select().from(checkups).where(eq(checkups.id, id));
  if (!checkup) notFound();
  const me = await requireClientAccess(checkup.clientId);
  const staff = canWrite(me.role);
  if (!staff && checkup.status !== "consegnato") notFound();

  const [client] = await db.select().from(clients).where(eq(clients.id, checkup.clientId));
  const [sections, personas, goals] = await Promise.all([
    db.select().from(checkupSections).where(eq(checkupSections.checkupId, id)),
    db.select().from(buyerPersonas).where(eq(buyerPersonas.checkupId, id)).orderBy(asc(buyerPersonas.priority)),
    db.select().from(objectives).where(eq(objectives.checkupId, id)),
  ]);
  if (!sections.length) notFound();

  return (
    <ReportView
      staff={staff}
      client={{ id: client.id, name: client.name, sector: client.sector, website: client.website }}
      checkup={{
        id: checkup.id,
        period: checkup.period,
        status: checkup.status,
        date: (checkup.deliveredAt ?? checkup.completedAt ?? checkup.createdAt).toISOString(),
        sources: checkup.sources ?? [],
        kpiSnapshot: checkup.kpiSnapshot ?? [],
        report: checkup.report ?? null,
      }}
      template={CHECKUP_SECTIONS.map((s) => ({ key: s.key, title: s.title, fields: s.fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind })) }))}
      content={Object.fromEntries(sections.map((s) => [s.sectionKey, s.content]))}
      personas={personas.map((p) => ({
        name: p.name,
        priority: p.priority,
        segment: p.segment,
        ageRange: p.ageRange,
        needs: p.needs,
        interests: p.interests,
        channels: p.channels,
        values: p.values,
        lever: p.lever,
      }))}
      objectives={goals.map((o) => ({ stage: o.stage, goal: o.strategicGoal, micro: o.microObjectives, strategies: o.operationalStrategies ?? [] }))}
    />
  );
}
