import { TECH_ARTICLES } from "./articles-tech";
import { WORK_ARTICLES } from "./articles-work";
import type { GuideArticle } from "./types";

/** Tutti gli articoli della guida. */
export const GUIDE: GuideArticle[] = [...WORK_ARTICLES, ...TECH_ARTICLES];
