import "server-only";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

import * as schema from "./schema";

// Un solo pool per processo (evita connessioni duplicate con l'hot reload in sviluppo)
const globalForDb = globalThis as unknown as { __dbPool?: mysql.Pool };

const pool =
  globalForDb.__dbPool ??
  mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5, timezone: "Z", dateStrings: ["DATE"] });

if (process.env.NODE_ENV !== "production") globalForDb.__dbPool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
