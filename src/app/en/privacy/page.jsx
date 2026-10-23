import { LegalPage } from "src/components/legal/legal-page";
import { PrivacyEn, PRIVACY_UPDATED } from "src/components/legal/privacy-content";

export const metadata = {
  title: "Privacy Policy",
  robots: { index: true, follow: true },
  alternates: { languages: { it: "/privacy" } },
};

export default function PrivacyPageEn() {
  return (
    <LegalPage title="Privacy Policy" updated={PRIVACY_UPDATED.en} lang="en" alternate="/privacy">
      <PrivacyEn />
    </LegalPage>
  );
}
