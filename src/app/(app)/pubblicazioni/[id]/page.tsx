import { requireWriter } from "@/lib/auth";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import * as s from "@/db/schema";
import { AD_BUTTONS_BY_DESTINATION, itemIssues } from "@/lib/editorial-plan";
import { toRomeInput } from "@/lib/format";
import { FUNNEL_STAGES } from "@/lib/funnel";
import { toPlanItem } from "@/lib/plan-adapter";
import { isAiConfigured } from "@/lib/ai/claude";
import { ItemView } from "./item-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [item] = await db.select({ title: s.editorialItems.title }).from(s.editorialItems).where(eq(s.editorialItems.id, Number((await params).id)));
  return { title: item?.title ?? "Pubblicazione" };
}

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvato?: string }> }) {
  await requireWriter();
  const id = Number((await params).id);
  const { salvato } = await searchParams;
  const [item] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  if (!item) notFound();
  const [client] = await db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(eq(s.clients.id, item.clientId));
  const series = await db.select({ id: s.contentSeries.id, name: s.contentSeries.name }).from(s.contentSeries).where(eq(s.contentSeries.clientId, item.clientId));
  const personas = await db.select({ id: s.buyerPersonas.id, name: s.buyerPersonas.name }).from(s.buyerPersonas).where(eq(s.buyerPersonas.clientId, item.clientId));
  const [kit] = await db.select({ clientId: s.brandKits.clientId }).from(s.brandKits).where(eq(s.brandKits.clientId, item.clientId));
  const reviews = await db.select().from(s.designReviews).where(eq(s.designReviews.itemId, id)).orderBy(desc(s.designReviews.id)).limit(10);
  const issues = itemIssues(toPlanItem(item)).map((i) => ({ level: i.level, message: i.message.replace(`"${item.title}": `, "") }));

  return (
    <ItemView
      saved={!!salvato}
      client={client}
      item={{
        ...item,
        scheduledAt: toRomeInput(item.scheduledAt),
        createdAt: undefined,
        updatedAt: undefined,
        shotList: item.shotList ?? [],
        crossPost: item.crossPost ?? [],
      }}
      issues={issues}
      design={{
        aiConfigured: isAiConfigured(),
        hasBrandKit: !!kit,
        reviews: reviews.map((r) => ({ id: r.id, fileName: r.fileName, thumb: r.thumb, result: r.result, createdAt: r.createdAt.toISOString() })),
      }}
      series={series}
      personas={personas}
      options={{
        formats: [...s.FORMATS],
        platforms: [...s.PLATFORMS],
        stages: FUNNEL_STAGES.map(({ key, label }) => ({ key, label })),
        buttons: [...new Set(Object.values(AD_BUTTONS_BY_DESTINATION).flat())],
        buttonsByDestination: AD_BUTTONS_BY_DESTINATION,
      }}
    />
  );
}
