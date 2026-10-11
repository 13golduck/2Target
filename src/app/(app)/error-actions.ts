"use server";

import { requireUser } from "@/lib/auth";
import { logError } from "@/lib/error-log";

// Errori mostrati nel browser (messaggi rossi, errori JavaScript): finiscono nel registro dell'utente che li ha visti.
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
  await logError({ userId: me.id, area: detail ? "Pagina (JavaScript)" : "Pagina", message: msg, detail: detail?.slice(0, 4000), path: String(path ?? "").slice(0, 300) });
}
