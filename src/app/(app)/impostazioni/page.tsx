import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getMailSettingsForForm, getMailTest } from "@/lib/mail";
import { SETTINGS_TTL_MIN, settingsUnlocked } from "@/lib/settings-access";
import { SettingsGate } from "./settings-gate";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ primo?: string }> }) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const { primo } = await searchParams;
  // Seconda verifica: anche da collegato serve un codice nuovo ricevuto via email
  if (!(await settingsUnlocked(me.id))) return <SettingsGate minutes={SETTINGS_TTL_MIN} />;
  const [mail, lastTest] = await Promise.all([getMailSettingsForForm(), getMailTest()]);
  return <SettingsView mail={mail} lastTest={lastTest} firstAccess={primo === "1"} />;
}
