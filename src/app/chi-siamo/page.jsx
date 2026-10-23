import { PublicHome } from "./public-home";

export const metadata = {
  title: { absolute: "2Target · la piattaforma marketing di Golduck" },
  description: "Con 2Target il team Golduck segue i social della tua attività dall'idea al risultato: strategia, piano editoriale, pubblicazione, report e sponsorizzate.",
  robots: { index: true, follow: true },
  alternates: { languages: { en: "/en" } },
};

export default function AboutPage() {
  return <PublicHome lang="it" />;
}
