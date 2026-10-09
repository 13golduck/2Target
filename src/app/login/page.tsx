import { LoginView } from "./login-view";

export const metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ da?: string }> }) {
  const { da } = await searchParams;
  // Solo percorsi interni: niente redirect verso altri siti
  const returnTo = da?.startsWith("/") && !da.startsWith("//") ? da : "/";
  return <LoginView returnTo={returnTo} />;
}
