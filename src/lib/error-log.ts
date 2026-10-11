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

/**
 * Dettaglio tecnico di un errore: tipo, codice HTTP, tipo di errore dell'API, request-id (per il supporto Anthropic),
 * contesto della chiamata AI (modello, passo) e stack. Senza segreti.
 */
export function errorDetail(e: unknown, context: Record<string, unknown> = {}) {
  const err = e as {
    name?: string;
    message?: string;
    status?: number;
    requestID?: string | null;
    error?: { error?: { type?: string; message?: string }; type?: string };
    aiContext?: Record<string, unknown>;
    cause?: unknown;
    stack?: string;
  } | null;
  const lines: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v != null && v !== "") lines.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  };
  add("Tipo", err?.name ?? typeof e);
  add("Messaggio", err?.message ?? String(e));
  add("Codice HTTP", err?.status);
  add("Tipo errore API", err?.error?.error?.type ?? err?.error?.type);
  add("Request ID", err?.requestID);
  for (const [k, v] of Object.entries({ ...(err?.aiContext ?? {}), ...context })) add(k, v);
  if (err?.cause) add("Causa", err.cause instanceof Error ? err.cause.message : err.cause);
  add("Quando (UTC)", new Date().toISOString());
  if (err?.stack) lines.push("", err.stack);
  return lines.join("\n");
}

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
