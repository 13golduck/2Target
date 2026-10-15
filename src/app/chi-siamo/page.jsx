import { COMPANY } from "src/components/legal/legal-page";

import { Starfield } from "./starfield";

// Presentazione pubblica di 2Target (è anche la home per chi non ha fatto l'accesso).
// La richiedono Meta (verifica Tech Provider, App Review) e TikTok: servizio offerto e dati dell'azienda che lo fornisce.
// I testi devono restare veri: li leggono anche i revisori delle piattaforme.

export const metadata = {
  title: { absolute: "2Target · la piattaforma marketing di Golduck" },
  description: "Con 2Target il team Golduck segue i social della tua attività dall'idea al risultato: strategia, piano editoriale, pubblicazione, report e sponsorizzate.",
  robots: { index: true, follow: true },
};

const gold = "#CDA434";
const ink = "#1C252E";
const muted = "#637381";

const FEATURES = [
  { n: "01", t: "Partiamo da chi sei", d: "Un check-up iniziale mette a fuoco posizionamento, pubblico e concorrenti, e fissa gli obiettivi che misureremo insieme." },
  { n: "02", t: "Vedi il piano prima che esca", d: "Ogni contenuto ha testo, formato e data: tu lo approvi e solo allora va online." },
  { n: "03", t: "Pubblichiamo al momento giusto", d: "I contenuti approvati escono sulla tua Pagina Facebook, sul tuo Instagram e sul tuo TikTok, nei giorni previsti." },
  { n: "04", t: "Capisci cosa funziona", d: "Ogni mese ricevi un report chiaro: copertura, follower, interazioni e visite al sito, con un semaforo per ogni obiettivo." },
  { n: "05", t: "Spingi solo ciò che merita", d: "Se lo vuoi, sponsorizziamo i post migliori con budget, durata e tetto di spesa decisi da te." },
];

const DATA = [
  "Sei tu a collegare i tuoi account (Meta, TikTok, Google) e a scegliere quali profili condividere con noi.",
  "Usiamo i dati solo per ciò che ci chiedi: pubblicare, misurare, preparare i report e gestire le sponsorizzate che autorizzi.",
  "Le chiavi di accesso sono conservate cifrate. I tuoi dati non vengono venduti né condivisi con terzi.",
  "Puoi scollegare gli account quando vuoi; se ce lo chiedi, cancelliamo i dati entro 30 giorni.",
];

const CSS = `
@keyframes t2-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes t2-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.t2-rise { opacity: 0; animation: t2-rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
.t2-gold { background: linear-gradient(90deg, ${gold} 0%, #F3D98A 25%, ${gold} 50%, #F3D98A 75%, ${gold} 100%); background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; animation: t2-shine 8s linear infinite; }
.t2-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
.t2-card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(28,37,46,.08); border-color: ${gold}; }
.t2-cta { transition: transform .2s ease, box-shadow .2s ease; }
.t2-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(205,164,52,.35); }
@media (prefers-reduced-motion: reduce) { .t2-rise { opacity: 1; animation: none; } .t2-gold { animation: none; } .t2-card, .t2-cta { transition: none; } }
`;

const delay = (i) => ({ animationDelay: `${0.1 + i * 0.12}s` });

export default function AboutPage() {
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: ink, lineHeight: 1.6, background: "#fff", minHeight: "100vh" }}>
      <style>{CSS}</style>

      <header style={{ position: "relative", overflow: "hidden", background: "radial-gradient(ellipse at 70% 20%, #1f1b10 0%, #121212 55%, #0b0b0b 100%)", color: "#fff" }}>
        <Starfield />
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto", padding: "20px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ background: gold, color: "#121212", fontWeight: 800, borderRadius: 8, padding: "4px 8px" }}>2T</span>
          <strong style={{ fontSize: 18, flex: 1 }}>2Target</strong>
          <a className="t2-cta" href="/login" style={{ color: "#121212", background: gold, textDecoration: "none", fontWeight: 700, padding: "8px 16px", borderRadius: 8 }}>
            Accedi
          </a>
        </div>
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto", padding: "48px 20px 72px" }}>
          <p className="t2-rise" style={{ margin: 0, color: gold, fontWeight: 700, letterSpacing: 0.5, ...delay(0) }}>by Golduck</p>
          <h1 className="t2-rise" style={{ fontSize: "clamp(30px, 5.4vw, 50px)", lineHeight: 1.12, margin: "10px 0 18px", maxWidth: 760, ...delay(1) }}>
            I tuoi social, finalmente <span className="t2-gold">sotto controllo</span>.
          </h1>
          <p className="t2-rise" style={{ margin: 0, maxWidth: 680, color: "#C4CDD5", fontSize: 18, ...delay(2) }}>
            2Target è la piattaforma con cui il team Golduck segue il marketing della tua attività, dall&apos;idea al risultato. Tu decidi e approvi,
            noi pensiamo al resto: e ogni mese vedi con chiarezza dove stai andando.
          </p>
          <p className="t2-rise" style={{ margin: "18px 0 0", maxWidth: 680, color: "#919EAB", fontSize: 14, ...delay(3) }}>
            È uno strumento interno, usato solo dal team Golduck: a te arrivano i contenuti da approvare e i report dei risultati.
          </p>
        </div>
      </header>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "56px 20px 8px" }}>
        <h2 style={{ fontSize: 26, margin: "0 0 6px" }}>Come lavoriamo insieme</h2>
        <p style={{ margin: "0 0 24px", color: muted }}>Cinque passi, sempre gli stessi: così sai sempre a che punto siamo.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <div key={f.t} className="t2-card" style={{ border: "1px solid #E5E8EB", borderRadius: 12, padding: 20 }}>
              <span style={{ color: gold, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>{f.n}</span>
              <h3 style={{ margin: "4px 0 6px", fontSize: 17 }}>{f.t}</h3>
              <p style={{ margin: 0, color: muted }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 8px" }}>
        <h2 style={{ fontSize: 26, margin: "0 0 6px" }}>I tuoi dati restano tuoi</h2>
        <p style={{ margin: "0 0 16px", color: muted }}>Lavorare tranquilli significa sapere sempre chi vede cosa, e perché.</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {DATA.map((d) => (
            <li key={d} style={{ marginBottom: 8 }}>{d}</li>
          ))}
        </ul>
        <p style={{ color: muted }}>
          Tutti i dettagli sono nell&apos;<a href="/privacy">informativa privacy</a>, nei <a href="/termini">termini di servizio</a> e nella pagina per l&apos;
          <a href="/eliminazione-dati">eliminazione dei dati</a>.
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

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 0" }}>
        <div style={{ background: "#121212", color: "#fff", borderRadius: 16, padding: "28px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <div style={{ flex: "1 1 320px" }}>
            <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>Vuoi capire come può crescere la tua attività?</h2>
            <p style={{ margin: 0, color: "#C4CDD5" }}>Scrivici: partiamo da un check-up e ti mostriamo da dove cominciare.</p>
          </div>
          <a className="t2-cta" href={`mailto:${COMPANY.email}`} style={{ color: "#121212", background: gold, textDecoration: "none", fontWeight: 700, padding: "12px 20px", borderRadius: 8 }}>
            Contattaci
          </a>
        </div>
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
