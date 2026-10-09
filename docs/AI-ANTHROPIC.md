# Chiave API Anthropic per l'AI di 2Target

Il check-up a quattro mani usa Claude tramite le API di Anthropic, con l'account dell'organizzazione Golduck.
La chiave sta solo sul server (`.env.local` in locale, variabili Node.js su Plesk): il browser non la vede mai.

## 1. Organizzazione e fatturazione

1. Vai su <https://platform.claude.com> e accedi con l'account Golduck (consigliato `a.infantino@golduck.it`
   o un indirizzo aziendale condiviso, non personale).
2. Se è il primo accesso crea l'**organizzazione** "Golduck" (Settings → Organization): nome, Paese Italia.
3. **Settings → Billing**: aggiungi il metodo di pagamento e acquista credito prepagato (per iniziare bastano
   20-50 $: un check-up costa indicativamente 2-6 $). Attiva la ricarica automatica solo se vuoi.
   In fattura inserisci i dati fiscali di Golduck (P.IVA).
4. **Settings → Limits**: imposta un **limite di spesa mensile** (es. 100 $) e un avviso via email
   (es. al 70%). È la protezione più importante contro i costi imprevisti.

## 2. Workspace e chiave

1. **Settings → Workspaces → Create workspace**: nome `2Target`. Così i consumi dell'app restano separati
   da eventuali altri usi, e puoi dare al workspace un limite di spesa suo.
2. **Settings → API keys → Create key**: workspace `2Target`, nome `2target-produzione`
   (e, se vuoi, una seconda `2target-locale` per il Mac).
3. Copia la chiave (inizia con `sk-ant-`): **viene mostrata una volta sola**. Non incollarla in chat né in email.

## 3. Dove metterla

In locale, in `golduck-marketing/.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

poi riavvia `npm run dev`.

Su Plesk: sito 2target → Node.js → variabili d'ambiente → `ANTHROPIC_API_KEY` → **Riavvia app**.

## 4. Controllo dei costi

- Ogni check-up mostra a fine lavoro il **contatore**: token in ingresso e uscita, ricerche web, costo stimato
  per fase. È una stima a listino; il dato ufficiale è su platform.claude.com → Usage / Cost.
- Si sceglie il modello a ogni check-up:
  - **Claude Opus 5.5**: analisi più profonda (4 $ / 20 $ per milione di token in ingresso / uscita);
  - **Claude Sonnet 5.5**: circa metà costo (2 $ / 10 $);
  - **Misto**: Sonnet per ricerca e domande, Opus per scrivere il documento.
- Le ricerche web costano 10 $ ogni 1.000 (un check-up ne usa circa 30-45).
- L'esempio di check-up Golduck incluso nelle istruzioni viene messo in cache: dalla seconda chiamata in poi
  costa un decimo.

## 5. Sicurezza

- Se una chiave finisce dove non deve (chat, screenshot, repository), revocala subito da Settings → API keys
  e creane una nuova.
- I dati inviati all'AI sono quelli del cliente e le risposte del consulente: evita di inserire negli appunti
  dati personali non necessari (es. dati sanitari, credenziali, IBAN).
