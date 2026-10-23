import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { clients, leads, users } from "@/db/schema";
import { appUrl } from "@/lib/integrations/config";
import { sendMail } from "@/lib/mail";
import { pushToEmails } from "@/lib/push";

// Lead in tempo reale: appena un contatto arriva (modulo del sito subito, moduli di Meta alla lettura ogni 15 minuti)
// parte un'email al responsabile del cliente, o agli amministratori se il cliente non ha un responsabile.
// Chi richiama entro poche ore chiude molto di più: è il motivo per cui l'avviso non aspetta la notte.

/** Oltre questo numero di contatti insieme si manda un riepilogo unico invece di un'email per contatto. */
export const SUMMARY_FROM = 4;

const SOURCE: Record<string, string> = {
  meta_ads: "Inserzioni Meta",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  google_ads: "Google Ads",
  seo: "Google (ricerca)",
  sito: "Sito web",
  whatsapp: "WhatsApp",
  telefono: "Telefono",
  email: "Email",
  passaparola: "Passaparola",
  evento: "Evento",
  altro: "Altro",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type LeadLite = { name: string | null; email: string | null; phone: string | null; company: string | null; message: string | null; source: string };

/** Contenuto dell'email (funzione pura, coperta dai test): un contatto con i dettagli, oppure un riepilogo. */
export function leadEmail(clientName: string, list: LeadLite[], link: string) {
  const who = (l: LeadLite) => l.name ?? l.email ?? l.phone ?? "Contatto senza nome";
  if (list.length >= SUMMARY_FROM) {
    const subject = `${list.length} nuovi contatti per ${clientName}`;
    const rows = list.map((l) => `• ${who(l)}${l.phone ? ` · ${l.phone}` : ""}${l.email ? ` · ${l.email}` : ""} (${SOURCE[l.source] ?? l.source})`);
    const text = [`${clientName}: ${list.length} nuovi contatti.`, "", ...rows, "", `Aprili in 2Target: ${link}`].join("\n");
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1C252E">
<p><b>${esc(clientName)}</b>: ${list.length} nuovi contatti.</p>
<ul>${list.map((l) => `<li><b>${esc(who(l))}</b>${l.phone ? ` · ${esc(l.phone)}` : ""}${l.email ? ` · ${esc(l.email)}` : ""} <span style="color:#637381">(${esc(SOURCE[l.source] ?? l.source)})</span></li>`).join("")}</ul>
<p><a href="${esc(link)}" style="background:#CDA434;color:#121212;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">Apri i lead</a></p></div>`;
    return { subject, text, html };
  }
  const l = list[0];
  const subject = `Nuovo contatto per ${clientName}: ${who(l)}`;
  const lines = [
    l.name && `Nome: ${l.name}`,
    l.company && `Azienda: ${l.company}`,
    l.phone && `Telefono: ${l.phone}`,
    l.email && `Email: ${l.email}`,
    `Fonte: ${SOURCE[l.source] ?? l.source}`,
    l.message && `\n${l.message}`,
  ].filter(Boolean) as string[];
  const text = [`${clientName}: nuovo contatto.`, "", ...lines, "", "Richiamalo il prima possibile: entro poche ore si chiude molto di più.", `Apri in 2Target: ${link}`].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1C252E">
<p><b>${esc(clientName)}</b>: nuovo contatto.</p>
<table cellspacing="0" style="font-size:15px">${[
    ["Nome", l.name],
    ["Azienda", l.company],
    ["Telefono", l.phone ? `<a href="tel:${esc(l.phone.replace(/\s+/g, ""))}">${esc(l.phone)}</a>` : null],
    ["Email", l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : null],
    ["Fonte", SOURCE[l.source] ?? l.source],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="color:#637381;padding:4px 16px 4px 0">${k}</td><td style="padding:4px 0">${k === "Telefono" || k === "Email" ? v : esc(String(v))}</td></tr>`)
    .join("")}</table>
${l.message ? `<p style="background:#F4F6F8;border-radius:8px;padding:12px 14px;white-space:pre-wrap">${esc(l.message)}</p>` : ""}
<p style="font-size:13px;color:#637381">Richiamalo il prima possibile: entro poche ore si chiude molto di più.</p>
<p><a href="${esc(link)}" style="background:#CDA434;color:#121212;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">Apri in 2Target</a></p></div>`;
  return { subject, text, html };
}

/** Avvisa dei lead appena creati di un cliente. Non lancia mai: il lead è già salvato, l'email è un di più. */
export async function notifyNewLeads(clientId: number, leadIds: number[]) {
  if (!leadIds.length) return;
  try {
    const [client] = await db.select({ name: clients.name, ownerId: clients.ownerId }).from(clients).where(eq(clients.id, clientId));
    if (!client) return;
    const list = await db.select().from(leads).where(and(eq(leads.clientId, clientId), inArray(leads.id, leadIds)));
    if (!list.length) return;
    const [owner] = client.ownerId ? await db.select({ email: users.email, active: users.active }).from(users).where(eq(users.id, client.ownerId)) : [];
    const to = owner?.active
      ? [owner.email]
      : (await db.select({ email: users.email }).from(users).where(and(inArray(users.role, ["superadmin", "admin"]), eq(users.active, true)))).map((u) => u.email);
    const mail = leadEmail(client.name, list, `${appUrl()}/clienti/${clientId}/lead`);
    for (const addr of to) await sendMail(addr, mail.subject, mail.text, mail.html);
    await pushToEmails(to, {
      title: list.length === 1 ? `Nuovo lead per ${client.name}` : `${list.length} nuovi lead per ${client.name}`,
      body: list.length === 1 ? (list[0].name ?? list[0].email ?? "Apri per i dettagli") : "Apri per vederli tutti",
      url: `/clienti/${clientId}/lead`,
      tag: `lead-${clientId}`,
    });
  } catch (e) {
    console.error("[lead] avviso non riuscito:", e);
  }
}
