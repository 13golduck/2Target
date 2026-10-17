import { desc, eq, isNull, and } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, designReviews } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/claude";
import { BrandView } from "./brand-view";

export const metadata = { title: "Brand" };

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWriter();
  const clientId = Number((await params).id);
  const [kit] = await db.select().from(brandKits).where(eq(brandKits.clientId, clientId));
  const reviews = await db
    .select()
    .from(designReviews)
    .where(and(eq(designReviews.clientId, clientId), isNull(designReviews.itemId)))
    .orderBy(desc(designReviews.id))
    .limit(20);
  return (
    <BrandView
      clientId={clientId}
      aiConfigured={isAiConfigured()}
      kit={kit ? { data: kit.data, logo: kit.logo, updatedAt: kit.updatedAt.toISOString() } : null}
      reviews={reviews.map((r) => ({ id: r.id, fileName: r.fileName, thumb: r.thumb, result: r.result, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
