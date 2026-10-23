import { Label } from "src/components/label";
import { STATUS_LABEL } from "@/lib/kpi";

export const STATUS_COLOR = {
  bene: "success",
  male: "warning",
  troppo_male: "error",
  in_attesa: "default",
};

export function StatusBadge({ status, label }) {
  return (
    <Label variant="soft" color={STATUS_COLOR[status]}>
      {label ?? STATUS_LABEL[status]}
    </Label>
  );
}
