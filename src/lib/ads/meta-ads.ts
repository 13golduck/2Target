import "server-only";

import { META } from "@/lib/integrations/config";
import { getJson, qs } from "@/lib/integrations/http";

// Sponsorizzate via Meta Marketing API: si promuove un post GIÀ pubblicato (Facebook o Instagram).
// Struttura Meta: campagna (obiettivo) → gruppo di inserzioni (budget, periodo, pubblico) → inserzione (il post).
// Tutto nasce in pausa e si attiva solo alla fine: se un passaggio fallisce non resta nulla che spende.

const graph = (p: string) => `https://graph.facebook.com/${META.version}/${p}`;
const get = <T>(p: string, params: Record<string, string | number | undefined>) => getJson<T>(`${graph(p)}?${qs(params)}`);
const post = <T>(p: string, params: Record<string, string | number | undefined>) =>
  getJson<T>(graph(p), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs(params) });

export type AdAccount = { id: string; name: string; currency: string; status: number; business?: string };

/** Account pubblicitari a cui ha accesso chi ha collegato Meta (propri e condivisi come partner). */
export async function listAdAccounts(userToken: string): Promise<AdAccount[]> {
  const r = await get<{ data: { id: string; name: string; currency: string; account_status: number; business?: { name: string } }[] }>("me/adaccounts", {
    fields: "id,name,currency,account_status,business{name}",
    limit: 100,
    access_token: userToken,
  });
  return r.data.map((a) => ({ id: a.id, name: a.name, currency: a.currency, status: a.account_status, business: a.business?.name }));
}

/** Ricerca di città per il pubblico (targeting Meta). */
export async function searchCities(userToken: string, q: string) {
  const r = await get<{ data: { key: string; name: string; region?: string; country_code: string }[] }>("search", {
    type: "adgeolocation",
    location_types: JSON.stringify(["city"]),
    q,
    limit: 8,
    access_token: userToken,
  });
  return r.data.map((c) => ({ key: c.key, name: [c.name, c.region].filter(Boolean).join(", "), country: c.country_code }));
}

// Obiettivo 2Target → obiettivo Meta e ottimizzazione, per la promozione di un post esistente
const OBJECTIVES: Record<string, { objective: string; optimization: string; label: string }> = {
  notorieta: { objective: "OUTCOME_AWARENESS", optimization: "REACH", label: "Notorietà" },
  interazione: { objective: "OUTCOME_ENGAGEMENT", optimization: "POST_ENGAGEMENT", label: "Interazione" },
  traffico: { objective: "OUTCOME_TRAFFIC", optimization: "LINK_CLICKS", label: "Traffico" },
};
export const promotableObjective = (o: string) => (OBJECTIVES[o] ? o : "interazione");

export type BoostInput = {
  userToken: string;
  adAccountId: string;
  platform: "facebook" | "instagram";
  /** Facebook: id del post; Instagram: id del contenuto pubblicato. */
  postId: string;
  /** Pagina Facebook dell'inserzionista (per Instagram: la pagina collegata all'account). */
  pageId: string;
  instagramUserId?: string;
  name: string;
  objective: string;
  /** Budget totale in unità della valuta dell'account (es. 50 = 50 €). */
  budget: number;
  startAt: Date;
  endAt: Date;
  city?: { key: string; radiusKm: number };
  ageMin: number;
  ageMax: number;
};

export type BoostResult = { campaignId: string; adSetId: string; adId: string };

export async function boostPost(i: BoostInput): Promise<BoostResult> {
  const o = OBJECTIVES[promotableObjective(i.objective)];
  const token = i.userToken;
  const act = i.adAccountId.startsWith("act_") ? i.adAccountId : `act_${i.adAccountId}`;
  const created: string[] = [];
  try {
    const campaign = await post<{ id: string }>(`${act}/campaigns`, {
      name: `2Target · ${i.name}`.slice(0, 200),
      objective: o.objective,
      status: "PAUSED",
      special_ad_categories: "[]",
      is_adset_budget_sharing_enabled: "false",
      access_token: token,
    });
    created.push(campaign.id);

    const targeting = {
      geo_locations: i.city ? { cities: [{ key: i.city.key, radius: i.city.radiusKm, distance_unit: "kilometer" }] } : { countries: ["IT"] },
      age_min: i.ageMin,
      age_max: i.ageMax,
      publisher_platforms: [i.platform],
      ...(i.platform === "instagram" ? { instagram_positions: ["stream", "story", "explore", "reels"] } : { facebook_positions: ["feed", "story", "video_feeds"] }),
      targeting_automation: { advantage_audience: 0 },
    };
    const adSet = await post<{ id: string }>(`${act}/adsets`, {
      name: `2Target · ${i.name}`.slice(0, 200),
      campaign_id: campaign.id,
      lifetime_budget: Math.round(i.budget * 100),
      billing_event: "IMPRESSIONS",
      optimization_goal: o.optimization,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      start_time: Math.floor(i.startAt.getTime() / 1000),
      end_time: Math.floor(i.endAt.getTime() / 1000),
      targeting: JSON.stringify(targeting),
      status: "PAUSED",
      access_token: token,
    });
    created.push(adSet.id);

    const creative = await post<{ id: string }>(`${act}/adcreatives`, {
      name: `2Target · ${i.name}`.slice(0, 200),
      ...(i.platform === "facebook"
        ? { object_story_id: i.postId.includes("_") ? i.postId : `${i.pageId}_${i.postId}` }
        : { object_id: i.pageId, instagram_user_id: i.instagramUserId, source_instagram_media_id: i.postId }),
      access_token: token,
    });
    const ad = await post<{ id: string }>(`${act}/ads`, {
      name: `2Target · ${i.name}`.slice(0, 200),
      adset_id: adSet.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: "PAUSED",
      access_token: token,
    });
    created.push(ad.id);

    // Tutto creato: si accende dal basso verso l'alto
    for (const id of [ad.id, adSet.id, campaign.id]) await post(id, { status: "ACTIVE", access_token: token });
    return { campaignId: campaign.id, adSetId: adSet.id, adId: ad.id };
  } catch (e) {
    // Se qualcosa va storto si cancella ciò che è stato creato (nessuna spesa: era tutto in pausa)
    for (const id of created.reverse()) await post(id, { status: "DELETED", access_token: token }).catch(() => undefined);
    throw e;
  }
}

export async function setCampaignStatus(userToken: string, campaignId: string, status: "ACTIVE" | "PAUSED" | "DELETED") {
  await post(campaignId, { status, access_token: userToken });
}

type Action = { action_type: string; value: string };
export type CampaignInsights = { spend: number; daily: { day: string; spend: number }[]; results: Record<string, number>; effectiveStatus: string };

/** Spesa giornaliera e risultati totali della campagna. */
export async function campaignInsights(userToken: string, campaignId: string, since: string, until: string): Promise<CampaignInsights> {
  const [daily, total, info] = await Promise.all([
    get<{ data: { spend: string; date_start: string }[] }>(`${campaignId}/insights`, {
      fields: "spend",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      limit: 400,
      access_token: userToken,
    }),
    get<{ data: { spend?: string; impressions?: string; reach?: string; clicks?: string; frequency?: string; actions?: Action[] }[] }>(`${campaignId}/insights`, {
      fields: "spend,impressions,reach,clicks,frequency,actions",
      date_preset: "maximum",
      access_token: userToken,
    }),
    get<{ effective_status: string }>(campaignId, { fields: "effective_status", access_token: userToken }),
  ]);
  const t = total.data[0] ?? {};
  const act = (k: string) => Number(t.actions?.find((a) => a.action_type === k)?.value ?? 0);
  return {
    spend: Number(t.spend ?? 0),
    daily: daily.data.map((d) => ({ day: d.date_start, spend: Number(d.spend) })),
    results: {
      impressioni: Number(t.impressions ?? 0),
      copertura: Number(t.reach ?? 0),
      clic: Number(t.clicks ?? 0),
      interazioni: act("post_engagement"),
      clic_link: act("link_click"),
      // Contatti dai moduli: Meta li conta come "lead" (o raggruppati sul modulo nativo)
      contatti: act("lead") || act("onsite_conversion.lead_grouped"),
      // Quante volte in media la stessa persona ha visto l'inserzione (serve ai consigli: pubblico saturo)
      frequenza: Math.round(Number(t.frequency ?? 0) * 100) / 100,
    },
    effectiveStatus: info.effective_status,
  };
}
