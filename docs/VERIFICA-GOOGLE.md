# Verifica Google dell'app 2Target (ambiti sensibili)

Google chiede un **video dimostrativo** per gli ambiti sensibili che 2Target usa: Analytics, Google Ads e YouTube.
Progetto Google Cloud: **2Target** (`target-511908`) → Google Auth Platform → Centro di verifica.

## Prima di registrare
- Il branding deve essere **pubblicato** (Google Auth Platform → Branding → Pubblica), altrimenti la verifica non parte.
- Serve un account Google che abbia: una proprietà GA4, un canale YouTube e, se attivo, un account Google Ads.
  Va bene l'account Golduck o un cliente che ha dato il consenso.
- Registra lo schermo intero a 1080p, con la barra degli indirizzi visibile (Google controlla il dominio 2target.it).
- Durata indicativa: 3-5 minuti. Didascalie in inglese (l'interfaccia è in italiano).

## Copione
1. **Apertura** (10 s): mostra `https://2target.it` nella barra degli indirizzi e accedi a 2Target.
   Didascalia: *"2Target — internal marketing platform of Golduck. Consultants connect each client's Google account."*
2. **Collegamento** (40 s): Clienti → un cliente → **Canali** → **Collega Google**.
   - Si apre la **schermata di consenso di Google**: deve leggersi chiaramente il nome **2Target** e l'elenco dei
     permessi. Scorri lentamente l'elenco, poi **Consenti**.
   - Didascalia: *"OAuth consent screen: app name 2Target and requested scopes."*
3. **Google Analytics** (`analytics.readonly`, 40 s): scegli la proprietà GA4, poi apri **KPI** e **SEO** del cliente
   e mostra visite, sorgenti e conversioni lette da GA4.
   Didascalia: *"analytics.readonly: GA4 traffic and conversions shown in the client's KPI and SEO pages. Read-only."*
4. **YouTube** (`youtube.readonly`, `yt-analytics.readonly`, 40 s): scegli il canale YouTube del cliente e mostra
   iscritti, visualizzazioni e statistiche dei video.
   Didascalia: *"youtube.readonly / yt-analytics.readonly: channel selection and channel statistics for reports."*
5. **Google Ads** (`adwords`, 40 s): mostra il report delle sponsorizzate con spesa, clic e conversioni delle campagne.
   Didascalia: *"adwords: read-only campaign spend and conversions. The Google Ads API has no read-only scope;
   2Target never creates or edits campaigns."*
6. **Search Console e scheda Google** (30 s, facoltativo ma utile): dati di Search Console nella pagina SEO e la scheda
   dell'attività.
7. **Scollegamento** (20 s): in Canali mostra **Scollega**.
   Didascalia: *"Users can disconnect at any time, in 2Target and in their Google account."*

## Invio
1. Carica il video su YouTube come **Non in elenco**.
2. Centro di verifica → **Risolvi il problema** → incolla il link nel campo del video.
3. Il campo «Informazioni aggiuntive» è già compilato (testo in inglese per i revisori, senza credenziali).
4. **Conferma**. Google risponde di solito in 3-5 giorni lavorativi via email a developer@golduck.eu e può chiedere
   chiarimenti: rispondi dalla stessa conversazione.

## Dopo l'approvazione
- Sparisce l'avviso «app non verificata» per i clienti e cade il limite di 100 utenti di test.
- Per i video Shorts (`youtube.upload`) servirà una seconda richiesta: si attiva in Impostazioni → Integrazioni
  («caricamento su YouTube») solo dopo questa verifica.
