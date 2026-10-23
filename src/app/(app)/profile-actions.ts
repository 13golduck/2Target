"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { PROFILE_PLATFORMS, profileSetups, socialAccounts } from "@/db/schema";
import { draftProfileKit } from "@/lib/ai/profile-kit";
import { BudgetError } from "@/lib/ai/budget";
import { isAiConfigured } from "@/lib/ai/claude";
import { audit } from "@/lib/audit";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { facebookHealth, FB_FIXABLE, instagramHealth, updateFacebookPage } from "@/lib/integrations/profile-health";
import { decryptSecret } from "@/lib/secret-box";

// Profili social: controllo di completezza, correzioni (dove Meta lo consente) e kit di creazione con l'AI.

const path = (clientId: number) => `/clienti/${clientId}/profili`;
type Platform = (typeof PROFILE_PLATFORMS)[number];

async function upsert(clientId: number, platform: Platform, set: Partial<typeof profileSetups.$inferInsert>, userId: number) {
  await db
    .insert(profileSetups)
    .values({ clientId, platform, ...set, updatedBy: userId })
    .onDuplicateKeyUpdate({ set: { ...set, updatedBy: userId } });
}

/** Legge da Meta i profili Facebook e Instagram collegati e ne misura la completezza. */
export async function checkProfiles(clientId: number) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  const errors: string[] = [];
  let checked = 0;
  for (const c of channels.filter((x) => (x.platform === "facebook" || x.platform === "instagram") && x.connected && x.externalId)) {
    const token = decryptSecret(c.assetTokenEnc);
    if (!token || c.externalId!.startsWith("simulazione")) {
      errors.push(`${c.name ?? c.handle}: profilo di prova, niente da leggere su Meta`);
      continue;
    }
    try {
      const health = c.platform === "facebook" ? await facebookHealth(c.externalId!, token) : await instagramHealth(c.externalId!, token);
      await upsert(clientId, c.platform as Platform, { health }, me.id);
      checked++;
    } catch (e) {
      errors.push(`${c.name ?? c.handle}: ${(e as Error).message}`);
    }
  }
  revalidatePath(path(clientId));
  return { checked, errors };
}

const Fix = z.object({ channelId: z.number().int().positive(), field: z.enum(FB_FIXABLE), value: z.string().trim().max(1000) });

/** Corregge un campo della Pagina Facebook (descrizione, sito, telefono, email). */
export async function fixFacebookField(input: z.infer<typeof Fix>) {
  const me = await requireWriter();
  const p = Fix.safeParse(input);
  if (!p.success) return { error: "Valore non valido" };
  const [c] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, p.data.channelId), eq(socialAccounts.platform, "facebook")));
  if (!c?.externalId) return { error: "Pagina non trovata" };
  await requireClientAccess(c.clientId);
  const token = decryptSecret(c.assetTokenEnc);
  if (!token) return { error: "Pagina non collegata: ricollega Meta" };
  try {
    await updateFacebookPage(c.externalId, token, { [p.data.field]: p.data.value });
  } catch (e) {
    return { error: (e as Error).message };
  }
  await audit({ userId: me.id, category: "canali", action: "profilo.modifica", description: `Aggiornato «${p.data.field}» della Pagina Facebook «${c.name ?? c.handle}»`, clientId: c.clientId, meta: { valore: p.data.value.slice(0, 300) } });
  const health = await facebookHealth(c.externalId, token).catch(() => null);
  if (health) await upsert(c.clientId, "facebook", { health }, me.id);
  revalidatePath(path(c.clientId));
  return { ok: true };
}

/** Prepara con l'AI i testi del profilo (nome, username, bio, descrizione, pulsante, primi post). */
export async function prepareProfileKit(clientId: number, platform: Platform) {
  const me = await requireWriter();
  await requireClientAccess(clientId);
  if (!isAiConfigured()) return { error: "Manca la chiave API di Anthropic: inseriscila in Impostazioni → Integrazioni" };
  const [row] = await db.select().from(profileSetups).where(and(eq(profileSetups.clientId, clientId), eq(profileSetups.platform, platform)));
  const current = row?.health?.items
    .filter((i) => i.value)
    .map((i) => `${i.label}: ${i.value}`)
    .join("\n");
  try {
    const kit = await draftProfileKit(clientId, platform, current || undefined);
    await upsert(clientId, platform, { kit }, me.id);
    await audit({ userId: me.id, category: "canali", action: "profilo.kit", description: `Preparato con l'AI il kit del profilo ${platform}`, clientId });
    revalidatePath(path(clientId));
    return { ok: true, kit };
  } catch (e) {
    return { error: e instanceof BudgetError ? e.message : `AI: ${(e as Error).message}` };
  }
}

const Save = z.object({ clientId: z.number().int().positive(), platform: z.enum(PROFILE_PLATFORMS), kit: z.record(z.string(), z.unknown()).optional(), steps: z.record(z.string(), z.boolean()).optional() });

/** Salva testi modificati a mano e passi spuntati della procedura. */
export async function saveProfileSetup(input: z.infer<typeof Save>) {
  const me = await requireWriter();
  const p = Save.safeParse(input);
  if (!p.success) return { error: "Dati non validi" };
  await requireClientAccess(p.data.clientId);
  await upsert(p.data.clientId, p.data.platform, { ...(p.data.kit && { kit: p.data.kit }), ...(p.data.steps && { steps: p.data.steps }) }, me.id);
  revalidatePath(path(p.data.clientId));
  return { ok: true };
}
