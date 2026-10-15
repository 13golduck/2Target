import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";

import { db } from "@/db";
import { isoDaysAgo } from "@/lib/format";
import { channelDaily, clients, connections, seoSnapshots, socialAccounts, socialPosts } from "@/db/schema";
import { isConfigured } from "@/lib/integrations/config";
import { requireUser, userCanPublish } from "@/lib/auth";
import { ensureChannelsFromClient, isSiteSyncRunning, startSiteSync } from "@/lib/integrations/client-channels";
import { assetsFor } from "../../../channel-actions";
import { clientAdsExposure } from "@/lib/ads/ads";
import { isDryRun } from "@/lib/publishing/meta-publish";
import { ChannelsView } from "./channels-view";

export const metadata = { title: "Canali" };

/** Il nome del profilo somiglia a quello del cliente (o al dominio del suo sito)? Serve solo per un avviso. */
function nameMatches(assetName: string, clientName: string, website: string | null) {
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(assetName).replace(/ /g, "");
  const stop = new Set(["srl", "spa", "snc", "sas", "studio", "the", "italia", "group", "official", "shop", "store"]);
  const tokens = norm(clientName).split(" ").filter((t) => t.length >= 4 && !stop.has(t));
  let domain = "";
  try {
    domain = website ? new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").split(".")[0] : "";
  } catch {
    domain = "";
  }
  if (domain.length >= 4) tokens.push(domain);
  const whole = norm(clientName).replace(/ /g, "");
  return (whole.length >= 3 && a.includes(whole)) || tokens.some((t) => a.includes(t));
}

export default async function ChannelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scegli?: string; errore?: string }> }) {
  await ensureIntegrationKeys();
  const me = await requireUser();
  const canConnect = await userCanPublish(me);
  const clientId = Number((await params).id);
  const sp = await searchParams;
  // Clienti creati prima: sito e social della scheda diventano canali alla prima apertura
  await ensureChannelsFromClient(clientId, me.id).catch(() => undefined);

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
        // Per ogni profilo: è già di un altro cliente? Il nome somiglia a quello del cliente?
        const owners = await db
          .select({ platform: socialAccounts.platform, externalId: socialAccounts.externalId, clientId: socialAccounts.clientId, name: clients.name })
          .from(socialAccounts)
          .innerJoin(clients, eq(clients.id, socialAccounts.clientId));
        const [client] = await db.select({ name: clients.name, website: clients.website }).from(clients).where(eq(clients.id, clientId));
        picker = {
          connectionId: conn.id,
          provider: conn.provider,
          accountName: conn.accountName,
          clientName: client?.name ?? "",
          assets: assets.map((a) => {
            const [kind, externalId] = a.key.split("|");
            const owner = owners.find((o) => o.platform === kind && o.externalId === externalId && o.clientId !== clientId);
            return { ...a, selected: taken.has(a.key), owner: owner?.name ?? null, matches: nameMatches(`${a.name} ${a.handle}`, client?.name ?? "", client?.website ?? null) };
          }),
        };
      }
    } catch (e) {
      picker = { error: (e as Error).message };
    }
  }

  const sum = (id: number, metric: string) => daily.filter((d) => d.socialAccountId === id && d.metric === metric).reduce((t, d) => t + d.value, 0);
  const last = (id: number, metric: string) =>
    daily.filter((d) => d.socialAccountId === id && d.metric === metric).sort((a, b) => b.day.localeCompare(a.day))[0]?.value ?? null;

  const [ads] = await db
    .select({ payer: clients.adsPayer, adAccountId: clients.adAccountId, adAccountName: clients.adAccountName, currency: clients.adAccountCurrency, monthlyCap: clients.adsMonthlyCap, markup: clients.adsMarkup })
    .from(clients)
    .where(eq(clients.id, clientId));
  const showAds = !!ads && (isDryRun() || conns.some((c) => c.provider === "meta"));
  const exposure = showAds ? await clientAdsExposure(clientId) : null;

  return (
    <ChannelsView
      ads={showAds && exposure ? { ...ads, ...exposure } : null}
      clientId={clientId}
      canConnect={canConnect}
      error={sp.errore ?? null}
      configured={{ meta: isConfigured("meta"), google: isConfigured("google"), tiktok: isConfigured("tiktok") }}
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
        lastSyncError: c.platform === "website" && isSiteSyncRunning(c.id) ? null : c.lastSyncError,
        // Sito mai analizzato: l'analisi parte (o è già in corso) in sottofondo
        pending: c.platform === "website" && !c.lastSyncAt && (isSiteSyncRunning(c.id) || (!c.lastSyncError && (startSiteSync(c), true))),
        stats: {
          followers: last(c.id, "followers"),
          likesTotal: last(c.id, "likes_total"),
          videosTotal: last(c.id, "posts_total"),
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
