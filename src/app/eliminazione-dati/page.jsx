import { LegalPage } from "src/components/legal/legal-page";

// Istruzioni per l'eliminazione dei dati (richiesta da Meta, TikTok e Google per le app che leggono dati degli utenti).

export const metadata = { title: "Eliminazione dei dati", robots: { index: true, follow: true } };

export default async function DataDeletionPage({ searchParams }) {
  const { codice } = await searchParams;
  const code = /^[A-F0-9]{12}$/.test(codice ?? "") ? codice : null;
  return (
    <LegalPage title="Eliminazione dei dati" updated="14 ottobre 2026" lang="it">
      {code && (
        <p style={{ padding: 16, borderRadius: 8, background: "#F4F6F8" }}>
          <b>Richiesta ricevuta.</b> Codice di conferma: <b>{code}</b>. I token di accesso e i dati ricevuti da Facebook e Instagram per il tuo account sono stati
          eliminati da 2Target. Per qualsiasi domanda scrivi a a.infantino@golduck.it indicando il codice.
        </p>
      )}
      <p>
        Questa pagina spiega come scollegare 2Target dai tuoi account (Facebook, Instagram, TikTok, Google) e come chiedere la cancellazione dei dati che 2Target
        ha ricevuto da queste piattaforme. 2Target è gestita da Golduck.
      </p>

      <h2>1. Scollega 2Target dal tuo account</h2>
      <ul>
        <li><b>Facebook e Instagram:</b> Facebook → Impostazioni e privacy → Impostazioni → Integrazioni business → seleziona 2Target → Rimuovi.</li>
        <li><b>TikTok:</b> app TikTok → Profilo → Menu → Impostazioni e privacy → Sicurezza → App e servizi → 2Target → Rimuovi accesso.</li>
        <li><b>Google:</b> account Google → Sicurezza → Connessioni con app e servizi di terze parti → 2Target → Elimina tutte le connessioni.</li>
      </ul>
      <p>
        Da quel momento 2Target non può più leggere né pubblicare nulla sui tuoi account. Quando rimuovi 2Target da Facebook, Meta ce lo comunica e 2Target cancella
        automaticamente i token e i dati scaricati per il tuo account.
      </p>

      <h2>2. Chiedi la cancellazione dei dati</h2>
      <p>
        Scrivi a <a href="mailto:a.infantino@golduck.it?subject=Richiesta%20di%20eliminazione%20dei%20dati%202Target">a.infantino@golduck.it</a> con oggetto
        «Richiesta di eliminazione dei dati 2Target», indicando l&apos;account o la pagina interessata. Entro 30 giorni eliminiamo i token di accesso, i dati dei profili,
        i post e le statistiche ricevuti dalle piattaforme e ti confermiamo la cancellazione via email.
      </p>

      <h2>Cosa resta</h2>
      <p>
        Restano solo le informazioni che la legge ci obbliga a conservare (per esempio i documenti contabili) e, per un massimo di 2 anni, il registro delle operazioni
        senza contenuti dei profili. Per i dettagli vedi l&apos;<a href="/privacy">informativa sulla privacy</a>.
      </p>
    </LegalPage>
  );
}
