"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { clients, editorialItems, users } from "@/db/schema";
import { approvalLink } from "@/lib/approval";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { itemIssues } from "@/lib/editorial-plan";
import { buildMonthlyReport, previousMonth } from "@/lib/monthly-report";
import { sendMail } from "@/lib/mail";
import { toPlanItem } from "@/lib/plan-adapter";

// Opzioni del cliente: approvazione via link (facoltativa) e report mensile automatico.

export async function setApproval(clientId: number, enabled: boolean) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  await db.update(clients).set({ approvalEnabled: enabled }).where(eq(clients.id, clientId));
  await audit({ userId: me.id, category: "canali", action: enabled ? "approvazione.attivata" : "approvazione.disattivata", description: `Approvazione via link ${enabled ? "attivata" : "disattivata (i link già inviati smettono di funzionare)"}`, clientId });
  revalidatePath(`/clienti/${clientId}`, "layout");
  return { ok: true, link: enabled ? approvalLink(clientId) : null };
}

export async function getApprovalLink(clientId: number) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  const [c] = await db.select({ on: clients.approvalEnabled }).from(clients).where(eq(clients.id, clientId));
  if (!c?.on) return { error: "Attiva prima l'approvazione via link" };
  await audit({ userId: me.id, category: "canali", action: "approvazione.link", description: "Creato un link di approvazione per il cliente (valido 60 giorni)", clientId });
  return { link: approvalLink(clientId) };
}

const Report = z.object({ clientId: z.number().int().positive(), monthly: z.boolean(), email: z.string().trim().email().max(255).or(z.literal("")) });

export async function saveReportSettings(input: z.infer<typeof Report>) {
  const me = await requireWriter();
  const p = Report.safeParse(input);
  if (!p.success) return { error: "Indirizzo email non valido" };
  const v = p.data;
  await requireClientAccess(v.clientId);
  if (v.monthly && !v.email) return { error: "Serve l'email a cui mandare il report" };
  await db.update(clients).set({ reportMonthly: v.monthly, reportEmail: v.email || null }).where(eq(clients.id, v.clientId));
  await audit({ userId: me.id, category: "canali", action: "report.impostazioni", description: v.monthly ? `Report mensile automatico a ${v.email}` : "Report mensile automatico disattivato", clientId: v.clientId });
  revalidatePath(`/clienti/${v.clientId}`);
  return { ok: true };
}

/** Manda in approvazione le bozze complete (senza errori) dei prossimi 30 giorni del piano. */
export async function sendForApproval(planId: number) {
  const me = await requireWriter();
  const now = new Date();
  const rows = await db
    .select()
    .from(editorialItems)
    .where(and(eq(editorialItems.planId, planId), eq(editorialItems.status, "bozza"), gte(editorialItems.scheduledAt, now), lte(editorialItems.scheduledAt, new Date(now.getTime() + 30 * 86_400_000))));
  const ready = rows.filter((i) => !itemIssues(toPlanItem(i)).some((x) => x.level === "errore"));
  if (!ready.length) return { count: 0 };
  await requireClientAccess(ready[0].clientId);
  for (const i of ready) await db.update(editorialItems).set({ status: "da_approvare" }).where(eq(editorialItems.id, i.id));
  await audit({ userId: me.id, category: "contenuti", action: "approvazione.invio", description: `Mandati in approvazione ${ready.length} contenuti`, clientId: ready[0].clientId, meta: { schede: ready.map((i) => i.id) } });
  revalidatePath(`/clienti/${ready[0].clientId}/piano`);
  return { count: ready.length };
}

/** Anteprima del report del mese scorso (HTML) e invio di prova a chi lo chiede. */
export async function previewReport(clientId: number, sendToMe = false) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  const r = await buildMonthlyReport(clientId, previousMonth());
  if (sendToMe) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, me.id));
    try {
      await sendMail(u.email, `[Prova] ${r.subject}`, r.text, r.html);
    } catch (e) {
      return { error: `Invio non riuscito: ${(e as Error).message}` };
    }
    return { ok: true, sentTo: u.email };
  }
  return { html: r.html, subject: r.subject };
}

/** Parole del brand (oltre a nome e dominio) per separare le ricerche con il nome del cliente in SEO. */
export async function saveBrandTerms(clientId: number, terms: string) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  const clean = terms
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
  await db.update(clients).set({ brandTerms: clean || null }).where(eq(clients.id, clientId));
  await audit({ userId: me.id, category: "canali", action: "seo.brand", description: clean ? `Parole del brand per la SEO: ${clean}` : "Tolte le parole del brand aggiunte a mano", clientId });
  revalidatePath(`/clienti/${clientId}/seo`);
  return { ok: true };
}
