import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clients, editorialItems, editorialPlans } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { buildPlanDocx, planFileName } from "@/lib/plan-docx";

// Piano editoriale in Word per il cliente: GET /api/piano/<id piano>/word

export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  await requireWriter();
  const planId = Number((await params).planId);
  const [row] = planId
    ? await db
        .select({ plan: editorialPlans, clientName: clients.name })
        .from(editorialPlans)
        .innerJoin(clients, eq(clients.id, editorialPlans.clientId))
        .where(eq(editorialPlans.id, planId))
        .limit(1)
    : [];
  if (!row) return NextResponse.json({ message: "Piano non trovato" }, { status: 404 });

  const items = await db.select().from(editorialItems).where(eq(editorialItems.planId, planId));
  const buffer = await buildPlanDocx({ clientName: row.clientName, plan: row.plan, items });
  const name = planFileName(row.clientName, row.plan.name);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
