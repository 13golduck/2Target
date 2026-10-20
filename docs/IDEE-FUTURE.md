# 2Target · idee e passi futuri

Elenco vivo delle evoluzioni concordate con Golduck, in ordine indicativo di priorità.

## Obiettivo guida
2Target è l'unico posto in cui Golduck lavora sul marketing dei clienti: check-up → strategia e piano →
produzione e pubblicazione centralizzata (mai con le credenziali dei clienti, sempre sul profilo giusto) →
misurazione (KPI, lead, SEO) → report al cliente.

## Prossimi passi
- **Audit TikTok:** registrare il video del flusso e inviare la richiesta (vedi docs/COLLEGAMENTI-API.md, 2b);
  fino all'approvazione i post TikTok escono solo come privati.
- Anteprima fedele di ciò che verrà pubblicato (come appare su ogni social).
- Meta: revisione dell'app (App Review + verifica dell'azienda) per l'uso su larga scala.
- LinkedIn: richiesta e approvazione della Community Management API (vedi docs/COLLEGAMENTI-API.md, 2d).
- «Riprova» TikTok con la possibilità di cambiare le impostazioni (oggi: annulla e riprogramma).

## Studio (creazione dei post con l'AI)
- **Video nello Studio:** montaggio con il motore FilmCraft (web), tagli proposti dall'AI dai video caricati,
  scritte e sottotitoli, esportazione nel browser con riserva sul server (ffmpeg).
- **Musica da librerie con licenza:** brani da librerie riconosciute che gestiscono i diritti (anche verso SIAE),
  oltre al caricamento di file propri; prima la verifica di API e licenze per l'uso sui social.
- **Più chiavi e scelta del modello per le immagini AI:** poter inserire più chiavi o profili (es. Nano Banana 2 per
  il lavoro quotidiano e Gemini 3 Pro Image per le immagini importanti) e scegliere il modello nella finestra
  «Immagine AI» e in chat, con il costo stimato accanto a ciascuno. Oggi c'è una sola chiave Google e un solo
  modello, impostato in Impostazioni → Integrazioni → «Google AI (immagini)».
- **Altri fornitori di immagini:** OpenAI e Flux dietro la stessa interfaccia (`src/lib/ai/image-gen.ts`), quando
  Golduck avrà creato i progetti dedicati e inserito le chiavi.

## Spunti futuri
- **Craft Launcher** (https://github.com/storytold/craft-launcher): valutare l'integrazione della suite come
  alternativa ad Adobe per la produzione grafica, collegata al brief del Senior Graphic Designer AI e al brand kit.
- **Video generati da agenti AI:** dal brief e dallo script della scheda, agenti che producono bozze di reel/video
  (montaggio, sottotitoli, voce, musica) da revisionare e pubblicare dal piano editoriale.

## Fatto
- **2Target Studio: testo, grafica e immagini AI** (ottobre 2026). «Crea post» con tre modi (Semplice, Avanzato,
  Con l'AI); lo Studio lavora a quattro mani con l'AI su una scheda del piano, con chat e versioni; editor grafico a
  pagine e livelli (colori e logo del brand kit) con esportazione JPEG nel post; immagini create o modificate con
  Google Nano Banana 2, nel tetto mensile delle immagini AI. Codice: `src/lib/studio/`, `src/app/(app)/studio/`,
  `src/lib/ai/studio-agent.ts`, `src/lib/ai/image-gen.ts`.
- **Il check-up imposta il lavoro successivo** (ottobre 2026). Alla consegna 2Target prepara KPI con punto di partenza
  e obiettivo (collegati agli obiettivi per fase del funnel), canali da collegare, rubriche, prime idee e la bozza del
  primo mese di piano; buyer persona e obiettivi solo se mancano. Ogni proposta cita le evidenze del check-up
  (numerate, l'AI non può inventarle). Niente doppioni con KPI e rubriche esistenti; bozza saltata se c'è già un piano
  nel periodo. Codice: `src/lib/ai/foundation-agent.ts`, `src/lib/checkup-foundation.ts`.
- **Pubblicazione su TikTok e Instagram senza Facebook** (ottobre 2026). TikTok: video e foto dalla scheda, con
  tutti gli elementi richiesti dalle Content Sharing Guidelines (in attesa dell'audit). Instagram: collegamento con
  login Instagram, token rinnovato da solo, statistiche e pubblicazione. Codice: `src/lib/publishing/` e
  `src/lib/integrations/instagram.ts`.
- **Google approfondito** (ottobre 2026). Search Console con confronti, opportunità, brand/non brand e variazioni;
  Analytics 4 con pagine di atterraggio, campagne e conversioni affiancate ai Lead; scheda Google (Business Profile);
  Google Ads con la spesa nei costi di marketing; analisi SEO mensile con l'AI che crea idee in bacheca.
