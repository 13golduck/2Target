// Eseguito una volta all'avvio del server: applica le migrazioni nuove della cartella drizzle/
// e, solo al primo avvio su un database vuoto, crea l'amministratore (BOOTSTRAP_ADMIN_*).
// Così ogni deploy su Plesk aggiorna da solo le tabelle (basta "Riavvia app").

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_DB_MIGRATIONS !== "true") {
    const { runMigrations } = await import("./lib/run-migrations");
    await runMigrations();
  }
  const { bootstrapAdmin } = await import("./lib/bootstrap-admin");
  await bootstrapAdmin().catch((e) => console.error("[admin] creazione non riuscita:", e));
}
