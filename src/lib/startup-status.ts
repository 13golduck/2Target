// Esito dell'avvio (migrazioni), condiviso tra instrumentation e /api/stato.
// Si conserva solo il codice d'errore del database, mai messaggi che possano contenere credenziali.

const g = globalThis as unknown as { __startupError?: string | null };

export function setStartupError(e: unknown) {
  if (!e) {
    g.__startupError = null;
    return;
  }
  g.__startupError = errorCode(e);
}

/** Codice dell'errore di mysql2, anche quando Drizzle lo avvolge in `cause`. */
export function errorCode(e: unknown): string {
  const err = e as { code?: unknown; cause?: { code?: unknown } };
  const code = err?.code ?? err?.cause?.code;
  return typeof code === "string" ? code : "ERRORE_SCONOSCIUTO";
}

export const getStartupError = () => g.__startupError ?? null;

/** Traduce i codici di mysql2 in indicazioni per chi configura Plesk. */
export function explainDbError(code: string) {
  const map: Record<string, string> = {
    ER_ACCESS_DENIED_ERROR: "utente o password del database non corrispondono a DATABASE_URL",
    ER_BAD_DB_ERROR: "il nome del database in DATABASE_URL non esiste",
    ER_DBACCESS_DENIED_ERROR: "l'utente non ha accesso a questo database",
    ECONNREFUSED: "il server MariaDB non risponde su host e porta indicati",
    ENOTFOUND: "host del database sconosciuto",
    ERR_INVALID_URL: "DATABASE_URL non è un indirizzo valido (caratteri speciali nella password?)",
  };
  return map[code] ?? `errore ${code}`;
}

/** Momento dell'avvio del processo (per finestre temporali come il primo accesso). */
const gs = globalThis as unknown as { __startedAt?: number };
gs.__startedAt ??= Date.now();
export const getStartedAt = () => gs.__startedAt ?? Date.now();
