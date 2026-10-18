import "server-only";
import { constants } from "node:fs";
import { access, statfs } from "node:fs/promises";

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { appSettings, auditLogs, publications, users } from "@/db/schema";
import { appUrl } from "@/lib/integrations/config";
import { sendMail } from "@/lib/mail";
import { ensureMediaDir } from "@/lib/media";
import { backupDir, backupState, listBackups } from "./backup";
import { healthChecks, type Check } from "./health";

// Sorveglianza di 2Target: battito dello scheduler, controlli di salute e avviso agli amministratori
// quando qualcosa si rompe. Lo scheduler stesso non può segnalare di essersi fermato: per quello
// /api/stato risponde 503 e un monitor esterno (es. UptimeRobot) avvisa.

const BEAT_KEY = "scheduler_heartbeat";
const ALERTS_KEY = "watchdog_alerts";
/** Lo stesso problema si ripete al massimo ogni 12 ore. */
const ALERT_COOLDOWN_MS = 12 * 3_600_000;

async function setting<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return row?.value as T | undefined;
}

async function saveSetting(key: string, value: unknown) {
  await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

/** Battito dello scheduler: una scrittura per giro (ogni minuto). */
export async function heartbeat() {
  await saveSetting(BEAT_KEY, { at: new Date().toISOString() });
}

export async function schedulerBeat() {
  const at = Date.parse((await setting<{ at?: string }>(BEAT_KEY))?.at ?? "");
  return Number.isFinite(at) ? new Date(at) : null;
}

async function diskFree() {
  try {
    const s = await statfs(backupDir()).catch(() => statfs(process.cwd()));
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

/** Fatti e controlli correnti (per la pagina di sistema e per gli avvisi). */
export async function currentHealth(now = new Date()): Promise<Check[]> {
  const sync = Date.parse((await setting<{ at?: string }>("sync_last_run"))?.at ?? "");
  const b = await backupState();
  const [overdue] = await db
    .select({ n: sql<number>`count(*)` })
    .from(publications)
    .where(and(eq(publications.status, "programmata"), lt(publications.scheduledAt, new Date(now.getTime() - 15 * 60_000))));
  const [errors] = await db
    .select({ n: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.category, "errori"), gte(auditLogs.createdAt, new Date(now.getTime() - 3_600_000))));
  const mediaWritable = await ensureMediaDir()
    .then((d) => access(d, constants.W_OK))
    .then(() => true)
    .catch(() => false);
  const toDate = (s?: string) => (s && Number.isFinite(Date.parse(s)) ? new Date(s) : null);
  return healthChecks({
    now,
    uptimeMs: process.uptime() * 1000,
    schedulerBeat: await schedulerBeat(),
    syncLastRun: Number.isFinite(sync) ? new Date(sync) : null,
    backup: { lastOkAt: toDate(b.lastOkAt), lastError: b.lastError ?? null, lastErrorAt: toDate(b.lastErrorAt), count: (await listBackups()).length },
    overduePublications: Number(overdue?.n ?? 0),
    errorsLastHour: Number(errors?.n ?? 0),
    diskFreeBytes: await diskFree(),
    mediaWritable,
  });
}

let lastWatch = 0;

/** Dal giro dello scheduler, ogni 15 minuti: email agli amministratori per i problemi nuovi. */
export async function maybeWatch(now = new Date()) {
  if (now.getTime() - lastWatch < 15 * 60_000) return;
  lastWatch = now.getTime();
  // Lo scheduler che gira qui è vivo per definizione: il suo controllo serve a /api/stato e alla pagina
  const problems = (await currentHealth(now)).filter((c) => c.level === "errore" && c.key !== "scheduler");
  if (!problems.length) return;
  const sent = (await setting<Record<string, string>>(ALERTS_KEY)) ?? {};
  const fresh = problems.filter((p) => !sent[p.key] || now.getTime() - Date.parse(sent[p.key]) > ALERT_COOLDOWN_MS);
  if (!fresh.length) return;
  const admins = await db.select({ email: users.email }).from(users).where(and(inArray(users.role, ["superadmin", "admin"]), eq(users.active, true)));
  if (!admins.length) return;
  const link = `${appUrl()}/impostazioni#sistema`;
  const subject = `2Target: ${fresh.length === 1 ? fresh[0].label.toLowerCase() : `${fresh.length} problemi`} da controllare`;
  const text = `${fresh.map((p) => `• ${p.label}: ${p.detail}`).join("\n")}\n\nStato completo: ${link}`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<p>2Target ha rilevato:</p><ul>${fresh.map((p) => `<li><b>${esc(p.label)}</b>: ${esc(p.detail)}</li>`).join("")}</ul><p><a href="${link}">Apri lo stato del sistema</a></p>`;
  for (const a of admins) await sendMail(a.email, subject, text, html).catch((e) => console.error("[sorveglianza] email non inviata:", e));
  for (const p of fresh) sent[p.key] = now.toISOString();
  await saveSetting(ALERTS_KEY, sent);
}
