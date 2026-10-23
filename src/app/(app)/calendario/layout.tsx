import { gateFeature } from "@/lib/feature-gate";

// Sezione spegnibile da Impostazioni → Funzioni
export default async function Layout({ children }: { children: React.ReactNode }) {
  return gateFeature("calendario", children);
}
