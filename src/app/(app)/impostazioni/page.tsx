import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getMailSettingsForForm, getMailTest } from "@/lib/mail";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ primo?: string }> }) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const { primo } = await searchParams;
  const [mail, lastTest] = await Promise.all([getMailSettingsForForm(), getMailTest()]);
  return <SettingsView mail={mail} lastTest={lastTest} firstAccess={primo === "1"} />;
}
