// Testo dell'informativa privacy, in italiano e in inglese (stesso contenuto, sezioni nello stesso ordine).
// Deve restare vero rispetto al codice: permessi richiesti in src/lib/integrations/config.ts, rotazione dei backup in
// src/lib/system/backup.ts, fornitori AI in src/lib/ai. Se cambia uno di questi, va aggiornata anche questa pagina.

import { COMPANY } from "./company";

export const PRIVACY_UPDATED = { it: "23 ottobre 2026", en: "23 October 2026" };

const mail = <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;

export function PrivacyIt() {
  return (
    <>
      <p>
        2Target è la piattaforma con cui Golduck gestisce la comunicazione e il marketing dei propri clienti: check-up, piani editoriali, creazione dei contenuti,
        pubblicazione sui social, lead e report dei risultati. Questa informativa spiega quali dati personali tratta 2Target, perché, per quanto tempo e quali sono
        i tuoi diritti, ai sensi del Regolamento (UE) 2016/679 (GDPR).
      </p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        {COMPANY.name} ({COMPANY.brand}), P.IVA {COMPANY.vat}, {COMPANY.address}. Contatto per ogni richiesta sulla privacy: {mail}.
      </p>

      <h2>2. A chi si rivolge 2Target</h2>
      <p>
        2Target non è aperta al pubblico: la usano il team Golduck e i clienti che Golduck invita. Non è destinata a minori di 18 anni e non raccoglie
        consapevolmente dati di minori.
      </p>

      <h2>3. Quali dati trattiamo</h2>
      <ul>
        <li>
          <b>Utenti di 2Target</b> (team e clienti invitati): nome, email, ruolo, preferenze, registro degli accessi e delle azioni svolte.
        </li>
        <li>
          <b>Dati dei clienti</b>: informazioni sull&apos;azienda, obiettivi, testi, foto, video e musica caricati o creati per le pubblicazioni, piani editoriali,
          approvazioni, lead ricevuti dai moduli dei loro siti (nome, email, telefono, messaggio).
        </li>
        <li>
          <b>Dati delle piattaforme che il cliente collega</b>, solo per gli account che sceglie di autorizzare, descritti nella sezione 4.
        </li>
        <li>
          <b>Dati tecnici</b>: indirizzo IP e tipo di browser nei registri del server, usati per la sicurezza.
        </li>
      </ul>

      <h2>4. Dati ricevuti dalle piattaforme collegate</h2>
      <p>
        Il collegamento avviene sempre con l&apos;accesso ufficiale della piattaforma (OAuth): 2Target non vede né conserva le password. Riceve un token di accesso,
        conservato cifrato, usato solo per le funzioni elencate qui.
      </p>
      <ul>
        <li>
          <b>TikTok</b> (Login Kit e API di TikTok): identificativo dell&apos;account (open ID), nome visualizzato e immagine del profilo
          (<i>user.info.basic</i>); numero di follower, di account seguiti, di «Mi piace» e di video (<i>user.info.stats</i>); elenco dei video pubblici con
          titolo, copertina, data, visualizzazioni, «Mi piace», commenti e condivisioni (<i>video.list</i>). Servono a mostrare al cliente l&apos;andamento del suo
          profilo e a preparare i report mensili. Solo se il cliente concede anche il permesso di pubblicazione, 2Target invia a TikTok i video che il cliente ha
          approvato, sul suo account. 2Target non legge messaggi privati, non segue e non contatta altri utenti.
        </li>
        <li>
          <b>Meta (Facebook, Instagram, Threads)</b>: nome e immagine delle Pagine e dei profili, post pubblicati e relative statistiche (copertura, interazioni,
          follower), commenti ai post del cliente, lead dei moduli pubblicitari, account e campagne pubblicitarie che il cliente autorizza. Servono a pubblicare i
          contenuti approvati, misurare i risultati, rispondere ai commenti e gestire le sponsorizzate che il cliente autorizza.
        </li>
        <li>
          <b>Google</b> (Search Console, Analytics, Profilo dell&apos;attività, YouTube e, se attivato, Google Ads): dati di traffico e posizionamento del sito,
          statistiche del Profilo dell&apos;attività, del canale YouTube e delle campagne. L&apos;uso dei dati ricevuti dalle API di Google rispetta le Google API
          Services User Data Policy, inclusi i requisiti di Limited Use.
        </li>
        <li>
          <b>LinkedIn e Pinterest</b>: nome e immagine della pagina o del profilo, post o Pin pubblicati e relative statistiche, bacheche; pubblicazione dei
          contenuti approvati.
        </li>
      </ul>
      <p>
        I dati ricevuti dalle piattaforme non vengono venduti, non sono usati per pubblicità verso terzi né per addestrare modelli di intelligenza artificiale.
      </p>

      <h2>5. Perché li trattiamo e su quale base giuridica</h2>
      <ul>
        <li>Fornire il servizio concordato con il cliente: pianificare, creare, pubblicare e misurare i contenuti (esecuzione del contratto, art. 6.1.b GDPR).</li>
        <li>Gestire gli accessi e proteggere la piattaforma da usi impropri (legittimo interesse, art. 6.1.f).</li>
        <li>Rispondere ai lead ricevuti dai siti dei clienti, per conto del cliente (il cliente è titolare di quei dati, Golduck li tratta come responsabile).</li>
        <li>Adempiere agli obblighi di legge, per esempio fiscali (art. 6.1.c).</li>
      </ul>

      <h2>6. Intelligenza artificiale</h2>
      <p>
        Per proporre testi, idee e grafiche, 2Target invia ai fornitori di intelligenza artificiale solo le informazioni necessarie (descrizione dell&apos;attività,
        obiettivi, testi e immagini del contenuto in lavorazione). Ogni proposta viene controllata da una persona del team prima di essere pubblicata. I fornitori,
        con i loro contratti per l&apos;uso aziendale delle API, non usano questi dati per addestrare i propri modelli.
      </p>

      <h2>7. Con chi condividiamo i dati</h2>
      <p>Solo con fornitori che ci aiutano a erogare il servizio, nominati responsabili del trattamento o soggetti a garanzie equivalenti:</p>
      <ul>
        <li>hosting e database: server in Italia;</li>
        <li>intelligenza artificiale: Anthropic (Claude) e Google (Gemini);</li>
        <li>invio delle email di servizio: il fornitore di posta di Golduck;</li>
        <li>le piattaforme social stesse, quando pubblichiamo per conto del cliente.</li>
      </ul>
      <p>
        Alcuni di questi fornitori hanno sede negli Stati Uniti: il trasferimento avviene sulla base del Data Privacy Framework UE-USA o delle clausole contrattuali
        standard della Commissione europea.
      </p>

      <h2>8. Per quanto tempo</h2>
      <ul>
        <li>Dati dei clienti e delle piattaforme collegate: per la durata del rapporto con il cliente; poi vengono cancellati entro 30 giorni.</li>
        <li>Token di accesso: finché l&apos;account resta collegato; vengono cancellati subito quando l&apos;account viene scollegato da 2Target. Se l&apos;accesso viene revocato dalla piattaforma, il token smette subito di funzionare.</li>
        <li>Registro delle azioni: 2 anni.</li>
        <li>Copie di sicurezza del database: ruotano e vengono sovrascritte entro 6 mesi.</li>
        <li>Documenti contabili: per il tempo previsto dalla legge.</li>
      </ul>

      <h2>9. Sicurezza</h2>
      <p>
        Accesso con codice via email e, se attivato, doppio fattore; collegamenti cifrati (HTTPS); token e chiavi cifrati nel database; permessi diversi per ruolo e per
        cliente; registro delle operazioni rilevanti; copie di sicurezza giornaliere.
      </p>

      <h2 id="cancellazione">10. Revoca dell&apos;accesso e cancellazione dei dati</h2>
      <p>Puoi revocare l&apos;accesso di 2Target in ogni momento:</p>
      <ul>
        <li>TikTok: app TikTok → Profilo → Menu → Impostazioni e privacy → Sicurezza → App e servizi → 2Target → Rimuovi accesso;</li>
        <li>Facebook e Instagram: Impostazioni → Integrazioni business → 2Target → Rimuovi;</li>
        <li>Google: account Google → Sicurezza → Connessioni con app e servizi di terze parti → 2Target;</li>
        <li>oppure chiedendolo a Golduck, o scollegando l&apos;account dalla pagina Canali di 2Target.</li>
      </ul>
      <p>
        Per far cancellare i dati raccolti scrivi a {mail}: li eliminiamo entro 30 giorni e te lo confermiamo via email. I passaggi completi sono nella pagina{" "}
        <a href="/eliminazione-dati">Eliminazione dei dati</a>.
      </p>

      <h2>11. I tuoi diritti</h2>
      <p>
        Puoi chiedere accesso, rettifica, cancellazione, limitazione, opposizione al trattamento e portabilità dei dati (artt. 15-22 GDPR), scrivendo a {mail}.
        Rispondiamo entro 30 giorni. Puoi anche presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).
      </p>

      <h2>12. Cookie</h2>
      <p>
        2Target usa solo cookie tecnici necessari all&apos;accesso e alle preferenze (per esempio tema chiaro o scuro). Non usa cookie di profilazione né strumenti
        di tracciamento pubblicitario, quindi non serve il consenso.
      </p>

      <h2>13. Modifiche</h2>
      <p>
        Se cambiamo questa informativa aggiorniamo la data in alto; per i cambiamenti importanti avvisiamo gli utenti di 2Target via email.
      </p>
    </>
  );
}

export function PrivacyEn() {
  return (
    <>
      <p>
        2Target is the platform Golduck uses to manage its clients&apos; communication and marketing: check-ups, editorial plans, content creation, social media
        publishing, leads and performance reports. This policy explains which personal data 2Target processes, why, for how long, and what your rights are under
        Regulation (EU) 2016/679 (GDPR).
      </p>

      <h2>1. Data controller</h2>
      <p>
        {COMPANY.name} ({COMPANY.brand}), VAT no. {COMPANY.vat}, {COMPANY.address}. Contact for any privacy request: {mail}.
      </p>

      <h2>2. Who 2Target is for</h2>
      <p>
        2Target is not open to the public: it is used by the Golduck team and by the clients Golduck invites. It is not intended for anyone under 18 and does not
        knowingly collect data from minors.
      </p>

      <h2>3. Data we process</h2>
      <ul>
        <li>
          <b>2Target users</b> (team and invited clients): name, email, role, preferences, log of sign-ins and actions.
        </li>
        <li>
          <b>Client data</b>: business information, goals, texts, photos, videos and music uploaded or created for posts, editorial plans, approvals, leads received
          from the forms on their websites (name, email, phone, message).
        </li>
        <li>
          <b>Data from the platforms the client connects</b>, only for the accounts the client chooses to authorise, described in section 4.
        </li>
        <li>
          <b>Technical data</b>: IP address and browser type in server logs, used for security.
        </li>
      </ul>

      <h2>4. Data received from connected platforms</h2>
      <p>
        Accounts are always connected through the platform&apos;s official sign-in (OAuth): 2Target never sees or stores passwords. It receives an access token,
        stored encrypted and used only for the purposes listed here.
      </p>
      <ul>
        <li>
          <b>TikTok</b> (Login Kit and TikTok APIs): account identifier (open ID), display name and profile picture (<i>user.info.basic</i>); follower, following,
          likes and video counts (<i>user.info.stats</i>); list of public videos with title, cover image, date, views, likes, comments and shares
          (<i>video.list</i>). We use them to show the client how their profile is performing and to prepare monthly reports. Only if the client also grants the
          publishing permission does 2Target send to TikTok the videos the client has approved, on the client&apos;s own account. 2Target does not read private
          messages and does not follow or contact other users.
        </li>
        <li>
          <b>Meta (Facebook, Instagram, Threads)</b>: name and picture of Pages and profiles, published posts and their insights (reach, engagement, followers),
          comments on the client&apos;s posts, leads from lead ads, ad accounts and campaigns the client authorises. We use them to publish approved content, measure
          results, reply to comments and manage the paid promotions the client authorises.
        </li>
        <li>
          <b>Google</b> (Search Console, Analytics, Business Profile, YouTube and, if enabled, Google Ads): website traffic and search data, Business Profile, YouTube
          channel and campaign statistics. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the
          Limited Use requirements.
        </li>
        <li>
          <b>LinkedIn and Pinterest</b>: page or profile name and picture, published posts or Pins and their statistics, boards; publishing approved content.
        </li>
      </ul>
      <p>Data received from the platforms is never sold, never used for third-party advertising and never used to train artificial intelligence models.</p>

      <h2>5. Purposes and legal bases</h2>
      <ul>
        <li>Providing the service agreed with the client: planning, creating, publishing and measuring content (performance of a contract, Art. 6(1)(b) GDPR).</li>
        <li>Managing access and protecting the platform from misuse (legitimate interest, Art. 6(1)(f)).</li>
        <li>Handling leads received from clients&apos; websites on the client&apos;s behalf (the client is the controller of that data; Golduck acts as processor).</li>
        <li>Complying with legal obligations, such as tax rules (Art. 6(1)(c)).</li>
      </ul>

      <h2>6. Artificial intelligence</h2>
      <p>
        To suggest texts, ideas and graphics, 2Target sends AI providers only the information needed (business description, goals, texts and images of the content
        being worked on). Every suggestion is reviewed by a member of the team before it is published. Under their business API terms, these providers do not use
        this data to train their models.
      </p>

      <h2>7. Who we share data with</h2>
      <p>Only with providers that help us deliver the service, appointed as processors or bound by equivalent safeguards:</p>
      <ul>
        <li>hosting and database: servers in Italy;</li>
        <li>artificial intelligence: Anthropic (Claude) and Google (Gemini);</li>
        <li>service emails: Golduck&apos;s email provider;</li>
        <li>the social platforms themselves, when we publish on the client&apos;s behalf.</li>
      </ul>
      <p>
        Some of these providers are based in the United States: transfers rely on the EU-US Data Privacy Framework or on the European Commission&apos;s Standard
        Contractual Clauses.
      </p>

      <h2>8. Retention</h2>
      <ul>
        <li>Client data and data from connected platforms: for the duration of the relationship with the client, then deleted within 30 days.</li>
        <li>Access tokens: while the account stays connected; deleted immediately when the account is disconnected from 2Target. If access is revoked from the platform, the token stops working at once.</li>
        <li>Action log: 2 years.</li>
        <li>Database backups: rotated and overwritten within 6 months.</li>
        <li>Accounting records: for the period required by law.</li>
      </ul>

      <h2>9. Security</h2>
      <p>
        Sign-in with an emailed code and, if enabled, two-factor authentication; encrypted connections (HTTPS); tokens and keys encrypted in the database;
        permissions by role and by client; log of relevant operations; daily backups.
      </p>

      <h2 id="deletion">10. Revoking access and deleting data</h2>
      <p>You can revoke 2Target&apos;s access at any time:</p>
      <ul>
        <li>TikTok: TikTok app → Profile → Menu → Settings and privacy → Security → Apps and services → 2Target → Remove access;</li>
        <li>Facebook and Instagram: Settings → Business integrations → 2Target → Remove;</li>
        <li>Google: Google Account → Security → Third-party apps and services → 2Target;</li>
        <li>or by asking Golduck, or by disconnecting the account from the Channels page in 2Target.</li>
      </ul>
      <p>
        To have the collected data deleted, write to {mail}: we delete it within 30 days and confirm by email. The full steps are on the{" "}
        <a href="/eliminazione-dati">data deletion page</a>.
      </p>

      <h2>11. Your rights</h2>
      <p>
        You can request access, rectification, erasure, restriction, objection and data portability (Arts. 15-22 GDPR) by writing to {mail}. We reply within 30
        days. You can also lodge a complaint with the Italian Data Protection Authority (garanteprivacy.it).
      </p>

      <h2>12. Cookies</h2>
      <p>
        2Target only uses technical cookies needed for sign-in and preferences (such as light or dark theme). It uses no profiling cookies or advertising trackers,
        so no consent is required.
      </p>

      <h2>13. Changes</h2>
      <p>If we change this policy we update the date at the top; for significant changes we notify 2Target users by email.</p>
    </>
  );
}
