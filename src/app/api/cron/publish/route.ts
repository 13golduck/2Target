import { NextResponse } from "next/server";

import { runDuePublications } from "@/lib/publishing/scheduler";

// Sveglia delle pubblicazioni programmate. L'app controlla già da sola ogni minuto, ma su Plesk
// il processo Node può addormentarsi se nessuno usa il sito: un'operazione pianificata di Plesk
// chiama questo indirizzo ogni 5 minuti (Recupera un URL → https://2target.it/api/cron/publish).
// Non serve una chiave: pubblica solo ciò che è già programmato e arrivato all'ora.

export const maxDuration = 300;

const g = globalThis as unknown as { __publishCronAt?: number };

export async function GET() {
  // Al massimo una volta ogni 30 secondi: chiamarlo di continuo non serve a nulla
  if (Date.now() - (g.__publishCronAt ?? 0) < 30_000) return NextResponse.json({ ok: true, skipped: true }, { headers: { "cache-control": "no-store" } });
  g.__publishCronAt = Date.now();
  const r = await runDuePublications();
  return NextResponse.json({ ok: true, ...r }, { headers: { "cache-control": "no-store" } });
}
export const POST = GET;
