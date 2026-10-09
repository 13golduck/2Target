// Eseguito una volta all'avvio del server: applica le migrazioni nuove della cartella drizzle/.
// Così ogni deploy su Plesk aggiorna da solo le tabelle (basta "Riavvia app").

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SKIP_DB_MIGRATIONS !== "true") {
    const { runMigrations } = await import("./lib/run-migrations");
    await runMigrations();
  }
}
