import { NextResponse } from "next/server";

import { runDuePublications } from "@/lib/publishing/scheduler";

// Sveglia delle pubblicazioni programmate. L'app controlla già da sola ogni minuto, ma su Plesk
// il processo Node può addormentarsi se nessuno usa il sito: un'operazione pianificata di Plesk
// chiama questo indirizzo ogni 5 minuti (Recupera un URL → https://2target.it/api/cron/publish).
// Non serve una chiave: pubblica solo ciò che è già programmato e arrivato all'ora.

export const maxDuration = 300;

export async function GET() {
  const r = await runDuePublications();
  return NextResponse.json({ ok: true, ...r }, { headers: { "cache-control": "no-store" } });
}
export const POST = GET;
