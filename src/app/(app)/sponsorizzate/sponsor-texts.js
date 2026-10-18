// Conferme ed esiti delle azioni su una sponsorizzata: gli stessi testi nella pagina Sponsorizzate e nella pubblicazione.

export const SPONSOR_ACTION_TEXT = {
  pausa: { title: 'Mettere in pausa la sponsorizzata?', content: 'Smette di spendere finché non la riattivi.', confirmText: 'Metti in pausa', tone: 'warning', done: 'Sponsorizzata messa in pausa' },
  riprendi: { title: 'Riattivare la sponsorizzata?', content: 'Riprende a spendere il budget residuo fino alla data di fine.', confirmText: 'Riattiva', tone: 'warning', done: 'Sponsorizzata riattivata' },
  termina: { title: 'Terminare la sponsorizzata?', content: 'Si ferma per sempre: per ripartire serve una nuova sponsorizzata.', confirmText: 'Termina', tone: 'error', done: 'Sponsorizzata terminata' },
};
