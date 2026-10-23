import { LegalPage } from "src/components/legal/legal-page";
import { TermsEn, TERMS_UPDATED } from "src/components/legal/terms-content";

export const metadata = {
  title: "Terms of Service",
  robots: { index: true, follow: true },
  alternates: { languages: { it: "/termini" } },
};

export default function TermsPageEn() {
  return (
    <LegalPage title="Terms of Service" updated={TERMS_UPDATED.en} lang="en" alternate="/termini">
      <TermsEn />
    </LegalPage>
  );
}
