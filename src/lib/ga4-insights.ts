// Analytics 4 accanto ai Lead di 2Target: per campagna (UTM) e per pagina di atterraggio,
// quanti contatti e quanti clienti sono arrivati davvero. Modulo senza dipendenze dal server.

export interface LeadLite {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingUrl: string | null;
  won: boolean;
  wonValue: number | null;
}

const low = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Chiave di una campagna: sorgente / mezzo / campagna, come negli UTM. */
export const campaignKey = (source: string | null, medium: string | null, campaign: string | null) => `${low(source)}|${low(medium)}|${low(campaign)}`;

/** Percorso di una pagina senza dominio, parametri e barra finale: «https://x.it/servizi/?a=1» → «/servizi». */
export function pathOf(url: string | null | undefined) {
  if (!url) return "";
  let p = url.trim();
  try {
    p = new URL(p, "https://x").pathname;
  } catch {
    p = p.split("?")[0];
  }
  p = p.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return (p || "/").toLowerCase();
}

type Tally = { leads: number; customers: number; revenue: number };
const add = (map: Map<string, Tally>, key: string, l: LeadLite) => {
  const t = map.get(key) ?? { leads: 0, customers: 0, revenue: 0 };
  t.leads++;
  if (l.won) {
    t.customers++;
    t.revenue += l.wonValue ?? 0;
  }
  map.set(key, t);
};

/** Campagne di Analytics con i contatti e i clienti arrivati con gli stessi UTM. */
export function campaignsWithLeads<T extends { sessionSource: string; sessionMedium: string; sessionCampaignName: string }>(rows: T[], leads: LeadLite[]) {
  const byKey = new Map<string, Tally>();
  for (const l of leads) if (l.utmSource || l.utmCampaign) add(byKey, campaignKey(l.utmSource, l.utmMedium, l.utmCampaign), l);
  const seen = new Set<string>();
  const out = rows.map((r) => {
    const key = campaignKey(r.sessionSource, r.sessionMedium, r.sessionCampaignName === "(not set)" ? "" : r.sessionCampaignName);
    seen.add(key);
    return { ...r, ...(byKey.get(key) ?? { leads: 0, customers: 0, revenue: 0 }) };
  });
  // Lead con UTM che Analytics non mostra tra le prime campagne (o non ha tracciato): si segnalano comunque
  const missing = [...byKey.entries()].filter(([k]) => !seen.has(k)).map(([k, t]) => {
    const [source, medium, campaign] = k.split("|");
    return { source, medium, campaign, ...t };
  });
  return { rows: out, missing };
}

/** Pagine di atterraggio di Analytics con i contatti arrivati da quella pagina. */
export function landingWithLeads<T extends { landingPage: string }>(rows: T[], leads: LeadLite[]) {
  const byPath = new Map<string, Tally>();
  for (const l of leads) if (l.landingUrl) add(byPath, pathOf(l.landingUrl), l);
  return rows.map((r) => ({ ...r, ...(byPath.get(pathOf(r.landingPage)) ?? { leads: 0, customers: 0, revenue: 0 }) }));
}

/** Conversioni per evento, con la suddivisione per canale. */
export function conversionsByEvent(rows: { eventName: string; sessionDefaultChannelGroup: string; keyEvents: number }[]) {
  const map = new Map<string, { eventName: string; total: number; channels: { channel: string; count: number }[] }>();
  for (const r of rows) {
    const e = map.get(r.eventName) ?? { eventName: r.eventName, total: 0, channels: [] };
    e.total += r.keyEvents;
    e.channels.push({ channel: r.sessionDefaultChannelGroup, count: r.keyEvents });
    map.set(r.eventName, e);
  }
  return [...map.values()].map((e) => ({ ...e, channels: e.channels.sort((a, b) => b.count - a.count) })).sort((a, b) => b.total - a.total);
}
