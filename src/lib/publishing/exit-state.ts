// Stato reale dell'uscita di una scheda, dalle sue pubblicazioni sui profili (una per profilo).
// Senza pubblicazioni la scheda non ha un'uscita automatica: vale solo lo stato del piano.
// Modulo senza dipendenze dal server: lo usano il calendario e il riepilogo settimanale.

export type ExitState = "errore" | "in_corso" | "programmata" | "pubblicata";

export interface PubLite {
  status: "programmata" | "in_corso" | "pubblicata" | "errore" | "annullata";
  platform: string;
  permalink: string | null;
  error: string | null;
}

/** Il caso più urgente vince: un errore su un profilo conta più degli altri profili già usciti. */
export function exitState(pubs: PubLite[]): ExitState | null {
  const live = pubs.filter((p) => p.status !== "annullata");
  if (!live.length) return null;
  for (const s of ["errore", "in_corso", "programmata"] as const) if (live.some((p) => p.status === s)) return s;
  return "pubblicata";
}

export const EXIT_LABEL: Record<ExitState, string> = {
  errore: "Non uscita",
  in_corso: "In pubblicazione",
  programmata: "Programmata",
  pubblicata: "Uscita",
};
