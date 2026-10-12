"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { brandKits, designReviews, editorialItems } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { BudgetError } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { draftBrandKit, generateBrief, reviewDesign } from "@/lib/ai/designer";
import { BrandKitSchema } from "@/lib/design-types";
import { errorDetail, logError } from "@/lib/error-log";
import { audit, diff } from "@/lib/audit";

// Studio grafico: brand kit, brief grafici e revisioni (Senior Graphic Designer AI).

const NO_AI = { error: "Manca la chiave API di Anthropic: l'AI è spenta (vedi Consumi AI)." };
async function aiError(e: unknown, userId: number, what: string) {
  const error = e instanceof BudgetError ? e.message : `L'AI non ha risposto: ${e instanceof Error ? e.message : "errore"}`;
  await logError({ userId, area: `Studio grafico: ${what}`, message: error, detail: errorDetail(e, { Funzione: what }) });
  return { error };
}
const HEX = /^#[0-9a-f]{6}$/i;

export async function saveBrandKit(f: FormData) {
  const me = await requireWriter();
  const clientId = Number(f.get("clientId"));
  let data;
  try {
    data = BrandKitSchema.parse(JSON.parse(String(f.get("data") ?? "{}")));
  } catch {
    return { error: "Brand kit non valido" };
  }
  data.palette = data.palette.filter((c) => HEX.test(c.hex));
  const logoField = String(f.get("logo") ?? "keep");
  const set: { data: typeof data; updatedBy: number; logo?: string | null; icon?: string | null } = { data, updatedBy: me.id };
  if (logoField === "") {
    set.logo = null;
    set.icon = null;
  } else if (logoField !== "keep") {
    // Il browser ha già rifilato e compresso il logo (lato lungo max 1000 px)
    if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(logoField)) return { error: "Logo: usa PNG, JPG, SVG o WebP" };
    if (logoField.length > 1_400_000) return { error: "Logo troppo pesante anche dopo la compressione: prova con un'immagine più semplice" };
    set.logo = logoField;
    const iconField = String(f.get("icon") ?? "");
    set.icon = /^data:image\/(png|webp);base64,/.test(iconField) && iconField.length < 300_000 ? iconField : null;
  }
  const [kitBefore] = await db.select({ data: brandKits.data }).from(brandKits).where(eq(brandKits.clientId, clientId));
  await db.insert(brandKits).values({ clientId, ...set }).onDuplicateKeyUpdate({ set });
  await audit({ userId: me.id, category: "grafica", action: "brandkit.salvato", description: `Salvato il brand kit${logoField === "" ? " (logo rimosso)" : logoField !== "keep" ? " con un nuovo logo" : ""}`, clientId, meta: diff(kitBefore?.data as Record<string, unknown> | undefined, data as Record<string, unknown>) });
  revalidatePath(`/clienti/${clientId}/brand`);
  return { ok: true };
}

/** Proposta dell'AI: non viene salvata, il consulente la rivede nel modulo. */
export async function proposeBrandKit(clientId: number, logo?: { colors?: { hex: string; share: number }[]; image?: string | null }) {
  const me = await requireWriter();
  if (!isAiConfigured()) return NO_AI;
  // Colori misurati nel browser sul logo attuale (anche se non ancora salvato)
  const colors = (logo?.colors ?? [])
    .filter((c) => HEX.test(c.hex) && Number.isFinite(c.share) && c.share > 0 && c.share <= 1)
    .slice(0, 8);
  const image = logo?.image && /^data:image\/(png|jpeg|webp|gif);base64,/.test(logo.image) && logo.image.length < 1_400_000 ? logo.image : null;
  try {
    return { ok: true, data: await draftBrandKit(clientId, colors, image) };
  } catch (e) {
    return aiError(e, me.id, "brand kit");
  }
}

export async function createBrief(itemId: number, note?: string) {
  const me = await requireWriter();
  if (!isAiConfigured()) return NO_AI;
  try {
    const brief = await generateBrief(itemId, note?.slice(0, 800));
    const [it] = await db.select({ clientId: editorialItems.clientId, title: editorialItems.title }).from(editorialItems).where(eq(editorialItems.id, itemId));
    await audit({ userId: me.id, category: "grafica", action: "brief.generato", description: `Brief grafico generato per «${it?.title ?? itemId}»`, clientId: it?.clientId, target: `pubblicazione:${itemId}` });
    revalidatePath(`/pubblicazioni/${itemId}`);
    return { ok: true, brief };
  } catch (e) {
    return aiError(e, me.id, "brief");
  }
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function reviewUpload(f: FormData) {
  const me = await requireWriter();
  if (!isAiConfigured()) return NO_AI;
  const clientId = Number(f.get("clientId"));
  const itemId = Number(f.get("itemId")) || null;
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Scegli un'immagine" };
  if (!IMAGE_TYPES.includes(file.type)) return { error: "Formato non supportato: PNG, JPG, WebP o GIF (esporta il PDF come immagine)" };
  if (file.size > 5 * 1024 * 1024) return { error: "Immagine troppo pesante: massimo 5 MB" };
  if (itemId) {
    const [it] = await db.select({ id: editorialItems.id }).from(editorialItems).where(and(eq(editorialItems.id, itemId), eq(editorialItems.clientId, clientId)));
    if (!it) return { error: "Pubblicazione non trovata" };
  }
  const thumb = String(f.get("thumb") ?? "");
  try {
    const result = await reviewDesign({ clientId, itemId, mediaType: file.type, base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
    await db.insert(designReviews).values({
      clientId,
      itemId,
      fileName: file.name.slice(0, 200),
      thumb: /^data:image\/(jpeg|png|webp);base64,/.test(thumb) && thumb.length < 200_000 ? thumb : null,
      result,
      createdBy: me.id,
    });
    await audit({ userId: me.id, category: "grafica", action: "revisione.nuova", description: `Revisione grafica AI di «${file.name.slice(0, 120)}»`, clientId, target: itemId ? `pubblicazione:${itemId}` : null });
    revalidatePath(`/clienti/${clientId}/brand`);
    if (itemId) revalidatePath(`/pubblicazioni/${itemId}`);
    return { ok: true, result };
  } catch (e) {
    return aiError(e, me.id, "revisione");
  }
}

export async function deleteReview(id: number) {
  const me = await requireWriter();
  const [r] = await db.select({ clientId: designReviews.clientId, itemId: designReviews.itemId }).from(designReviews).where(eq(designReviews.id, id));
  if (!r) return;
  await db.delete(designReviews).where(eq(designReviews.id, id));
  await audit({ userId: me.id, category: "grafica", action: "revisione.eliminata", description: "Eliminata una revisione grafica", clientId: r.clientId });
  revalidatePath(`/clienti/${r.clientId}/brand`);
  if (r.itemId) revalidatePath(`/pubblicazioni/${r.itemId}`);
}
