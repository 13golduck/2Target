// Intestazione e piè di pagina del sito pubblico di 2Target (home, privacy, termini), in italiano e in inglese.
// TikTok chiede che l'icona dell'app sia visibile in testa a ogni pagina e come favicon: è la stessa immagine
// caricata sulla piattaforma (public/icon-192.png, da docs/brand/2target-icon-1024.png).

import { COMPANY } from "./company";

export const SITE_GOLD = "#CDA434";

const LABELS = {
  it: { home: "/", privacy: "/privacy", terms: "/termini", deletion: "/eliminazione-dati", features: "Funzioni", privacyLabel: "Privacy", termsLabel: "Termini di servizio", deletionLabel: "Eliminazione dei dati", signIn: "Accedi", other: { href: "/en", label: "English" }, service: "2Target è un servizio di Golduck", vat: "P.IVA", contacts: "Contatti" },
  en: { home: "/en", privacy: "/en/privacy", terms: "/en/terms", deletion: "/eliminazione-dati", features: "Features", privacyLabel: "Privacy Policy", termsLabel: "Terms of Service", deletionLabel: "Data deletion", signIn: "Sign in", other: { href: "/", label: "Italiano" }, service: "2Target is a service by Golduck", vat: "VAT no.", contacts: "Contact" },
};

export const siteLinks = (lang) => LABELS[lang];

/** Intestazione: icona e nome dell'app, menu, cambio lingua e accesso. dark = su fondo scuro (home). */
export function SiteHeader({ lang, dark = false, alternate }) {
  const l = LABELS[lang];
  const color = dark ? "#fff" : "#1C252E";
  const link = { color: dark ? "#C4CDD5" : "#637381", textDecoration: "none", fontSize: 14 };
  return (
    <nav aria-label={lang === "it" ? "Menu del sito" : "Site menu"} style={{ position: "relative", maxWidth: 960, margin: "0 auto", padding: "20px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", color }}>
      <a href={l.home} style={{ display: "flex", alignItems: "center", gap: 10, color, textDecoration: "none", flex: 1, minWidth: 160 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- immagine statica piccola, uguale all'icona registrata sulle piattaforme */}
        <img src="/icon-192.png" alt="2Target" width={36} height={36} style={{ borderRadius: 8, display: "block" }} />
        <strong style={{ fontSize: 18 }}>2Target</strong>
      </a>
      <a href={`${l.home}#features`} style={link}>{l.features}</a>
      <a href={l.privacy} style={link}>{l.privacyLabel}</a>
      <a href={l.terms} style={link}>{l.termsLabel}</a>
      <a href={alternate ?? l.other.href} style={link} hrefLang={lang === "it" ? "en" : "it"}>
        {l.other.label}
      </a>
      <a href="/login" style={{ color: "#121212", background: SITE_GOLD, textDecoration: "none", fontWeight: 700, padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
        {l.signIn}
      </a>
    </nav>
  );
}

export function SiteFooter({ lang }) {
  const l = LABELS[lang];
  const muted = "#637381";
  return (
    <footer style={{ maxWidth: 960, margin: "48px auto 0", padding: "24px 20px 48px", borderTop: "1px solid #E5E8EB", color: muted, fontSize: 14 }}>
      <p style={{ margin: "0 0 6px" }}>
        <strong style={{ color: "#1C252E" }}>{l.service}</strong> · {COMPANY.name} · {l.vat} {COMPANY.vat}
      </p>
      <p style={{ margin: "0 0 6px" }}>{COMPANY.address}</p>
      <p style={{ margin: 0 }}>
        {l.contacts}: <a href={`mailto:${COMPANY.email}`} style={{ color: "inherit" }}>{COMPANY.email}</a> · <a href="https://golduck.it" style={{ color: "inherit" }}>golduck.it</a> ·{" "}
        <a href={l.privacy} style={{ color: "inherit" }}>{l.privacyLabel}</a> · <a href={l.terms} style={{ color: "inherit" }}>{l.termsLabel}</a> ·{" "}
        <a href={l.deletion} style={{ color: "inherit" }}>{l.deletionLabel}</a>
      </p>
    </footer>
  );
}
