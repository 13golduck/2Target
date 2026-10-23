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
  // Cartella di foto e video da pubblicare (fuori dall'app): deve essere scrivibile
  let media = "ok";
  try {
    const { access, constants } = await import("node:fs/promises");
    const { ensureMediaDir } = await import("@/lib/media");
    await access(await ensureMediaDir(), constants.W_OK);
  } catch (e) {
    media = `cartella dei file non scrivibile (${errorCode(e)})`;
  }
  // FFmpeg per controllare e convertire i video (arriva con il pacchetto di produzione)
  const { ffmpegVersion } = await import("@/lib/media-video");
  const ffmpeg = (await ffmpegVersion()) ?? "non disponibile: i video si pubblicano senza controllo";
  // Pubblicazioni programmate: il controllo ogni minuto è vivo? (un monitor esterno avvisa se risponde 503)
  let scheduler = "ok";
  if (database === "ok") {
    try {
      const { currentHealth } = await import("@/lib/system/watchdog");
      const check = (await currentHealth()).find((c) => c.key === "scheduler");
      if (check && check.level !== "ok") scheduler = check.detail;
    } catch (e) {
      scheduler = `non verificabile (${errorCode(e)})`;
    }
  }
  const startup = getStartupError();
  const set = (k: string) => Boolean(process.env[k]?.trim());
  const body = {
    database,
    migrazioni: startup ? explainDbError(startup) : "ok",
    media,
    ffmpeg,
    scheduler,
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
  const ok = database === "ok" && !startup && body.variabili.AUTH_SECRET && scheduler === "ok";
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
