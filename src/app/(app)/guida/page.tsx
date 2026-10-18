import { requireUser } from "@/lib/auth";
import { GUIDE } from "@/lib/guide/articles";
import { articlesFor } from "@/lib/guide/types";
import { GuideIndexView } from "./guide-index-view";

export const metadata = { title: "Guida" };

// Guida di 2Target: tutte le funzioni spiegate passo per passo, con ricerca.
export default async function GuidePage() {
  const me = await requireUser();
  const list = articlesFor(GUIDE, me.role).map(({ slug, title, summary, category, icon, keywords, blocks }) => ({ slug, title, summary, category, icon, keywords, blocks }));
  return <GuideIndexView articles={list} />;
}
