import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/roles";
import { isoDaysAgo } from "@/lib/format";
import { channelDaily, clients, leads, seoAnalyses, seoSnapshots, socialAccounts } from "@/db/schema";
import { isAiConfigured } from "@/lib/ai/claude";
import { campaignsWithLeads, conversionsByEvent, landingWithLeads, type LeadLite } from "@/lib/ga4-insights";
import { brandSplit, brandTerms, changes, opportunities, type GscRow } from "@/lib/seo-insights";
import { ensureChannelsFromClient, isSiteSyncRunning, startSiteSync } from "@/lib/integrations/client-channels";
import { SeoView } from "./seo-view";

export const metadata = { title: "SEO" };

export default async function SeoPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const readOnly = !canWrite(me.role);
  const clientId = Number((await params).id);
  // Il sito indicato nell'analisi iniziale compare anche qui, senza passare da Canali
  await ensureChannelsFromClient(clientId, me.id).catch(() => undefined);
  const channels = (await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId))).filter((c) =>
    ["search_console", "ga4", "website", "business_profile", "google_ads"].includes(c.platform),
  );
  const ids = channels.map((c) => c.id);
  const since = isoDaysAgo(100);
  const daily = ids.length
    ? await db.select().from(channelDaily).where(and(inArray(channelDaily.socialAccountId, ids), gte(channelDaily.day, since))).orderBy(asc(channelDaily.day))
    : [];
  // Solo l'ultima fotografia di ogni tipo (lo storico mensile resta nel database)
  const heads = ids.length
    ? await db.select({ id: seoSnapshots.id, socialAccountId: seoSnapshots.socialAccountId, kind: seoSnapshots.kind }).from(seoSnapshots).where(inArray(seoSnapshots.socialAccountId, ids)).orderBy(desc(seoSnapshots.id))
    : [];
  // In ordine dal più recente: la prima di ogni profilo e tipo è l'ultima
  const newest = new Map<string, number>();
  for (const h of heads) if (!newest.has(`${h.socialAccountId}|${h.kind}`)) newest.set(`${h.socialAccountId}|${h.kind}`, h.id);
  const snaps = newest.size ? await db.select().from(seoSnapshots).where(inArray(seoSnapshots.id, [...newest.values()])) : [];
  const [client] = await db.select({ name: clients.name, website: clients.website, brandTerms: clients.brandTerms }).from(clients).where(eq(clients.id, clientId));
  const terms = brandTerms(client.name, client.website, client.brandTerms);
  // Lead degli ultimi 28 giorni: si affiancano a campagne e pagine di atterraggio di Analytics
  const recentLeads: LeadLite[] = (
    await db
      .select({ utmSource: leads.utmSource, utmMedium: leads.utmMedium, utmCampaign: leads.utmCampaign, landingUrl: leads.landingUrl, stage: leads.stage, wonValue: leads.wonValue })
      .from(leads)
      .where(and(eq(leads.clientId, clientId), gte(leads.receivedAt, new Date(`${isoDaysAgo(28)}T00:00:00Z`))))
  ).map((l) => ({ ...l, won: l.stage === "vinto" }));

  const [analysis] = await db.select().from(seoAnalyses).where(eq(seoAnalyses.clientId, clientId)).orderBy(desc(seoAnalyses.id)).limit(1);

  const latest = (id: number, kind: string) => snaps.find((s) => s.socialAccountId === id && s.kind === kind) ?? null;
  const gsc = (id: number, kind: string) => (latest(id, kind)?.rows ?? []) as unknown as GscRow[];
  const series = (id: number, metrics: string[]) => {
    const days = [...new Set(daily.filter((d) => d.socialAccountId === id).map((d) => d.day))].sort();
    return {
      days,
      values: Object.fromEntries(metrics.map((m) => [m, days.map((day) => daily.find((d) => d.socialAccountId === id && d.day === day && d.metric === m)?.value ?? 0)])),
    };
  };

  return (
    <SeoView
      readOnly={readOnly}
      clientId={clientId}
      ai={{
        configured: isAiConfigured(),
        analysis: analysis ? { ...analysis.data, createdAt: analysis.createdAt.toISOString(), ideasCreated: analysis.ideasCreated, trigger: analysis.trigger } : null,
      }}
      searchConsole={channels
        .filter((c) => c.platform === "search_console")
        .map((c) => ({
          id: c.id,
          name: c.name ?? c.handle,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          series: series(c.id, ["seo_clicks", "seo_impressions", "seo_position"]),
          queries: gsc(c.id, "queries"),
          pages: gsc(c.id, "pages"),
          // Letture per il consulente: opportunità, brand e non brand, variazioni, dispositivi, confronto con l'anno prima
          opportunities: opportunities(gsc(c.id, "queries")),
          brand: { terms, ...brandSplit(gsc(c.id, "queries"), terms) },
          pageChanges: latest(c.id, "pages_prev") ? changes(gsc(c.id, "pages"), gsc(c.id, "pages_prev")) : null,
          queryChanges: latest(c.id, "queries_prev") ? changes(gsc(c.id, "queries"), gsc(c.id, "queries_prev")) : null,
          devices: (latest(c.id, "devices")?.rows ?? []) as unknown as (GscRow & { prevClicks: number })[],
          summary: (latest(c.id, "summary")?.rows ?? []) as unknown as (GscRow & { start: string; end: string })[],
          period: latest(c.id, "queries") ? { start: latest(c.id, "queries")!.periodStart, end: latest(c.id, "queries")!.periodEnd } : null,
        }))}
      analytics={channels
        .filter((c) => c.platform === "ga4")
        .map((c) => ({
          id: c.id,
          name: c.name ?? c.handle,
          series: series(c.id, ["sessions_total", "sessions_organic_search", "sessions_organic_social", "sessions_paid_social", "key_events"]),
          landing: latest(c.id, "landing_pages") ? landingWithLeads(latest(c.id, "landing_pages")!.rows as { landingPage: string }[], recentLeads) : null,
          campaigns: latest(c.id, "campaigns")
            ? campaignsWithLeads(latest(c.id, "campaigns")!.rows as { sessionSource: string; sessionMedium: string; sessionCampaignName: string }[], recentLeads)
            : null,
          conversions: latest(c.id, "conversions") ? conversionsByEvent(latest(c.id, "conversions")!.rows as { eventName: string; sessionDefaultChannelGroup: string; keyEvents: number }[]) : null,
          leadsTotal: recentLeads.length,
        }))}
      businessProfiles={channels
        .filter((c) => c.platform === "business_profile")
        .map((c) => ({
          id: c.id,
          name: c.name ?? c.handle,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          error: c.lastSyncError,
          series: series(c.id, ["gbp_views_search", "gbp_views_maps", "gbp_calls", "gbp_directions", "gbp_website_clicks", "gbp_messages", "gbp_bookings"]),
          rating: series(c.id, ["gbp_rating", "gbp_reviews_total"]),
          reviews: (latest(c.id, "gbp_reviews")?.rows ?? []) as { author: string; stars: number | null; comment: string; at: string; replied: boolean }[],
        }))}
      googleAds={channels
        .filter((c) => c.platform === "google_ads")
        .map((c) => ({
          id: c.id,
          name: c.name ?? c.handle,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          error: c.lastSyncError,
          series: series(c.id, ["ads_spend", "ads_clicks", "ads_impressions", "ads_conversions", "ads_conversion_value"]),
          campaigns: (latest(c.id, "ads_campaigns")?.rows ?? []) as { id: string; name: string; status: string; cost: number; clicks: number; impressions: number; conversions: number; value: number }[],
        }))}
      websites={channels
        .filter((c) => c.platform === "website")
        .map((c) => {
          const result = (latest(c.id, "pagespeed")?.rows?.[0] as Record<string, unknown>) ?? null;
          // Mai analizzato e senza errori: si avvia (o è già in corso) l'analisi in sottofondo
          if (!result && !c.lastSyncError) startSiteSync(c);
          return {
            id: c.id,
            url: c.handle,
            result,
            at: latest(c.id, "pagespeed")?.createdAt?.toISOString() ?? null,
            pending: !result && (!c.lastSyncError || isSiteSyncRunning(c.id)),
            error: !result && !isSiteSyncRunning(c.id) ? c.lastSyncError : null,
          };
        })}
    />
  );
}
