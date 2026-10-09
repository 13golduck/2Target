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
}
