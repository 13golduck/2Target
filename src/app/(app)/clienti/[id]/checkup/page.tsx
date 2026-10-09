import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { checkupSections, checkups } from "@/db/schema";
import { CHECKUP_SECTIONS } from "@/lib/checkup-template";
import { CheckupView } from "./checkup-view";

export const metadata = { title: "Check-up" };

export default async function CheckupPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const [checkup] = await db.select().from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id)).limit(1);
  const sections = checkup ? await db.select().from(checkupSections).where(eq(checkupSections.checkupId, checkup.id)) : [];

  return (
    <CheckupView
      clientId={clientId}
      checkup={checkup ? { id: checkup.id, title: checkup.title, period: checkup.period, status: checkup.status, deliveredAt: checkup.deliveredAt?.toISOString() ?? null } : null}
      template={CHECKUP_SECTIONS}
      content={Object.fromEntries(sections.map((s) => [s.sectionKey, s.content]))}
    />
  );
}
