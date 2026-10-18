"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { CHANNEL_KINDS, clients, connections, editorialItems, socialAccounts } from "@/db/schema";
import { requireWriter, userCanPublish } from "@/lib/auth";
import { forgetFromClient, siteKey } from "@/lib/integrations/client-channels";
import { encryptSecret } from "@/lib/secret-box";
import * as meta from "@/lib/integrations/meta";
import { PROVIDER_MODULES, providerLabel } from "@/lib/integrations/providers";
import { accessToken, syncChannel, syncClient, updateKpisFromData } from "@/lib/integrations/sync";
import { audit } from "@/lib/audit";
import { META } from "@/lib/integrations/config";

const path = (clientId: number) => `/clienti/${clientId}/canali`;

/** Canali disponibili per un collegamento (letti dalla piattaforma, senza token verso il browser). */
export async function assetsFor(connectionId: number) {
  await requireWriter();
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) return { conn: null, assets: [] as { key: string; kind: string; handle: string; name: string; pictureUrl?: string }[] };
  // accessToken rinnova i token in scadenza (Instagram, Threads, TikTok, LinkedIn, Google, Pinterest)
  const raw = await PROVIDER_MODULES[conn.provider].listAssets(await accessToken(conn));
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
  const token = await accessToken(conn);

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
    // Tutti gli altri: si legge e si pubblica con il token dell'utente collegato (si rinnova da solo), senza token di Pagina
    for (const a of await PROVIDER_MODULES[conn.provider].listAssets(token)) {
      if (!chosen.has(`${a.kind}|${a.externalId}`)) continue;
      const other = await owner(a.kind, a.externalId);
      if (other) refused.push(`${a.name} è già collegato al cliente ${other}`);
      else ids.push(await upsertChannel(conn.clientId, conn.id, a.kind, a.externalId, a.handle, a.name, a.pictureUrl, null));
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
    description: `Collegati ${ids.length} canali da ${providerLabel(conn.provider)} (${conn.accountName})${refused.length ? ` · ${refused.length} rifiutati perché di un altro cliente` : ""}`,
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
  await forgetFromClient(ch);
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
  await audit({ userId: me.id, category: "canali", action: "collegamento.rimosso", description: `Scollegato l'account ${providerLabel(conn.provider)} «${conn.accountName}»`, clientId: conn.clientId });
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
    // Se la scheda del cliente non ha un sito, si usa questo (check-up e report leggono da lì)
    await db.update(clients).set({ website: handle }).where(and(eq(clients.id, clientId), isNull(clients.website)));
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

/**
 * Collega le Pagine e gli Instagram del cliente tramite l'utente di sistema del portfolio Golduck: accesso che non
 * scade e non dipende dalla persona (il cliente condivide le sue risorse con il portfolio Golduck, Golduck le assegna
 * all'utente di sistema). Poi si scelgono i profili come per un collegamento normale; quelli già collegati passano
 * al nuovo accesso.
 */
export async function connectMetaSystemUser(f: FormData) {
  const me = await requireWriter();
  if (!(await userCanPublish(me))) throw new Error("Solo gli amministratori e chi è abilitato a pubblicare possono collegare profili ai clienti");
  const clientId = Number(f.get("clientId"));
  const token = META.systemUserToken;
  if (!clientId) return;
  if (!token) redirect(`${path(clientId)}?errore=${encodeURIComponent("Manca il token dell'utente di sistema: un amministratore lo inserisce in Impostazioni → Integrazioni → Meta")}`);
  let su: Awaited<ReturnType<typeof meta.systemUser>>;
  try {
    su = await meta.systemUser(token);
  } catch (e) {
    redirect(`${path(clientId)}?errore=${encodeURIComponent(`Meta: ${(e as Error).message}`)}`);
  }
  const values = {
    clientId,
    provider: "meta" as const,
    externalUserId: `system:${su.id}`,
    accountName: `Portfolio Golduck (${su.name})`,
    accessTokenEnc: encryptSecret(token),
    refreshTokenEnc: null,
    expiresAt: su.expiresAt,
    scopes: null,
    status: "attivo" as const,
    lastError: null,
    connectedBy: me.id,
  };
  await db
    .insert(connections)
    .values(values)
    .onDuplicateKeyUpdate({ set: { accountName: values.accountName, accessTokenEnc: values.accessTokenEnc, expiresAt: values.expiresAt, status: "attivo", lastError: null } });
  const [row] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.clientId, clientId), eq(connections.provider, "meta"), eq(connections.externalUserId, values.externalUserId)));
  await audit({ userId: me.id, category: "canali", action: "collegamento.portfolio", description: `Collegato l'accesso permanente di Meta tramite il portfolio Golduck (${su.name})`, clientId, target: `collegamento:${row.id}` });
  redirect(`${path(clientId)}?scegli=${row.id}`);
}

/**
 * Post veloce da un profilo (Canali → Nuovo post): crea una scheda fuori piano, già approvata, con il testo scritto,
 * e apre la pubblicazione con quel profilo già scelto. Media, anteprima e conferma restano quelli dell'editor.
 */
export async function quickPost(f: FormData) {
  const me = await requireWriter();
  if (!(await userCanPublish(me))) return { error: "Pubblicano solo gli amministratori e chi è abilitato" };
  const [ch] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, Number(f.get("channelId"))));
  if (!ch || !["instagram", "facebook"].includes(ch.platform)) return { error: "Profilo non valido" };
  const caption = String(f.get("caption") ?? "").trim();
  const format = String(f.get("format") ?? "post");
  const title = caption.split("\n")[0].slice(0, 80) || "Post veloce";
  const [r] = await db.insert(editorialItems).values({
    clientId: ch.clientId,
    planId: null,
    title,
    platform: ch.platform as "instagram" | "facebook",
    format: (["post", "carosello", "reel", "storia"].includes(format) ? format : "post") as "post",
    caption: caption || null,
    status: "approvato",
    scheduledAt: new Date(),
    internalNotes: "Post veloce creato da Canali (fuori dal piano editoriale)",
  });
  await audit({ userId: me.id, category: "contenuti", action: "pubblicazione.veloce", description: `Post veloce per ${ch.platform} «${ch.name ?? ch.handle}»`, clientId: ch.clientId, target: `pubblicazione:${r.insertId}` });
  redirect(`/pubblicazioni/${r.insertId}?canale=${ch.id}#pubblica`);
}
