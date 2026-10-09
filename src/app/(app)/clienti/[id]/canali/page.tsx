import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { isoDaysAgo } from "@/lib/format";
import { channelDaily, connections, seoSnapshots, socialAccounts, socialPosts } from "@/db/schema";
import { isConfigured } from "@/lib/integrations/config";
import { assetsFor } from "../../../channel-actions";
import { ChannelsView } from "./channels-view";

export const metadata = { title: "Canali" };

export default async function ChannelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scegli?: string; errore?: string }> }) {
  const clientId = Number((await params).id);
  const sp = await searchParams;

  const conns = await db.select().from(connections).where(eq(connections.clientId, clientId));
  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  const ids = channels.map((c) => c.id);
  const since = isoDaysAgo(30);
  const daily = ids.length ? await db.select().from(channelDaily).where(and(inArray(channelDaily.socialAccountId, ids), gte(channelDaily.day, since))) : [];
  const posts = ids.length ? await db.select().from(socialPosts).where(inArray(socialPosts.socialAccountId, ids)).orderBy(desc(socialPosts.publishedAt)) : [];
  const speeds = ids.length ? await db.select().from(seoSnapshots).where(and(inArray(seoSnapshots.socialAccountId, ids), eq(seoSnapshots.kind, "pagespeed"))).orderBy(desc(seoSnapshots.id)) : [];

  // Scelta dei canali subito dopo il collegamento
  let picker = null;
  if (sp.scegli) {
    try {
      const { conn, assets } = await assetsFor(Number(sp.scegli));
      if (conn && conn.clientId === clientId) {
        const taken = new Set(channels.filter((c) => c.connectionId === conn.id).map((c) => `${c.platform}|${c.externalId}`));
        picker = { connectionId: conn.id, provider: conn.provider, accountName: conn.accountName, assets: assets.map((a) => ({ ...a, selected: taken.has(a.key) })) };
      }
    } catch (e) {
      picker = { error: (e as Error).message };
    }
  }

  const sum = (id: number, metric: string) => daily.filter((d) => d.socialAccountId === id && d.metric === metric).reduce((t, d) => t + d.value, 0);
  const last = (id: number, metric: string) =>
    daily.filter((d) => d.socialAccountId === id && d.metric === metric).sort((a, b) => b.day.localeCompare(a.day))[0]?.value ?? null;

  return (
    <ChannelsView
      clientId={clientId}
      error={sp.errore ?? null}
      configured={{ meta: isConfigured("meta"), google: isConfigured("google") }}
      connections={conns.map((c) => ({ id: c.id, provider: c.provider, accountName: c.accountName, status: c.status, lastError: c.lastError, expiresAt: c.expiresAt?.toISOString() ?? null }))}
      channels={channels.map((c) => ({
        id: c.id,
        platform: c.platform,
        handle: c.handle,
        name: c.name,
        pictureUrl: c.pictureUrl,
        connected: c.connected,
        connectionId: c.connectionId,
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        lastSyncError: c.lastSyncError,
        stats: {
          followers: last(c.id, "followers"),
          reach30: sum(c.id, "reach"),
          clicks30: sum(c.id, "seo_clicks"),
          impressions30: sum(c.id, "seo_impressions"),
          sessions30: sum(c.id, "sessions_total"),
          organic30: sum(c.id, "sessions_organic_search"),
          posts: posts.filter((p) => p.socialAccountId === c.id).length,
        },
        recentPosts: posts
          .filter((p) => p.socialAccountId === c.id)
          .slice(0, 6)
          .map((p) => ({ id: p.id, mediaType: p.mediaType, permalink: p.permalink, caption: p.caption, thumbnailUrl: p.thumbnailUrl, publishedAt: p.publishedAt?.toISOString() ?? null, metrics: p.metrics ?? {} })),
        pagespeed: (speeds.find((s) => s.socialAccountId === c.id)?.rows?.[0] as Record<string, unknown> | undefined) ?? null,
      }))}
      picker={picker}
    />
  );
}
