// Testo dei termini di servizio, in italiano e in inglese (stesso contenuto, sezioni nello stesso ordine).
// Bozza da far verificare a un legale prima di considerarla definitiva.

import { COMPANY } from "./company";

export const TERMS_UPDATED = { it: "23 ottobre 2026", en: "23 October 2026" };

const mail = <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;

export function TermsIt({ privacyHref = "/privacy" }) {
  return (
    <>
      <p>
        Questi termini regolano l&apos;uso di 2Target, la piattaforma di marketing fornita da {COMPANY.name} ({COMPANY.brand}), P.IVA {COMPANY.vat},{" "}
        {COMPANY.address} («Golduck», «noi»). Usando 2Target accetti questi termini e l&apos;<a href={privacyHref}>informativa sulla privacy</a>.
      </p>

      <h2>1. Il servizio</h2>
      <p>
        2Target permette al team Golduck e ai suoi clienti di preparare check-up e piani editoriali, creare testi, grafiche e video (anche con l&apos;aiuto
        dell&apos;intelligenza artificiale), approvarli, pubblicarli sui profili social del cliente (Facebook, Instagram, Threads, TikTok, LinkedIn, Pinterest,
        YouTube), raccogliere lead e misurare i risultati con report periodici. Le condizioni economiche e le attività concordate sono definite nel contratto tra
        Golduck e il cliente, che prevale su questi termini in caso di contrasto.
      </p>

      <h2>2. Chi può usarlo</h2>
      <p>
        L&apos;accesso è riservato al team Golduck e alle persone che Golduck invita, maggiorenni e autorizzate ad agire per l&apos;azienda cliente. Ogni account è
        personale: le credenziali e i codici di accesso non vanno condivisi. Avvisaci subito a {mail} se sospetti un uso non autorizzato.
      </p>

      <h2>3. Account social collegati</h2>
      <ul>
        <li>Puoi collegare solo account e profili di cui sei titolare o per cui hai l&apos;autorizzazione del titolare.</li>
        <li>
          Collegando un account autorizzi 2Target a leggere i dati e a compiere le azioni indicate nella schermata di autorizzazione della piattaforma, solo per le
          attività concordate con Golduck.
        </li>
        <li>Puoi revocare l&apos;accesso in qualsiasi momento, dalla piattaforma o da 2Target; da quel momento non pubblichiamo né leggiamo più nulla da quell&apos;account.</li>
        <li>
          L&apos;uso di ogni piattaforma resta soggetto anche alle sue regole (per esempio i Termini di servizio e le Linee guida della community di TikTok, le
          Condizioni di Meta, i Termini di Google).
        </li>
      </ul>

      <h2>4. Contenuti e pubblicazione</h2>
      <ul>
        <li>Il cliente resta titolare dei propri contenuti e dei propri dati. Ci concede solo i diritti necessari a prepararli, conservarli e pubblicarli per suo conto.</li>
        <li>
          Un contenuto viene pubblicato solo dopo l&apos;approvazione del cliente o del responsabile del team, nella data indicata. Chi approva è responsabile di
          averlo controllato.
        </li>
        <li>
          Non si possono caricare o pubblicare contenuti illeciti, ingannevoli, offensivi, che violano diritti di terzi (immagini, musica, marchi) o le regole delle
          piattaforme.
        </li>
        <li>
          La musica proposta da 2Target proviene da librerie con licenza Creative Commons che ne consente l&apos;uso commerciale; quando la licenza lo chiede,
          l&apos;autore va citato nel testo del post.
        </li>
      </ul>

      <h2>5. Intelligenza artificiale</h2>
      <p>
        I testi, le immagini e i video proposti dall&apos;intelligenza artificiale sono suggerimenti: possono contenere errori e vanno sempre controllati da una
        persona prima della pubblicazione. Golduck applica un tetto di spesa configurabile ai servizi AI.
      </p>

      <h2>6. Usi vietati</h2>
      <p>
        È vietato usare 2Target per inviare spam, raccogliere dati di altri utenti delle piattaforme, aggirare limiti tecnici o di sicurezza, accedere ad account
        altrui, decompilare il software o usarlo in modo contrario alla legge o alle regole delle piattaforme collegate.
      </p>

      <h2>7. Disponibilità</h2>
      <p>
        Curiamo il funzionamento e la sicurezza di 2Target e facciamo copie di sicurezza giornaliere, ma il servizio può avere interruzioni per manutenzione o guasti.
        Le funzioni che dipendono da piattaforme di terzi possono cambiare o fermarsi se la piattaforma modifica le proprie API o regole.
      </p>

      <h2>8. Responsabilità</h2>
      <p>
        Nei limiti consentiti dalla legge, Golduck non risponde di danni indiretti, perdite di dati causate da terzi, interruzioni o decisioni delle piattaforme
        social (per esempio la rimozione di un contenuto o la sospensione di un account), né dei risultati di marketing, che dipendono da molti fattori. Restano
        ferme le responsabilità che la legge non permette di escludere, come quelle per dolo o colpa grave.
      </p>

      <h2>9. Sospensione e chiusura</h2>
      <p>
        Possiamo sospendere un account che viola questi termini o mette a rischio la sicurezza. Alla fine del rapporto scolleghiamo gli account social e cancelliamo i
        dati come indicato nell&apos;<a href={privacyHref}>informativa sulla privacy</a>; su richiesta forniamo prima una copia dei contenuti del cliente.
      </p>

      <h2>10. Modifiche</h2>
      <p>
        Possiamo aggiornare questi termini; la data in alto indica l&apos;ultima versione. Per i cambiamenti importanti avvisiamo gli utenti via email prima che
        entrino in vigore.
      </p>

      <h2>11. Legge applicabile e foro</h2>
      <p>
        Si applica la legge italiana. Per le controversie con aziende è competente il foro di Brescia; per i consumatori resta il foro del luogo di residenza.
      </p>

      <h2>12. Contatti</h2>
      <p>Per domande su questi termini: {mail}.</p>
    </>
  );
}

export function TermsEn({ privacyHref = "/en/privacy" }) {
  return (
    <>
      <p>
        These terms govern the use of 2Target, the marketing platform provided by {COMPANY.name} ({COMPANY.brand}), VAT no. {COMPANY.vat}, {COMPANY.address}{" "}
        (&quot;Golduck&quot;, &quot;we&quot;). By using 2Target you accept these terms and the <a href={privacyHref}>Privacy Policy</a>. In case of differences,
        the Italian version prevails.
      </p>

      <h2>1. The service</h2>
      <p>
        2Target lets the Golduck team and its clients prepare check-ups and editorial plans, create texts, graphics and videos (also with the help of artificial
        intelligence), approve them, publish them on the client&apos;s social profiles (Facebook, Instagram, Threads, TikTok, LinkedIn, Pinterest, YouTube), collect
        leads and measure results with periodic reports. Fees and agreed activities are set out in the contract between Golduck and the client, which prevails over
        these terms in case of conflict.
      </p>

      <h2>2. Who can use it</h2>
      <p>
        Access is limited to the Golduck team and to people Golduck invites, who must be adults authorised to act for the client business. Each account is
        personal: credentials and sign-in codes must not be shared. Tell us immediately at {mail} if you suspect unauthorised use.
      </p>

      <h2>3. Connected social accounts</h2>
      <ul>
        <li>You may only connect accounts and profiles you own or are authorised by the owner to manage.</li>
        <li>
          By connecting an account you authorise 2Target to read the data and perform the actions shown on the platform&apos;s authorisation screen, only for the
          activities agreed with Golduck.
        </li>
        <li>You can revoke access at any time, from the platform or from 2Target; from then on we no longer publish or read anything from that account.</li>
        <li>
          Use of each platform also remains subject to its own rules (for example TikTok&apos;s Terms of Service and Community Guidelines, Meta&apos;s Terms,
          Google&apos;s Terms).
        </li>
      </ul>

      <h2>4. Content and publishing</h2>
      <ul>
        <li>The client keeps ownership of its content and data. It grants us only the rights needed to prepare, store and publish them on its behalf.</li>
        <li>Content is published only after approval by the client or the team lead, on the scheduled date. Whoever approves is responsible for having checked it.</li>
        <li>
          You may not upload or publish content that is unlawful, misleading, offensive, infringes third-party rights (images, music, trademarks) or breaks platform
          rules.
        </li>
        <li>
          Music offered in 2Target comes from libraries under Creative Commons licences that allow commercial use; when the licence requires it, the author must be
          credited in the post.
        </li>
      </ul>

      <h2>5. Artificial intelligence</h2>
      <p>
        Texts, images and videos suggested by artificial intelligence are suggestions: they may contain errors and must always be reviewed by a person before
        publishing. Golduck applies a configurable spending cap to AI services.
      </p>

      <h2>6. Prohibited uses</h2>
      <p>
        You may not use 2Target to send spam, collect data about other platform users, bypass technical or security limits, access other people&apos;s accounts,
        reverse engineer the software, or in any way that breaks the law or the rules of connected platforms.
      </p>

      <h2>7. Availability</h2>
      <p>
        We look after 2Target&apos;s operation and security and make daily backups, but the service may be interrupted for maintenance or faults. Features that
        depend on third-party platforms may change or stop if a platform changes its APIs or rules.
      </p>

      <h2>8. Liability</h2>
      <p>
        To the extent permitted by law, Golduck is not liable for indirect damages, data loss caused by third parties, outages or decisions of social platforms (for
        example removing content or suspending an account), or for marketing results, which depend on many factors. Liability that cannot be excluded by law, such
        as for wilful misconduct or gross negligence, is not affected.
      </p>

      <h2>9. Suspension and termination</h2>
      <p>
        We may suspend an account that breaches these terms or puts security at risk. When the relationship ends we disconnect the social accounts and delete data as
        described in the <a href={privacyHref}>Privacy Policy</a>; on request we first provide a copy of the client&apos;s content.
      </p>

      <h2>10. Changes</h2>
      <p>We may update these terms; the date at the top shows the latest version. For significant changes we notify users by email before they take effect.</p>

      <h2>11. Governing law and jurisdiction</h2>
      <p>
        Italian law applies. Disputes with businesses fall under the courts of Brescia, Italy; consumers keep the right to their local court of residence.
      </p>

      <h2>12. Contact</h2>
      <p>For questions about these terms: {mail}.</p>
    </>
  );
}
