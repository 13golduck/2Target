import "server-only";
import { PLATFORM_INFO } from "@/lib/platforms";
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { adCampaigns, adSpendDaily, channelDaily, clients, leads, publications, socialAccounts, socialPosts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/integrations/config";
import { sendMail } from "@/lib/mail";
import { kpisWithStatus } from "@/lib/queries";
import { engagementScore } from "@/lib/recycle";
import { signPayload, verifyPayload } from "@/lib/secret-box";

// Report mensile al cliente (come i report programmati di Metricool e Sprout): cosa è uscito, come sono andati
// i profili, i lead, le sponsorizzate e i KPI. Una sola raccolta di dati (monthlyReportData) per tre uscite:
// l'email automatica, la pagina stampabile in PDF (/report-mensile/<link firmato>) e il video verticale.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (v: number) => Math.round(v).toLocaleString("it-IT");
const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const KPI_COLOR = { bene: "#22A06B", male: "#E8A317", troppo_male: "#D9363E", in_attesa: "#919EAB" } as const;
// Al cliente va lo stato, non il commento interno del consulente
export const KPI_WORD = { bene: "In linea", male: "Da migliorare", troppo_male: "Sotto obiettivo", in_attesa: "In attesa di dati" } as const;
/** Nomi delle piattaforme (da @/lib/platforms, riesportati per la pagina del report). */
export const PLATFORM_NAME: Record<string, string> = Object.fromEntries(Object.entries(PLATFORM_INFO).map(([k, v]) => [k, v.label]));

/** Mese precedente a `now` in formato AAAA-MM. */
export const previousMonth = (now = new Date()) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
};

// ── Link firmato alla pagina del report (per il cliente, senza accesso) ──
const LINK_DAYS = 120;
export function reportLink(clientId: number, month: string) {
  return `${appUrl()}/report-mensile/${signPayload({ kind: "report", c: clientId, m: month }, LINK_DAYS * 86_400)}`;
}
export function reportFromToken(token: string) {
  const p = verifyPayload<{ kind?: string; c?: number; m?: string }>(decodeURIComponent(token));
  return p?.kind === "report" && typeof p.c === "number" && /^\d{4}-\d{2}$/.test(p.m ?? "") ? { clientId: p.c, month: p.m! } : null;
}

export type MonthlyReport = Awaited<ReturnType<typeof monthlyReportData>>;

export async function monthlyReportData(clientId: number, month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const label = from.toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
  const [client] = await db.select({ name: clients.name, website: clients.website }).from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error("Cliente non trovato");

  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  const social = channels.filter((c) => !["website", "search_console", "ga4", "business_profile", "google_ads"].includes(c.platform));
  const daily = social.length
    ? await db
        .select()
        .from(channelDaily)
        .where(and(inArray(channelDaily.socialAccountId, social.map((c) => c.id)), gte(channelDaily.day, from.toISOString().slice(0, 10)), lt(channelDaily.day, to.toISOString().slice(0, 10))))
        .orderBy(asc(channelDaily.day))
    : [];
  const profiles = social.map((c) => {
    const f = daily.filter((d) => d.socialAccountId === c.id && d.metric === "followers");
    const reach = daily.filter((d) => d.socialAccountId === c.id && d.metric === "reach").reduce((t, d) => t + d.value, 0);
    return { name: c.name ?? c.handle, platform: c.platform, start: f[0]?.value ?? null, end: f.at(-1)?.value ?? null, reach };
  });

  const posts = await db
    .select({ caption: publications.caption, permalink: publications.permalink, at: publications.publishedAt, platform: socialAccounts.platform, socialAccountId: publications.socialAccountId, externalId: publications.externalId })
    .from(publications)
    .innerJoin(socialAccounts, eq(socialAccounts.id, publications.socialAccountId))
    .where(and(eq(publications.clientId, clientId), eq(publications.status, "pubblicata"), isNotNull(publications.publishedAt), gte(publications.publishedAt, from), lt(publications.publishedAt, to)))
    .orderBy(asc(publications.publishedAt));

  // Il post migliore del mese: interazioni (sulla copertura, se nota) lette dai profili
  const stats = posts.length
    ? await db
        .select({ socialAccountId: socialPosts.socialAccountId, externalId: socialPosts.externalId, metrics: socialPosts.metrics, thumbnailUrl: socialPosts.thumbnailUrl })
        .from(socialPosts)
        .where(inArray(socialPosts.socialAccountId, [...new Set(posts.map((p) => p.socialAccountId))]))
    : [];
  const ranked = posts
    .map((p) => {
      const s = stats.find((x) => x.socialAccountId === p.socialAccountId && x.externalId === p.externalId);
      return { ...p, score: engagementScore(s?.metrics), metrics: s?.metrics ?? null, thumbnailUrl: s?.thumbnailUrl ?? null };
    })
    .filter((p) => p.score != null)
    .sort((a, b) => b.score! - a.score!);
  const best = ranked[0] ?? null;

  const [leadCount] = await db.select({ n: sql<number>`count(*)` }).from(leads).where(and(eq(leads.clientId, clientId), gte(leads.receivedAt, from), lt(leads.receivedAt, to)));

  // Sponsorizzate del mese: spesa letta da Meta (in euro) e contatti arrivati dalle campagne
  const [adsSpend] = await db
    .select({ eur: sql<string | null>`sum(${adSpendDaily.spendEur})` })
    .from(adSpendDaily)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adSpendDaily.campaignId))
    .where(and(eq(adCampaigns.clientId, clientId), gte(adSpendDaily.day, from.toISOString().slice(0, 10)), lt(adSpendDaily.day, to.toISOString().slice(0, 10))));
  const [adsLeads] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.clientId, clientId), isNotNull(leads.adCampaignId), gte(leads.receivedAt, from), lt(leads.receivedAt, to)));

  const kpis = (await kpisWithStatus([clientId])).map((k) => ({ label: k.label, status: k.evaluation.status as keyof typeof KPI_WORD }));

  return {
    clientId,
    clientName: client.name,
    month,
    label,
    posts: posts.map((p) => ({ at: p.at!, platform: p.platform, caption: p.caption, permalink: p.permalink })),
    best: best ? { caption: best.caption, permalink: best.permalink, platform: best.platform, at: best.at!, thumbnailUrl: best.thumbnailUrl, metrics: best.metrics } : null,
    profiles,
    reach: profiles.reduce((t, p) => t + p.reach, 0),
    followersGained: profiles.reduce((t, p) => t + (p.start != null && p.end != null ? p.end - p.start : 0), 0),
    leads: Number(leadCount?.n ?? 0),
    ads: { spend: Number(adsSpend?.eur ?? 0), leads: Number(adsLeads?.n ?? 0) },
    kpis,
  };
}

/** Email del report (testo e HTML) dai dati del mese. */
export function monthlyReportEmail(r: MonthlyReport, link: string | null) {
  const subject = `${r.clientName} · i risultati di ${r.label}`;
  const text = [
    `${r.clientName} · report di ${r.label}`,
    "",
    `Contenuti pubblicati: ${r.posts.length}`,
    ...r.profiles.map((p) => `${PLATFORM_NAME[p.platform] ?? p.platform} ${p.name}: follower ${p.end != null ? n(p.end) : "—"}${p.start != null && p.end != null ? ` (${p.end - p.start >= 0 ? "+" : ""}${n(p.end - p.start)})` : ""}${p.reach ? `, copertura ${n(p.reach)}` : ""}`),
    `Lead ricevuti: ${r.leads}`,
    ...(r.ads.spend > 0 ? [`Sponsorizzate: ${eur(r.ads.spend)} spesi, ${r.ads.leads} contatti`] : []),
    ...r.kpis.map((k) => `KPI ${k.label}: ${KPI_WORD[k.status]}`),
    ...(link ? ["", `Report completo (anche in PDF): ${link}`] : []),
    "",
    "Golduck · 2Target",
  ].join("\n");

  const td = 'style="padding:8px 10px;border-bottom:1px solid #eee;font-size:14px"';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1C252E">
<div style="max-width:640px;margin:0 auto;background:#fff">
  <div style="background:#121212;color:#fff;padding:24px">
    <span style="background:#CDA434;color:#121212;font-weight:800;border-radius:6px;padding:2px 8px">2T</span>
    <h1 style="font-size:22px;margin:16px 0 4px">${esc(r.clientName)}</h1>
    <div style="color:#C4CDD5">I risultati di ${esc(r.label)}</div>
  </div>
  <div style="padding:24px">
    <table width="100%" cellspacing="0" style="margin-bottom:24px"><tr>
      <td style="text-align:center;padding:12px;background:#FBF6E6;border-radius:8px"><div style="font-size:26px;font-weight:700">${r.posts.length}</div><div style="font-size:12px;color:#637381">contenuti pubblicati</div></td>
      <td width="12"></td>
      <td style="text-align:center;padding:12px;background:#FBF6E6;border-radius:8px"><div style="font-size:26px;font-weight:700">${r.leads}</div><div style="font-size:12px;color:#637381">lead ricevuti</div></td>
      <td width="12"></td>
      <td style="text-align:center;padding:12px;background:#FBF6E6;border-radius:8px"><div style="font-size:26px;font-weight:700">${n(r.reach)}</div><div style="font-size:12px;color:#637381">persone raggiunte</div></td>
    </tr></table>
    ${
      r.profiles.length
        ? `<h2 style="font-size:16px">I profili</h2><table width="100%" cellspacing="0">${r.profiles
            .map(
              (p) =>
                `<tr><td ${td}>${esc(PLATFORM_NAME[p.platform] ?? p.platform)} · <b>${esc(p.name)}</b></td><td ${td} align="right">${p.end != null ? `${n(p.end)} follower` : "—"}${p.start != null && p.end != null ? ` <span style="color:${p.end >= p.start ? "#22A06B" : "#D9363E"}">(${p.end - p.start >= 0 ? "+" : ""}${n(p.end - p.start)})</span>` : ""}</td></tr>`,
            )
            .join("")}</table>`
        : ""
    }
    ${r.ads.spend > 0 ? `<h2 style="font-size:16px;margin-top:24px">Sponsorizzate</h2><p style="font-size:14px">${eur(r.ads.spend)} investiti · ${r.ads.leads} contatti arrivati dalle campagne</p>` : ""}
    ${
      r.kpis.length
        ? `<h2 style="font-size:16px;margin-top:24px">Gli obiettivi</h2><table width="100%" cellspacing="0">${r.kpis
            .map((k) => `<tr><td ${td}><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${KPI_COLOR[k.status]};margin-right:8px"></span>${esc(k.label)}</td><td ${td} align="right" style="color:${KPI_COLOR[k.status]}">${KPI_WORD[k.status]}</td></tr>`)
            .join("")}</table>`
        : ""
    }
    ${
      r.posts.length
        ? `<h2 style="font-size:16px;margin-top:24px">Cosa è uscito</h2><table width="100%" cellspacing="0">${r.posts
            .slice(0, 20)
            .map((p) => `<tr><td ${td}>${p.at.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" })} · ${esc(PLATFORM_NAME[p.platform] ?? p.platform)}</td><td ${td}>${p.permalink ? `<a href="${esc(p.permalink)}" style="color:#9A7B1F">${esc((p.caption ?? "post").slice(0, 60))}</a>` : esc((p.caption ?? "post").slice(0, 60))}</td></tr>`)
            .join("")}</table>`
        : ""
    }
    ${link ? `<p style="margin:28px 0"><a href="${esc(link)}" style="background:#CDA434;color:#121212;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">Apri il report completo (anche in PDF)</a></p>` : ""}
    <p style="font-size:13px;color:#637381;margin-top:32px">Per domande rispondi a questa email o scrivi al tuo referente Golduck.</p>
  </div>
  <div style="padding:16px 24px;background:#f4f6f8;font-size:12px;color:#919EAB">Golduck · 2Target</div>
</div></body></html>`;
  return { subject, text, html };
}

/** Compatibilità: email del report di un mese (usata dall'anteprima e dalla prova). */
export async function buildMonthlyReport(clientId: number, month: string) {
  return monthlyReportEmail(await monthlyReportData(clientId, month), reportLink(clientId, month));
}

/** Dalla sincronizzazione notturna: manda il report del mese chiuso ai clienti che lo hanno attivo (una volta sola). */
export async function sendDueMonthlyReports(now = new Date()) {
  // Si aspetta il 3 del mese: Meta e Google consolidano i dati con qualche giorno di ritardo
  if (now.getUTCDate() < 3) return [];
  const month = previousMonth(now);
  const due = await db
    .select({ id: clients.id, name: clients.name, email: clients.reportEmail, last: clients.reportLastMonth })
    .from(clients)
    .where(and(eq(clients.reportMonthly, true), isNotNull(clients.reportEmail)));
  const out: string[] = [];
  for (const c of due.filter((x) => x.last !== month)) {
    try {
      const r = await buildMonthlyReport(c.id, month);
      await sendMail(c.email!, r.subject, r.text, r.html);
      await db.update(clients).set({ reportLastMonth: month }).where(eq(clients.id, c.id));
      await audit({ userId: null, actorLabel: "Sistema", category: "contenuti", action: "report.inviato", description: `Report di ${month} inviato a ${c.email}`, clientId: c.id });
      out.push(`${c.name}: inviato`);
    } catch (e) {
      await audit({ userId: null, actorLabel: "Sistema", category: "errori", action: "report.errore", description: `Report di ${month} non inviato: ${(e as Error).message}`.slice(0, 500), clientId: c.id });
      out.push(`${c.name}: ${(e as Error).message}`);
    }
  }
  return out;
}
