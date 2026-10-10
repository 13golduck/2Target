// Crea o riattiva un utente del team (accesso con codice via email, nessuna password).
// Uso: npm run user:create -- email@golduck.it "Nome Cognome" [superadmin|admin|user|viewer]
// Di solito non serve: gli amministratori aggiungono i colleghi dalla pagina Utenti.

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

import { users } from "../src/db/schema";

process.loadEnvFile(".env.local");

const [emailArg, nameArg, roleArg] = process.argv.slice(2);
const email = String(emailArg ?? "").trim().toLowerCase();
const name = (nameArg ?? "").trim() || email.split("@")[0];
const role = (["superadmin", "admin", "user", "viewer"] as const).find((r) => r === roleArg) ?? "admin";

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run user:create -- email@golduck.it "Nome Cognome" [superadmin|admin|user|viewer]');
  process.exit(1);
}

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
await drizzle(pool).insert(users).values({ email, name, role }).onDuplicateKeyUpdate({ set: { name, role, active: true } });
console.log(`Utente pronto: ${email} (${role}). Accede con il codice inviato via email.`);
await pool.end();
