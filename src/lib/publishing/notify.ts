import "server-only";
import { and, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";

import { db } from "@/db";
import { clients, editorialItems, publications, socialAccounts, users } from "@/db/schema";
import { appUrl } from "@/lib/integrations/config";
import { sendMail } from "@/lib/mail";
import { platformName } from "@/lib/platforms";
import { pushToEmails } from "@/lib/push";
import { isDryRun } from "./meta-publish";

// Esito delle pubblicazioni, comunicato una volta sola per esito:
// - non è uscita → email a chi l'ha programmata (o agli amministratori), con il motivo e il link alla scheda;
// - è uscita → email al cliente con il link al post, solo se il cliente l'ha chiesto e mai in simulazione.
// I post usciti si vedono anche nella Home «Oggi» (riquadro «Usciti nelle ultime 24 ore»).

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const PLATFORM: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn" };

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1C252E">
<div style="max-width:560px;margin:0 auto;background:#fff">
  <div style="background:#121212;color:#fff;padding:20px 24px">
    <span style="background:#CDA434;color:#121212;font-weight:800;border-radius:6px;padding:2px 8px">2T</span>
    <h1 style="font-size:20px;margin:14px 0 0">${esc(title)}</h1>
  </div>
  <div style="padding:24px;font-size:15px;line-height:1.5">${body}</div>
  <div style="padding:14px 24px;background:#f4f6f8;font-size:12px;color:#919EAB">Golduck · 2Target</div>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#CDA434;color:#121212;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">${esc(label)}</a></p>`;

/** Testo dell'email di errore per il consulente (funzione pura, coperta dai test). */
export function failureEmail(p: { title: string; clientName: string; platform: string; handle: string; when: Date; error: string; link: string }) {
  const where = `${PLATFORM[p.platform] ?? p.platform} @${p.handle}`;
  const when = p.when.toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const uncertain = p.error.startsWith("ESITO INCERTO");
  const subject = `${uncertain ? "Esito incerto" : "Non pubblicato"}: «${p.title}» su ${where}`;
  const text = [
    `${p.clientName} · «${p.title}»`,
    `${uncertain ? "Esito incerto" : "Non è uscito"} su ${where} (programmato per ${when}).`,
    "",
    `Motivo: ${p.error}`,
    "",
    `Apri la scheda: ${p.link}`,
  ].join("\n");
  const html = layout(subject, `<p><b>${esc(p.clientName)}</b> · «${esc(p.title)}»<br>${uncertain ? "Esito incerto" : "Non è uscito"} su <b>${esc(where)}</b>, programmato per ${esc(when)}.</p>
<p style="background:#FFF4E5;border-radius:8px;padding:12px 14px;color:#7A4100">${esc(p.error)}</p>${button(p.link, "Apri la scheda")}`);
  return { subject, text, html };
}

/** Testo dell'email di uscita per il cliente (funzione pura, coperta dai test). */
export function publishedEmail(p: { title: string; clientName: string; platform: string; permalink: string | null; caption: string | null }) {
  const where = PLATFORM[p.platform] ?? p.platform;
  const subject = `È uscito il tuo nuovo post su ${where}`;
  const excerpt = (p.caption ?? "").split("\n")[0].slice(0, 160);
  const text = [`${p.clientName}: è uscito «${p.title}» su ${where}.`, excerpt ? `«${excerpt}»` : "", p.permalink ? `Guardalo qui: ${p.permalink}` : "", "", "Golduck · 2Target"]
    .filter((l, i, a) => l || a[i - 1])
    .join("\n");
  const html = layout(subject, `<p>Ciao ${esc(p.clientName)}, è appena uscito <b>«${esc(p.title)}»</b> su ${esc(where)}.</p>
${excerpt ? `<p style="color:#637381;border-left:3px solid #CDA434;padding-left:12px">${esc(excerpt)}</p>` : ""}${p.permalink ? button(p.permalink, "Guarda il post") : ""}
<p style="font-size:13px;color:#637381">Un like o una condivisione nelle prime ore aiutano il post a farsi vedere di più.</p>`);
  return { subject, text, html };
}

/**
 * Comunica l'esito attuale della pubblicazione, se non è già stato comunicato. Non lancia mai:
 * un'email non partita non deve rimettere in discussione la pubblicazione.
 */
export async function notifyPublicationOutcome(id: number) {
  try {
    // Presa in carico atomica: tra giri dello scheduler, «Riprova» e controlli TikTok l'avviso parte una volta
    const [pub] = await db.select().from(publications).where(eq(publications.id, id));
    if (!pub || !["pubblicata", "errore"].includes(pub.status) || pub.notifiedStatus === pub.status) return;
    const [claim] = await db
      .update(publications)
      .set({ notifiedStatus: pub.status })
      .where(and(eq(publications.id, id), eq(publications.status, pub.status), or(isNull(publications.notifiedStatus), ne(publications.notifiedStatus, pub.status))));
    if (claim.affectedRows !== 1) return;

    const [item] = await db.select({ title: editorialItems.title, caption: editorialItems.caption }).from(editorialItems).where(eq(editorialItems.id, pub.itemId));
    const [channel] = await db.select({ platform: socialAccounts.platform, handle: socialAccounts.handle }).from(socialAccounts).where(eq(socialAccounts.id, pub.socialAccountId));
    const [client] = await db.select({ name: clients.name, email: clients.reportEmail, notify: clients.notifyPublished }).from(clients).where(eq(clients.id, pub.clientId));
    if (!item || !channel || !client) return;

    if (pub.status === "errore") {
      const mail = failureEmail({
        title: item.title,
        clientName: client.name,
        platform: channel.platform,
        handle: channel.handle,
        when: pub.scheduledAt,
        error: pub.error ?? "errore sconosciuto",
        link: `${appUrl()}/pubblicazioni/${pub.itemId}`,
      });
      // A chi l'ha programmata; se non c'è più, agli amministratori attivi
      const [author] = pub.createdBy ? await db.select({ email: users.email, active: users.active }).from(users).where(eq(users.id, pub.createdBy)) : [];
      const to = author?.active
        ? [author.email]
        : (await db.select({ email: users.email }).from(users).where(and(inArray(users.role, ["superadmin", "admin"]), eq(users.active, true)))).map((u) => u.email);
      for (const addr of to) await sendMail(addr, mail.subject, mail.text, mail.html);
      // Anche sul telefono di chi ha attivato le notifiche: un post non uscito va sistemato presto
      await pushToEmails(to, { title: `Non uscito: ${item.title}`, body: `${client.name} · ${platformName(channel.platform)} @${channel.handle}`, url: `/pubblicazioni/${pub.itemId}`, tag: `pub-${pub.id}` }).catch((e) =>
        console.error("[pubblicazioni] notifica push non riuscita:", e),
      );
      return;
    }

    // Uscita: al cliente solo se l'ha chiesto, e mai per i post simulati (non sono davvero online)
    if (client.notify && client.email && !isDryRun()) {
      const mail = publishedEmail({ title: item.title, clientName: client.name, platform: channel.platform, permalink: pub.permalink, caption: item.caption });
      await sendMail(client.email, mail.subject, mail.text, mail.html);
    }
  } catch (e) {
    console.error("[pubblicazioni] avviso dell'esito non riuscito:", e);
  }
}

/** A ogni giro dello scheduler: comunica gli esiti degli ultimi 2 giorni non ancora comunicati (al massimo 50). */
export async function notifyPendingOutcomes() {
  const rows = await db
    .select({ id: publications.id })
    .from(publications)
    .where(
      and(
        inArray(publications.status, ["pubblicata", "errore"]),
        or(isNull(publications.notifiedStatus), ne(publications.notifiedStatus, publications.status)),
        gte(publications.updatedAt, new Date(Date.now() - 2 * 86_400_000)),
      ),
    )
    .limit(50);
  for (const r of rows) await notifyPublicationOutcome(r.id);
}
