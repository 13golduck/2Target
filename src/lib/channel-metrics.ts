// Calcoli del check-up sui canali: engagement rate, frequenza, confronto tra tipi di contenuto.
// Esempio Piantiny: post con persone ~3-4x le interazioni dei post di solo prodotto.

export interface PostSample {
  likes: number;
  comments: number;
  shares?: number;
  saves?: number;
  publishedAt: Date;
  tags?: string[]; // es. "persone", "prodotto", "reel", "foto"
}

export const interactionsOf = (p: PostSample) => p.likes + p.comments + (p.shares ?? 0) + (p.saves ?? 0);

/** ER classico per profilo (interazioni medie / follower), quello usato nel check-up pubblico. */
export function engagementRateByFollowers(posts: PostSample[], followers: number): number | null {
  if (posts.length === 0 || followers <= 0) return null;
  const avg = posts.reduce((s, p) => s + interactionsOf(p), 0) / posts.length;
  return avg / followers;
}

export function postsPerMonth(posts: PostSample[], months = 3, now = new Date()): number {
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);
  return posts.filter((p) => p.publishedAt >= from && p.publishedAt <= now).length / months;
}

export interface TagComparison {
  tag: string;
  posts: number;
  avgInteractions: number;
  /** Rapporto rispetto alla media dei post senza il tag. */
  liftVsOthers: number | null;
}

/** Per ogni tag: media interazioni dei post con il tag e quante volte rende rispetto agli altri. */
export function compareByTag(posts: PostSample[]): TagComparison[] {
  const tags = [...new Set(posts.flatMap((p) => p.tags ?? []))];
  const avg = (xs: PostSample[]) => (xs.length ? xs.reduce((s, p) => s + interactionsOf(p), 0) / xs.length : 0);
  return tags
    .map((tag) => {
      const withTag = posts.filter((p) => p.tags?.includes(tag));
      const others = posts.filter((p) => !p.tags?.includes(tag));
      const a = avg(withTag);
      const b = avg(others);
      return { tag, posts: withTag.length, avgInteractions: a, liftVsOthers: others.length && b > 0 ? a / b : null };
    })
    .sort((x, y) => y.avgInteractions - x.avgInteractions);
}
