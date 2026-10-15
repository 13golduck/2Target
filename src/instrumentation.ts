// Eseguito una volta all'avvio del server: applica le migrazioni nuove della cartella drizzle/
// e, solo al primo avvio su un database vuoto, crea l'amministratore (BOOTSTRAP_ADMIN_*).
// Così ogni deploy su Plesk aggiorna da solo le tabelle (basta "Riavvia app").
// Un errore qui non deve bloccare tutto il sito: si registra e si legge su /api/stato.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { setStartupError } = await import("./lib/startup-status");
  try {
    if (process.env.SKIP_DB_MIGRATIONS !== "true") {
      const { runMigrations } = await import("./lib/run-migrations");
      await runMigrations();
    }
    setStartupError(null);
  } catch (e) {
    console.error("[db] migrazioni non riuscite:", e);
    setStartupError(e);
    return;
  }
  const { bootstrapAdmin } = await import("./lib/bootstrap-admin");
  await bootstrapAdmin().catch((e) => console.error("[admin] creazione non riuscita:", e));
  // Chiavi delle integrazioni salvate in Impostazioni
  const { loadIntegrationKeys } = await import("./lib/integrations/keys");
  await loadIntegrationKeys().catch((e) => console.error("[integrazioni] chiavi non caricate:", e));
  // Pubblicazioni programmate: controllo ogni minuto
  const { startPublishScheduler } = await import("./lib/publishing/scheduler");
  startPublishScheduler();
  // Check-up AI fermati dal riavvio: ripartono da soli (se recenti e nei limiti di spesa)
  const { resumeStaleCheckups } = await import("./lib/ai/resume");
  await resumeStaleCheckups().catch((e) => console.error("[ai] ripresa automatica non riuscita:", e));
  // Messaggio di sistema nell'audit trail: ogni avvio (deploy, riavvio da Plesk) resta tracciato
  const { audit } = await import("./lib/audit");
  const { readFile } = await import("node:fs/promises");
  const version = (await readFile(`${process.cwd()}/VERSION`, "utf8").catch(() => "sviluppo")).trim();
  await audit({
    userId: null,
    actorLabel: "Sistema",
    category: "sistema",
    action: "app.avvio",
    description: `App avviata · versione ${version} · migrazioni del database aggiornate`,
    meta: { versione: version, node: process.version, ambiente: process.env.NODE_ENV ?? null },
  });
}

/** Errori del server durante una richiesta (pagine, azioni): finiscono nell'audit trail, categoria «errori». */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const e = err as Error & { digest?: string };
  // I redirect e le pagine non trovate non sono errori
  if (typeof e?.digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(e.digest)) return;
  const { logError } = await import("./lib/error-log");
  await logError({
    area: "Server",
    message: e?.message || String(err),
    detail: `${request.method} ${request.path} · ${context.routeType}${e?.digest ? ` · digest ${e.digest}` : ""}\n${e?.stack ?? ""}`,
    path: request.path,
  });
}
