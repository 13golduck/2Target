import "server-only";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { logError } from "@/lib/error-log";
import { backupDate, backupName, backupsToDelete } from "./health";

// Backup del database: un file SQL compresso al giorno, scritto da 2Target (mysqldump non è sempre installato
// sul server), in una cartella privata fuori dal sito. Rotazione: 7 giorni, 4 settimane, 6 mesi (vedi health.ts).
// I token delle integrazioni nel database sono già cifrati con AUTH_SECRET: il file da solo non li espone,
// ma resta comunque leggibile solo dal proprietario (permessi 600).

const BATCH = 500;
const STATE_KEY = "backup_state";

export type BackupState = { lastOkAt?: string; lastFile?: string; lastBytes?: number; lastError?: string; lastErrorAt?: string };

export function backupDir() {
  return process.env.BACKUP_DIR || path.resolve(process.cwd(), "..", "private", "2target-backup");
}

type Pool = { query: (sql: string, values?: unknown[]) => Promise<[unknown, unknown]>; escape: (v: unknown) => string };
const pool = () => (db as unknown as { $client: Pool }).$client;

const ident = (name: string) => `\`${name.replace(/`/g, "``")}\``;

/** Valore SQL: le colonne JSON arrivano come oggetti e vanno riscritte come testo JSON. */
function literal(v: unknown, escape: Pool["escape"]) {
  if (v === null || v === undefined) return "NULL";
  if (Buffer.isBuffer(v)) return `X'${v.toString("hex")}'`;
  if (v instanceof Date) return escape(v.toISOString().slice(0, 19).replace("T", " "));
  if (typeof v === "object") return escape(JSON.stringify(v));
  if (typeof v === "boolean") return v ? "1" : "0";
  return escape(v);
}

/** Righe SQL del dump, tabella per tabella, a blocchi (non si carica tutto il database in memoria). */
async function* dumpLines(): AsyncGenerator<string> {
  const p = pool();
  yield `-- Backup 2Target del ${new Date().toISOString()}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET time_zone='+00:00';\n`;
  const [tables] = (await p.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")) as [Record<string, string>[], unknown];
  for (const row of tables) {
    const table = Object.values(row)[0];
    const [[create]] = (await p.query(`SHOW CREATE TABLE ${ident(table)}`)) as [Record<string, string>[], unknown];
    yield `\nDROP TABLE IF EXISTS ${ident(table)};\n${create["Create Table"]};\n`;
    // Chiave primaria per un ordine stabile tra un blocco e l'altro
    const [keys] = (await p.query(`SHOW KEYS FROM ${ident(table)} WHERE Key_name = 'PRIMARY'`)) as [{ Column_name: string }[], unknown];
    const order = keys.length ? ` ORDER BY ${keys.map((k) => ident(k.Column_name)).join(", ")}` : "";
    for (let offset = 0; ; offset += BATCH) {
      const [rows] = (await p.query(`SELECT * FROM ${ident(table)}${order} LIMIT ${BATCH} OFFSET ${offset}`)) as [Record<string, unknown>[], unknown];
      if (!rows.length) break;
      const cols = Object.keys(rows[0]).map(ident).join(", ");
      yield `INSERT INTO ${ident(table)} (${cols}) VALUES\n${rows.map((r) => `(${Object.values(r).map((v) => literal(v, p.escape.bind(p))).join(", ")})`).join(",\n")};\n`;
      if (rows.length < BATCH) break;
    }
  }
  yield "\nSET FOREIGN_KEY_CHECKS=1;\n";
}

export async function backupState(): Promise<BackupState> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, STATE_KEY));
  return (row?.value as BackupState | undefined) ?? {};
}

async function saveState(patch: BackupState) {
  const value = { ...(await backupState()), ...patch };
  await db.insert(appSettings).values({ key: STATE_KEY, value }).onDuplicateKeyUpdate({ set: { value } });
}

/** Backup conservati, dal più recente. */
export async function listBackups() {
  const dir = backupDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: { name: string; at: Date; bytes: number }[] = [];
  for (const name of names) {
    const at = backupDate(name);
    if (!at) continue;
    const s = await stat(path.join(dir, name)).catch(() => null);
    if (s) out.push({ name, at, bytes: s.size });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const g = globalThis as unknown as { __backupRunning?: boolean };

/** Esegue un backup e la rotazione. Mai due insieme; l'esito resta in app_settings e nell'audit trail. */
export async function runBackup(trigger: "notte" | "manuale", userId: number | null = null) {
  if (g.__backupRunning) return { ok: false as const, error: "Un backup è già in corso" };
  g.__backupRunning = true;
  const dir = backupDir();
  const name = backupName(new Date());
  const tmp = path.join(dir, `.${name}.tmp`);
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Prima nel file temporaneo, poi il nome definitivo: un backup a metà non sembra mai valido
    await pipeline(Readable.from(dumpLines()), createGzip({ level: 6 }), createWriteStream(tmp, { mode: 0o600 }));
    await chmod(tmp, 0o600);
    await rename(tmp, path.join(dir, name));
    const { size } = await stat(path.join(dir, name));
    const all = await listBackups();
    for (const old of backupsToDelete(all.map((b) => b.name))) await rm(path.join(dir, old), { force: true });
    await saveState({ lastOkAt: new Date().toISOString(), lastFile: name, lastBytes: size });
    await audit({ userId, actorLabel: userId ? undefined : "Sistema", category: "sistema", action: "backup.eseguito", description: `Backup del database (${trigger}): ${name}, ${Math.round(size / 1024)} KB` });
    return { ok: true as const, name, bytes: size };
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    const message = e instanceof Error ? e.message : String(e);
    await saveState({ lastError: message.slice(0, 300), lastErrorAt: new Date().toISOString() }).catch(() => undefined);
    await logError({ userId, area: "Backup", message: `Backup del database non riuscito: ${message}`, detail: e instanceof Error ? e.stack : null });
    return { ok: false as const, error: message };
  } finally {
    g.__backupRunning = false;
  }
}

/** Dal giro dello scheduler: dalle 2 di notte (ora italiana) un backup al giorno. */
export async function maybeRunNightlyBackup(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("it-IT", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }).format(now));
  if (hour < 2 || hour >= 6) return;
  const st = await backupState();
  const last = Date.parse(st.lastOkAt ?? "");
  const lastTry = Date.parse(st.lastErrorAt ?? "");
  if (Number.isFinite(last) && now.getTime() - last < 20 * 3_600_000) return;
  // Dopo un errore si riprova al massimo una volta l'ora, per non riempire il registro
  if (Number.isFinite(lastTry) && now.getTime() - lastTry < 3_600_000) return;
  await runBackup("notte");
}
