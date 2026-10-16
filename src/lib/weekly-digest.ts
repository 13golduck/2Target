import "server-only";
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { appSettings, clients, editorialItems, leads, publications, socialAccounts, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/integrations/config";
import { sendMail } from "@/lib/mail";
import { EXIT_LABEL, exitState, type ExitState } from "@/lib/publishing/exit-state";
import { isoWeek } from "@/lib/week";

// Riepilogo settimanale al team Golduck (lunedì mattina, dalla sincronizzazione notturna): cosa è uscito
// nella settimana passata, cosa NON è uscito e perché, cosa esce nei prossimi 7 giorni e cosa manca da approvare.
// Uguale per tutto il team (tutti vedono tutti i clienti); ognuno lo può disattivare da Profilo.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const DAY = 86_400_000;
const PLATFORM: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn" };
const when = (d: Date) => d.toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export async function buildWeeklyDigest(now = new Date()) {
  const lastFrom = new Date(now.getTime() - 7 * DAY);
  const nextTo = new Date(now.getTime() + 7 * DAY);
  const names = new Map((await db.select({ id: clients.id, name: clients.name }).from(clients)).map((c) => [c.id, c.name]));

  // Pubblicazioni della settimana passata (per data programmata) e schede dei prossimi 7 giorni
  const pastPubs = await db
    .select({ itemId: publications.itemId, clientId: publications.clientId, status: publications.status, error: publications.error, platform: socialAccounts.platform, handle: socialAccounts.handle, title: editorialItems.title })
    .from(publications)
    .innerJoin(socialAccounts, eq(socialAccounts.id, publications.socialAccountId))
    .innerJoin(editorialItems, eq(editorialItems.id, publications.itemId))
    .where(and(gte(publications.scheduledAt, lastFrom), lt(publications.scheduledAt, now), ne(publications.status, "annullata")));
  const published = pastPubs.filter((p) => p.status === "pubblicata");
  const failed = pastPubs.filter((p) => p.status === "errore");

  const next = await db
    .select({ id: editorialItems.id, clientId: editorialItems.clientId, title: editorialItems.title, status: editorialItems.status, at: editorialItems.scheduledAt })
    .from(editorialItems)
    .where(and(gte(editorialItems.scheduledAt, now), lt(editorialItems.scheduledAt, nextTo), ne(editorialItems.status, "annullato")))
    .orderBy(asc(editorialItems.scheduledAt));
  const nextPubs = next.length
    ? await db.select({ itemId: publications.itemId, status: publications.status, platform: socialAccounts.platform, permalink: publications.permalink, error: publications.error })
        .from(publications)
        .innerJoin(socialAccounts, eq(socialAccounts.id, publications.socialAccountId))
        .where(inArray(publications.itemId, next.map((i) => i.id)))
    : [];
  const upcoming = next.map((i) => {
    const mine = nextPubs.filter((p) => p.itemId === i.id);
    return { ...i, exit: exitState(mine) as ExitState | null, platforms: [...new Set(mine.filter((p) => p.status !== "annullata").map((p) => PLATFORM[p.platform] ?? p.platform))] };
  });
  // Da sistemare prima dell'uscita: non approvate, oppure approvate ma senza uscita automatica (vanno pubblicate a mano)
  const toApprove = upcoming.filter((i) => i.status === "bozza" || i.status === "da_approvare");
  const manual = upcoming.filter((i) => i.status === "approvato" && !i.exit);

  const leadRows = await db
    .select({ clientId: leads.clientId, n: sql<number>`count(*)` })
    .from(leads)
    .where(gte(leads.receivedAt, lastFrom))
    .groupBy(leads.clientId);
  const leadTotal = leadRows.reduce((t, r) => t + Number(r.n), 0);

  const base = appUrl();
  const link = (path: string, label: string) => `<a href="${esc(base + path)}" style="color:#9A7B1F">${esc(label)}</a>`;
  const client = (id: number) => names.get(id) ?? "Cliente";
  const range = `${lastFrom.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" })} – ${now.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" })}`;
  const subject = failed.length
    ? `2Target · settimana: ${failed.length} ${failed.length === 1 ? "uscita non riuscita" : "uscite non riuscite"} da controllare`
    : `2Target · settimana: ${published.length} uscite, ${upcoming.length} in arrivo`;

  const text = [
    `Riepilogo settimanale 2Target (${range})`,
    "",
    `Uscite: ${published.length} · Non uscite: ${failed.length} · Lead ricevuti: ${leadTotal}`,
    ...(failed.length ? ["", "NON USCITE (da controllare):", ...failed.map((f) => `- ${client(f.clientId)} · ${f.title} · ${PLATFORM[f.platform] ?? f.platform} @${f.handle}: ${(f.error ?? "").slice(0, 160)} → ${base}/pubblicazioni/${f.itemId}`)] : []),
    ...(toApprove.length ? ["", "DA APPROVARE (escono nei prossimi 7 giorni):", ...toApprove.map((i) => `- ${when(i.at!)} · ${client(i.clientId)} · ${i.title} → ${base}/pubblicazioni/${i.id}`)] : []),
    ...(manual.length ? ["", "APPROVATE MA SENZA USCITA AUTOMATICA (da pubblicare a mano o programmare):", ...manual.map((i) => `- ${when(i.at!)} · ${client(i.clientId)} · ${i.title}`)] : []),
    "",
    "PROSSIMI 7 GIORNI:",
    ...(upcoming.length ? upcoming.map((i) => `- ${when(i.at!)} · ${client(i.clientId)} · ${i.title}${i.exit ? ` (${EXIT_LABEL[i.exit]}${i.platforms.length ? `: ${i.platforms.join(", ")}` : ""})` : ""}`) : ["nessun contenuto in calendario"]),
    "",
    `Calendario: ${base}/calendario`,
    "Per non ricevere più questa email: Profilo → Riepilogo settimanale.",
  ].join("\n");

  const td = 'style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top"';
  const section = (title: string, color: string, rows: string[]) =>
    rows.length ? `<h2 style="font-size:15px;margin:24px 0 6px;color:${color}">${esc(title)}</h2><table width="100%" cellspacing="0">${rows.join("")}</table>` : "";
  const tile = (value: number, label: string, bg = "#FBF6E6") =>
    `<td style="text-align:center;padding:12px;background:${bg};border-radius:8px"><div style="font-size:24px;font-weight:700">${value}</div><div style="font-size:12px;color:#637381">${esc(label)}</div></td>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1C252E">
<div style="max-width:680px;margin:0 auto;background:#fff">
  <div style="background:#121212;color:#fff;padding:20px 24px">
    <span style="background:#CDA434;color:#121212;font-weight:800;border-radius:6px;padding:2px 8px">2T</span>
    <h1 style="font-size:20px;margin:14px 0 4px">Riepilogo settimanale</h1>
    <div style="color:#C4CDD5">${esc(range)}</div>
  </div>
  <div style="padding:20px 24px">
    <table width="100%" cellspacing="0"><tr>${tile(published.length, "uscite")}<td width="10"></td>${tile(failed.length, "non uscite", failed.length ? "#FFE9E5" : "#FBF6E6")}<td width="10"></td>${tile(upcoming.length, "in arrivo (7 giorni)")}<td width="10"></td>${tile(leadTotal, "lead ricevuti")}</tr></table>
    ${section(
      "Non uscite: da controllare",
      "#D9363E",
      failed.map((f) => `<tr><td ${td}><b>${esc(client(f.clientId))}</b><br>${link(`/pubblicazioni/${f.itemId}`, f.title)}</td><td ${td}>${esc(PLATFORM[f.platform] ?? f.platform)} @${esc(f.handle)}<br><span style="color:#637381">${esc((f.error ?? "").slice(0, 200))}</span></td></tr>`),
    )}
    ${section(
      "Da approvare (escono nei prossimi 7 giorni)",
      "#B76E00",
      toApprove.map((i) => `<tr><td ${td} width="140">${esc(when(i.at!))}</td><td ${td}><b>${esc(client(i.clientId))}</b> · ${link(`/pubblicazioni/${i.id}`, i.title)}</td></tr>`),
    )}
    ${section(
      "Approvate ma senza uscita automatica",
      "#637381",
      manual.map((i) => `<tr><td ${td} width="140">${esc(when(i.at!))}</td><td ${td}><b>${esc(client(i.clientId))}</b> · ${link(`/pubblicazioni/${i.id}`, i.title)}</td></tr>`),
    )}
    ${section(
      "Prossimi 7 giorni",
      "#1C252E",
      upcoming.length
        ? upcoming.map((i) => `<tr><td ${td} width="140">${esc(when(i.at!))}</td><td ${td}><b>${esc(client(i.clientId))}</b> · ${esc(i.title)}</td><td ${td} align="right" style="color:#637381">${i.exit ? esc(EXIT_LABEL[i.exit]) + (i.platforms.length ? `<br>${esc(i.platforms.join(", "))}` : "") : "—"}</td></tr>`)
        : [`<tr><td ${td}>Nessun contenuto in calendario.</td></tr>`],
    )}
    ${
      leadRows.length
        ? section("Lead ricevuti", "#1C252E", leadRows.sort((a, b) => Number(b.n) - Number(a.n)).map((r) => `<tr><td ${td}>${esc(client(r.clientId))}</td><td ${td} align="right">${Number(r.n)}</td></tr>`))
        : ""
    }
    <p style="margin-top:24px"><a href="${esc(base)}/calendario" style="background:#1C1C1C;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;display:inline-block">Apri il calendario</a></p>
  </div>
  <div style="padding:14px 24px;background:#f4f6f8;font-size:12px;color:#919EAB">Golduck · 2Target · Per non riceverla più: Profilo → Riepilogo settimanale</div>
</div></body></html>`;

  return { subject, text, html, counts: { published: published.length, failed: failed.length, upcoming: upcoming.length, toApprove: toApprove.length } };
}

/** Dalla sincronizzazione notturna: dal lunedì, una volta per settimana, al team che lo riceve. */
export async function sendDueWeeklyDigest(now = new Date()) {
  const week = isoWeek(now);
  const [last] = await db.select().from(appSettings).where(eq(appSettings.key, "weekly_digest_last")).limit(1);
  if ((last?.value as { week?: string } | undefined)?.week === week) return [];
  // Segnato prima dell'invio: con due chiamate al cron insieme non parte due volte
  await db.insert(appSettings).values({ key: "weekly_digest_last", value: { week } }).onDuplicateKeyUpdate({ set: { value: { week } } });
  const team = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.active, true), eq(users.weeklyDigest, true), ne(users.role, "viewer")));
  if (!team.length) return [];
  const d = await buildWeeklyDigest(now);
  const out: string[] = [];
  for (const u of team) {
    try {
      await sendMail(u.email, d.subject, d.text, d.html);
      out.push(`${u.email}: inviato`);
    } catch (e) {
      out.push(`${u.email}: ${(e as Error).message}`);
    }
  }
  await audit({ userId: null, actorLabel: "Sistema", category: "sistema", action: "riepilogo.settimanale", description: `Riepilogo settimanale ${week} inviato a ${out.filter((o) => o.endsWith("inviato")).length} persone del team`, meta: { ...d.counts, esiti: out } });
  return out;
}
