import "server-only";

import { META } from "@/lib/integrations/config";
import { getJson, qs } from "@/lib/integrations/http";

// Moduli contatti di Meta (lead ads): si creano sulla Pagina Facebook del cliente e i contatti raccolti
// si leggono a intervalli (sincronizzazione), senza webhook. Servono i permessi pages_manage_ads (creare
// il modulo) e leads_retrieval (leggere i contatti), concessi con il collegamento Meta del cliente.

const graph = (p: string) => `https://graph.facebook.com/${META.version}/${p}`;

export type LeadFormInput = {
  name: string;
  fields: ("FULL_NAME" | "EMAIL" | "PHONE" | "CITY")[];
  customQuestion?: string | null;
  intro?: string | null;
  privacyUrl: string;
  /** Sito del cliente: dove porta il pulsante della pagina di ringraziamento. */
  website?: string | null;
  thankYou?: string | null;
};

/** Parametri della creazione del modulo (funzione pura, coperta dai test). */
export function buildLeadFormParams(f: LeadFormInput) {
  if (!f.fields.length && !f.customQuestion) throw new Error("Il modulo deve avere almeno una domanda");
  const questions = [
    ...f.fields.map((type) => ({ type })),
    ...(f.customQuestion?.trim() ? [{ type: "CUSTOM", key: "domanda_1", label: f.customQuestion.trim().slice(0, 300) }] : []),
  ];
  const website = f.website?.trim();
  return {
    name: f.name.slice(0, 200),
    locale: "it_IT",
    questions: JSON.stringify(questions),
    privacy_policy: JSON.stringify({ url: f.privacyUrl, link_text: "Informativa privacy" }),
    ...(website ? { follow_up_action_url: website } : {}),
    ...(f.intro?.trim()
      ? { context_card: JSON.stringify({ title: f.name.slice(0, 60), style: "PARAGRAPH_STYLE", content: [f.intro.trim().slice(0, 500)] }) }
      : {}),
    thank_you_page: JSON.stringify({
      title: "Grazie!",
      body: (f.thankYou?.trim() || "Abbiamo ricevuto la tua richiesta: ti ricontattiamo al più presto.").slice(0, 300),
      ...(website ? { button_type: "VIEW_WEBSITE", button_text: "Visita il sito", website_url: website } : { button_type: "NONE" }),
    }),
  };
}

/** Crea il modulo sulla Pagina (con il token della Pagina) e restituisce l'id Meta. */
export async function createLeadForm(pageToken: string, pageId: string, f: LeadFormInput) {
  const r = await getJson<{ id: string }>(graph(`${pageId}/leadgen_forms`), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({ ...buildLeadFormParams(f), access_token: pageToken }),
  });
  return r.id;
}

export type MetaLead = { id: string; created_time: string; ad_id?: string; campaign_id?: string; field_data?: { name: string; values: string[] }[] };

/** Contatti del modulo arrivati dopo `sinceUnix` (secondi), seguendo le pagine dei risultati. */
export async function fetchFormLeads(pageToken: string, formId: string, sinceUnix: number, maxPages = 20) {
  const out: MetaLead[] = [];
  let url: string | null = `${graph(`${formId}/leads`)}?${qs({
    fields: "id,created_time,field_data,ad_id,campaign_id",
    filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]),
    limit: 100,
    access_token: pageToken,
  })}`;
  for (let page = 0; url && page < maxPages; page++) {
    const r: { data: MetaLead[]; paging?: { next?: string } } = await getJson(url);
    out.push(...r.data);
    url = r.paging?.next ?? null;
  }
  return out;
}

/**
 * Dalle risposte del modulo ai campi del Lead di 2Target. Meta usa nomi diversi a seconda della lingua
 * e del tipo di domanda (full_name, first_name+last_name, phone_number…): si normalizza qui.
 */
export function mapLeadFields(fieldData: { name: string; values: string[] }[] = []) {
  const value = (...keys: string[]) => {
    for (const k of keys) {
      const f = fieldData.find((x) => x.name.toLowerCase() === k);
      if (f?.values?.[0]?.trim()) return f.values[0].trim();
    }
    return null;
  };
  const first = value("first_name");
  const last = value("last_name");
  const name = value("full_name") ?? ([first, last].filter(Boolean).join(" ") || null);
  const known = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone", "city", "company_name"]);
  const extra = fieldData
    .filter((f) => !known.has(f.name.toLowerCase()) && f.values?.[0]?.trim())
    .map((f) => `${f.name === "domanda_1" ? "Risposta" : f.name}: ${f.values.join(", ")}`);
  const city = value("city");
  return {
    name,
    email: value("email"),
    phone: value("phone_number", "phone"),
    company: value("company_name"),
    message: [...(city ? [`Città: ${city}`] : []), ...extra].join("\n") || null,
  };
}
