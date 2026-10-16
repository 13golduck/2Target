"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import * as s from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { fromRomeInput, parseMetricInput } from "@/lib/format";
import { METRIC_BY_KEY } from "@/lib/kpi-catalog";
import { kpiSnapshot } from "@/lib/queries";
import { audit, diff } from "@/lib/audit";
import { ensureChannelsFromClient } from "@/lib/integrations/client-channels";
import { syncPendingPublications } from "@/lib/publishing/sync";
import { isAiConfigured } from "@/lib/ai/claude";
import { startFoundation } from "@/lib/ai/foundation-agent";

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
  const me = await requireWriter();
  const name = str(f, "name");
  if (!name) return;
  let website = str(f, "website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const [r] = await db.insert(s.clients).values({ name, sector: str(f, "sector"), website, vatNumber: str(f, "vatNumber"), city: str(f, "city"), status: "onboarding" });
  await audit({ userId: me.id, category: "clienti", action: "cliente.nuovo", description: `Creato il cliente «${name}»`, clientId: r.insertId, target: `cliente:${r.insertId}` });
  await ensureChannelsFromClient(r.insertId, me.id).catch(() => undefined);
  // Il lavoro con un nuovo cliente parte dal check-up
  redirect(`/clienti/${r.insertId}/checkup`);
}

// ── KPI ──────────────────────────────────────────────────────────────
export async function addKpi(f: FormData) {
  const me = await requireWriter();
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
  await audit({ userId: me.id, category: "clienti", action: "kpi.nuovo", description: `Aggiunto il KPI «${str(f, "label") ?? metric.label}» (obiettivo ${target})`, clientId });
  revalidatePath(`/clienti/${clientId}`, "layout");
}

export async function addMeasurement(f: FormData) {
  const me = await requireWriter();
  const kpiId = int(f, "kpiId")!;
  const [kpi] = await db.select().from(s.kpis).where(eq(s.kpis.id, kpiId));
  if (!kpi) return;
  const value = parseMetricInput(f.get("value"), METRIC_BY_KEY[kpi.metricKey]?.unit ?? "n");
  const periodStart = str(f, "periodStart");
  const periodEnd = str(f, "periodEnd");
  if (value == null || !periodStart || !periodEnd) return;
  await db.insert(s.kpiMeasurements).values({ kpiId, value, periodStart, periodEnd, sample: int(f, "sample") });
  await audit({ userId: me.id, category: "clienti", action: "kpi.misura", description: `Inserita la misura ${value} per «${kpi.label}» (${periodStart} → ${periodEnd})`, clientId: kpi.clientId, target: `kpi:${kpiId}` });
  revalidatePath(`/clienti/${kpi.clientId}`, "layout");
}

export async function deleteKpi(f: FormData) {
  const me = await requireWriter();
  const id = int(f, "kpiId")!;
  const [kpi] = await db.select().from(s.kpis).where(eq(s.kpis.id, id));
  if (!kpi) return;
  await db.update(s.kpis).set({ active: false }).where(eq(s.kpis.id, id));
  await audit({ userId: me.id, category: "clienti", action: "kpi.rimosso", description: `Rimosso il KPI «${kpi.label}»`, clientId: kpi.clientId, target: `kpi:${id}` });
  revalidatePath(`/clienti/${kpi.clientId}`, "layout");
}

// ── Check-up ─────────────────────────────────────────────────────────
export async function createCheckup(f: FormData) {
  const me = await requireWriter();
  const clientId = int(f, "clientId")!;
  const [prev] = await db.select({ id: s.checkups.id }).from(s.checkups).where(eq(s.checkups.clientId, clientId)).orderBy(desc(s.checkups.id)).limit(1);
  const month = new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" }).replace(/^./, (c) => c.toUpperCase());
  const [nc] = await db.insert(s.checkups).values({ clientId, period: str(f, "period") ?? month, previousId: prev?.id ?? null });
  await audit({ userId: me.id, category: "checkup", action: "checkup.nuovo_manuale", description: `Creato un check-up manuale (${str(f, "period") ?? month})`, clientId, target: `checkup:${nc.insertId}` });
  redirect(`/clienti/${clientId}/checkup`);
}

export async function saveCheckupSection(f: FormData) {
  const me = await requireWriter();
  const checkupId = int(f, "checkupId")!;
  const [chk] = await db.select({ status: s.checkups.status }).from(s.checkups).where(eq(s.checkups.id, checkupId));
  // Un check-up consegnato fa parte dello storico: si modifica solo dopo averlo riaperto
  if (chk?.status === "consegnato") return;
  const sectionKey = String(f.get("sectionKey"));
  const content: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("field:")) content[k.slice(6)] = String(v);
  await db.insert(s.checkupSections).values({ checkupId, sectionKey, content }).onDuplicateKeyUpdate({ set: { content } });
  const [c] = await db.select({ clientId: s.checkups.clientId }).from(s.checkups).where(eq(s.checkups.id, checkupId));
  await audit({ userId: me.id, category: "checkup", action: "checkup.sezione", description: `Modificata a mano la sezione «${sectionKey}» del check-up`, clientId: c.clientId, target: `checkup:${checkupId}` });
  revalidatePath(`/clienti/${c.clientId}/checkup`);
}

export async function setCheckupStatus(f: FormData) {
  const me = await requireWriter();
  const id = int(f, "checkupId")!;
  const status = oneOf(["bozza", "in_revisione", "consegnato"] as const, str(f, "status"));
  if (!status) return;
  const [c] = await db.select({ clientId: s.checkups.clientId, kpiSnapshot: s.checkups.kpiSnapshot, foundationState: s.checkups.foundationState }).from(s.checkups).where(eq(s.checkups.id, id));
  await db
    .update(s.checkups)
    .set({
      status,
      deliveredAt: status === "consegnato" ? new Date() : null,
      // Alla consegna si fissa la fotografia dei KPI (se l'AI non l'ha già fatto)
      ...(status === "consegnato" && !c.kpiSnapshot?.length && { kpiSnapshot: await kpiSnapshot(c.clientId), completedAt: new Date() }),
    })
    .where(eq(s.checkups.id, id));
  const STATUS_LABEL = { bozza: "Bozza", in_revisione: "In revisione", consegnato: "Consegnato" };
  await audit({ userId: me.id, category: "checkup", action: "checkup.stato", description: `Check-up portato a «${STATUS_LABEL[status]}»`, clientId: c.clientId, target: `checkup:${id}` });
  // Alla consegna il check-up prepara la base delle altre sezioni (una volta sola: poi si rifà a mano)
  if (status === "consegnato" && c.foundationState === "nessuna" && isAiConfigured()) await startFoundation(id, me.id);
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
  await audit({ userId: user.id, category: "contenuti", action: "idea.nuova", description: `Nuova idea «${title}»`, clientId });
  revalidatePath(`/clienti/${clientId}/idee`);
}

export async function setIdeaStatus(f: FormData) {
  const me = await requireWriter();
  const id = int(f, "ideaId")!;
  const status = oneOf(s.IDEA_STATUSES, str(f, "status"));
  if (!status) return;
  const [idea] = await db.select({ clientId: s.ideas.clientId, title: s.ideas.title }).from(s.ideas).where(eq(s.ideas.id, id));
  await db.update(s.ideas).set({ status }).where(eq(s.ideas.id, id));
  await audit({ userId: me.id, category: "contenuti", action: "idea.stato", description: `Idea «${idea.title}» → ${status}`, clientId: idea.clientId, target: `idea:${id}` });
  revalidatePath(`/clienti/${idea.clientId}/idee`);
}

/** Trascinamento nella bacheca: cambia colonna a un'idea. */
export async function moveIdea(ideaId: number, status: string) {
  const me = await requireWriter();
  const next = oneOf(s.IDEA_STATUSES, status);
  if (!next || next === "pianificata") return;
  const [idea] = await db.select({ clientId: s.ideas.clientId, title: s.ideas.title }).from(s.ideas).where(eq(s.ideas.id, ideaId));
  if (!idea) return;
  await db.update(s.ideas).set({ status: next }).where(eq(s.ideas.id, ideaId));
  await audit({ userId: me.id, category: "contenuti", action: "idea.stato", description: `Idea «${idea.title}» spostata in ${next}`, clientId: idea.clientId, target: `idea:${ideaId}` });
  revalidatePath(`/clienti/${idea.clientId}/idee`);
}

/** Trascinamento nel calendario: nuova data e ora della pubblicazione. */
export async function rescheduleItem(itemId: number, iso: string) {
  const me = await requireWriter();
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return;
  const [item] = await db.select({ clientId: s.editorialItems.clientId, planId: s.editorialItems.planId, title: s.editorialItems.title, scheduledAt: s.editorialItems.scheduledAt }).from(s.editorialItems).where(eq(s.editorialItems.id, itemId));
  if (!item) return;
  await db.update(s.editorialItems).set({ scheduledAt: when }).where(eq(s.editorialItems.id, itemId));
  await syncPendingPublications(itemId, me.id);
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.data", description: `Spostata la pubblicazione «${item.title}» nel calendario`, clientId: item.clientId, target: `pubblicazione:${itemId}`, meta: { prima: item.scheduledAt?.toISOString() ?? null, dopo: when.toISOString() } });
  revalidatePath(`/clienti/${item.clientId}/piano`);
}

export async function voteIdea(f: FormData) {
  const user = await requireWriter();
  const ideaId = int(f, "ideaId")!;
  const value = int(f, "value") === -1 ? -1 : 1;
  await db.insert(s.ideaVotes).values({ ideaId, userId: user.id, value }).onDuplicateKeyUpdate({ set: { value } });
  const [idea] = await db.select({ clientId: s.ideas.clientId, title: s.ideas.title }).from(s.ideas).where(eq(s.ideas.id, ideaId));
  await audit({ userId: user.id, category: "contenuti", action: "idea.voto", description: `Voto ${value > 0 ? "positivo" : "negativo"} all'idea «${idea.title}»`, clientId: idea.clientId, target: `idea:${ideaId}` });
  revalidatePath(`/clienti/${idea.clientId}/idee`);
}

/** Trasforma un'idea in una scheda del piano e apre la scheda. */
export async function planIdea(f: FormData) {
  const me = await requireWriter();
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
  await audit({ userId: me.id, category: "contenuti", action: "idea.pianificata", description: `Idea «${idea.title}» trasformata in pubblicazione`, clientId: idea.clientId, target: `pubblicazione:${r.insertId}` });
  redirect(`/pubblicazioni/${r.insertId}`);
}

// ── Piano editoriale ─────────────────────────────────────────────────
export async function createPlan(f: FormData) {
  const me = await requireWriter();
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
  await audit({ userId: me.id, category: "contenuti", action: "piano.nuovo", description: `Nuovo piano editoriale «${str(f, "name") ?? "Piano editoriale"}» (${startsOn} → ${endsOn})`, clientId, target: `piano:${r.insertId}` });
  redirect(`/clienti/${clientId}/piano?piano=${r.insertId}`);
}

export async function createItem(f: FormData) {
  const me = await requireWriter();
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
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.nuova", description: `Nuova pubblicazione «${str(f, "title") ?? "Nuova pubblicazione"}»`, clientId: plan.clientId, target: `pubblicazione:${r.insertId}` });
  redirect(`/pubblicazioni/${r.insertId}`);
}

const ITEM_LABELS: Record<string, string> = {
  title: "Titolo", platform: "Piattaforma", crossPost: "Pubblica anche su", format: "Formato", stage: "Fase del funnel", seriesId: "Rubrica",
  personaId: "Buyer persona", scheduledAt: "Data di pubblicazione", hook: "Gancio", layoutNotes: "Layout", script: "Script", shotList: "Scene",
  onScreenText: "Testo a schermo", audioNotes: "Audio", caption: "Didascalia", hashtags: "Hashtag", cta: "CTA", ctaDestination: "Destinazione CTA",
  ctaUrl: "Link CTA", referencesUrls: "Riferimenti", needsClientMaterial: "Serve materiale del cliente", productionNotes: "Note di produzione",
  productionStatus: "Stato produzione", isPaid: "Sponsorizzata", adObjective: "Obiettivo inserzione", adButton: "Pulsante inserzione", adBudget: "Budget",
  adDays: "Giorni", adAudience: "Pubblico", status: "Stato", internalNotes: "Note interne", publishedUrl: "Link pubblicato",
};

export async function saveItem(f: FormData) {
  const me = await requireWriter();
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
  const [before] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  const newStatus = oneOf(s.ITEM_STATUSES, str(f, "status")) ?? "bozza";
  const values = {
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
    status: newStatus,
    internalNotes: str(f, "internalNotes"),
    publishedUrl: str(f, "publishedUrl"),
  };
  await db.update(s.editorialItems).set(values).where(eq(s.editorialItems.id, id));
  await syncPendingPublications(id, me.id);
  await audit({
    userId: me.id,
    category: "contenuti",
    action: before && before.status !== newStatus ? "pubblicazione.stato" : "pubblicazione.modifica",
    description: before && before.status !== newStatus ? `Pubblicazione «${str(f, "title") ?? "Senza titolo"}»: stato ${before.status} → ${newStatus}` : `Modificata la pubblicazione «${str(f, "title") ?? "Senza titolo"}»`,
    clientId: before?.clientId,
    target: `pubblicazione:${id}`,
    meta: diff(before, values, ITEM_LABELS),
  });
  revalidatePath(`/pubblicazioni/${id}`);
  redirect(`/pubblicazioni/${id}?salvato=1`);
}

export async function deleteItem(f: FormData) {
  const me = await requireWriter();
  const id = int(f, "id")!;
  const [item] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  if (!item) return;
  await db.delete(s.editorialItems).where(and(eq(s.editorialItems.id, id)));
  if (item.ideaId) await db.update(s.ideas).set({ status: "approvata" }).where(eq(s.ideas.id, item.ideaId));
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.eliminata", description: `Eliminata la pubblicazione «${item.title}»`, clientId: item.clientId, target: `pubblicazione:${id}` });
  redirect(`/clienti/${item.clientId}/piano?piano=${item.planId}`);
}
