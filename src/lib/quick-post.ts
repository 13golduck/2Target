// «Crea post»: le regole della procedura guidata in tre passi (dove, cosa, quando). Funzioni pure.
// Il formato si deduce dai file, la scheda entra nel piano in corso e l'approvazione segue le regole del cliente.

export type QuickFile = { kind: "image" | "video" };

/** Un video → reel; due o più file → carosello; altrimenti post (anche di solo testo). */
export function inferFormat(files: QuickFile[]): "post" | "reel" | "carosello" {
  if (files.length >= 2) return "carosello";
  if (files.length === 1 && files[0].kind === "video") return "reel";
  return "post";
}

/** Titolo interno: la prima riga del testo, corta. */
export function titleFromCaption(caption: string) {
  const first = caption.split("\n").find((l) => l.trim())?.trim() ?? "";
  const clean = first.replace(/\s+/g, " ");
  return (clean.length > 70 ? `${clean.slice(0, 67).trimEnd()}…` : clean) || "Post";
}

export type PlanRange = { id: number; startsOn: string; endsOn: string };

/** Piano che copre il giorno di uscita (ora italiana); a parità, il più recente. Null = fuori dal piano. */
export function planFor(plans: PlanRange[], when: Date) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(when);
  return plans.filter((p) => p.startsOn <= day && p.endsOn >= day).sort((a, b) => b.id - a.id)[0]?.id ?? null;
}

/**
 * Esce subito chi può pubblicare; va in approvazione se il cliente approva via link
 * o se chi lo crea non è abilitato a pubblicare.
 */
export function initialStatus(o: { canPublish: boolean; approvalEnabled: boolean }): "approvato" | "da_approvare" {
  return o.canPublish && !o.approvalEnabled ? "approvato" : "da_approvare";
}
