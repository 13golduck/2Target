import "server-only";

import { appUrl } from "@/lib/integrations/config";
import { signPayload, verifyPayload } from "@/lib/secret-box";

// Link di approvazione per il cliente: firmato, valido 60 giorni, funziona solo se l'approvazione è attiva per quel cliente.
// Spegnere l'interruttore lo invalida subito, anche se il link non è scaduto.

const TTL_DAYS = 60;

export function approvalLink(clientId: number) {
  return `${appUrl()}/approva/${signPayload({ kind: "approva", c: clientId }, TTL_DAYS * 86_400)}`;
}

export function approvalClientId(token: string) {
  const p = verifyPayload<{ kind?: string; c?: number }>(decodeURIComponent(token));
  return p?.kind === "approva" && typeof p.c === "number" ? p.c : null;
}
