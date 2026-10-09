import mysql from "mysql2/promise";

// Primo amministratore sul server (dove gli script di sviluppo non ci sono).
// Si imposta BOOTSTRAP_ADMIN_EMAIL (e facoltativo BOOTSTRAP_ADMIN_NAME) nelle variabili Node.js di Plesk
// e si riavvia l'app: se la tabella utenti è VUOTA viene creato l'amministratore. Nessuna password:
// si accede con il codice via email. Con utenti già presenti le variabili non fanno nulla.

export async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.DATABASE_URL) return;
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  try {
    const [rows] = await conn.query("select count(*) as n from users");
    if (Number((rows as { n: number }[])[0].n) > 0) {
      console.log("[admin] utenti già presenti: BOOTSTRAP_ADMIN_* ignorate (puoi toglierle)");
      return;
    }
    await conn.query("insert into users (email, name, role, active) values (?, ?, 'admin', 1)", [
      email,
      process.env.BOOTSTRAP_ADMIN_NAME?.trim() || email.split("@")[0],
    ]);
    console.log(`[admin] creato l'amministratore ${email}: ora togli le variabili BOOTSTRAP_ADMIN_*`);
  } finally {
    await conn.end();
  }
}
