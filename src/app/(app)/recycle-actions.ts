"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { editorialItems, editorialPlans } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { copyItemForRecycle } from "@/lib/recycle-data";

// Riciclo dei contenuti: una scheda già uscita si ripropone come copia in bozza in un piano dello stesso cliente.

const Input = z.object({ itemId: z.number().int().positive(), planId: z.number().int().positive() });

export async function recycleItem(input: z.infer<typeof Input>) {
  const me = await requireWriter();
  const p = Input.safeParse(input);
  if (!p.success) return { error: "Dati non validi" };
  const [item] = await db.select({ clientId: editorialItems.clientId, title: editorialItems.title }).from(editorialItems).where(eq(editorialItems.id, p.data.itemId));
  const [plan] = await db.select({ clientId: editorialPlans.clientId }).from(editorialPlans).where(eq(editorialPlans.id, p.data.planId));
  if (!item || !plan) return { error: "Scheda o piano non trovati" };
  // La copia resta nello stesso cliente: mai una scheda di un cliente nel piano di un altro
  if (item.clientId !== plan.clientId) return { error: "La scheda appartiene a un altro cliente" };
  await requireClientAccess(item.clientId);
  try {
    const r = await copyItemForRecycle(p.data.itemId, p.data.planId, me.id);
    await audit({
      userId: me.id,
      category: "contenuti",
      action: "pubblicazione.riproposta",
      description: `Riproposta la scheda «${item.title}» come nuova bozza${r.media ? ` (con ${r.media} file)` : ""}`,
      clientId: item.clientId,
      target: `pubblicazione:${r.id}`,
      meta: { originale: p.data.itemId },
    });
    revalidatePath(`/clienti/${item.clientId}/piano`);
    return { ok: true, id: r.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Copia non riuscita" };
  }
}
