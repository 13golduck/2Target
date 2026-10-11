"use server";

import { and, desc, eq, gte, notLike } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logError } from "@/lib/error-log";

// Errori mostrati nel browser (messaggi rossi, errori JavaScript): finiscono nell'audit trail, con l'utente che li ha visti.
const recent = new Map<string, number>();

export async function reportClientError(message: string, path: string, detail?: string) {
  const me = await requireUser();
  const msg = String(message ?? "").slice(0, 1000);
  if (!msg) return;
  // Lo stesso errore ripetuto in pochi secondi si registra una volta sola
  const key = `${me.id}|${msg}|${path}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 10_000) return;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  // Se il messaggio mostrato viene da un errore già registrato dal server, si collega la voce con il dettaglio tecnico
  const server = (
    await db
      .select({ id: auditLogs.id, message: auditLogs.description, meta: auditLogs.meta })
      .from(auditLogs)
      .where(and(eq(auditLogs.category, "errori"), gte(auditLogs.createdAt, new Date(now - 86_400_000)), notLike(auditLogs.action, "errore.pagina%")))
      .orderBy(desc(auditLogs.id))
      .limit(50)
  ).map((r) => ({ ...r, detail: typeof r.meta?.dettaglio === "string" ? r.meta.dettaglio : null }));
  const twin = server.find((r) => r.message.length > 10 && (msg.includes(r.message.slice(0, 200)) || r.message.includes(msg)));
  const full = [detail?.slice(0, 4000), twin && `\n— Dettaglio tecnico dal server (voce #${twin.id}) —\n${twin.detail ?? ""}`].filter(Boolean).join("\n");
  const isJs = !!detail?.startsWith("File:");
  await logError({ userId: me.id, area: isJs ? "Pagina (JavaScript)" : "Pagina", message: msg, detail: full || null, path: String(path ?? "").slice(0, 300) });
}
