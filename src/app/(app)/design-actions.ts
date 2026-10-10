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

// Studio grafico: brand kit, brief grafici e revisioni (Senior Graphic Designer AI).

const NO_AI = { error: "Manca la chiave API di Anthropic: l'AI è spenta (vedi Consumi AI)." };
const aiError = (e: unknown) => ({ error: e instanceof BudgetError ? e.message : `L'AI non ha risposto: ${e instanceof Error ? e.message : "errore"}` });
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
  const set: { data: typeof data; updatedBy: number; logo?: string | null } = { data, updatedBy: me.id };
  if (logoField === "") set.logo = null;
  else if (logoField !== "keep") {
    if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(logoField)) return { error: "Logo: usa PNG, JPG, SVG o WebP" };
    if (logoField.length > 450_000) return { error: "Logo troppo pesante: massimo circa 300 KB" };
    set.logo = logoField;
  }
  await db.insert(brandKits).values({ clientId, ...set }).onDuplicateKeyUpdate({ set });
  revalidatePath(`/clienti/${clientId}/brand`);
  return { ok: true };
}

/** Proposta dell'AI: non viene salvata, il consulente la rivede nel modulo. */
export async function proposeBrandKit(clientId: number) {
  await requireWriter();
  if (!isAiConfigured()) return NO_AI;
  try {
    return { ok: true, data: await draftBrandKit(clientId) };
  } catch (e) {
    return aiError(e);
  }
}

export async function createBrief(itemId: number, note?: string) {
  await requireWriter();
  if (!isAiConfigured()) return NO_AI;
  try {
    const brief = await generateBrief(itemId, note?.slice(0, 800));
    revalidatePath(`/pubblicazioni/${itemId}`);
    return { ok: true, brief };
  } catch (e) {
    return aiError(e);
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
    revalidatePath(`/clienti/${clientId}/brand`);
    if (itemId) revalidatePath(`/pubblicazioni/${itemId}`);
    return { ok: true, result };
  } catch (e) {
    return aiError(e);
  }
}

export async function deleteReview(id: number) {
  await requireWriter();
  const [r] = await db.select({ clientId: designReviews.clientId, itemId: designReviews.itemId }).from(designReviews).where(eq(designReviews.id, id));
  if (!r) return;
  await db.delete(designReviews).where(eq(designReviews.id, id));
  revalidatePath(`/clienti/${r.clientId}/brand`);
  if (r.itemId) revalidatePath(`/pubblicazioni/${r.itemId}`);
}
