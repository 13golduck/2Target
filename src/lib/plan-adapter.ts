import type { editorialItems, editorialPlans } from "@/db/schema";
import type { EditorialItem, EditorialPlan } from "./editorial-plan";

type ItemRow = typeof editorialItems.$inferSelect;
type PlanRow = typeof editorialPlans.$inferSelect;

export const splitHashtags = (s: string | null | undefined) =>
  (s ?? "").split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);

export const toPlanItem = (i: ItemRow): EditorialItem => ({
  id: String(i.id),
  title: i.title,
  format: i.format,
  scheduledAt: i.scheduledAt,
  status: i.status,
  hook: i.hook,
  layoutNotes: i.layoutNotes,
  script: i.script,
  shotList: i.shotList ?? [],
  caption: i.caption,
  hashtags: splitHashtags(i.hashtags),
  cta: i.cta,
  ctaDestination: i.ctaDestination,
  ctaUrl: i.ctaUrl,
  isPaid: i.isPaid,
  adObjective: i.adObjective,
  adButton: i.adButton,
  adBudget: i.adBudget,
  adDays: i.adDays,
});

export const toPlan = (p: PlanRow): EditorialPlan => ({
  startsOn: new Date(`${p.startsOn}T00:00:00Z`),
  endsOn: new Date(`${p.endsOn}T00:00:00Z`),
  minPerWeek: p.minPerWeek,
  formatQuotas: p.formatQuotas ?? {},
  adsBudget: p.adsBudget,
});
