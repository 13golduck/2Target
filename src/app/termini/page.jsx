import { LegalPage } from "src/components/legal/legal-page";

export const metadata = { title: "Termini di servizio", robots: { index: true, follow: true } };

export default function TermsPage() {
  return (
    <LegalPage title="Termini di servizio" updated="11 ottobre 2026">
      <p>
        2Target è uno strumento riservato al team Golduck e ai clienti che Golduck abilita. L&apos;accesso avviene con un account personale e non va condiviso.
      </p>
      <h2>Uso consentito</h2>
      <ul>
        <li>Gestire check-up, piani editoriali, pubblicazioni, lead e report dei clienti di Golduck.</li>
        <li>Collegare solo account e profili di cui si è titolari o per cui si ha l&apos;autorizzazione del titolare.</li>
        <li>Pubblicare solo contenuti approvati e sui profili del cliente a cui si riferiscono.</li>
      </ul>
      <h2>Account collegati</h2>
      <p>
        Il cliente resta titolare dei propri profili e dei propri dati e può revocare l&apos;accesso in qualsiasi momento (vedi l&apos;<a href="/privacy">informativa privacy</a>).
        Golduck usa gli accessi solo per le attività concordate con il cliente.
      </p>
      <h2>Responsabilità</h2>
      <p>
        Golduck cura il funzionamento e la sicurezza della piattaforma ma non risponde di interruzioni o modifiche dei servizi di terze parti (Meta, Google e altri).
      </p>
      <h2>Contatti</h2>
      <p>Per domande: <a href="mailto:a.infantino@golduck.it">a.infantino@golduck.it</a>.</p>
    </LegalPage>
  );
}
