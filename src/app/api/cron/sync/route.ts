import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { syncClient } from "@/lib/integrations/sync";
import { audit } from "@/lib/audit";

// Sincronizzazione notturna di tutti i clienti. Su Plesk: Operazioni pianificate →
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://DOMINIO/api/cron/sync
// Senza CRON_SECRET impostato l'indirizzo è disattivato.

export const maxDuration = 300;

export async function POST(request: Request) {
  return run(request);
}
export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ message: "Non autorizzato" }, { status: 401 });

  const list = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const report: Record<string, string[]> = {};
  const started = Date.now();
  for (const c of list) report[c.name] = await syncClient(c.id);
  const withErrors = Object.entries(report).filter(([, e]) => e.length);
  await audit({
    userId: null,
    actorLabel: "Sistema",
    category: "sistema",
    action: "sync.notturna",
    description: `Aggiornamento automatico dei canali: ${list.length} clienti in ${Math.round((Date.now() - started) / 1000)} s${withErrors.length ? ` · ${withErrors.length} con errori` : " · tutto ok"}`,
    meta: withErrors.length ? { errori: Object.fromEntries(withErrors) } : null,
  });
  return NextResponse.json({ ok: true, report });
}
