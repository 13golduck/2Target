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

## 4. Controlli e blocchi di spesa

Ci sono due livelli, da impostare entrambi:

| Livello | Dove | Cosa fa |
|---|---|---|
| Anthropic | platform.claude.com → Settings → Limits (organizzazione) e Workspaces → 2Target → Limits | **Blocco definitivo**: oltre il limite le API rispondono con errore. Avvisi email alle soglie. |
| 2Target | menu **Consumi AI** (solo amministratori) | Si ferma **prima** con un messaggio chiaro. |

Limiti di 2Target (valori iniziali, modificabili):
- **Budget mensile dell'app** 50 $: raggiunto il budget, nessun nuovo lavoro AI fino al mese dopo;
- **Avviso** all'80%: banner in Consumi AI;
- **Tetto per check-up** 8 $: comprese ricerche e revisioni;
- **Tetto mensile per cliente** 15 $;
- **Lavori AI contemporanei** 2 e **check-up AI al giorno** 10;
- **interruttore generale** per spegnere l'AI.

Come funzionano: prima di ogni fase (ricognizione, domande, ricerca, scrittura, revisione) l'app stima il costo
e non la avvia se sforerebbe un tetto; prima di ogni singola chiamata ricontrolla i tetti già raggiunti. Le ricerche
web hanno un numero massimo per fase (14 nella ricognizione, 30 nella ricerca approfondita) e ogni risposta ha un
massimo di token: una singola fase non può "scappare".

Consiglio: limite Anthropic sul workspace 2Target un po' sopra il budget di 2Target (es. 60 $ contro 50 $).

## 5. Ottimizzazioni già attive

- **Cache delle istruzioni (1 ora)**: istruzioni ed esempio Piantiny (circa 11.000 token) vengono scritti una volta
  e poi riletti a un ventesimo del prezzo per un'ora, anche tra le domande e la ricerca. In Consumi AI vedi la
  percentuale di token letti dalla cache.
- **Filtro dinamico delle ricerche**: Claude filtra i risultati web prima di leggerli; ogni pagina letta è limitata
  a 20.000 token.
- **Modello per fase**: in modalità Misto, Sonnet (metà prezzo) fa ricerca e domande, Opus scrive.
- **Ragionamento dosato**: impegno medio per domande e revisioni, alto per ricerca e scrittura.
- **Fasi separate**: le domande si fanno senza ricerche web; la scrittura senza web, sui soli appunti già raccolti.

## 6. Controllo dei costi

- Ogni check-up mostra a fine lavoro il **contatore**: token in ingresso e uscita, ricerche web, costo stimato
  per fase. È una stima a listino; il dato ufficiale è su platform.claude.com → Usage / Cost.
- Si sceglie il modello a ogni check-up:
  - **Claude Opus 5.5**: analisi più profonda (4 $ / 20 $ per milione di token in ingresso / uscita);
  - **Claude Sonnet 5.5**: circa metà costo (2 $ / 10 $);
  - **Misto**: Sonnet per ricerca e domande, Opus per scrivere il documento.
- Le ricerche web costano 10 $ ogni 1.000 (un check-up ne usa circa 30-45).
- L'esempio di check-up Golduck incluso nelle istruzioni viene messo in cache: dalla seconda chiamata in poi
  costa un ventesimo (0,20 $ invece di 4 $ per milione di token con Opus).

## 7. Sicurezza

- Se una chiave finisce dove non deve (chat, screenshot, repository), revocala subito da Settings → API keys
  e creane una nuova.
- I dati inviati all'AI sono quelli del cliente e le risposte del consulente: evita di inserire negli appunti
  dati personali non necessari (es. dati sanitari, credenziali, IBAN).

## Metodologia e report del check-up

- **Metodologia Golduck**: Impostazioni → *Metodologia del check-up*. È il testo che l'AI segue in ogni fase
  (struttura con Executive Summary + 8 punti, stile, SOSTAC, See-Think-Do-Care, StoryBrand, benchmark con mini-SWOT,
  regole sui dati). Ogni salvataggio crea una versione; il check-up registra quella con cui è partito.
- **Registro**: all'avvio del check-up si sceglie automatico, istituzionale o commerciale.
- **Report**: a check-up pronto, *Apri il report* → pagina web dedicata (`/report/<id>`) con indice, grafici e
  tabelle; *Scarica PDF* la stampa in A4. I Viewer del cliente la vedono solo quando il check-up è consegnato.
- L'AI non può consultare SimilarWeb, Semrush o Phlanx: i numeri sono solo verificati online (con fonte), forniti
  dal consulente o dichiarati come stima. Esempio di PDF: `docs/esempi/report-checkup-piantiny-esempio.pdf`.
