// Errori leggibili: i messaggi che arrivano da Meta, Google, TikTok o dall'AI sono in inglese tecnico.
// Qui diventano una frase semplice con cosa fare; il testo originale resta come dettaglio per il tecnico.
// Funzione pura (la usano le pagine e i test).

type Rule = { test: RegExp; text: string };

const RULES: Rule[] = [
  { test: /oauth|access token|token (is )?(expired|invalid)|session has expired|invalid_grant|error validating|\b190\b|unauthori[sz]ed|\b401\b/i, text: "L'accesso al social è scaduto o è stato revocato: ricollega l'account da Canali." },
  { test: /permission|not authorized|insufficient|scope|\(#10\)|\(#200\)|\b403\b|forbidden/i, text: "Manca un permesso: ricollega l'account da Canali e lascia tutte le spunte." },
  { test: /rate limit|too many|\b429\b|request limit|user request limit|application request limit/i, text: "Il social ha chiesto di rallentare: riprova tra qualche minuto." },
  { test: /timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network|socket hang up|\b50[234]\b/i, text: "Il social non ha risposto in tempo: riprova tra qualche minuto." },
  { test: /aspect ratio|resolution|video.*(format|codec|duration)|media.*(type|format)|invalid (image|video)|unsupported (file|media)|could not (download|fetch) (the )?media|image.*(too|size)/i, text: "Il social ha rifiutato il file (formato, proporzioni o durata): controlla foto e video e ricaricali." },
  { test: /overloaded|\b529\b|anthropic|claude/i, text: "L'AI è momentaneamente occupata: premi Riprendi o riprova tra poco." },
  { test: /budget|spending limit|insufficient funds|payment/i, text: "Problema di budget o di pagamento sull'account: controlla il metodo di pagamento sul social." },
];

/** Messaggi scritti da 2Target: spiegano già cosa fare (anche se citano tra parentesi l'errore tecnico). */
const OWN = /ESITO INCERTO|ricollega|riprova|controlla|collegalo|ricarica|Canali|Impostazioni|pubblicazione bloccata/i;

const TECHNICAL = /error|exception|http \d|\bcode\b|\(#\d+\)|[a-z]+_[a-z]+_[a-z]+|\{|\}|stack|undefined|null/i;

/** Frase da mostrare e dettaglio tecnico (null se il messaggio era già comprensibile). */
export function friendlyError(raw: string | null | undefined): { text: string; detail: string | null } {
  const message = (raw ?? "").trim();
  if (!message) return { text: "Errore sconosciuto: riprova.", detail: null };
  if (OWN.test(message)) return { text: message, detail: null };
  const rule = RULES.find((r) => r.test.test(message));
  if (rule) return { text: rule.text, detail: message };
  // Messaggi già scritti da 2Target in italiano: restano come sono
  if (!TECHNICAL.test(message)) return { text: message, detail: null };
  return { text: "Qualcosa non ha funzionato. Riprova; se succede ancora apri «Dettagli» e mandali a chi ti assiste.", detail: message };
}
