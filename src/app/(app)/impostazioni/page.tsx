import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLimits } from "@/lib/ai/budget";
import { getMethodology, planMethod } from "@/lib/ai/metodologia";
import { getMailSettingsForForm, getMailTest } from "@/lib/mail";
import { integrationStatus } from "@/lib/integrations/keys";
import { appUrl } from "@/lib/integrations/config";
import { SETTINGS_TTL_MIN, settingsUnlocked } from "@/lib/settings-access";
import { SettingsGate } from "./settings-gate";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ primo?: string }> }) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) redirect("/");
  const { primo } = await searchParams;
  // Seconda verifica: anche da collegato serve un codice nuovo ricevuto via email
  if (!(await settingsUnlocked(me.id))) return <SettingsGate minutes={SETTINGS_TTL_MIN} />;
  const [mail, lastTest, limits, method, plan, integrations] = await Promise.all([getMailSettingsForForm(), getMailTest(), getLimits(), getMethodology(), planMethod.get(), integrationStatus()]);
  return (
    <SettingsView
      mail={mail}
      lastTest={lastTest}
      limits={limits}
      method={{ version: method.version, text: method.text, at: method.at, isDefault: method.isDefault }}
      planMethod={{ version: plan.version, text: plan.text, at: plan.at, isDefault: plan.isDefault }}
      firstAccess={primo === "1"}
      integrations={{ status: integrations, appUrl: appUrl() }}
    />
  );
}
