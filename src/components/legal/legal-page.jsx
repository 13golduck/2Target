// Pagine pubbliche (privacy, termini, eliminazione dei dati): testo semplice, leggibile anche senza accesso.
// Le richiedono Google, Meta e TikTok, che vogliono anche l'icona dell'app in testa alla pagina (SiteHeader).

import { SiteFooter, SiteHeader } from "./site-chrome";

export { COMPANY } from "./company";

const UPDATED = { it: "Ultimo aggiornamento", en: "Last updated" };

/** lang: "it" | "en"; alternate: indirizzo della stessa pagina nell'altra lingua. */
export function LegalPage({ title, updated, lang = "it", alternate, children }) {
  return (
    <div lang={lang} style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65, color: "#1C252E", background: "#fff", minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid #E5E8EB" }}>
        <SiteHeader lang={lang} alternate={alternate} />
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 0" }}>
        <h1 style={{ fontSize: 32, margin: "0 0 4px" }}>{title}</h1>
        <p style={{ marginTop: 0, color: "#637381", fontSize: 14 }}>
          {UPDATED[lang]}: {updated}
        </p>
        {children}
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
