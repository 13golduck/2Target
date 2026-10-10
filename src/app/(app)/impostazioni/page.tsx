import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { getLimits } from "@/lib/ai/budget";
import { getMethodology } from "@/lib/ai/metodologia";
import { getMailSettingsForForm, getMailTest } from "@/lib/mail";
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
  const [mail, lastTest, limits, method] = await Promise.all([getMailSettingsForForm(), getMailTest(), getLimits(), getMethodology()]);
  return (
    <SettingsView
      mail={mail}
      lastTest={lastTest}
      limits={limits}
      method={{ version: method.version, text: method.text, at: method.at, isDefault: method.isDefault }}
      firstAccess={primo === "1"}
    />
  );
}
