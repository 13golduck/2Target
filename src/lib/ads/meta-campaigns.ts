import "server-only";

import { META } from "@/lib/integrations/config";
import { getJson, qs } from "@/lib/integrations/http";

// Inserzioni NUOVE via Meta Marketing API (non la promozione di un post già pubblicato, che sta in ./meta-ads):
// la creatività nasce dai media e dai testi della scheda del piano, anche se il contenuto non è mai uscito sul profilo.
// Struttura come per il boost: campagna → gruppo di inserzioni → creatività → inserzione, tutto in pausa
// e acceso solo alla fine; se un passaggio fallisce si cancella ciò che è stato creato, così non resta nulla che spende.

const graph = (p: string) => `https://graph.facebook.com/${META.version}/${p}`;
const get = <T>(p: string, params: Record<string, string | number | undefined>) => getJson<T>(`${graph(p)}?${qs(params)}`);
const post = <T>(p: string, params: Record<string, string | number | undefined>) =>
  getJson<T>(graph(p), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs(params) });

export type NewAdObjective = "notorieta" | "traffico" | "interazione" | "contatti";
export type Placement = "facebook" | "instagram" | "entrambi";

/** Obiettivo 2Target → obiettivo della campagna Meta, ottimizzazione del gruppo e destinazione. */
const GOALS: Record<NewAdObjective, { objective: string; optimization: string; destination?: string }> = {
  notorieta: { objective: "OUTCOME_AWARENESS", optimization: "REACH" },
  traffico: { objective: "OUTCOME_TRAFFIC", optimization: "LINK_CLICKS", destination: "WEBSITE" },
  interazione: { objective: "OUTCOME_ENGAGEMENT", optimization: "POST_ENGAGEMENT", destination: "ON_POST" },
  contatti: { objective: "OUTCOME_LEADS", optimization: "LEAD_GENERATION", destination: "ON_AD" },
};
export const adGoal = (o: NewAdObjective) => GOALS[o];

/** Pulsanti consentiti (sottoinsieme dei call_to_action di Meta, con l'etichetta italiana). */
export const AD_BUTTONS: Record<string, string> = {
  LEARN_MORE: "Scopri di più",
  CONTACT_US: "Contattaci",
  BOOK_TRAVEL: "Prenota",
  SHOP_NOW: "Acquista ora",
  SIGN_UP: "Iscriviti",
  GET_QUOTE: "Richiedi preventivo",
  APPLY_NOW: "Candidati ora",
  // «Chiama» e «WhatsApp» richiedono obiettivi e collegamenti dedicati: non sono tra quelli proposti
};

export type TargetingInput = {
  placement: Placement;
  city?: { key: string; radiusKm: number };
  ageMin: number;
  ageMax: number;
  gender?: "tutti" | "uomini" | "donne";
};

/** Pubblico Meta: zona (città + raggio, altrimenti Italia), età, sesso e posizionamenti. */
export function buildTargeting(t: TargetingInput) {
  const platforms = t.placement === "entrambi" ? ["facebook", "instagram"] : [t.placement];
  return {
    geo_locations: t.city ? { cities: [{ key: t.city.key, radius: t.city.radiusKm, distance_unit: "kilometer" }] } : { countries: ["IT"] },
    age_min: t.ageMin,
    age_max: t.ageMax,
    // Meta: 1 = uomini, 2 = donne; senza il campo, tutti
    ...(t.gender === "uomini" ? { genders: [1] } : t.gender === "donne" ? { genders: [2] } : {}),
    publisher_platforms: platforms,
    ...(platforms.includes("facebook") ? { facebook_positions: ["feed", "story", "video_feeds", "marketplace"] } : {}),
    ...(platforms.includes("instagram") ? { instagram_positions: ["stream", "story", "explore", "reels"] } : {}),
    // Il pubblico resta quello scelto (niente espansione automatica di Meta)
    targeting_automation: { advantage_audience: 0 },
  };
}

export type CreativeMedia = { kind: "image"; hash: string } | { kind: "video"; videoId: string; thumbnailUrl: string };

export type CreativeInput = {
  pageId: string;
  instagramUserId?: string;
  message: string;
  headline?: string;
  description?: string;
  /** Link di destinazione; senza link si usa la Pagina Facebook (obbligatorio per Meta nelle inserzioni con immagine). */
  link?: string;
  button: string;
  media: CreativeMedia[];
  /** Modulo contatti (campagne «contatti»): il pulsante apre il modulo invece del link. */
  leadFormId?: string;
};

/**
 * object_story_spec della creatività: immagine singola, carosello (2-10 immagini) o video.
 * Funzione pura: è la parte che si sbaglia più facilmente, quindi è coperta dai test.
 */
export function buildObjectStorySpec(c: CreativeInput) {
  if (!c.media.length) throw new Error("Serve almeno una foto o un video nella scheda");
  const link = c.link?.trim() || `https://www.facebook.com/${c.pageId}`;
  const cta = c.leadFormId
    ? { type: c.button, value: { lead_gen_form_id: c.leadFormId } }
    : { type: c.button, value: { link } };
  const identity = { page_id: c.pageId, ...(c.instagramUserId ? { instagram_user_id: c.instagramUserId } : {}) };

  const first = c.media[0];
  if (first.kind === "video") {
    return {
      ...identity,
      video_data: {
        video_id: first.videoId,
        image_url: first.thumbnailUrl,
        message: c.message,
        ...(c.headline ? { title: c.headline } : {}),
        ...(c.description ? { link_description: c.description } : {}),
        call_to_action: cta,
      },
    };
  }

  const images = c.media.filter((m): m is Extract<CreativeMedia, { kind: "image" }> => m.kind === "image");
  if (images.length >= 2) {
    return {
      ...identity,
      link_data: {
        message: c.message,
        link,
        child_attachments: images.slice(0, 10).map((m) => ({
          link,
          image_hash: m.hash,
          ...(c.headline ? { name: c.headline } : {}),
          ...(c.description ? { description: c.description } : {}),
          call_to_action: cta,
        })),
        // Meta sceglie l'ordine delle schede che rende di più
        multi_share_optimized: true,
        call_to_action: cta,
      },
    };
  }

  return {
    ...identity,
    link_data: {
      message: c.message,
      link,
      image_hash: images[0].hash,
      ...(c.headline ? { name: c.headline } : {}),
      ...(c.description ? { description: c.description } : {}),
      call_to_action: cta,
    },
  };
}

const act = (adAccountId: string) => (adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`);

/** Carica un'immagine nella libreria dell'account pubblicitario e ne restituisce l'hash. */
export async function uploadImage(userToken: string, adAccountId: string, bytes: Buffer, fileName: string) {
  const r = await post<{ images: Record<string, { hash: string }> }>(`${act(adAccountId)}/adimages`, {
    bytes: bytes.toString("base64"),
    name: fileName.slice(0, 100),
    access_token: userToken,
  });
  const hash = Object.values(r.images ?? {})[0]?.hash;
  if (!hash) throw new Error("Meta non ha restituito l'immagine caricata");
  return hash;
}

/**
 * Carica un video da un indirizzo pubblico firmato (Meta lo scarica da lì) e aspetta che sia elaborato,
 * perché la creatività video richiede una copertina: si usa quella preferita generata da Meta.
 */
export async function uploadVideo(userToken: string, adAccountId: string, fileUrl: string, fileName: string, waitMs = 120_000) {
  const v = await post<{ id: string }>(`${act(adAccountId)}/advideos`, { file_url: fileUrl, name: fileName.slice(0, 100), access_token: userToken });
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    const s = await get<{ status?: { video_status?: string } }>(v.id, { fields: "status", access_token: userToken });
    if (s.status?.video_status === "ready") break;
    if (s.status?.video_status === "error") throw new Error("Meta non è riuscito a elaborare il video");
    await new Promise((r) => setTimeout(r, 4000));
  }
  const thumbs = await get<{ data: { uri: string; is_preferred?: boolean }[] }>(`${v.id}/thumbnails`, { access_token: userToken });
  const thumb = thumbs.data.find((t) => t.is_preferred) ?? thumbs.data[0];
  if (!thumb) throw new Error("Il video è ancora in elaborazione su Meta: riprova tra qualche minuto");
  return { videoId: v.id, thumbnailUrl: thumb.uri };
}

export type NewAdInput = {
  userToken: string;
  adAccountId: string;
  name: string;
  objective: NewAdObjective;
  /** Budget totale in unità della valuta dell'account (es. 50 = 50 €). */
  budget: number;
  startAt: Date;
  endAt: Date;
  targeting: TargetingInput;
  creative: CreativeInput;
  /** Parametri aggiunti da Meta ai link (UTM): permettono di attribuire alla campagna i contatti dal sito. */
  urlTags?: string;
};

export type NewAdResult = { campaignId: string; adSetId: string; creativeId: string; adId: string };

export async function createNewAd(i: NewAdInput): Promise<NewAdResult> {
  const goal = adGoal(i.objective);
  const token = i.userToken;
  const account = act(i.adAccountId);
  const label = `2Target · ${i.name}`.slice(0, 200);
  const created: string[] = [];
  try {
    const campaign = await post<{ id: string }>(`${account}/campaigns`, {
      name: label,
      objective: goal.objective,
      status: "PAUSED",
      special_ad_categories: "[]",
      is_adset_budget_sharing_enabled: "false",
      access_token: token,
    });
    created.push(campaign.id);

    const adSet = await post<{ id: string }>(`${account}/adsets`, {
      name: label,
      campaign_id: campaign.id,
      lifetime_budget: Math.round(i.budget * 100),
      billing_event: "IMPRESSIONS",
      optimization_goal: goal.optimization,
      ...(goal.destination ? { destination_type: goal.destination } : {}),
      // I moduli contatto vivono sulla Pagina: Meta vuole sapere quale
      ...(i.objective === "contatti" ? { promoted_object: JSON.stringify({ page_id: i.creative.pageId }) } : {}),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      start_time: Math.floor(i.startAt.getTime() / 1000),
      end_time: Math.floor(i.endAt.getTime() / 1000),
      targeting: JSON.stringify(buildTargeting(i.targeting)),
      status: "PAUSED",
      access_token: token,
    });
    created.push(adSet.id);

    const creative = await post<{ id: string }>(`${account}/adcreatives`, {
      name: label,
      object_story_spec: JSON.stringify(buildObjectStorySpec(i.creative)),
      ...(i.urlTags ? { url_tags: i.urlTags } : {}),
      access_token: token,
    });

    const ad = await post<{ id: string }>(`${account}/ads`, {
      name: label,
      adset_id: adSet.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: "PAUSED",
      access_token: token,
    });
    created.push(ad.id);

    // Tutto creato: si accende dal basso verso l'alto
    for (const id of [ad.id, adSet.id, campaign.id]) await post(id, { status: "ACTIVE", access_token: token });
    return { campaignId: campaign.id, adSetId: adSet.id, creativeId: creative.id, adId: ad.id };
  } catch (e) {
    for (const id of created.reverse()) await post(id, { status: "DELETED", access_token: token }).catch(() => undefined);
    throw e;
  }
}
