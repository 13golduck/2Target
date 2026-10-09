import { STATUS_LABEL, type KpiStatus } from "@/lib/kpi";

const STYLE: Record<KpiStatus, string> = {
  bene: "bg-ok-soft text-ok",
  male: "bg-warn-soft text-warn",
  troppo_male: "bg-bad-soft text-bad",
  in_attesa: "bg-black/5 text-muted",
};
const DOT: Record<KpiStatus, string> = { bene: "bg-ok", male: "bg-warn", troppo_male: "bg-bad", in_attesa: "bg-muted/50" };

export function StatusBadge({ status, label }: { status: KpiStatus; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>
      <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
