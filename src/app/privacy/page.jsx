import { LegalPage } from "src/components/legal/legal-page";
import { PrivacyIt, PRIVACY_UPDATED } from "src/components/legal/privacy-content";

export const metadata = {
  title: "Informativa privacy",
  robots: { index: true, follow: true },
  alternates: { languages: { en: "/en/privacy" } },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Informativa sulla privacy" updated={PRIVACY_UPDATED.it} lang="it" alternate="/en/privacy">
      <PrivacyIt />
    </LegalPage>
  );
}
