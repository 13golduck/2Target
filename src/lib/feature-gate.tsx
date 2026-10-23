import { FeatureOff } from "src/components/feature-off";
import { FEATURES, type FeatureKey } from "./features";
import { featureOn } from "./features-data";

/** Per i layout delle sezioni generali: la pagina se la funzione è accesa, altrimenti l'avviso «spenta». */
export async function gateFeature(key: FeatureKey, children: React.ReactNode) {
  if (await featureOn(key)) return children;
  const label = FEATURES.find((f) => f.key === key)?.label ?? key;
  return (
    <div style={{ padding: 24 }}>
      <FeatureOff label={label} where="Impostazioni → Funzioni" href="/impostazioni#funzioni" />
    </div>
  );
}
