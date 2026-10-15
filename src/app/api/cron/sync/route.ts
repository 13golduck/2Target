import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { appSettings, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncClient } from "@/lib/integrations/sync";
import { audit } from "@/lib/audit";
import { sendDueMonthlyReports } from "@/lib/monthly-report";

// Sincronizzazione notturna di tutti i clienti (canali, KPI). Su Plesk: Operazioni pianificate →
// «Recupera un URL» https://2target.it/api/cron/sync ogni notte (es. alle 3:00).
// Senza chiave vale al massimo una volta ogni 20 ore; con "Authorization: Bearer $CRON_SECRET" sempre.

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
  // Senza chiave (operazione pianificata di Plesk «Recupera un URL») si esegue al massimo una volta ogni 20 ore:
  // chiunque chiami l'indirizzo non può fare altro che anticipare l'aggiornamento del giorno
  if (!ok) {
    const [last] = await db.select().from(appSettings).where(eq(appSettings.key, "sync_last_run")).limit(1);
    const at = Date.parse((last?.value as { at?: string } | undefined)?.at ?? "");
    if (Number.isFinite(at) && Date.now() - at < 20 * 3_600_000) return NextResponse.json({ ok: true, skipped: true, lastRun: new Date(at).toISOString() });
  }
  const runAt = { at: new Date().toISOString() };
  await db.insert(appSettings).values({ key: "sync_last_run", value: runAt }).onDuplicateKeyUpdate({ set: { value: runAt } });

  const list = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const report: Record<string, string[]> = {};
  const started = Date.now();
  for (const c of list) report[c.name] = await syncClient(c.id);
  // Report mensili ai clienti che li hanno attivi (dal 3 del mese, una volta per mese)
  const reports = await sendDueMonthlyReports().catch((e) => [`report: ${(e as Error).message}`]);
  const withErrors = Object.entries(report).filter(([, e]) => e.length);
  await audit({
    userId: null,
    actorLabel: "Sistema",
    category: "sistema",
    action: "sync.notturna",
    description: `Aggiornamento automatico dei canali: ${list.length} clienti in ${Math.round((Date.now() - started) / 1000)} s${withErrors.length ? ` · ${withErrors.length} con errori` : " · tutto ok"}`,
    meta: withErrors.length ? { errori: Object.fromEntries(withErrors) } : null,
  });
  return NextResponse.json({ ok: true, report, reports });
}
