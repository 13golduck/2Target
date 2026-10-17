// Il testo dei post LinkedIn usa una sintassi con caratteri riservati (menzioni, hashtag, parentesi…):
// vanno protetti con «\», altrimenti il post viene rifiutato o tagliato. Gli hashtag (#parola) diventano
// il modello {hashtag|\#|parola} che LinkedIn mostra come hashtag cliccabile.
// Modulo senza dipendenze dal server (si prova con i test).

const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
const escape = (t: string) => t.replace(RESERVED, (c) => `\\${c}`);

export function escapeCommentary(text: string) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out += escape(text.slice(last, m.index)) + `{hashtag|\\#|${m[1]}}`;
    last = m.index! + m[0].length;
  }
  return out + escape(text.slice(last));
}
