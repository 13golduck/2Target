import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { GUIDE } from "@/lib/guide/articles";
import { articlesFor } from "@/lib/guide/types";
import { ArticleView } from "./article-view";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: GUIDE.find((a) => a.slug === slug)?.title ?? "Guida" };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser();
  const visible = articlesFor(GUIDE, me.role);
  const article = visible.find((a) => a.slug === slug);
  if (!article) notFound();
  const related = (article.related ?? []).map((s) => visible.find((a) => a.slug === s)).filter((a) => !!a).map((a) => ({ slug: a.slug, title: a.title, icon: a.icon }));
  return <ArticleView article={article} related={related} />;
}
