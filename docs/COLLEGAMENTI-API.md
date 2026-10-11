# Collegare Meta e Google a 2Target

2Target legge i dati dei clienti con le **app sviluppatore di Golduck**. Si creano una volta sola,
con gli account Golduck; poi ogni cliente si collega dalla scheda **Canali** con un clic.

Le chiavi vanno in `.env.local` (in locale) e nelle variabili dell'app Node.js su Plesk (online).
Mai nel repository, mai in chat.

| Variabile | Dove si trova |
|---|---|
| `APP_URL` | indirizzo dell'app: `http://localhost:3070` in locale, `https://2target.it` online |
| `META_APP_ID`, `META_APP_SECRET` | Meta for Developers → la tua app → Impostazioni app → Di base |
| `META_CONFIG_ID` | Meta for Developers → la tua app → Facebook Login for Business → Configurazioni (ID della configurazione) |
| `META_GRAPH_VERSION` | facoltativa, predefinita `v25.0`; si aggiorna quando Meta ritira la versione |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud → API e servizi → Credenziali |
| `GOOGLE_PAGESPEED_KEY` | Google Cloud → Credenziali → Chiave API (gratuita) |
| `CRON_SECRET` | stringa casuale per la sincronizzazione notturna (`openssl rand -base64 33`) |

Dopo aver cambiato le variabili: in locale riavvia `npm run dev`, su Plesk **Riavvia app**.

---

## 1. App Meta (Instagram + Facebook)

**Prima di iniziare:** serve un account Facebook personale di chi amministra il Business Manager
(Meta Business Suite) di Golduck. I clienti devono avere:
- una **pagina Facebook**;
- un **profilo Instagram professionale** (Business o Creator) **collegato a quella pagina**;
- Golduck tra i partner della pagina, o la persona che collega l'account tra gli amministratori della pagina.

**Passaggi**
1. Vai su <https://developers.facebook.com/apps> → **Crea app**.
2. Caso d'uso: **Altro** → tipo **Business** → nome `2Target`, email `a.infantino@golduck.it`,
   portfolio aziendale **Golduck**.
3. Nella dashboard dell'app aggiungi i prodotti **Facebook Login for Business** e **Instagram Graph API**
   (se proposto: "API Instagram con Facebook Login").
4. **Facebook Login for Business → Impostazioni → URI di reindirizzamento OAuth validi**, aggiungi:
   - `http://localhost:3070/api/connect/meta/callback`
   - `https://2target.it/api/connect/meta/callback` (quando l'app è online)
5. **Impostazioni app → Di base**: copia **ID app** e **Chiave segreta** in `META_APP_ID` e `META_APP_SECRET`.
   Compila anche URL dell'informativa privacy e dominio dell'app (servono per la modalità Live).
6. **Ruoli dell'app → Ruoli**: aggiungi come amministratori o sviluppatori le persone del team che
   collegheranno i clienti.

**Permessi richiesti da 2Target:** lettura `pages_show_list`, `pages_read_engagement`, `read_insights`,
`business_management`, `instagram_basic`, `instagram_manage_insights`; pubblicazione `pages_manage_posts`,
`instagram_content_publish`. Si scelgono nella **configurazione** di Facebook Login for Business
(token d'accesso dell'utente), il cui ID va in `META_CONFIG_ID`.

**Serve la revisione dell'app di Meta?** Con l'accesso *standard* i permessi funzionano per le persone
che hanno un ruolo sull'app, sulle pagine che quelle persone gestiscono. Per uno strumento interno, in cui
è il team Golduck a collegare le pagine dei clienti, di solito basta. La revisione (App Review + verifica
dell'azienda) serve se un domani i clienti dovessero collegarsi da soli, e per pubblicare e gestire
inserzioni su larga scala.

**Durata dell'accesso:** il token utente dura circa 60 giorni; i token delle pagine collegate non scadono
finché la persona resta amministratore. In **Canali** compare la data di scadenza: prima di quella data
basta premere di nuovo **Collega Meta** con lo stesso account.

---

## 2. Progetto Google (Search Console, Analytics 4, PageSpeed)

1. Vai su <https://console.cloud.google.com> → crea il progetto **2Target**.
2. **API e servizi → Libreria**, abilita:
   - **Google Search Console API**
   - **Google Analytics Data API**
   - **Google Analytics Admin API**
   - **PageSpeed Insights API**
3. **API e servizi → Schermata di consenso OAuth** (Google Auth Platform):
   - tipo utente **Esterno**, nome app `2Target`, email di supporto `a.infantino@golduck.it`, logo facoltativo;
   - ambiti: `openid`, `email`, `.../auth/webmasters.readonly`, `.../auth/analytics.readonly`;
   - **Pubblico → Stato di pubblicazione: In produzione.** Se resta "Test", Google fa scadere l'accesso
     ogni 7 giorni. Finché l'app non è verificata da Google comparirà l'avviso "app non verificata":
     si prosegue con *Avanzate → Vai a 2Target*. Va bene per uso interno (fino a 100 utenti).
4. **Credenziali → Crea credenziali → ID client OAuth** → tipo **Applicazione web**:
   - URI di reindirizzamento autorizzati:
     - `http://localhost:3070/api/connect/google/callback`
     - `https://2target.it/api/connect/google/callback`
   - copia ID client e segreto in `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
5. **Credenziali → Crea credenziali → Chiave API**, limitala alla sola *PageSpeed Insights API*,
   copiala in `GOOGLE_PAGESPEED_KEY`. Senza chiave Google usa una quota condivisa che spesso è esaurita.

**Chi collega l'account Google** deve avere accesso alla proprietà Search Console (anche solo
"utente con accesso limitato") e alla proprietà GA4 (almeno "Visualizzatore") del cliente.
Conviene farsi aggiungere dal cliente con un account Google di Golduck.

---

## 3. Sincronizzazione automatica (Plesk)

Ogni notte 2Target scarica i dati di tutti i clienti e aggiorna i KPI.

1. Imposta `CRON_SECRET` nelle variabili dell'app Node.js e riavvia l'app.
2. Plesk → **Operazioni pianificate** → Aggiungi operazione → *Recupera un URL* o *Esegui un comando*:
   ```
   curl -fsS -m 600 -H "Authorization: Bearer IL_TUO_CRON_SECRET" https://2target.it/api/cron/sync
   ```
   Ogni giorno alle 05:30.

In qualsiasi momento si può aggiornare a mano da **Canali → Aggiorna tutti i dati**.

---

## Cosa si aggiorna da solo

| Fonte | Dati | KPI automatici |
|---|---|---|
| Instagram | follower, reach giornaliera, ultimi 50 post con reach, visualizzazioni, salvataggi, condivisioni, interazioni | reach, engagement rate, tasso salvataggi e condivisioni, crescita follower |
| Facebook | follower, ultimi 25 post con reazioni, commenti, condivisioni | — |
| Search Console | clic, impressioni, posizione giorno per giorno (90 giorni), prime 100 ricerche e pagine | clic, impressioni, CTR, posizione media |
| Analytics 4 | sessioni per canale, conversioni (eventi chiave) | visite da Google, conversioni |
| PageSpeed | punteggi prestazioni, SEO, accessibilità, LCP/CLS | — |

Un KPI si aggiorna da solo se la metrica è tra queste e nel KPI è indicato il canale
(es. *Engagement rate* + *Instagram*). La misura del mese in corso viene riscritta a ogni
sincronizzazione; le misure inserite a mano non vengono toccate.

## Prossimi passi

- Pubblicazione dei post dalla scheda (permessi `instagram_content_publish`, `pages_manage_posts`).
- Inserzioni Meta in lettura (`ads_read`) e moduli contatto (`leads_retrieval`) per il raccoglitore lead.
- TikTok (Login Kit + Content Posting API, audit per la pubblicazione pubblica) e LinkedIn.

---

## Pubblicazione su Facebook e Instagram

Dalla scheda di una pubblicazione (piano editoriale) si caricano foto e video, si scelgono i profili e si
programma l'uscita. **Si possono scegliere solo i profili collegati al cliente della scheda**: un profilo
appartiene a un solo cliente (2Target rifiuta di collegarlo a un secondo cliente) e il controllo si ripete
al momento dell'invio.

- **Chi pubblica:** Super admin e Administrator sempre; gli User solo se abilitati in **Utenti → Pubblica sui social**.
- **Quando:** solo schede in stato «Approvato». Se la scheda torna in bozza, le uscite programmate si annullano;
  se cambiano data, testo o file, le uscite programmate si aggiornano.
- **File:** foto JPEG o PNG (convertite in JPEG nel browser, Instagram accetta solo JPEG) fino a 8 MB; video MP4/MOV
  fino a 100 MB. Stanno in `MEDIA_DIR` (predefinita: `../private/2target-media`, fuori da httpdocs, così i deploy
  non li cancellano). Meta li scarica da un indirizzo firmato `/api/media/<firma>/<file>`.
- **Errori:** non si ritentano da soli (rischio di doppio post). Il dettaglio è nell'audit trail, categoria Errori;
  dalla scheda si può riprovare dopo aver controllato il profilo.
- **Simulazione:** in locale (`npm run dev`) nulla viene inviato a Meta. In produzione si può forzare con
  `PUBLISH_DRY_RUN=true`.

**Operazione pianificata su Plesk (necessaria).** L'app controlla le uscite ogni minuto, ma Plesk addormenta
Node.js quando il sito non riceve visite. Su Plesk: **Operazioni pianificate → Aggiungi attività → Recupera un URL**,
`https://2target.it/api/cron/publish`, ogni 5 minuti (`*/5 * * * *`). Non serve chiave: pubblica solo ciò che
è già programmato e arrivato all'ora.
