import { PublicHome } from "../chi-siamo/public-home";

export const metadata = {
  title: { absolute: "2Target · the marketing platform by Golduck" },
  description: "With 2Target the Golduck team runs your business's social media from idea to results: strategy, editorial plan, publishing, reports and promotions.",
  robots: { index: true, follow: true },
  alternates: { languages: { it: "/" } },
};

export default function HomeEn() {
  return <PublicHome lang="en" />;
}
