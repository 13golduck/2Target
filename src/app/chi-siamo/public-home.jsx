import { COMPANY } from "src/components/legal/company";
import { SiteFooter, SiteHeader } from "src/components/legal/site-chrome";

import { Starfield } from "./starfield";

// Presentazione pubblica di 2Target, in italiano (/ e /chi-siamo) e in inglese (/en): è la home per chi non ha fatto l'accesso.
// La richiedono Meta (verifica Tech Provider, App Review) e TikTok: servizio offerto, piattaforme collegate e dati dell'azienda.
// I testi devono restare veri: li leggono anche i revisori delle piattaforme.

const gold = "#CDA434";
const ink = "#1C252E";
const muted = "#637381";

const TEXT = {
  it: {
    eyebrow: "by Golduck",
    title: ["I tuoi social, finalmente ", "sotto controllo", "."],
    intro:
      "2Target è la piattaforma con cui il team Golduck segue il marketing della tua attività, dall'idea al risultato. Tu decidi e approvi, noi pensiamo al resto: e ogni mese vedi con chiarezza dove stai andando.",
    note: "È uno strumento riservato al team Golduck e ai clienti che invita: a te arrivano i contenuti da approvare e i report dei risultati.",
    stepsTitle: "Come lavoriamo insieme",
    stepsLead: "Cinque passi, sempre gli stessi: così sai sempre a che punto siamo.",
    steps: [
      { t: "Partiamo da chi sei", d: "Un check-up iniziale mette a fuoco posizionamento, pubblico e concorrenti, e fissa gli obiettivi che misureremo insieme." },
      { t: "Vedi il piano prima che esca", d: "Ogni contenuto ha testo, grafica o video e data: tu lo approvi e solo allora va online." },
      { t: "Pubblichiamo al momento giusto", d: "I contenuti approvati escono sui tuoi profili, nei giorni previsti, senza che tu debba fare nulla." },
      { t: "Capisci cosa funziona", d: "Ogni mese ricevi un report chiaro: copertura, follower, interazioni e visite al sito, con un semaforo per ogni obiettivo." },
      { t: "Spingi solo ciò che merita", d: "Se lo vuoi, sponsorizziamo i post migliori con budget, durata e tetto di spesa decisi da te." },
    ],
    platformsTitle: "Le piattaforme che colleghi",
    platformsLead: "Colleghi tu i tuoi account con l'accesso ufficiale di ogni piattaforma: noi non vediamo mai le tue password.",
    platforms: [
      { n: "TikTok", d: "Leggiamo profilo, follower e statistiche dei tuoi video pubblici per i report; pubblichiamo i video che approvi, solo se ce lo permetti." },
      { n: "Facebook e Instagram", d: "Pubblichiamo i post approvati, misuriamo i risultati, rispondiamo ai commenti e gestiamo le sponsorizzate che autorizzi." },
      { n: "Google", d: "Search Console, Analytics, Profilo dell'attività e YouTube, in sola lettura, per misurare visite e posizionamento." },
      { n: "LinkedIn, Threads e Pinterest", d: "Pubblichiamo i contenuti approvati e ne misuriamo i risultati." },
    ],
    dataTitle: "I tuoi dati restano tuoi",
    dataLead: "Lavorare tranquilli significa sapere sempre chi vede cosa, e perché.",
    data: [
      "Sei tu a collegare i tuoi account e a scegliere quali profili condividere con noi.",
      "Usiamo i dati solo per ciò che ci chiedi: pubblicare, misurare, preparare i report e gestire le sponsorizzate che autorizzi.",
      "Le chiavi di accesso sono conservate cifrate su server in Italia. I tuoi dati non vengono venduti né condivisi con terzi.",
      "Puoi scollegare gli account quando vuoi; se ce lo chiedi, cancelliamo i dati entro 30 giorni.",
    ],
    details: ["Tutti i dettagli sono nell'", "informativa privacy", ", nei ", "termini di servizio", " e nella pagina per l'", "eliminazione dei dati", "."],
    ctaTitle: "Vuoi capire come può crescere la tua attività?",
    ctaLead: "Scrivici: partiamo da un check-up e ti mostriamo da dove cominciare.",
    cta: "Contattaci",
  },
  en: {
    eyebrow: "by Golduck",
    title: ["Your social media, finally ", "under control", "."],
    intro:
      "2Target is the platform the Golduck team uses to run your business's marketing, from the first idea to the results. You decide and approve, we take care of the rest, and every month you see clearly where you are heading.",
    note: "It is reserved for the Golduck team and the clients it invites: you receive the content to approve and the performance reports.",
    stepsTitle: "How we work together",
    stepsLead: "Five steps, always the same, so you always know where we are.",
    steps: [
      { t: "We start from who you are", d: "An initial check-up clarifies positioning, audience and competitors, and sets the goals we will measure together." },
      { t: "See the plan before it goes live", d: "Every post has its text, graphic or video and date: you approve it, and only then is it published." },
      { t: "We publish at the right time", d: "Approved content goes out on your profiles on the planned days, with nothing for you to do." },
      { t: "Understand what works", d: "Every month you get a clear report: reach, followers, engagement and website visits, with a traffic light for each goal." },
      { t: "Boost only what deserves it", d: "If you want, we promote your best posts with the budget, duration and spending cap you choose." },
    ],
    platformsTitle: "The platforms you connect",
    platformsLead: "You connect your own accounts through each platform's official sign-in: we never see your passwords.",
    platforms: [
      { n: "TikTok", d: "We read your profile, followers and public video statistics for reports; we publish the videos you approve, only if you allow it." },
      { n: "Facebook and Instagram", d: "We publish approved posts, measure results, reply to comments and manage the promotions you authorise." },
      { n: "Google", d: "Search Console, Analytics, Business Profile and YouTube, read-only, to measure visits and search performance." },
      { n: "LinkedIn, Threads and Pinterest", d: "We publish approved content and measure its results." },
    ],
    dataTitle: "Your data stays yours",
    dataLead: "Working with peace of mind means always knowing who sees what, and why.",
    data: [
      "You connect your accounts and choose which profiles to share with us.",
      "We use the data only for what you ask: publishing, measuring, reporting and running the promotions you authorise.",
      "Access keys are stored encrypted on servers in Italy. Your data is never sold or shared with third parties.",
      "You can disconnect your accounts at any time; on request, we delete your data within 30 days.",
    ],
    details: ["All the details are in the ", "Privacy Policy", ", the ", "Terms of Service", " and the ", "data deletion", " page."],
    ctaTitle: "Want to see how your business can grow?",
    ctaLead: "Write to us: we start with a check-up and show you where to begin.",
    cta: "Contact us",
  },
};

const LINKS = {
  it: { privacy: "/privacy", terms: "/termini" },
  en: { privacy: "/en/privacy", terms: "/en/terms" },
};

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
const step = (i) => String(i + 1).padStart(2, "0");

export function PublicHome({ lang }) {
  const t = TEXT[lang];
  const links = LINKS[lang];
  return (
    <main lang={lang} style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: ink, lineHeight: 1.6, background: "#fff", minHeight: "100vh" }}>
      <style>{CSS}</style>

      <header style={{ position: "relative", overflow: "hidden", background: "radial-gradient(ellipse at 70% 20%, #1f1b10 0%, #121212 55%, #0b0b0b 100%)", color: "#fff" }}>
        <Starfield />
        <SiteHeader lang={lang} dark />
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto", padding: "48px 20px 72px" }}>
          <p className="t2-rise" style={{ margin: 0, color: gold, fontWeight: 700, letterSpacing: 0.5, ...delay(0) }}>{t.eyebrow}</p>
          <h1 className="t2-rise" style={{ fontSize: "clamp(30px, 5.4vw, 50px)", lineHeight: 1.12, margin: "10px 0 18px", maxWidth: 760, ...delay(1) }}>
            {t.title[0]}
            <span className="t2-gold">{t.title[1]}</span>
            {t.title[2]}
          </h1>
          <p className="t2-rise" style={{ margin: 0, maxWidth: 680, color: "#C4CDD5", fontSize: 18, ...delay(2) }}>{t.intro}</p>
          <p className="t2-rise" style={{ margin: "18px 0 0", maxWidth: 680, color: "#919EAB", fontSize: 14, ...delay(3) }}>{t.note}</p>
        </div>
      </header>

      <section id="features" style={{ maxWidth: 960, margin: "0 auto", padding: "56px 20px 8px" }}>
        <h2 style={{ fontSize: 26, margin: "0 0 6px" }}>{t.stepsTitle}</h2>
        <p style={{ margin: "0 0 24px", color: muted }}>{t.stepsLead}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {t.steps.map((f, i) => (
            <div key={f.t} className="t2-card" style={{ border: "1px solid #E5E8EB", borderRadius: 12, padding: 20 }}>
              <span style={{ color: gold, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>{step(i)}</span>
              <h3 style={{ margin: "4px 0 6px", fontSize: 17 }}>{f.t}</h3>
              <p style={{ margin: 0, color: muted }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 8px" }}>
        <h2 style={{ fontSize: 26, margin: "0 0 6px" }}>{t.platformsTitle}</h2>
        <p style={{ margin: "0 0 24px", color: muted }}>{t.platformsLead}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16 }}>
          {t.platforms.map((p) => (
            <div key={p.n} className="t2-card" style={{ border: "1px solid #E5E8EB", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>{p.n}</h3>
              <p style={{ margin: 0, color: muted }}>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 8px" }}>
        <h2 style={{ fontSize: 26, margin: "0 0 6px" }}>{t.dataTitle}</h2>
        <p style={{ margin: "0 0 16px", color: muted }}>{t.dataLead}</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {t.data.map((d) => (
            <li key={d} style={{ marginBottom: 8 }}>{d}</li>
          ))}
        </ul>
        <p style={{ color: muted }}>
          {t.details[0]}
          <a href={links.privacy}>{t.details[1]}</a>
          {t.details[2]}
          <a href={links.terms}>{t.details[3]}</a>
          {t.details[4]}
          <a href="/eliminazione-dati">{t.details[5]}</a>
          {t.details[6]}
        </p>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 0" }}>
        <div style={{ background: "#121212", color: "#fff", borderRadius: 16, padding: "28px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <div style={{ flex: "1 1 320px" }}>
            <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>{t.ctaTitle}</h2>
            <p style={{ margin: 0, color: "#C4CDD5" }}>{t.ctaLead}</p>
          </div>
          <a className="t2-cta" href={`mailto:${COMPANY.email}`} style={{ color: "#121212", background: gold, textDecoration: "none", fontWeight: 700, padding: "12px 20px", borderRadius: 8 }}>
            {t.cta}
          </a>
        </div>
      </section>

      <SiteFooter lang={lang} />
    </main>
  );
}
