export type FunnelStage = "awareness" | "consideration" | "conversion" | "retention";

export const FUNNEL_STAGES: { key: FunnelStage; label: string; micro: string }[] = [
  { key: "awareness", label: "Awareness", micro: "Reach, notorietà presso il pubblico giusto" },
  { key: "consideration", label: "Consideration", micro: "Lead, approfondimento" },
  { key: "conversion", label: "Conversion", micro: "Dal primo contatto al primo ordine" },
  { key: "retention", label: "Retention / Loyalty", micro: "Fidelizzazione e riordino" },
];
