import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/roles";
import { isoDaysAgo } from "@/lib/format";
import { channelDaily, seoSnapshots, socialAccounts } from "@/db/schema";
import { SeoView } from "./seo-view";

export const metadata = { title: "SEO" };

export default async function SeoPage({ params }: { params: Promise<{ id: string }> }) {
  const readOnly = !canWrite((await requireUser()).role);
  const clientId = Number((await params).id);
  const channels = (await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId))).filter((c) =>
    ["search_console", "ga4", "website"].includes(c.platform),
  );
  const ids = channels.map((c) => c.id);
  const since = isoDaysAgo(100);
  const daily = ids.length
    ? await db.select().from(channelDaily).where(and(inArray(channelDaily.socialAccountId, ids), gte(channelDaily.day, since))).orderBy(asc(channelDaily.day))
    : [];
  const snaps = ids.length ? await db.select().from(seoSnapshots).where(inArray(seoSnapshots.socialAccountId, ids)).orderBy(desc(seoSnapshots.id)) : [];

  const latest = (id: number, kind: string) => snaps.find((s) => s.socialAccountId === id && s.kind === kind) ?? null;
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
      searchConsole={channels
        .filter((c) => c.platform === "search_console")
        .map((c) => ({
          id: c.id,
          name: c.name ?? c.handle,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          series: series(c.id, ["seo_clicks", "seo_impressions", "seo_position"]),
          queries: latest(c.id, "queries")?.rows ?? [],
          pages: latest(c.id, "pages")?.rows ?? [],
          period: latest(c.id, "queries") ? { start: latest(c.id, "queries")!.periodStart, end: latest(c.id, "queries")!.periodEnd } : null,
        }))}
      analytics={channels
        .filter((c) => c.platform === "ga4")
        .map((c) => ({
          id: c.id,
          name: c.name ?? c.handle,
          series: series(c.id, ["sessions_total", "sessions_organic_search", "sessions_organic_social", "sessions_paid_social", "key_events"]),
        }))}
      websites={channels
        .filter((c) => c.platform === "website")
        .map((c) => ({ id: c.id, url: c.handle, result: (latest(c.id, "pagespeed")?.rows?.[0] as Record<string, unknown>) ?? null, at: latest(c.id, "pagespeed")?.createdAt?.toISOString() ?? null }))}
    />
  );
}
