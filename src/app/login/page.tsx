import { setupOpen } from "@/lib/first-access";
import { LoginView } from "./login-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ da?: string }> }) {
  const { da } = await searchParams;
  // Solo percorsi interni: niente redirect verso altri siti
  const returnTo = da?.startsWith("/") && !da.startsWith("//") ? da : "/";
  // Database non raggiungibile: si mostra il login normale (la diagnosi è su /api/stato)
  const setup = await setupOpen().catch(() => false);
  return <LoginView returnTo={returnTo} setup={setup} />;
}
