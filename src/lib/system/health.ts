// Salute di 2Target: dai fatti raccolti (battito dello scheduler, ultima sincronizzazione, backup, code
// di pubblicazione, errori, spazio su disco) a un elenco di controlli con semaforo. Funzioni pure.

const MIN = 60_000;
const HOUR = 60 * MIN;

export type Level = "ok" | "attenzione" | "errore";
export type Check = { key: string; label: string; level: Level; detail: string };

export type HealthFacts = {
  now: Date;
  /** Da quanto è acceso il server (ms): appena avviato lo scheduler non ha ancora battuto. */
  uptimeMs: number;
  schedulerBeat: Date | null;
  syncLastRun: Date | null;
  backup: { lastOkAt: Date | null; lastError: string | null; lastErrorAt: Date | null; count: number };
  /** Pubblicazioni «programmate» con l'ora già passata da oltre 15 minuti. */
  overduePublications: number;
  errorsLastHour: number;
  /** Spazio libero (byte) sul disco dei file e dei backup; null = non misurabile. */
  diskFreeBytes: number | null;
  mediaWritable: boolean;
};

export const SCHEDULER_LATE_MIN = 10;
export const SYNC_LATE_HOURS = 30;
export const BACKUP_LATE_HOURS = 30;
export const ERRORS_SPIKE = 20;
export const DISK_LOW_BYTES = 2 * 1024 ** 3;
export const DISK_CRITICAL_BYTES = 500 * 1024 ** 2;

const ago = (ms: number) => (ms < HOUR ? `${Math.round(ms / MIN)} min` : ms < 48 * HOUR ? `${Math.round(ms / HOUR)} ore` : `${Math.round(ms / (24 * HOUR))} giorni`);
const gb = (b: number) => `${(b / 1024 ** 3).toLocaleString("it-IT", { maximumFractionDigits: 1 })} GB`;

export function healthChecks(f: HealthFacts): Check[] {
  const t = f.now.getTime();
  const out: Check[] = [];

  const beat = f.schedulerBeat ? t - f.schedulerBeat.getTime() : null;
  out.push(
    beat != null && beat <= SCHEDULER_LATE_MIN * MIN
      ? { key: "scheduler", label: "Pubblicazioni programmate", level: "ok", detail: `controllo ogni minuto, ultimo ${ago(beat)} fa` }
      : f.uptimeMs < SCHEDULER_LATE_MIN * MIN
        ? { key: "scheduler", label: "Pubblicazioni programmate", level: "ok", detail: "app appena avviata: primo controllo entro un minuto" }
        : { key: "scheduler", label: "Pubblicazioni programmate", level: "errore", detail: beat == null ? "il controllo non è mai partito: riavvia l'app da Plesk" : `fermo da ${ago(beat)}: riavvia l'app da Plesk` },
  );

  if (f.overduePublications) {
    out.push({ key: "coda", label: "Coda di pubblicazione", level: "errore", detail: `${f.overduePublications} post programmati non sono usciti all'ora prevista` });
  } else out.push({ key: "coda", label: "Coda di pubblicazione", level: "ok", detail: "nessun post in ritardo" });

  const sync = f.syncLastRun ? t - f.syncLastRun.getTime() : null;
  out.push(
    sync != null && sync <= SYNC_LATE_HOURS * HOUR
      ? { key: "sync", label: "Aggiornamento notturno dei dati", level: "ok", detail: `ultimo ${ago(sync)} fa` }
      : { key: "sync", label: "Aggiornamento notturno dei dati", level: "attenzione", detail: sync == null ? "mai eseguito: controlla l'operazione pianificata su Plesk" : `ultimo ${ago(sync)} fa: controlla l'operazione pianificata su Plesk` },
  );

  const b = f.backup;
  const bAge = b.lastOkAt ? t - b.lastOkAt.getTime() : null;
  const failedAfterOk = b.lastErrorAt && (!b.lastOkAt || b.lastErrorAt > b.lastOkAt);
  out.push(
    failedAfterOk
      ? { key: "backup", label: "Backup del database", level: "errore", detail: `ultimo tentativo non riuscito: ${b.lastError ?? "errore sconosciuto"}` }
      : bAge != null && bAge <= BACKUP_LATE_HOURS * HOUR
        ? { key: "backup", label: "Backup del database", level: "ok", detail: `ultimo ${ago(bAge)} fa · ${b.count} ${b.count === 1 ? "copia conservata" : "copie conservate"}` }
        : { key: "backup", label: "Backup del database", level: "attenzione", detail: bAge == null ? "nessun backup ancora: il primo parte stanotte" : `ultimo ${ago(bAge)} fa` },
  );

  out.push(
    f.errorsLastHour >= ERRORS_SPIKE
      ? { key: "errori", label: "Errori", level: "attenzione", detail: `${f.errorsLastHour} errori nell'ultima ora: guarda la pagina Errori` }
      : { key: "errori", label: "Errori", level: "ok", detail: f.errorsLastHour ? `${f.errorsLastHour} nell'ultima ora` : "nessuno nell'ultima ora" },
  );

  out.push(
    !f.mediaWritable
      ? { key: "disco", label: "Spazio e file", level: "errore", detail: "la cartella dei file non è scrivibile: i caricamenti non funzionano" }
      : f.diskFreeBytes == null
        ? { key: "disco", label: "Spazio e file", level: "ok", detail: "cartella dei file scrivibile" }
        : f.diskFreeBytes < DISK_CRITICAL_BYTES
          ? { key: "disco", label: "Spazio e file", level: "errore", detail: `restano solo ${gb(f.diskFreeBytes)} liberi` }
          : f.diskFreeBytes < DISK_LOW_BYTES
            ? { key: "disco", label: "Spazio e file", level: "attenzione", detail: `restano ${gb(f.diskFreeBytes)} liberi` }
            : { key: "disco", label: "Spazio e file", level: "ok", detail: `${gb(f.diskFreeBytes)} liberi` },
  );
  return out;
}

// ── Rotazione dei backup ─────────────────────────────────────────────
// Si tengono: gli ultimi 7 giorni (uno al giorno), le ultime 4 settimane (uno a settimana), gli ultimi 6 mesi
// (uno al mese). Un ripristino recente è preciso, uno vecchio resta possibile senza riempire il disco.

export const KEEP = { daily: 7, weekly: 4, monthly: 6 };

const BACKUP_NAME = /^2target-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.sql\.gz$/;

export const backupName = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `2target-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.sql.gz`;
};

export function backupDate(name: string) {
  const m = name.match(BACKUP_NAME);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
}

/** Lunedì della settimana (UTC) come chiave. */
const weekKey = (d: Date) => {
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
};

/** Nomi dei backup da cancellare. I file con nomi estranei non si toccano mai. */
export function backupsToDelete(names: string[]): string[] {
  const dated = names
    .map((n) => ({ n, d: backupDate(n) }))
    .filter((x): x is { n: string; d: Date } => !!x.d)
    .sort((a, b) => b.d.getTime() - a.d.getTime());
  const keep = new Set<string>();
  const pick = (key: (d: Date) => string, limit: number) => {
    const seen = new Set<string>();
    for (const x of dated) {
      const k = key(x.d);
      if (seen.has(k)) continue;
      seen.add(k);
      if (seen.size > limit) break;
      keep.add(x.n); // il più recente di quel giorno / settimana / mese
    }
  };
  pick((d) => d.toISOString().slice(0, 10), KEEP.daily);
  pick(weekKey, KEEP.weekly);
  pick((d) => d.toISOString().slice(0, 7), KEEP.monthly);
  return dated.filter((x) => !keep.has(x.n)).map((x) => x.n);
}
