import "server-only";

import { META } from "./config";
import { getJson, qs } from "./http";

// Completezza dei profili collegati: cosa c'è e cosa manca (foto, copertina, descrizione, link, contatti…).
// Facebook: alcuni campi della Pagina si possono correggere da qui (serve il permesso pages_manage_metadata);
// Instagram non permette di modificare bio e link via API: si prepara il testo da incollare nell'app.

const graph = (path: string, params: Record<string, string | number | undefined>) => `https://graph.facebook.com/${META.version}/${path}?${qs(params)}`;

export type HealthItem = { key: string; label: string; ok: boolean; value?: string | null; fixable?: boolean; hint?: string };
export type Health = { score: number; checkedAt: string; items: HealthItem[] };

const score = (items: HealthItem[]) => Math.round((items.filter((i) => i.ok).length / items.length) * 100);
const filled = (v: unknown) => typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null;

/** Campi della Pagina Facebook modificabili via API (Graph: POST /{page-id}). */
export const FB_FIXABLE = ["about", "website", "phone", "emails"] as const;

export async function facebookHealth(pageId: string, pageToken: string): Promise<Health> {
  const p = await getJson<Record<string, unknown> & { picture?: { data?: { is_silhouette?: boolean; url?: string } }; cover?: { source?: string }; category_list?: { name: string }[]; hours?: Record<string, string>; location?: Record<string, unknown> }>(
    graph(pageId, { fields: "name,username,about,category,category_list,website,phone,emails,picture{is_silhouette,url},cover,location,hours,fan_count,link", access_token: pageToken }),
  );
  const items: HealthItem[] = [
    { key: "picture", label: "Immagine del profilo", ok: !!p.picture?.data && !p.picture.data.is_silhouette, hint: "Il logo quadrato, almeno 320×320" },
    { key: "cover", label: "Immagine di copertina", ok: filled(p.cover?.source), hint: "1640×624 (si vede ritagliata su smartphone)" },
    { key: "about", label: "Descrizione breve", ok: filled(p.about), value: (p.about as string) ?? null, fixable: true, hint: "Cosa fai e per chi, massimo 255 caratteri" },
    { key: "category", label: "Categoria", ok: filled(p.category), value: (p.category as string) ?? null },
    { key: "website", label: "Sito web", ok: filled(p.website), value: (p.website as string) ?? null, fixable: true },
    { key: "phone", label: "Telefono", ok: filled(p.phone), value: (p.phone as string) ?? null, fixable: true },
    { key: "emails", label: "Email", ok: filled(p.emails), value: Array.isArray(p.emails) ? (p.emails as string[]).join(", ") : null, fixable: true },
    { key: "location", label: "Indirizzo", ok: filled(p.location), hint: "Se il cliente riceve in sede: aiuta la ricerca locale" },
    { key: "hours", label: "Orari", ok: filled(p.hours), hint: "Utile per attività con orari di apertura" },
    { key: "username", label: "Nome utente (facebook.com/nome)", ok: filled(p.username), value: (p.username as string) ?? null },
  ];
  return { score: score(items), checkedAt: new Date().toISOString(), items };
}

export async function instagramHealth(igId: string, pageToken: string): Promise<Health> {
  const p = await getJson<{ name?: string; username?: string; biography?: string; website?: string; profile_picture_url?: string; media_count?: number; followers_count?: number }>(
    graph(igId, { fields: "name,username,biography,website,profile_picture_url,media_count,followers_count", access_token: pageToken }),
  );
  const items: HealthItem[] = [
    { key: "picture", label: "Immagine del profilo", ok: filled(p.profile_picture_url), hint: "Il logo, leggibile anche in piccolo" },
    { key: "name", label: "Nome visualizzato", ok: filled(p.name), value: p.name ?? null, hint: "Nome + parola chiave (es. «Studio Rossi · Architetto Brescia»)" },
    { key: "biography", label: "Bio", ok: filled(p.biography), value: p.biography ?? null, hint: "Massimo 150 caratteri: cosa fai, per chi, invito all'azione" },
    { key: "website", label: "Link nel profilo", ok: filled(p.website), value: p.website ?? null },
    { key: "posts", label: "Almeno 9 contenuti (griglia piena)", ok: (p.media_count ?? 0) >= 9, value: p.media_count != null ? String(p.media_count) : null },
  ];
  return { score: score(items), checkedAt: new Date().toISOString(), items };
}

/** Aggiorna campi della Pagina Facebook. Se manca il permesso Meta restituisce un errore leggibile. */
export async function updateFacebookPage(pageId: string, pageToken: string, fields: Partial<Record<(typeof FB_FIXABLE)[number], string>>) {
  const body: Record<string, string> = { access_token: pageToken };
  for (const [k, v] of Object.entries(fields)) {
    if (!FB_FIXABLE.includes(k as (typeof FB_FIXABLE)[number]) || v == null) continue;
    body[k] = k === "emails" ? JSON.stringify(v.split(/[,\s]+/).filter(Boolean)) : v;
  }
  try {
    await getJson(`https://graph.facebook.com/${META.version}/${pageId}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs(body) });
  } catch (e) {
    const msg = (e as Error).message;
    if (/permission|#200|#10|pages_manage_metadata/i.test(msg)) {
      throw new Error("Meta non consente ancora la modifica da 2Target (serve il permesso pages_manage_metadata, da approvare con l'App Review): copia il testo e incollalo nella Pagina");
    }
    throw e;
  }
}
