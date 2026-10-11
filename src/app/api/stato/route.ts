import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { describeDatabaseUrl, errorCode, explainDbError, getStartupError } from "@/lib/startup-status";

// Diagnosi pubblica dell'installazione: dice solo cosa è configurato, mai i valori.
export const dynamic = "force-dynamic";

export async function GET() {
  let database = "ok";
  try {
    const { db } = await import("@/db");
    await db.execute(sql`select 1`);
  } catch (e) {
    console.error("[stato] database non raggiungibile:", errorCode(e), (e as Error)?.constructor?.name);
    database = explainDbError(errorCode(e));
    // "Access denied for user 'x'@'host'": utente e host non sono segreti e dicono quale account MariaDB ha rifiutato
    const msg = String((e as { cause?: { message?: string } })?.cause?.message ?? (e as Error)?.message ?? "");
    const who = msg.match(/for user '([^']*)'@'([^']*)'/);
    if (who) database += ` (MariaDB ha rifiutato ${who[1]}@${who[2]}${/using password: NO/.test(msg) ? ", senza password" : ""})`;
  }
  const startup = getStartupError();
  const set = (k: string) => Boolean(process.env[k]?.trim());
  const body = {
    database,
    migrazioni: startup ? explainDbError(startup) : "ok",
    databaseUrl: database === "ok" ? undefined : describeDatabaseUrl(),
    variabili: {
      DATABASE_URL: set("DATABASE_URL"),
      AUTH_SECRET: set("AUTH_SECRET"),
      APP_URL: set("APP_URL"),
      CRON_SECRET: set("CRON_SECRET"),
      ANTHROPIC_API_KEY: set("ANTHROPIC_API_KEY"),
      META_APP_ID: set("META_APP_ID"),
      META_APP_SECRET: set("META_APP_SECRET"),
      META_CONFIG_ID: set("META_CONFIG_ID"),
    },
  };
  const ok = database === "ok" && !startup && body.variabili.AUTH_SECRET;
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
