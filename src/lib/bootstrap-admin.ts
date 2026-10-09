import mysql from "mysql2/promise";

import { hashPassword } from "./password";

// Primo amministratore sul server (dove gli script di sviluppo non ci sono).
// Si impostano BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD nelle variabili Node.js di Plesk,
// si riavvia l'app: se la tabella utenti è VUOTA viene creato l'amministratore.
// Dopo il primo accesso le due variabili vanno tolte (con utenti già presenti non fanno nulla).

export async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  if (!email || !process.env.DATABASE_URL) return;
  if (password.length < 12) {
    console.warn("[admin] BOOTSTRAP_ADMIN_PASSWORD troppo corta (minimo 12 caratteri): utente non creato");
    return;
  }
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  try {
    const [rows] = await conn.query("select count(*) as n from users");
    if (Number((rows as { n: number }[])[0].n) > 0) {
      console.log("[admin] utenti già presenti: BOOTSTRAP_ADMIN_* ignorate (puoi toglierle)");
      return;
    }
    await conn.query("insert into users (email, name, password_hash, role, active) values (?, ?, ?, 'admin', 1)", [
      email,
      process.env.BOOTSTRAP_ADMIN_NAME?.trim() || email.split("@")[0],
      await hashPassword(password),
    ]);
    console.log(`[admin] creato l'amministratore ${email}: ora togli le variabili BOOTSTRAP_ADMIN_*`);
  } finally {
    await conn.end();
  }
}
