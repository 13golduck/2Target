import { COMPANY } from "src/components/legal/legal-page";

// Presentazione pubblica di 2Target (è anche la home per chi non ha fatto l'accesso).
// La richiedono Meta (verifica Tech Provider, App Review) e TikTok: servizio offerto e dati dell'azienda che lo fornisce.

export const metadata = {
  title: { absolute: "2Target · la piattaforma marketing di Golduck" },
  description: "2Target è lo strumento interno con cui Golduck gestisce i social e il marketing dei propri clienti: piani editoriali, pubblicazioni, report e sponsorizzate.",
  robots: { index: true, follow: true },
};

const gold = "#CDA434";
const ink = "#1C252E";
const muted = "#637381";

const FEATURES = [
  { t: "Check-up e strategia", d: "Analisi iniziale del cliente: posizionamento, pubblico, concorrenti, obiettivi e indicatori da misurare." },
  { t: "Piano editoriale", d: "Calendario dei contenuti con testi, formati e materiali, approvato dal cliente prima della pubblicazione." },
  { t: "Pubblicazione", d: "I contenuti approvati vengono pubblicati sulla Pagina Facebook, sull'account Instagram e su TikTok del cliente." },
  { t: "Report e KPI", d: "Copertura, follower, interazioni e visite al sito, raccolti nei report mensili per il cliente." },
  { t: "Sponsorizzate", d: "Promozione dei post del cliente solo su sua autorizzazione, con budget e durata concordati e tetto di spesa." },
];

const DATA = [
  "Il titolare dell'attività collega di persona i propri account (Meta, TikTok, Google) e sceglie quali profili condividere.",
  "Usiamo i dati solo per i servizi richiesti dal cliente: pubblicazione, statistiche, report e sponsorizzate autorizzate.",
  "Le chiavi di accesso sono conservate cifrate; i dati non vengono venduti né condivisi con terzi.",
  "Il cliente può scollegare gli account in qualsiasi momento; su richiesta i dati vengono cancellati entro 30 giorni.",
];

export default function AboutPage() {
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: ink, lineHeight: 1.6, background: "#fff", minHeight: "100vh" }}>
      <header style={{ background: "#121212", color: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ background: gold, color: "#121212", fontWeight: 800, borderRadius: 8, padding: "4px 8px" }}>2T</span>
          <strong style={{ fontSize: 18, flex: 1 }}>2Target</strong>
          <a href="/login" style={{ color: "#121212", background: gold, textDecoration: "none", fontWeight: 700, padding: "8px 16px", borderRadius: 8 }}>
            Accedi
          </a>
        </div>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 56px" }}>
          <p style={{ margin: 0, color: gold, fontWeight: 700, letterSpacing: 0.5 }}>by Golduck</p>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.15, margin: "8px 0 16px", maxWidth: 720 }}>
            La piattaforma con cui Golduck gestisce i social e il marketing dei propri clienti
          </h1>
          <p style={{ margin: 0, maxWidth: 680, color: "#C4CDD5", fontSize: 18 }}>
            2Target è uno strumento interno, usato solo dal team Golduck. I clienti non accedono alla piattaforma: ricevono i contenuti da approvare e i
            report dei risultati.
          </p>
        </div>
      </header>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 8px" }}>
        <h2 style={{ fontSize: 24, margin: "0 0 20px" }}>Cosa facciamo con 2Target</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <div key={f.t} style={{ border: "1px solid #E5E8EB", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>{f.t}</h3>
              <p style={{ margin: 0, color: muted }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 8px" }}>
        <h2 style={{ fontSize: 24, margin: "0 0 12px" }}>Come trattiamo i dati dei clienti</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {DATA.map((d) => (
            <li key={d} style={{ marginBottom: 6 }}>{d}</li>
          ))}
        </ul>
        <p style={{ color: muted }}>
          Dettagli nell&apos;<a href="/privacy">informativa privacy</a>, nei <a href="/termini">termini di servizio</a> e nella pagina per l&apos;<a href="/eliminazione-dati">eliminazione dei dati</a>.
        </p>
      </section>

      <section lang="en" style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 8px" }}>
        <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>About 2Target (English)</h2>
        <p style={{ margin: 0, color: muted }}>
          2Target is an internal tool of Golduck, an Italian consulting agency, used only by the Golduck team to manage its clients&apos; social media.
          Each client&apos;s business owner connects their own Facebook Page, Instagram and TikTok accounts and can disconnect them at any time. We use
          the data only to publish content the client has approved, to report on performance (reach, followers, engagement) and, when authorised by the
          client, to run and measure paid promotions of their posts. Access tokens are stored encrypted and data is never sold or shared with third
          parties.
        </p>
      </section>

      <footer style={{ maxWidth: 960, margin: "48px auto 0", padding: "24px 20px 48px", borderTop: "1px solid #E5E8EB", color: muted, fontSize: 14 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong style={{ color: ink }}>2Target è un servizio di Golduck</strong> · {COMPANY.name} · P.IVA {COMPANY.vat}
        </p>
        <p style={{ margin: "0 0 6px" }}>{COMPANY.address}</p>
        <p style={{ margin: 0 }}>
          Contatti: <a href={`mailto:${COMPANY.email}`} style={{ color: "inherit" }}>{COMPANY.email}</a> · <a href="https://golduck.it" style={{ color: "inherit" }}>golduck.it</a> ·{" "}
          <a href="/privacy" style={{ color: "inherit" }}>Privacy</a> · <a href="/termini" style={{ color: "inherit" }}>Termini</a>
        </p>
      </footer>
    </main>
  );
}
