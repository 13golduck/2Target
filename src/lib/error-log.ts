import "server-only";
import { lt } from "drizzle-orm";

import { db } from "@/db";
import { errorLogs } from "@/db/schema";

// Registro errori: chi ha visto quale errore, dove e quando. Non deve mai far fallire l'operazione che lo chiama.
// Si conservano 90 giorni; i messaggi vengono ripuliti da eventuali segreti evidenti.

const RETENTION_DAYS = 90;
const clean = (t: string) =>
  t
    .replace(/sk-ant-[\w-]+/g, "sk-ant-***")
    .replace(/(password|pass|secret|token|apikey|api_key)=([^&\s]+)/gi, "$1=***")
    .replace(/mysql:\/\/[^@\s]+@/g, "mysql://***@");

export async function logError(o: { userId?: number | null; area: string; message: string; detail?: string | null; path?: string | null }) {
  try {
    await db.insert(errorLogs).values({
      userId: o.userId ?? null,
      area: o.area.slice(0, 60),
      message: clean(o.message).slice(0, 1000) || "Errore senza messaggio",
      detail: o.detail ? clean(o.detail).slice(0, 8000) : null,
      path: o.path?.slice(0, 300) ?? null,
    });
    // Pulizia occasionale delle voci vecchie
    if (Math.random() < 0.02) {
      await db.delete(errorLogs).where(lt(errorLogs.createdAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000)));
    }
  } catch (e) {
    console.error("[errori] impossibile registrare:", e);
  }
}
