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
- **Musica dell'app (Instagram/TikTok):** le API non permettono di scegliere la musica delle app. Proposta: video
  senza musica, poi bozza nell'app TikTok (permesso `video.upload`) e invio al telefono per Instagram, dove si aggiunge
  il brano dalla libreria dell'app. In attesa di decisione.
- **Librerie a pagamento (ricerca del 21/10/2026):** oggi ci sono Openverse e Jamendo (gratuite, CC0/CC BY). Candidata
  principale **Epidemic Sound** (Partner API pubblica con prova gratuita per prototipi, licenza Business che copre il
  lavoro per i clienti e le sponsorizzate online, catalogo senza collecting quindi senza SIAE, safelisting contro i
  reclami). Da chiedere al commerciale: prezzo del contratto Partner API e limite di 1 canale «safelisted» per
  piattaforma (con molti clienti può servire Enterprise). Alternative: Artlist o Soundstripe (API Enterprise su
  preventivo); gratuita: Jamendo (CC BY con attribuzione, licenza a pagamento per le sponsorizzate). Pixabay non ha
  un'API per la musica; la libreria di Instagram/TikTok non è usabile da strumenti esterni. Prima di scegliere,
  conferma legale sulla posizione SIAE per i cataloghi senza collecting.
- **«Apri in FilmCraft» per i ritocchi avanzati:** il motore web di FilmCraft (provato il 20/10) come editor avanzato
  sul montaggio dello Studio, quando sarà più maturo (oggi alpha e lento a esportare nel browser).
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
- **Timeline del montaggio e librerie musicali gratuite** (ottobre 2026). Tracce video, scritte e audio con trascinamento,
  bordi da tirare, aggancio, dividi e duplica; più spezzoni audio posizionabili. Libreria musicale con Openverse (senza
  chiave) e Jamendo, solo CC0/CC BY, crediti in italiano da aggiungere al testo. Codice: `video-timeline.jsx`,
  `video-editor.jsx`, `music-library.jsx`, `src/lib/music/`.
- **Impostazioni riordinate** (ottobre 2026). Menu delle sezioni con stato accanto; integrazioni in gruppi chiusi.
- **2Target Studio: video** (ottobre 2026). Montaggio di clip con inizio e fine, scritte a tempo (disegnate nel browser,
  uguali all'anteprima), musica caricata e volumi; il server compone con FFmpeg un MP4 1080×1920 adatto ai social.
  L'AI propone il montaggio dai video del progetto. Il post esce con l'ultima cosa esportata (grafica o video).
  Codice: `src/lib/studio/video.ts`, `src/lib/studio/video-render.ts`, `src/app/api/studio/video/`.
- **Approvazione del cliente obbligatoria e uscita automatica** (ottobre 2026). Interruttore nella panoramica del
  cliente; Studio e Crea post ricordano profili e data, e il post si programma da solo all'approvazione (del cliente
  dal link o del team). Codice: `src/lib/publishing/release-approved.ts`.
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
