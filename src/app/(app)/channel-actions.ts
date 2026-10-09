"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { CHANNEL_KINDS, connections, socialAccounts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import * as google from "@/lib/integrations/google";
import * as meta from "@/lib/integrations/meta";
import { syncChannel, syncClient, updateKpisFromData } from "@/lib/integrations/sync";

const path = (clientId: number) => `/clienti/${clientId}/canali`;

/** Canali disponibili per un collegamento (letti dalla piattaforma, senza token verso il browser). */
export async function assetsFor(connectionId: number) {
  await requireUser();
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
  await requireUser();
  const connectionId = Number(f.get("connectionId"));
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) return;
  const chosen = new Set(f.getAll("asset").map(String));
  const token = decryptSecret(conn.accessTokenEnc)!;

  const ids: number[] = [];
  if (conn.provider === "meta") {
    for (const a of await meta.listAssets(token)) {
      if (!chosen.has(`${a.kind}|${a.externalId}`)) continue;
      ids.push(await upsertChannel(conn.clientId, conn.id, a.kind, a.externalId, a.handle, a.name, a.pictureUrl, encryptSecret(a.pageToken)));
    }
  } else {
    for (const a of await google.listAssets(token)) {
      if (!chosen.has(`${a.kind}|${a.externalId}`)) continue;
      ids.push(await upsertChannel(conn.clientId, conn.id, a.kind, a.externalId, a.handle, a.name, undefined, null));
    }
  }

  // Prima sincronizzazione subito, così i dati compaiono senza aspettare la notte
  for (const id of ids) {
    const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    await syncChannel(ch).catch(() => undefined);
  }
  await updateKpisFromData(conn.clientId);
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
  await requireUser();
  const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, Number(f.get("channelId"))));
  if (!ch) return { error: "Canale non trovato" };
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
  await requireUser();
  const clientId = Number(f.get("clientId"));
  const errors = await syncClient(clientId);
  revalidatePath(path(clientId));
  return { errors };
}

export async function removeChannel(f: FormData) {
  await requireUser();
  const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, Number(f.get("channelId"))));
  if (!ch) return;
  await db.delete(socialAccounts).where(eq(socialAccounts.id, ch.id));
  revalidatePath(path(ch.clientId));
}

export async function removeConnection(f: FormData) {
  await requireUser();
  const [conn] = await db.select().from(connections).where(eq(connections.id, Number(f.get("connectionId"))));
  if (!conn) return;
  // I canali restano (con i dati storici) ma risultano scollegati
  await db.update(socialAccounts).set({ connected: false, assetTokenEnc: null }).where(eq(socialAccounts.connectionId, conn.id));
  await db.delete(connections).where(eq(connections.id, conn.id));
  revalidatePath(path(conn.clientId));
}

export async function addManualChannel(f: FormData) {
  await requireUser();
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
  const [r] = await db
    .insert(socialAccounts)
    .values({ clientId, platform, handle, name: handle })
    .onDuplicateKeyUpdate({ set: { name: handle } });
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
