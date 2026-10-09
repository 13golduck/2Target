import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getMailSettingsForForm } from "@/lib/mail";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ primo?: string }> }) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const { primo } = await searchParams;
  return <SettingsView mail={await getMailSettingsForForm()} firstAccess={primo === "1"} />;
}
