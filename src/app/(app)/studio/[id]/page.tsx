import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import * as s from "@/db/schema";
import { isAiConfigured } from "@/lib/ai/claude";
import { budgetStatus } from "@/lib/ai/budget";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { featureOn } from "@/lib/features-data";
import { previewMediaUrl } from "@/lib/media";
import { clientPlatforms, currentVersion, mediaOf, messagesOf, versionsOf } from "@/lib/studio/studio-data";
import { FeatureOff } from "src/components/feature-off";
import { StudioView } from "./studio-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [item] = await db.select({ title: s.editorialItems.title }).from(s.editorialItems).where(eq(s.editorialItems.id, Number((await params).id)));
  return { title: item ? `Studio · ${item.title}` : "Studio" };
}

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWriter();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [item] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  if (!item) notFound();
  await requireClientAccess(item.clientId);
  const [client] = await db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(eq(s.clients.id, item.clientId));
  if (!(await featureOn("studio", item.clientId))) {
    return (
      <div style={{ padding: 24 }}>
        <FeatureOff label="Studio con l'AI" where={`Panoramica di ${client.name} → Funzioni`} href={`/clienti/${client.id}`} />
      </div>
    );
  }
  const [kit] = await db.select({ hasLogo: sql<number>`${s.brandKits.logo} is not null`, at: s.brandKits.updatedAt }).from(s.brandKits).where(eq(s.brandKits.clientId, item.clientId));
  const current = await currentVersion(id);
  const messages = await messagesOf(id);
  const versions = await versionsOf(id);
  const media = await mediaOf(id);
  const budget = await budgetStatus();

  return (
    <StudioView
      item={{ id: item.id, status: item.status }}
      client={{ ...client, logo: kit?.hasLogo ? `/api/logo/${client.id}?tipo=icona&v=${kit.at.getTime()}` : null }}
      platforms={await clientPlatforms(item.clientId)}
      state={current.state}
      versionN={current.n}
      versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
      messages={messages.map((m) => ({ id: m.id, role: m.role, text: m.text, versionN: m.versionN, costEur: m.costEur, createdAt: m.createdAt.toISOString() }))}
      media={media.map((m) => ({ ...m, url: previewMediaUrl(m.id) }))}
      ai={{ configured: isAiConfigured(), budgetWarning: budget.warning }}
    />
  );
}
