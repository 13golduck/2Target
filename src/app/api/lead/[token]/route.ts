import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clients, LEAD_SOURCES, leadEvents, leads } from "@/db/schema";
import { audit } from "@/lib/audit";

// Raccoglitore pubblico dei lead: i moduli del sito del cliente inviano qui (JSON o form).
//   POST /api/lead/<chiave del cliente>
// Campi: name, email, phone, company, message, source, utm_source, utm_medium, utm_campaign, page
// Campo trappola anti-spam: "website" deve restare vuoto.
//
// Limiti anti-spam a due livelli:
// - per IP, in memoria: primo sbarramento leggero. L'IP arriva da x-forwarded-for, che un client può
//   falsificare, quindi è best-effort (non è la garanzia).
// - per cliente, su database: contando i lead già salvati in una finestra. È durevole (regge ai riavvii)
//   e NON aggirabile falsificando l'IP, perché conta per leadToken del cliente, non per IP.

const PER_IP_WINDOW_MS = 10 * 60_000;
const PER_IP_MAX = 20;
const PER_CLIENT_WINDOW_MS = 15 * 60_000;
const PER_CLIENT_MAX = 60;

const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string) {
  const now = Date.now();
  // Pulizia opportunistica: evita che la mappa cresca all'infinito tra i riavvii
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > PER_IP_WINDOW_MS) hits.delete(k);
  const h = hits.get(ip);
  if (!h || now - h.t > PER_IP_WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > PER_IP_MAX;
}

/** Tetto durevole per cliente: quanti lead sono già arrivati nella finestra, contati sul database. */
async function clientFlooded(clientId: number) {
  const since = new Date(Date.now() - PER_CLIENT_WINDOW_MS);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.clientId, clientId), gte(leads.receivedAt, since)));
  return Number(n) >= PER_CLIENT_MAX;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

/** Fonte dal campo "source" o dagli UTM (es. utm_source=facebook&utm_medium=paid → meta_ads). */
function guessSource(source?: string, utmSource?: string, utmMedium?: string) {
  if (source && (LEAD_SOURCES as readonly string[]).includes(source)) return source as (typeof LEAD_SOURCES)[number];
  const s = (utmSource ?? "").toLowerCase();
  const m = (utmMedium ?? "").toLowerCase();
  const paid = /(cpc|paid|ads|ppc|sponsor)/.test(m);
  if (/(facebook|instagram|fb|ig|meta)/.test(s)) return paid ? "meta_ads" : s.includes("insta") || s === "ig" ? "instagram" : "facebook";
  if (/google/.test(s)) return paid ? "google_ads" : "seo";
  if (/tiktok/.test(s)) return "tiktok";
  if (/linkedin/.test(s)) return "linkedin";
  if (/(newsletter|email|mail)/.test(s + m)) return "email";
  return "sito";
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (limited(ip)) return NextResponse.json({ ok: false, message: "Troppe richieste" }, { status: 429, headers: cors });
  if (Number(request.headers.get("content-length")) > 20_000) return NextResponse.json({ ok: false }, { status: 413, headers: cors });

  const [client] = token.length >= 16 ? await db.select({ id: clients.id }).from(clients).where(eq(clients.leadToken, token)) : [];
  if (!client) return NextResponse.json({ ok: false, message: "Chiave non valida" }, { status: 404, headers: cors });

  let body: Record<string, string> = {};
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) body = await request.json();
    else body = Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  } catch {
    return NextResponse.json({ ok: false, message: "Dati non leggibili" }, { status: 400, headers: cors });
  }
  const get = (k: string, max = 200) => (body[k] == null ? null : String(body[k]).trim().slice(0, max) || null);

  // Trappola per i bot: campo nascosto compilato → si risponde ok senza salvare
  if (get("website")) return NextResponse.json({ ok: true }, { headers: cors });
  if (!get("email") && !get("phone")) return NextResponse.json({ ok: false, message: "Serve almeno email o telefono" }, { status: 422, headers: cors });

  // Tetto durevole per cliente: regge ai riavvii e non si aggira falsificando l'IP
  if (await clientFlooded(client.id)) return NextResponse.json({ ok: false, message: "Troppe richieste" }, { status: 429, headers: cors });

  const now = new Date();
  const [r] = await db.insert(leads).values({
    clientId: client.id,
    receivedAt: now,
    name: get("name"),
    company: get("company"),
    email: get("email"),
    phone: get("phone", 60),
    message: get("message", 4000),
    source: guessSource(get("source") ?? undefined, get("utm_source") ?? undefined, get("utm_medium") ?? undefined),
    utmSource: get("utm_source", 120),
    utmMedium: get("utm_medium", 120),
    utmCampaign: get("utm_campaign"),
    landingUrl: get("page", 500) ?? request.headers.get("referer")?.slice(0, 500) ?? null,
    stage: "nuovo",
    stageChangedAt: now,
  });
  await db.insert(leadEvents).values({ leadId: r.insertId, toStage: "nuovo", at: now });
  await audit({ userId: null, actorLabel: "Modulo del sito", category: "lead", action: "lead.dal_sito", description: `Lead ricevuto dal sito: «${get("name") ?? get("email") ?? get("phone")}»`, clientId: client.id, target: `lead:${r.insertId}` });

  // Modulo HTML classico: torna alla pagina di ringraziamento del sito, se indicata e dello stesso sito
  const redirect = get("redirect", 500);
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (redirect && origin) {
    try {
      if (new URL(redirect).host === new URL(origin).host) return NextResponse.redirect(redirect, { status: 303, headers: cors });
    } catch {
      /* indirizzo non valido: risposta JSON */
    }
  }
  return NextResponse.json({ ok: true }, { headers: cors });
}
