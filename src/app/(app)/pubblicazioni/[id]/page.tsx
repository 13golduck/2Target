import { requireWriter } from "@/lib/auth";
import { inArray } from "drizzle-orm";
import { previewMediaUrl } from "@/lib/media";
import { isDryRun } from "@/lib/publishing/meta-publish";
import { connectionsOf, PUBLISHABLE, routeOf } from "@/lib/publishing/targets";
import { canPublishWith } from "@/lib/roles";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import * as s from "@/db/schema";
import { AD_BUTTONS_BY_DESTINATION, itemIssues } from "@/lib/editorial-plan";
import { nowDate, toRomeInput } from "@/lib/format";
import { FUNNEL_STAGES } from "@/lib/funnel";
import { toPlanItem } from "@/lib/plan-adapter";
import { isAiConfigured } from "@/lib/ai/claude";
import { clientAdsExposure } from "@/lib/ads/ads";
import { bestTimes } from "@/lib/best-times";
import { ItemView } from "./item-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [item] = await db.select({ title: s.editorialItems.title }).from(s.editorialItems).where(eq(s.editorialItems.id, Number((await params).id)));
  return { title: item?.title ?? "Pubblicazione" };
}

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvato?: string }> }) {
  const me = await requireWriter();
  const id = Number((await params).id);
  const { salvato } = await searchParams;
  const [item] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  if (!item) notFound();
  const [client] = await db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(eq(s.clients.id, item.clientId));
  const series = await db.select({ id: s.contentSeries.id, name: s.contentSeries.name }).from(s.contentSeries).where(eq(s.contentSeries.clientId, item.clientId));
  const personas = await db.select({ id: s.buyerPersonas.id, name: s.buyerPersonas.name }).from(s.buyerPersonas).where(eq(s.buyerPersonas.clientId, item.clientId));
  const [kit] = await db.select({ clientId: s.brandKits.clientId, hasLogo: sql<number>`${s.brandKits.logo} is not null`, at: s.brandKits.updatedAt }).from(s.brandKits).where(eq(s.brandKits.clientId, item.clientId));
  const reviews = await db.select().from(s.designReviews).where(eq(s.designReviews.itemId, id)).orderBy(desc(s.designReviews.id)).limit(10);
  const [meRow] = await db.select({ canPublish: s.users.canPublish }).from(s.users).where(eq(s.users.id, me.id));
  // Solo i profili di QUESTO cliente: non si può scegliere il profilo di un altro
  const channels = await db
    .select()
    .from(s.socialAccounts)
    .where(and(eq(s.socialAccounts.clientId, item.clientId), inArray(s.socialAccounts.platform, [...PUBLISHABLE])));
  const conns = await connectionsOf(channels);
  const routeFor = (c: (typeof channels)[number]) => routeOf(c, conns.find((x) => x.id === c.connectionId));
  const media = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.itemId, id)).orderBy(asc(s.mediaAssets.position));
  const pubs = await db.select().from(s.publications).where(eq(s.publications.itemId, id)).orderBy(desc(s.publications.id));
  const campaigns = await db.select().from(s.adCampaigns).where(eq(s.adCampaigns.itemId, id)).orderBy(desc(s.adCampaigns.id));
  const [ads] = await db
    .select({ payer: s.clients.adsPayer, adAccountId: s.clients.adAccountId, adAccountName: s.clients.adAccountName, currency: s.clients.adAccountCurrency, monthlyCap: s.clients.adsMonthlyCap, markup: s.clients.adsMarkup })
    .from(s.clients)
    .where(eq(s.clients.id, item.clientId));
  const anyPublished = pubs.some((p) => p.status === "pubblicata");
  const exposure = anyPublished || campaigns.length ? await clientAdsExposure(item.clientId) : { spentMonth: 0, committed: 0 };
  const best = await bestTimes(item.clientId);
  const feedback = await db.select().from(s.itemFeedback).where(eq(s.itemFeedback.itemId, id)).orderBy(desc(s.itemFeedback.createdAt)).limit(20);
  const issues = itemIssues(toPlanItem(item)).map((i) => ({ level: i.level, message: i.message.replace(`"${item.title}": `, "") }));

  return (
    <ItemView
      saved={!!salvato}
      client={{ ...client, logo: kit?.hasLogo ? `/api/logo/${client.id}?tipo=icona&v=${kit.at.getTime()}` : null }}
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
      publishing={{
        canPublish: canPublishWith(me.role, meRow?.canPublish),
        dryRun: isDryRun(),
        scheduledAt: item.scheduledAt?.toISOString() ?? null,
        scheduledFuture: !!item.scheduledAt && item.scheduledAt.getTime() > nowDate().getTime() + 60_000,
        channels: channels.map((c) => ({
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          name: c.name,
          pictureUrl: c.pictureUrl,
          ...(() => {
            const r = routeFor(c);
            return "route" in r ? { ready: true, route: r.route, problem: null } : { ready: false, route: null, problem: r.problem };
          })(),
        })),
        media: media.map((m) => ({ id: m.id, kind: m.kind, mime: m.mime, fileName: m.fileName, width: m.width, height: m.height, size: m.size, url: previewMediaUrl(m.id) })),
        publications: pubs.map((p) => ({
          id: p.id,
          socialAccountId: p.socialAccountId,
          status: p.status,
          scheduledAt: p.scheduledAt.toISOString(),
          publishedAt: p.publishedAt?.toISOString() ?? null,
          permalink: p.permalink,
          error: p.error,
          files: p.mediaIds.length,
        })),
      }}
      sponsoring={{
        clientId: item.clientId,
        canPublish: canPublishWith(me.role, meRow?.canPublish),
        dryRun: isDryRun(),
        ads: { ...ads, ...exposure },
        publications: pubs.map((p) => {
          const ch = channels.find((c) => c.id === p.socialAccountId);
          // Si sponsorizzano solo i post usciti dalle Pagine Meta (non Instagram diretto né TikTok)
          const viaMeta = !!ch && "route" in routeFor(ch) && (routeFor(ch) as { route: string }).route === "meta";
          return { id: p.id, status: p.status, platform: viaMeta ? ch.platform : null, channelName: ch?.name ?? ch?.handle ?? "profilo", publishedAt: p.publishedAt?.toISOString() ?? null, permalink: p.permalink };
        }),
        campaigns: campaigns.map((c) => ({
          ...c,
          startAt: c.startAt.toISOString(),
          endAt: c.endAt.toISOString(),
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          createdAt: undefined,
          updatedAt: undefined,
        })),
      }}
      bestTimes={best}
      feedback={feedback.map((f) => ({ id: f.id, author: f.author, decision: f.decision, message: f.message, createdAt: f.createdAt.toISOString() }))}
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
