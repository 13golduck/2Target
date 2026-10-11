import "server-only";
import { audit } from "@/lib/audit";

// Errori: finiscono nell'audit trail (registro unico), categoria «errori».
// I messaggi vengono ripuliti da eventuali segreti evidenti.

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

/**
 * Registra un errore nell'audit trail (categoria «errori»): messaggio, area, pagina e dettaglio tecnico.
 * Non deve mai far fallire l'operazione che lo chiama.
 */
export async function logError(o: { userId?: number | null; area: string; message: string; detail?: string | null; path?: string | null; clientId?: number | null }) {
  const message = clean(o.message).slice(0, 1000) || "Errore senza messaggio";
  await audit({
    userId: o.userId ?? null,
    actorLabel: o.userId ? undefined : "Sistema",
    category: "errori",
    action: `errore.${o.area.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`.slice(0, 60),
    description: message.slice(0, 600),
    clientId: o.clientId ?? null,
    path: o.path?.slice(0, 300) ?? null,
    meta: {
      area: o.area.slice(0, 60),
      ...(message.length > 600 && { messaggio: message }),
      ...(o.detail && { dettaglio: clean(o.detail).slice(0, 8000) }),
    },
  });
}
