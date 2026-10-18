export type FunnelStage = "awareness" | "consideration" | "conversion" | "retention";

export const FUNNEL_STAGES: { key: FunnelStage; label: string; micro: string }[] = [
  { key: "awareness", label: "Farsi conoscere", micro: "Reach, notorietà presso il pubblico giusto" },
  { key: "consideration", label: "Convincere", micro: "Lead, approfondimento" },
  { key: "conversion", label: "Vendere", micro: "Dal primo contatto al primo ordine" },
  { key: "retention", label: "Fidelizzare", micro: "Fidelizzazione e riordino" },
];
