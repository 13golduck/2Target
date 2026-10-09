"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, COST_KINDS, LEAD_SOURCES, LEAD_STAGES, leadEvents, leads, marketingCosts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fromRomeInput } from "@/lib/format";
import { updateKpisFromData } from "@/lib/integrations/sync";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => {
  const raw = String(f.get(k) ?? "").trim().replace(/\./g, "").replace(",", ".").replace("€", "");
  const v = Number(raw);
  return raw !== "" && Number.isFinite(v) ? v : null;
};
const oneOf = <T extends readonly string[]>(list: T, v: string | null): T[number] | null =>
  v && (list as readonly string[]).includes(v) ? (v as T[number]) : null;
const path = (clientId: number) => `/clienti/${clientId}/lead`;

async function afterChange(clientId: number) {
  await updateKpisFromData(clientId).catch(() => undefined);
  revalidatePath(path(clientId));
}

export async function saveLead(f: FormData) {
  const user = await requireUser();
  const id = Number(f.get("id")) || null;
  const clientId = Number(f.get("clientId"));
  const stage = oneOf(LEAD_STAGES, str(f, "stage")) ?? "nuovo";
  const data = {
    name: str(f, "name"),
    company: str(f, "company"),
    email: str(f, "email"),
    phone: str(f, "phone"),
    message: str(f, "message"),
    source: oneOf(LEAD_SOURCES, str(f, "source")) ?? "altro",
    utmCampaign: str(f, "utmCampaign"),
    estimatedValue: num(f, "estimatedValue"),
    wonValue: num(f, "wonValue"),
    lostReason: stage === "perso" ? str(f, "lostReason") : null,
    notes: str(f, "notes"),
    receivedAt: fromRomeInput(str(f, "receivedAt")) ?? new Date(),
  };
  if (id) {
    const [old] = await db.select().from(leads).where(eq(leads.id, id));
    if (!old) return { error: "Lead non trovato" };
    await db.update(leads).set(data).where(eq(leads.id, id));
    if (old.stage !== stage) await changeStage(id, old.stage, stage, user.id);
    await afterChange(old.clientId);
  } else {
    const [r] = await db.insert(leads).values({ ...data, clientId, stage: "nuovo", stageChangedAt: data.receivedAt });
    await db.insert(leadEvents).values({ leadId: r.insertId, toStage: "nuovo", at: data.receivedAt, userId: user.id });
    if (stage !== "nuovo") await changeStage(r.insertId, "nuovo", stage, user.id);
    await afterChange(clientId);
  }
  return { ok: true };
}

async function changeStage(id: number, from: (typeof LEAD_STAGES)[number], to: (typeof LEAD_STAGES)[number], userId: number | null) {
  const now = new Date();
  await db
    .update(leads)
    .set({ stage: to, stageChangedAt: now, ...(to === "vinto" ? { wonAt: now } : from === "vinto" ? { wonAt: null } : {}) })
    .where(eq(leads.id, id));
  await db.insert(leadEvents).values({ leadId: id, fromStage: from, toStage: to, at: now, userId });
}

/** Trascinamento nella pipeline. */
export async function moveLead(id: number, stage: string) {
  const user = await requireUser();
  const to = oneOf(LEAD_STAGES, stage);
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead || !to || lead.stage === to) return;
  await changeStage(id, lead.stage, to, user.id);
  await afterChange(lead.clientId);
}

export async function deleteLead(f: FormData) {
  await requireUser();
  const [lead] = await db.select().from(leads).where(eq(leads.id, Number(f.get("id"))));
  if (!lead) return;
  await db.delete(leads).where(eq(leads.id, lead.id));
  await afterChange(lead.clientId);
}

export async function addCost(f: FormData) {
  await requireUser();
  const clientId = Number(f.get("clientId"));
  const month = str(f, "month"); // AAAA-MM
  const amount = num(f, "amount");
  const source = oneOf(LEAD_SOURCES, str(f, "source"));
  if (!month || !/^\d{4}-\d{2}$/.test(month) || amount == null || !source) return { error: "Compila mese, fonte e importo" };
  await db.insert(marketingCosts).values({ clientId, month: `${month}-01`, source, kind: oneOf(COST_KINDS, str(f, "kind")) ?? "inserzioni", amount, notes: str(f, "notes") });
  await afterChange(clientId);
  return { ok: true };
}

export async function deleteCost(f: FormData) {
  await requireUser();
  const [c] = await db.select().from(marketingCosts).where(eq(marketingCosts.id, Number(f.get("id"))));
  if (!c) return;
  await db.delete(marketingCosts).where(eq(marketingCosts.id, c.id));
  await afterChange(c.clientId);
}

/** Crea (o rigenera) la chiave per ricevere i lead dai moduli del sito. */
export async function regenerateLeadToken(f: FormData) {
  await requireUser();
  const clientId = Number(f.get("clientId"));
  await db.update(clients).set({ leadToken: randomBytes(18).toString("base64url") }).where(eq(clients.id, clientId));
  revalidatePath(path(clientId));
}
