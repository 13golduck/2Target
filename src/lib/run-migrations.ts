import path from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

export async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL mancante: migrazioni saltate");
    return;
  }
  const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });
  try {
    await migrate(drizzle(connection), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[db] migrazioni aggiornate");
  } finally {
    await connection.end();
  }
}
