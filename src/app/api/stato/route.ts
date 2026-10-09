import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { errorCode, explainDbError, getStartupError } from "@/lib/startup-status";

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
  }
  const startup = getStartupError();
  const set = (k: string) => Boolean(process.env[k]?.trim());
  const body = {
    database,
    migrazioni: startup ? explainDbError(startup) : "ok",
    variabili: {
      DATABASE_URL: set("DATABASE_URL"),
      AUTH_SECRET: set("AUTH_SECRET"),
      APP_URL: set("APP_URL"),
      CRON_SECRET: set("CRON_SECRET"),
      ANTHROPIC_API_KEY: set("ANTHROPIC_API_KEY"),
      SMTP_HOST: set("SMTP_HOST"),
      SMTP_USER: set("SMTP_USER"),
      SMTP_PASS: set("SMTP_PASS"),
    },
  };
  const ok = database === "ok" && !startup && body.variabili.AUTH_SECRET;
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
