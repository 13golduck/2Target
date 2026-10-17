// Pagine pubbliche (privacy, termini): testo semplice, leggibile anche senza accesso. Le richiedono Google e Meta.

/** Dati dell'azienda che fornisce 2Target (richiesti da Meta e TikTok sul sito del servizio). */
export const COMPANY = {
  name: "Infantino Antonio",
  vat: "04587910987",
  address: "Via Zilie Inferiori 37/A, 25013 Calvisano (BS), Italia",
  email: "a.infantino@golduck.it",
};

export function LegalPage({ title, updated, children }) {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 80px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65, color: "#1C252E" }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#CDA434", letterSpacing: 0.5 }}>2Target · Golduck</p>
      <h1 style={{ fontSize: 32, margin: "8px 0 4px" }}>{title}</h1>
      <p style={{ marginTop: 0, color: "#637381", fontSize: 14 }}>Ultimo aggiornamento: {updated}</p>
      {children}
      <hr style={{ margin: "40px 0 16px", border: 0, borderTop: "1px solid #E5E8EB" }} />
      <p style={{ fontSize: 14, color: "#637381" }}>
        <a href="/chi-siamo" style={{ color: "inherit" }}>Chi siamo</a> · <a href="/privacy" style={{ color: "inherit" }}>Privacy</a> · <a href="/termini" style={{ color: "inherit" }}>Termini di servizio</a> · Contatti: <a href={`mailto:${COMPANY.email}`} style={{ color: "inherit" }}>{COMPANY.email}</a>
      </p>
      <p style={{ fontSize: 13, color: "#919EAB", marginTop: 0 }}>
        {COMPANY.name} · P.IVA {COMPANY.vat} · {COMPANY.address}
      </p>
    </main>
  );
}
