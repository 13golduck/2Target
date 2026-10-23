import { LegalPage } from "src/components/legal/legal-page";
import { TermsIt, TERMS_UPDATED } from "src/components/legal/terms-content";

export const metadata = {
  title: "Termini di servizio",
  robots: { index: true, follow: true },
  alternates: { languages: { en: "/en/terms" } },
};

export default function TermsPage() {
  return (
    <LegalPage title="Termini di servizio" updated={TERMS_UPDATED.it} lang="it" alternate="/en/terms">
      <TermsIt />
    </LegalPage>
  );
}
