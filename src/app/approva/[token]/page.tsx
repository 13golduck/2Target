import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { clients, editorialItems, itemFeedback, mediaAssets, socialAccounts } from "@/db/schema";
import { approvalClientId } from "@/lib/approval";
import { nowDate } from "@/lib/format";
import { publicMediaUrl } from "@/lib/media";
import { ApprovalView } from "./approval-view";

export const metadata = { title: "Approvazione contenuti", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Pagina pubblica per il cliente: vede le anteprime dei contenuti in arrivo e li approva o chiede modifiche, senza account.
export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clientId = approvalClientId(token);
  const [client] = clientId ? await db.select({ id: clients.id, name: clients.name, approvalEnabled: clients.approvalEnabled }).from(clients).where(eq(clients.id, clientId)) : [];
  if (!client?.approvalEnabled) return <ApprovalView invalid token="" client={null} channels={[]} items={[]} />;

  const items = await db
    .select()
    .from(editorialItems)
    .where(and(eq(editorialItems.clientId, client.id), inArray(editorialItems.status, ["da_approvare", "approvato", "bozza"]), gte(editorialItems.scheduledAt, new Date(nowDate().getTime() - 86_400_000))))
    .orderBy(asc(editorialItems.scheduledAt))
    .limit(60);
  // Si mostrano solo quelli mandati in approvazione o già approvati; le bozze solo se hanno ricevuto una richiesta di modifiche
  const ids = items.map((i) => i.id);
  const feedback = ids.length ? await db.select().from(itemFeedback).where(inArray(itemFeedback.itemId, ids)).orderBy(desc(itemFeedback.createdAt)) : [];
  const media = ids.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.itemId, ids)).orderBy(asc(mediaAssets.position)) : [];
  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, client.id));

  const visible = items.filter((i) => i.status !== "bozza" || feedback.some((f) => f.itemId === i.id && f.decision === "modifiche"));
  return (
    <ApprovalView
      invalid={false}
      token={token}
      client={{ name: client.name }}
      channels={channels.map((c) => ({ platform: c.platform, name: c.name, handle: c.handle, pictureUrl: c.pictureUrl }))}
      items={visible.map((i) => ({
        id: i.id,
        title: i.title,
        format: i.format,
        platform: i.platform,
        crossPost: i.crossPost ?? [],
        scheduledAt: i.scheduledAt?.toISOString() ?? null,
        status: i.status,
        caption: i.caption ?? "",
        hashtags: i.hashtags ?? "",
        media: media.filter((m) => m.itemId === i.id).map((m) => ({ id: m.id, kind: m.kind, mime: m.mime, url: publicMediaUrl(m.storageKey) })),
        feedback: feedback.filter((f) => f.itemId === i.id).map((f) => ({ id: f.id, author: f.author, decision: f.decision, message: f.message, createdAt: f.createdAt.toISOString() })),
      }))}
    />
  );
}
