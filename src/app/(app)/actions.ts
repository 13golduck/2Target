"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import * as s from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { fromRomeInput, parseMetricInput } from "@/lib/format";
import { METRIC_BY_KEY } from "@/lib/kpi-catalog";
import { kpiSnapshot } from "@/lib/queries";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const int = (f: FormData, k: string) => {
  const v = Number(String(f.get(k) ?? "").replace(",", "."));
  return String(f.get(k) ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
};
const oneOf = <T extends readonly string[]>(list: T, v: string | null): T[number] | null =>
  v && (list as readonly string[]).includes(v) ? (v as T[number]) : null;

// ── Clienti ──────────────────────────────────────────────────────────
export async function createClient(f: FormData) {
  await requireWriter();
  const name = str(f, "name");
  if (!name) return;
  let website = str(f, "website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const [r] = await db.insert(s.clients).values({ name, sector: str(f, "sector"), website, vatNumber: str(f, "vatNumber"), city: str(f, "city"), status: "onboarding" });
  // Il lavoro con un nuovo cliente parte dal check-up
  redirect(`/clienti/${r.insertId}/checkup`);
}

// ── KPI ──────────────────────────────────────────────────────────────
export async function addKpi(f: FormData) {
  await requireWriter();
  const clientId = int(f, "clientId")!;
  const metric = METRIC_BY_KEY[String(f.get("metricKey"))];
  if (!metric) return;
  const target = parseMetricInput(f.get("target"), metric.unit);
  if (target == null || target <= 0) return;
  await db.insert(s.kpis).values({
    clientId,
    metricKey: metric.key,
    label: str(f, "label") ?? metric.label,
    scope: metric.scope,
    direction: metric.direction,
    platform: str(f, "platform"),
    baseline: parseMetricInput(f.get("baseline"), metric.unit),
    target,
    minSample: int(f, "minSample"),
  });
  revalidatePath(`/clienti/${clientId}`);
}

export async function addMeasurement(f: FormData) {
  await requireWriter();
  const kpiId = int(f, "kpiId")!;
  const [kpi] = await db.select().from(s.kpis).where(eq(s.kpis.id, kpiId));
  if (!kpi) return;
  const value = parseMetricInput(f.get("value"), METRIC_BY_KEY[kpi.metricKey]?.unit ?? "n");
  const periodStart = str(f, "periodStart");
  const periodEnd = str(f, "periodEnd");
  if (value == null || !periodStart || !periodEnd) return;
  await db.insert(s.kpiMeasurements).values({ kpiId, value, periodStart, periodEnd, sample: int(f, "sample") });
  revalidatePath(`/clienti/${kpi.clientId}`);
}

export async function deleteKpi(f: FormData) {
  await requireWriter();
  const id = int(f, "kpiId")!;
  const [kpi] = await db.select().from(s.kpis).where(eq(s.kpis.id, id));
  if (!kpi) return;
  await db.update(s.kpis).set({ active: false }).where(eq(s.kpis.id, id));
  revalidatePath(`/clienti/${kpi.clientId}`);
}

// ── Check-up ─────────────────────────────────────────────────────────
export async function createCheckup(f: FormData) {
  await requireWriter();
  const clientId = int(f, "clientId")!;
  const [prev] = await db.select({ id: s.checkups.id }).from(s.checkups).where(eq(s.checkups.clientId, clientId)).orderBy(desc(s.checkups.id)).limit(1);
  const month = new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" }).replace(/^./, (c) => c.toUpperCase());
  await db.insert(s.checkups).values({ clientId, period: str(f, "period") ?? month, previousId: prev?.id ?? null });
  redirect(`/clienti/${clientId}/checkup`);
}

export async function saveCheckupSection(f: FormData) {
  await requireWriter();
  const checkupId = int(f, "checkupId")!;
  const [chk] = await db.select({ status: s.checkups.status }).from(s.checkups).where(eq(s.checkups.id, checkupId));
  // Un check-up consegnato fa parte dello storico: si modifica solo dopo averlo riaperto
  if (chk?.status === "consegnato") return;
  const sectionKey = String(f.get("sectionKey"));
  const content: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("field:")) content[k.slice(6)] = String(v);
  await db.insert(s.checkupSections).values({ checkupId, sectionKey, content }).onDuplicateKeyUpdate({ set: { content } });
  const [c] = await db.select({ clientId: s.checkups.clientId }).from(s.checkups).where(eq(s.checkups.id, checkupId));
  revalidatePath(`/clienti/${c.clientId}/checkup`);
}

export async function setCheckupStatus(f: FormData) {
  await requireWriter();
  const id = int(f, "checkupId")!;
  const status = oneOf(["bozza", "in_revisione", "consegnato"] as const, str(f, "status"));
  if (!status) return;
  const [c] = await db.select({ clientId: s.checkups.clientId, kpiSnapshot: s.checkups.kpiSnapshot }).from(s.checkups).where(eq(s.checkups.id, id));
  await db
    .update(s.checkups)
    .set({
      status,
      deliveredAt: status === "consegnato" ? new Date() : null,
      // Alla consegna si fissa la fotografia dei KPI (se l'AI non l'ha già fatto)
      ...(status === "consegnato" && !c.kpiSnapshot?.length && { kpiSnapshot: await kpiSnapshot(c.clientId), completedAt: new Date() }),
    })
    .where(eq(s.checkups.id, id));
  revalidatePath(`/clienti/${c.clientId}/checkup`);
}

// ── Idee ─────────────────────────────────────────────────────────────
export async function addIdea(f: FormData) {
  const user = await requireWriter();
  const clientId = int(f, "clientId")!;
  const title = str(f, "title");
  if (!title) return;
  await db.insert(s.ideas).values({
    clientId,
    title,
    body: str(f, "body"),
    format: oneOf(s.FORMATS, str(f, "format")),
    stage: oneOf(s.FUNNEL, str(f, "stage")),
    parentId: int(f, "parentId"),
    createdBy: user.id,
  });
  revalidatePath(`/clienti/${clientId}/idee`);
}

export async function setIdeaStatus(f: FormData) {
  await requireWriter();
  const id = int(f, "ideaId")!;
  const status = oneOf(s.IDEA_STATUSES, str(f, "status"));
  if (!status) return;
  const [idea] = await db.select({ clientId: s.ideas.clientId }).from(s.ideas).where(eq(s.ideas.id, id));
  await db.update(s.ideas).set({ status }).where(eq(s.ideas.id, id));
  revalidatePath(`/clienti/${idea.clientId}/idee`);
}

/** Trascinamento nella bacheca: cambia colonna a un'idea. */
export async function moveIdea(ideaId: number, status: string) {
  await requireWriter();
  const next = oneOf(s.IDEA_STATUSES, status);
  if (!next || next === "pianificata") return;
  const [idea] = await db.select({ clientId: s.ideas.clientId }).from(s.ideas).where(eq(s.ideas.id, ideaId));
  if (!idea) return;
  await db.update(s.ideas).set({ status: next }).where(eq(s.ideas.id, ideaId));
  revalidatePath(`/clienti/${idea.clientId}/idee`);
}

/** Trascinamento nel calendario: nuova data e ora della pubblicazione. */
export async function rescheduleItem(itemId: number, iso: string) {
  await requireWriter();
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return;
  const [item] = await db.select({ clientId: s.editorialItems.clientId, planId: s.editorialItems.planId }).from(s.editorialItems).where(eq(s.editorialItems.id, itemId));
  if (!item) return;
  await db.update(s.editorialItems).set({ scheduledAt: when }).where(eq(s.editorialItems.id, itemId));
  revalidatePath(`/clienti/${item.clientId}/piano`);
}

export async function voteIdea(f: FormData) {
  const user = await requireWriter();
  const ideaId = int(f, "ideaId")!;
  const value = int(f, "value") === -1 ? -1 : 1;
  await db.insert(s.ideaVotes).values({ ideaId, userId: user.id, value }).onDuplicateKeyUpdate({ set: { value } });
  const [idea] = await db.select({ clientId: s.ideas.clientId }).from(s.ideas).where(eq(s.ideas.id, ideaId));
  revalidatePath(`/clienti/${idea.clientId}/idee`);
}

/** Trasforma un'idea in una scheda del piano e apre la scheda. */
export async function planIdea(f: FormData) {
  await requireWriter();
  const ideaId = int(f, "ideaId")!;
  const planId = int(f, "planId");
  const [idea] = await db.select().from(s.ideas).where(eq(s.ideas.id, ideaId));
  if (!idea || !planId) return;
  const [r] = await db.insert(s.editorialItems).values({
    clientId: idea.clientId,
    planId,
    ideaId,
    title: idea.title,
    format: idea.format ?? "post",
    stage: idea.stage,
    personaId: idea.personaId,
    layoutNotes: idea.body,
  });
  await db.update(s.ideas).set({ status: "pianificata" }).where(eq(s.ideas.id, ideaId));
  redirect(`/pubblicazioni/${r.insertId}`);
}

// ── Piano editoriale ─────────────────────────────────────────────────
export async function createPlan(f: FormData) {
  await requireWriter();
  const clientId = int(f, "clientId")!;
  const startsOn = str(f, "startsOn");
  const endsOn = str(f, "endsOn");
  if (!startsOn || !endsOn || endsOn < startsOn) return;
  const formatQuotas: Partial<Record<(typeof s.FORMATS)[number], number>> = {};
  for (const fmt of s.FORMATS) {
    const n = int(f, `quota:${fmt}`);
    if (n) formatQuotas[fmt] = n;
  }
  const [r] = await db.insert(s.editorialPlans).values({
    clientId,
    name: str(f, "name") ?? "Piano editoriale",
    startsOn,
    endsOn,
    minPerWeek: int(f, "minPerWeek") ?? 3,
    formatQuotas,
    platforms: f.getAll("platforms").map(String),
    adsBudget: int(f, "adsBudget"),
    brief: str(f, "brief"),
  });
  redirect(`/clienti/${clientId}/piano?piano=${r.insertId}`);
}

export async function createItem(f: FormData) {
  await requireWriter();
  const planId = int(f, "planId")!;
  const [plan] = await db.select().from(s.editorialPlans).where(eq(s.editorialPlans.id, planId));
  if (!plan) return;
  const [r] = await db.insert(s.editorialItems).values({
    clientId: plan.clientId,
    planId,
    title: str(f, "title") ?? "Nuova pubblicazione",
    format: oneOf(s.FORMATS, str(f, "format")) ?? "reel",
    platform: oneOf(s.PLATFORMS, plan.platforms?.[0] ?? null) ?? "instagram",
    scheduledAt: fromRomeInput(str(f, "scheduledAt")),
  });
  redirect(`/pubblicazioni/${r.insertId}`);
}

export async function saveItem(f: FormData) {
  await requireWriter();
  const id = int(f, "id")!;

  const shotList: s.ShotListEntry[] = [];
  const scene = f.getAll("shot_scena").map(String);
  const desc = f.getAll("shot_descrizione").map(String);
  const dur = f.getAll("shot_durata").map(String);
  const src = f.getAll("shot_fonte").map(String);
  scene.forEach((scena, i) => {
    if (!scena.trim()) return;
    shotList.push({
      scena: scena.trim(),
      descrizione: desc[i]?.trim() || undefined,
      durata_s: Number(dur[i]) || undefined,
      fonte: (["cliente", "golduck", "ai", "stock"].includes(src[i]) ? src[i] : "cliente") as s.ShotListEntry["fonte"],
    });
  });

  const isPaid = f.get("isPaid") === "on";
  await db
    .update(s.editorialItems)
    .set({
      title: str(f, "title") ?? "Senza titolo",
      platform: oneOf(s.PLATFORMS, str(f, "platform")) ?? "instagram",
      crossPost: f.getAll("crossPost").map(String),
      format: oneOf(s.FORMATS, str(f, "format")) ?? "post",
      stage: oneOf(s.FUNNEL, str(f, "stage")),
      seriesId: int(f, "seriesId"),
      personaId: int(f, "personaId"),
      scheduledAt: fromRomeInput(str(f, "scheduledAt")),
      hook: str(f, "hook"),
      layoutNotes: str(f, "layoutNotes"),
      script: str(f, "script"),
      shotList,
      onScreenText: str(f, "onScreenText"),
      audioNotes: str(f, "audioNotes"),
      caption: str(f, "caption"),
      hashtags: str(f, "hashtags"),
      cta: str(f, "cta"),
      ctaDestination: oneOf(s.CTA_DESTINATIONS, str(f, "ctaDestination")),
      ctaUrl: str(f, "ctaUrl"),
      referencesUrls: str(f, "referencesUrls"),
      needsClientMaterial: f.get("needsClientMaterial") === "on",
      productionNotes: str(f, "productionNotes"),
      productionStatus: oneOf(s.PRODUCTION_STATUSES, str(f, "productionStatus")) ?? "da_fare",
      isPaid,
      adObjective: isPaid ? oneOf(s.AD_OBJECTIVES, str(f, "adObjective")) : null,
      adButton: isPaid ? str(f, "adButton") : null,
      adBudget: isPaid ? int(f, "adBudget") : null,
      adDays: isPaid ? int(f, "adDays") : null,
      adAudience: isPaid ? str(f, "adAudience") : null,
      status: oneOf(s.ITEM_STATUSES, str(f, "status")) ?? "bozza",
      internalNotes: str(f, "internalNotes"),
      publishedUrl: str(f, "publishedUrl"),
    })
    .where(eq(s.editorialItems.id, id));
  revalidatePath(`/pubblicazioni/${id}`);
  redirect(`/pubblicazioni/${id}?salvato=1`);
}

export async function deleteItem(f: FormData) {
  await requireWriter();
  const id = int(f, "id")!;
  const [item] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  if (!item) return;
  await db.delete(s.editorialItems).where(and(eq(s.editorialItems.id, id)));
  if (item.ideaId) await db.update(s.ideas).set({ status: "approvata" }).where(eq(s.ideas.id, item.ideaId));
  redirect(`/clienti/${item.clientId}/piano?piano=${item.planId}`);
}
