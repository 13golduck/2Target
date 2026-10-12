"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { CHANNEL_KINDS, clients, connections, socialAccounts } from "@/db/schema";
import { requireWriter, userCanPublish } from "@/lib/auth";
import { siteKey } from "@/lib/integrations/client-channels";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import * as google from "@/lib/integrations/google";
import * as meta from "@/lib/integrations/meta";
import { syncChannel, syncClient, updateKpisFromData } from "@/lib/integrations/sync";
import { audit } from "@/lib/audit";

const path = (clientId: number) => `/clienti/${clientId}/canali`;

/** Canali disponibili per un collegamento (letti dalla piattaforma, senza token verso il browser). */
export async function assetsFor(connectionId: number) {
  await requireWriter();
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) return { conn: null, assets: [] as { key: string; kind: string; handle: string; name: string; pictureUrl?: string }[] };
  const token = decryptSecret(conn.accessTokenEnc)!;
  const raw = conn.provider === "meta" ? await meta.listAssets(token) : await google.listAssets(token);
  return {
    conn,
    assets: raw.map((a) => ({ key: `${a.kind}|${a.externalId}`, kind: a.kind, handle: a.handle, name: a.name, pictureUrl: "pictureUrl" in a ? a.pictureUrl : undefined })),
  };
}

export async function attachChannels(f: FormData) {
  const me = await requireWriter();
  if (!(await userCanPublish(me))) throw new Error("Solo gli amministratori e chi è abilitato a pubblicare possono collegare profili ai clienti");
  const connectionId = Number(f.get("connectionId"));
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) return;
  const chosen = new Set(f.getAll("asset").map(String));
  const token = decryptSecret(conn.accessTokenEnc)!;

  const ids: number[] = [];
  const refused: string[] = [];
  // Un profilo appartiene a un solo cliente: se è già di un altro cliente non si collega
  const owner = async (kind: string, externalId: string) => {
    const [o] = await db
      .select({ clientId: socialAccounts.clientId, name: clients.name })
      .from(socialAccounts)
      .innerJoin(clients, eq(clients.id, socialAccounts.clientId))
      .where(and(eq(socialAccounts.platform, kind as (typeof CHANNEL_KINDS)[number]), eq(socialAccounts.externalId, externalId)));
    return o && o.clientId !== conn.clientId ? o.name : null;
  };
  if (conn.provider === "meta") {
    for (const a of await meta.listAssets(token)) {
      if (!chosen.has(`${a.kind}|${a.externalId}`)) continue;
      const other = await owner(a.kind, a.externalId);
      if (other) refused.push(`@${a.handle} è già collegato al cliente ${other}`);
      else ids.push(await upsertChannel(conn.clientId, conn.id, a.kind, a.externalId, a.handle, a.name, a.pictureUrl, encryptSecret(a.pageToken)));
    }
  } else {
    for (const a of await google.listAssets(token)) {
      if (!chosen.has(`${a.kind}|${a.externalId}`)) continue;
      const other = await owner(a.kind, a.externalId);
      if (other) refused.push(`${a.handle} è già collegato al cliente ${other}`);
      else ids.push(await upsertChannel(conn.clientId, conn.id, a.kind, a.externalId, a.handle, a.name, undefined, null));
    }
  }

  // Prima sincronizzazione subito, così i dati compaiono senza aspettare la notte
  for (const id of ids) {
    const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    await syncChannel(ch).catch(() => undefined);
  }
  await updateKpisFromData(conn.clientId);
  await audit({
    userId: me.id,
    category: "canali",
    action: "canali.collegati",
    description: `Collegati ${ids.length} canali da ${conn.provider === "meta" ? "Meta" : "Google"} (${conn.accountName})${refused.length ? ` · ${refused.length} rifiutati perché di un altro cliente` : ""}`,
    clientId: conn.clientId,
    meta: refused.length ? { rifiutati: refused } : null,
  });
  if (refused.length) redirect(`${path(conn.clientId)}?errore=${encodeURIComponent(`Non collegati: ${refused.join("; ")}. Un profilo può appartenere a un solo cliente.`)}`);
  redirect(path(conn.clientId));
}

async function upsertChannel(clientId: number, connectionId: number, kind: string, externalId: string, handle: string, name: string, pictureUrl: string | undefined, assetTokenEnc: string | null) {
  const platform = kind as (typeof CHANNEL_KINDS)[number];
  const [existing] = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, clientId), eq(socialAccounts.platform, platform), eq(socialAccounts.externalId, externalId)));
  const data = { connectionId, handle, name, pictureUrl: pictureUrl ?? null, assetTokenEnc, connected: true, lastSyncError: null };
  if (existing) {
    await db.update(socialAccounts).set(data).where(eq(socialAccounts.id, existing.id));
    return existing.id;
  }
  // Un canale inserito a mano con lo stesso nome viene "promosso" a collegato
  const [manual] = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, clientId), eq(socialAccounts.platform, platform), eq(socialAccounts.handle, handle)));
  if (manual) {
    await db.update(socialAccounts).set({ ...data, externalId }).where(eq(socialAccounts.id, manual.id));
    return manual.id;
  }
  const [r] = await db.insert(socialAccounts).values({ clientId, platform, externalId, ...data });
  return r.insertId;
}

export async function syncChannelNow(f: FormData) {
  const me = await requireWriter();
  const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, Number(f.get("channelId"))));
  if (!ch) return { error: "Canale non trovato" };
  await audit({ userId: me.id, category: "canali", action: "canale.sincronizza", description: `Aggiornati a mano i dati del canale ${ch.platform} «${ch.name ?? ch.handle}»`, clientId: ch.clientId });
  try {
    await syncChannel(ch);
    await updateKpisFromData(ch.clientId);
    revalidatePath(path(ch.clientId));
    return { ok: true };
  } catch (e) {
    revalidatePath(path(ch.clientId));
    return { error: (e as Error).message };
  }
}

export async function syncClientNow(f: FormData) {
  const me = await requireWriter();
  const clientId = Number(f.get("clientId"));
  const errors = await syncClient(clientId);
  await audit({ userId: me.id, category: "canali", action: "canali.sincronizza", description: `Aggiornati a mano i dati di tutti i canali${errors.length ? ` (${errors.length} con errori)` : ""}`, clientId, meta: errors.length ? { errori: errors } : null });
  revalidatePath(path(clientId));
  return { errors };
}

export async function removeChannel(f: FormData) {
  const me = await requireWriter();
  const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, Number(f.get("channelId"))));
  if (!ch) return;
  await db.delete(socialAccounts).where(eq(socialAccounts.id, ch.id));
  await audit({ userId: me.id, category: "canali", action: "canale.rimosso", description: `Rimosso il canale ${ch.platform} «${ch.name ?? ch.handle}»`, clientId: ch.clientId });
  revalidatePath(path(ch.clientId));
}

export async function removeConnection(f: FormData) {
  const me = await requireWriter();
  const [conn] = await db.select().from(connections).where(eq(connections.id, Number(f.get("connectionId"))));
  if (!conn) return;
  // I canali restano (con i dati storici) ma risultano scollegati
  await db.update(socialAccounts).set({ connected: false, assetTokenEnc: null }).where(eq(socialAccounts.connectionId, conn.id));
  await db.delete(connections).where(eq(connections.id, conn.id));
  await audit({ userId: me.id, category: "canali", action: "collegamento.rimosso", description: `Scollegato l'account ${conn.provider === "meta" ? "Meta" : "Google"} «${conn.accountName}»`, clientId: conn.clientId });
  revalidatePath(path(conn.clientId));
}

export async function addManualChannel(f: FormData) {
  const me = await requireWriter();
  const clientId = Number(f.get("clientId"));
  const platform = String(f.get("platform")) as (typeof CHANNEL_KINDS)[number];
  let handle = String(f.get("handle") ?? "").trim();
  if (!CHANNEL_KINDS.includes(platform) || !handle) return { error: "Dati mancanti" };
  if (platform === "website") {
    if (!/^https?:\/\//i.test(handle)) handle = `https://${handle}`;
    try {
      new URL(handle);
    } catch {
      return { error: "Indirizzo del sito non valido" };
    }
  } else {
    handle = handle.replace(/^@/, "");
  }
  if (platform === "website") {
    const sites = await db.select({ handle: socialAccounts.handle }).from(socialAccounts).where(and(eq(socialAccounts.clientId, clientId), eq(socialAccounts.platform, "website")));
    const twin = sites.find((x) => siteKey(x.handle) === siteKey(handle));
    if (twin) return { error: `Il sito è già presente come ${twin.handle}` };
  }
  const [r] = await db
    .insert(socialAccounts)
    .values({ clientId, platform, handle, name: handle })
    .onDuplicateKeyUpdate({ set: { name: handle } });
  await audit({ userId: me.id, category: "canali", action: "canale.manuale", description: `Aggiunto a mano il canale ${platform} «${handle}»`, clientId });
  if (platform === "website") {
    const [ch] = await db.select().from(socialAccounts).where(r.insertId ? eq(socialAccounts.id, r.insertId) : and(eq(socialAccounts.clientId, clientId), eq(socialAccounts.platform, "website"), eq(socialAccounts.handle, handle)));
    try {
      await syncChannel(ch);
    } catch (e) {
      revalidatePath(path(clientId));
      return { error: `Sito aggiunto, ma l'analisi PageSpeed non è riuscita: ${(e as Error).message}` };
    }
  }
  revalidatePath(path(clientId));
  return { ok: true };
}
