import { LegalPage } from "src/components/legal/legal-page";

export const metadata = { title: "Informativa privacy", robots: { index: true, follow: true } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Informativa sulla privacy" updated="11 ottobre 2026">
      <p>
        2Target è la piattaforma interna con cui Golduck (titolare del trattamento: Infantino Antonio, P.IVA 04587910987, Via Zilie Inferiori 37/A, 25013 Calvisano BS) gestisce i progetti di comunicazione e marketing dei propri clienti:
        check-up, piani editoriali, pubblicazioni sui social, lead e indicatori di risultato. Questa informativa spiega quali dati tratta 2Target e perché.
      </p>

      <h2>Quali dati trattiamo</h2>
      <ul>
        <li><b>Dati del team e dei clienti che accedono:</b> nome, email, ruolo, registro degli accessi e delle azioni (audit trail).</li>
        <li><b>Dati dei clienti:</b> informazioni sull&apos;azienda, contenuti dei piani editoriali, foto e video caricati per le pubblicazioni, lead ricevuti dai moduli dei loro siti.</li>
        <li>
          <b>Dati delle piattaforme collegate dal cliente</b> (Facebook, Instagram, Google Search Console, Google Analytics): nome e immagine delle pagine e dei profili,
          numero di follower, post pubblicati e relative statistiche, dati di traffico e posizionamento del sito. Si leggono solo le risorse che chi collega l&apos;account sceglie di autorizzare.
        </li>
      </ul>

      <h2>Perché li trattiamo</h2>
      <p>
        Per misurare i risultati della comunicazione del cliente, preparare report e check-up, programmare e pubblicare i contenuti approvati sui profili del cliente stesso.
        I dati non vengono venduti, ceduti a terzi né usati per pubblicità.
      </p>

      <h2>Accesso alle piattaforme (Meta e Google)</h2>
      <p>
        Il collegamento avviene con l&apos;accesso ufficiale delle piattaforme: 2Target non vede né conserva le password. Riceve dei token di accesso, conservati cifrati,
        usati solo per le funzioni sopra. L&apos;uso dei dati ricevuti dalle API di Google rispetta le Google API Services User Data Policy, inclusi i requisiti di Limited Use.
        Le API di Google sono usate in sola lettura.
      </p>

      <h2>Conservazione e sicurezza</h2>
      <p>
        I dati sono conservati su server in Italia per la durata del rapporto con il cliente; il registro delle azioni per 2 anni. Accesso con codice via email e,
        se attivato, doppio fattore; token e chiavi cifrati; ogni operazione rilevante viene registrata.
      </p>

      <h2 id="cancellazione">Revoca dell&apos;accesso e cancellazione dei dati</h2>
      <p>
        Il cliente può revocare in ogni momento l&apos;accesso di 2Target: da Facebook (Impostazioni → Integrazioni business), da Google (account Google → Sicurezza → App di terze parti)
        o chiedendolo a Golduck. Per cancellare i dati raccolti scrivi a <a href="mailto:a.infantino@golduck.it">a.infantino@golduck.it</a>: li eliminiamo entro 30 giorni e confermiamo via email.
      </p>

      <h2>I tuoi diritti</h2>
      <p>
        Puoi chiedere accesso, rettifica, cancellazione, limitazione od opposizione al trattamento e la portabilità dei dati (artt. 15-22 GDPR), scrivendo a
        a.infantino@golduck.it. Puoi anche presentare reclamo al Garante per la protezione dei dati personali.
      </p>
    </LegalPage>
  );
}
