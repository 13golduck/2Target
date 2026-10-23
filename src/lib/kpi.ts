// Semaforo KPI: confronta il valore misurato con il target del cliente.
// "higher" = più alto è meglio (reach, ER, ROAS); "lower" = più basso è meglio (CPC, CPL, CPA).

export type KpiStatus = "bene" | "male" | "troppo_male" | "in_attesa";

export interface KpiRule {
  direction: "higher" | "lower";
  target: number;
  warnRatio?: number; // default 0.9
  criticalRatio?: number; // default 0.6
  minSample?: number | null; // es. spesa minima prima di giudicare
}

export interface KpiEvaluation {
  status: KpiStatus;
  /** Prestazione rispetto al target: 1 = esattamente in target, >1 meglio del target. */
  score: number | null;
  message: string;
}

export const DEFAULT_WARN_RATIO = 0.9;
export const DEFAULT_CRITICAL_RATIO = 0.6;

export function evaluateKpi(value: number | null | undefined, rule: KpiRule, sample?: number | null): KpiEvaluation {
  const warn = rule.warnRatio ?? DEFAULT_WARN_RATIO;
  const critical = rule.criticalRatio ?? DEFAULT_CRITICAL_RATIO;

  if (value == null || !Number.isFinite(value)) {
    return { status: "in_attesa", score: null, message: "Nessun dato nel periodo" };
  }
  if (rule.minSample != null && (sample ?? 0) < rule.minSample) {
    return { status: "in_attesa", score: null, message: "Dati ancora insufficienti per giudicare" };
  }
  if (rule.target <= 0) {
    return { status: "in_attesa", score: null, message: "Target non valido" };
  }

  // Per i KPI di costo il rapporto si inverte: CPL 15 € su target 10 € → score 0,67.
  const score =
    rule.direction === "higher" ? value / rule.target : value <= 0 ? Infinity : rule.target / value;

  if (score >= warn) return { status: "bene", score, message: "In linea con il target" };
  if (score >= critical) return { status: "male", score, message: "Sotto target: da correggere" };
  return {
    status: "troppo_male",
    score,
    message:
      rule.direction === "lower"
        ? "Costo fuori controllo: valutare la pausa della campagna"
        : "Molto sotto target: intervenire subito",
  };
}

const STATUS_RANK: Record<KpiStatus, number> = { troppo_male: 0, male: 1, bene: 2, in_attesa: 3 };

/** Stato complessivo di un gruppo di KPI (cliente, campagna): vince il peggiore. */
export function worstStatus(statuses: KpiStatus[]): KpiStatus {
  const judged = statuses.filter((s) => s !== "in_attesa");
  if (judged.length === 0) return "in_attesa";
  return judged.reduce((a, b) => (STATUS_RANK[a] <= STATUS_RANK[b] ? a : b));
}

export const STATUS_LABEL: Record<KpiStatus, string> = {
  bene: "In linea",
  male: "Da migliorare",
  troppo_male: "Sotto obiettivo",
  in_attesa: "In attesa",
};
