"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { competitors } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { normalizeInstagram } from "@/lib/competitors";
import { LENS_EXPIRED_MESSAGE, refreshCompetitorSnapshots } from "@/lib/competitors-data";

// Concorrenti del cliente: aggiunta, profilo Instagram da seguire, rimozione e lettura immediata.

const path = (clientId: number) => `/clienti/${clientId}/concorrenti`;

const Save = z.object({
  clientId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Scrivi il nome del concorrente").max(160),
  instagram: z.string().trim().max(200).optional(),
});

/** Crea o aggiorna un concorrente; il profilo Instagram si accetta come @nome, link o nome. */
export async function saveCompetitor(input: z.infer<typeof Save>) {
  const me = await requireWriter();
  const p = Save.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dati non validi" };
  await requireClientAccess(p.data.clientId);
  const instagram = p.data.instagram ? normalizeInstagram(p.data.instagram) : null;
  if (p.data.instagram && !instagram) return { error: "Profilo Instagram non valido: scrivi @nome o incolla il link del profilo" };

  let id = p.data.id;
  if (id) {
    const [c] = await db.select().from(competitors).where(eq(competitors.id, id));
    // Il concorrente deve essere di questo cliente: l'id arriva dal browser
    if (!c || c.clientId !== p.data.clientId) return { error: "Concorrente non trovato" };
    await db.update(competitors).set({ name: p.data.name, socialHandles: { ...(c.socialHandles ?? {}), instagram: instagram ?? undefined } }).where(eq(competitors.id, id));
  } else {
    const [r] = await db.insert(competitors).values({ clientId: p.data.clientId, name: p.data.name, socialHandles: instagram ? { instagram } : {} });
    id = r.insertId;
  }
  await audit({ userId: me.id, category: "clienti", action: p.data.id ? "concorrente.modificato" : "concorrente.aggiunto", description: `${p.data.id ? "Modificato" : "Aggiunto"} il concorrente «${p.data.name}»${instagram ? ` (@${instagram})` : ""}`, clientId: p.data.clientId, target: `concorrente:${id}` });
  // Prima lettura subito, così i numeri compaiono senza aspettare la notte
  const read = instagram ? await refreshCompetitorSnapshots(p.data.clientId) : { errors: [] as string[] };
  revalidatePath(path(p.data.clientId));
  return { ok: true, warning: read.errors.find((e) => instagram && e.includes(`@${instagram}`)) ?? read.errors.find((e) => e.startsWith("Per leggere") || e === LENS_EXPIRED_MESSAGE) };
}

export async function removeCompetitor(id: number) {
  const me = await requireWriter();
  const [c] = await db.select().from(competitors).where(eq(competitors.id, id));
  if (!c) return { error: "Concorrente non trovato" };
  await requireClientAccess(c.clientId);
  await db.delete(competitors).where(eq(competitors.id, id));
  await audit({ userId: me.id, category: "clienti", action: "concorrente.rimosso", description: `Rimosso il concorrente «${c.name}»`, clientId: c.clientId });
  revalidatePath(path(c.clientId));
  return { ok: true };
}

/** Rilegge adesso tutti i concorrenti del cliente (anche quelli già letti oggi). */
export async function refreshCompetitorsNow(clientId: number) {
  await requireWriter();
  await requireClientAccess(clientId);
  const r = await refreshCompetitorSnapshots(clientId, { force: true });
  revalidatePath(path(clientId));
  return { ok: true, done: r.done, errors: r.errors };
}
