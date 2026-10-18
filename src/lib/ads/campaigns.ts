import "server-only";
import { readFile } from "node:fs/promises";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { adCampaigns, adLeadForms, clients, editorialItems, leadEvents, leads, mediaAssets, socialAccounts, type AdCreative, type AdTargeting } from "@/db/schema";
import { audit } from "@/lib/audit";
import { mediaPath, publicMediaUrl } from "@/lib/media";
import { isDryRun } from "@/lib/publishing/meta-publish";
import { decryptSecret } from "@/lib/secret-box";
import { clientAdsExposure, metaUserToken, toEur } from "./ads";
import { createNewAd, uploadImage, uploadVideo, type CreativeMedia, type NewAdObjective, type Placement } from "./meta-campaigns";
import { createLeadForm, fetchFormLeads, mapLeadFields } from "./meta-leads";

// Campagne nuove e moduli contatti: le regole di 2Target sopra ./meta-campaigns e ./meta-leads.
// Le stesse delle sponsorizzate dei post: account scelto in Canali, chi paga fissato al lancio, tetto mensile
// del cliente, simulazione in locale (niente chiamate a Meta, niente spesa).

/** Pagina Facebook (obbligatoria per ogni inserzione) e account Instagram collegati del cliente. */
async function advertiser(clientId: number) {
  const channels = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.clientId, clientId), inArray(socialAccounts.platform, ["facebook", "instagram"]), eq(socialAccounts.connected, true)));
  const page = channels.find((c) => c.platform === "facebook" && c.externalId);
  const instagram = channels.find((c) => c.platform === "instagram" && c.externalId);
  return {
    pageId: page?.externalId ?? null,
    pageToken: decryptSecret(page?.assetTokenEnc),
    instagramUserId: instagram?.externalId ?? null,
  };
}

async function capCheck(clientId: number, budget: number, currency: string, cap: number | null) {
  if (cap == null) return;
  const budgetEur = await toEur(budget, currency);
  const x = await clientAdsExposure(clientId);
  if (x.spentMonth + x.committed + budgetEur > cap + 0.005) {
    throw new Error(`Supera il tetto mensile del cliente: già spesi ${x.spentMonth.toFixed(2)} € e impegnati ${x.committed.toFixed(2)} € su ${cap.toFixed(2)} €`);
  }
}

export type NewCampaignInput = {
  clientId: number;
  itemId: number;
  name: string;
  objective: NewAdObjective;
  placement: Placement;
  creative: Omit<AdCreative, "format">;
  leadFormId?: number;
  budget: number;
  days: number;
  targeting: AdTargeting;
  userId: number;
};

export async function launchNewCampaign(i: NewCampaignInput) {
  const [client] = await db.select().from(clients).where(eq(clients.id, i.clientId));
  if (!client?.adAccountId) throw new Error("Scegli prima l'account pubblicitario del cliente (Canali → Sponsorizzate)");
  const [item] = await db.select({ id: editorialItems.id }).from(editorialItems).where(and(eq(editorialItems.id, i.itemId), eq(editorialItems.clientId, i.clientId)));
  if (!item) throw new Error("Scheda non trovata per questo cliente");

  // Media della scheda, nell'ordine scelto (solo quelli del cliente: niente media di altri clienti)
  const rows = i.creative.mediaIds.length
    ? await db.select().from(mediaAssets).where(and(inArray(mediaAssets.id, i.creative.mediaIds), eq(mediaAssets.clientId, i.clientId)))
    : [];
  const media = i.creative.mediaIds.map((id) => rows.find((r) => r.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  if (!media.length) throw new Error("Scegli almeno una foto o un video della scheda");
  if (media.some((m) => m.kind === "video") && media.length > 1) throw new Error("Un video va da solo: il carosello è solo di foto");
  const format: AdCreative["format"] = media[0].kind === "video" ? "video" : media.length > 1 ? "carosello" : "immagine";
  if (i.objective === "traffico" && !i.creative.link?.trim()) throw new Error("L'obiettivo Traffico richiede il link di destinazione");

  let form: typeof adLeadForms.$inferSelect | undefined;
  if (i.objective === "contatti") {
    [form] = i.leadFormId ? await db.select().from(adLeadForms).where(and(eq(adLeadForms.id, i.leadFormId), eq(adLeadForms.clientId, i.clientId))) : [];
    if (!form?.metaFormId) throw new Error("Scegli (o crea) il modulo contatti del cliente");
  }

  const currency = client.adAccountCurrency ?? "EUR";
  await capCheck(i.clientId, i.budget, currency, client.adsMonthlyCap);

  const simulated = isDryRun() || !!form?.simulated;
  const ident = simulated ? null : await advertiser(i.clientId);
  if (ident && !ident.pageId) throw new Error("Collega la Pagina Facebook del cliente in Canali: Meta la richiede per ogni inserzione, anche solo su Instagram");
  if (ident && i.placement !== "facebook" && !ident.instagramUserId) throw new Error("Collega l'account Instagram del cliente in Canali, oppure pubblica solo su Facebook");

  const startAt = new Date(Date.now() + 5 * 60_000);
  const endAt = new Date(startAt.getTime() + i.days * 86_400_000);
  const creative: AdCreative = { ...i.creative, format, mediaIds: media.map((m) => m.id) };
  const [row] = await db.insert(adCampaigns).values({
    clientId: i.clientId,
    kind: i.objective === "contatti" ? "contatti" : "campagna",
    name: i.name.slice(0, 200),
    itemId: i.itemId,
    platform: i.placement,
    creative,
    leadFormId: form?.id ?? null,
    payer: client.adsPayer,
    adAccountId: client.adAccountId,
    currency,
    objective: i.objective,
    budget: i.budget,
    startAt,
    endAt,
    targeting: i.targeting,
    simulated,
    createdBy: i.userId,
  });
  const id = row.insertId;

  if (simulated || !ident?.pageId) {
    await db.update(adCampaigns).set({ status: "attiva", metaCampaignId: `simulazione-${id}` }).where(eq(adCampaigns.id, id));
    return { id, simulated: true };
  }
  try {
    const token = await metaUserToken(i.clientId);
    const uploaded: CreativeMedia[] = [];
    for (const m of media) {
      if (m.kind === "video") uploaded.push({ kind: "video", ...(await uploadVideo(token, client.adAccountId, publicMediaUrl(m.storageKey), m.fileName)) });
      else uploaded.push({ kind: "image", hash: await uploadImage(token, client.adAccountId, await readFile(mediaPath(m.storageKey)), m.fileName) });
    }
    const r = await createNewAd({
      userToken: token,
      adAccountId: client.adAccountId,
      name: `${client.name} · ${i.name}`,
      objective: i.objective,
      budget: i.budget,
      startAt,
      endAt,
      targeting: { placement: i.placement, city: i.targeting.city, ageMin: i.targeting.ageMin, ageMax: i.targeting.ageMax, gender: i.targeting.gender },
      creative: {
        pageId: ident.pageId,
        instagramUserId: i.placement !== "facebook" ? (ident.instagramUserId ?? undefined) : undefined,
        message: i.creative.message,
        headline: i.creative.headline,
        description: i.creative.description,
        link: i.creative.link || client.website || undefined,
        button: i.creative.button,
        media: uploaded,
        leadFormId: form?.metaFormId ?? undefined,
      },
    });
    await db
      .update(adCampaigns)
      .set({ status: "attiva", metaCampaignId: r.campaignId, metaAdSetId: r.adSetId, metaCreativeId: r.creativeId, metaAdId: r.adId })
      .where(eq(adCampaigns.id, id));
    return { id, simulated: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(adCampaigns).set({ status: "errore", error: message.slice(0, 1000) }).where(eq(adCampaigns.id, id));
    throw new Error(message);
  }
}

// ── Moduli contatti ───────────────────────────────────────────────────

export type LeadFormCreate = {
  clientId: number;
  name: string;
  fields: ("FULL_NAME" | "EMAIL" | "PHONE" | "CITY")[];
  customQuestion?: string | null;
  intro?: string | null;
  privacyUrl: string;
  thankYou?: string | null;
  userId: number;
};

export async function createClientLeadForm(i: LeadFormCreate) {
  const [client] = await db.select({ website: clients.website }).from(clients).where(eq(clients.id, i.clientId));
  if (!client) throw new Error("Cliente non trovato");
  const simulated = isDryRun();
  const ident = simulated ? null : await advertiser(i.clientId);
  if (ident && (!ident.pageId || !ident.pageToken)) throw new Error("Collega la Pagina Facebook del cliente in Canali: il modulo contatti vive sulla Pagina");

  const [row] = await db.insert(adLeadForms).values({
    clientId: i.clientId,
    pageId: ident?.pageId ?? "simulazione",
    name: i.name.slice(0, 200),
    fields: i.fields,
    customQuestion: i.customQuestion?.trim() || null,
    intro: i.intro?.trim() || null,
    privacyUrl: i.privacyUrl,
    thankYou: i.thankYou?.trim() || null,
    simulated,
    createdBy: i.userId,
  });
  const id = row.insertId;
  if (!ident?.pageId || !ident.pageToken) {
    await db.update(adLeadForms).set({ metaFormId: `simulazione-${id}` }).where(eq(adLeadForms.id, id));
    return { id, simulated: true };
  }
  try {
    const formId = await createLeadForm(ident.pageToken, ident.pageId, { ...i, website: client.website });
    await db.update(adLeadForms).set({ metaFormId: formId }).where(eq(adLeadForms.id, id));
    return { id, simulated: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Il modulo senza id Meta non è utilizzabile: si toglie per non proporlo nelle campagne
    await db.delete(adLeadForms).where(eq(adLeadForms.id, id));
    throw new Error(/permission|#200|#10|pages_manage_ads/i.test(message) ? "Meta non consente ancora di creare moduli: serve il permesso pages_manage_ads (ricollega Meta dopo l'approvazione)" : message);
  }
}

/**
 * Legge da Meta i contatti nuovi dei moduli del cliente e li salva nei Lead (fonte Meta Ads).
 * Idempotente: l'id Meta del contatto è l'externalId del lead, quindi rileggere non crea doppioni.
 */
export async function syncLeadForms(clientId: number) {
  const forms = await db
    .select()
    .from(adLeadForms)
    .where(and(eq(adLeadForms.clientId, clientId), eq(adLeadForms.simulated, false), isNotNull(adLeadForms.metaFormId)));
  if (!forms.length) return { added: 0, errors: [] as string[] };
  const ident = await advertiser(clientId);
  if (!ident.pageToken) return { added: 0, errors: ["Pagina Facebook non collegata: impossibile leggere i contatti dei moduli"] };

  // Campagne Meta del cliente → scheda del piano, per collegare il lead al contenuto che l'ha generato
  const camps = await db.select({ meta: adCampaigns.metaCampaignId, itemId: adCampaigns.itemId }).from(adCampaigns).where(eq(adCampaigns.clientId, clientId));
  const itemOf = (metaCampaignId?: string) => camps.find((c) => c.meta && c.meta === metaCampaignId)?.itemId ?? null;

  let added = 0;
  const errors: string[] = [];
  for (const f of forms) {
    try {
      // Si rilegge con un giorno di margine: Meta può consegnare i contatti con ritardo
      const since = Math.floor(((f.lastLeadsSyncAt ?? f.createdAt).getTime() - 86_400_000) / 1000);
      const list = await fetchFormLeads(ident.pageToken, f.metaFormId!, since);
      let fresh = 0;
      for (const l of list) {
        const m = mapLeadFields(l.field_data);
        const receivedAt = new Date(l.created_time);
        const r = await db
          .insert(leads)
          .values({
            clientId,
            receivedAt,
            name: m.name,
            email: m.email,
            phone: m.phone,
            company: m.company,
            message: m.message,
            source: "meta_ads",
            editorialItemId: itemOf(l.campaign_id),
            utmSource: "facebook",
            utmMedium: "lead_ads",
            utmCampaign: f.name.slice(0, 200),
            externalId: `meta:${l.id}`,
            stage: "nuovo",
            stageChangedAt: receivedAt,
          })
          // Già presente (stesso id Meta): non si tocca, il consulente può averlo già lavorato
          .onDuplicateKeyUpdate({ set: { externalId: `meta:${l.id}` } });
        // affectedRows: 1 = inserito, 0 = già c'era
        if (r[0].affectedRows === 1) {
          fresh++;
          await db.insert(leadEvents).values({ leadId: r[0].insertId, toStage: "nuovo", at: receivedAt });
        }
      }
      await db
        .update(adLeadForms)
        .set({ leadsCount: f.leadsCount + fresh, lastLeadsSyncAt: new Date(), error: null })
        .where(eq(adLeadForms.id, f.id));
      if (fresh) {
        added += fresh;
        await audit({ userId: null, actorLabel: "Meta Ads", category: "lead", action: "lead.da_meta", description: `${fresh} contatti dal modulo «${f.name}»`, clientId });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`Modulo «${f.name}»: ${message}`);
      await db.update(adLeadForms).set({ error: message.slice(0, 1000) }).where(eq(adLeadForms.id, f.id));
    }
  }
  return { added, errors };
}
