// Crea o aggiorna un utente del team.
// Uso: npm run user:create -- email@golduck.it "Nome Cognome" [admin|consulente]
// La password viene chiesta nel terminale e non si vede mentre la scrivi.

import mysql from "mysql2/promise";
import { stdin, stdout } from "node:process";
import { drizzle } from "drizzle-orm/mysql2";

import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";

process.loadEnvFile(".env.local");

const [emailArg, nameArg, roleArg] = process.argv.slice(2);
const email = String(emailArg ?? "").trim().toLowerCase();
const name = (nameArg ?? "").trim() || email.split("@")[0];
const role = roleArg === "consulente" ? "consulente" : "admin";

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run user:create -- email@golduck.it "Nome Cognome" [admin|consulente]');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (char: string) => {
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") process.exit(130);
      else if (char === "\u007f") value = value.slice(0, -1);
      else value += char;
    };
    stdin.on("data", onData);
  });
}

const password = await askHidden("Password (min. 12 caratteri): ");
if (password.length < 12) {
  console.error("Password troppo corta: servono almeno 12 caratteri.");
  process.exit(1);
}
if ((await askHidden("Ripeti la password: ")) !== password) {
  console.error("Le password non coincidono.");
  process.exit(1);
}

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
const passwordHash = await hashPassword(password);
await drizzle(pool)
  .insert(users)
  .values({ email, name, passwordHash, role })
  .onDuplicateKeyUpdate({ set: { name, passwordHash, role, active: true } });

console.log(`Utente pronto: ${email} (${role})`);
await pool.end();
