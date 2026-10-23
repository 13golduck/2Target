// Limiti delle piattaforme (documentazione delle API, ottobre 2026). Modulo puro: lo usano i client
// delle integrazioni e le regole di pubblicazione, senza caricare il codice di rete.

export const THREADS_MAX_CHARS = 500;
export const THREADS_MAX_CAROUSEL = 20;

export const PIN_TITLE_MAX = 100;
export const PIN_DESCRIPTION_MAX = 500;
export const PIN_MAX_IMAGES = 5;

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
/** YouTube considera Short un video verticale o quadrato fino a 3 minuti. */
export const SHORTS_MAX_SECONDS = 180;

export const GBP_SUMMARY_MAX = 1500;
