import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ da?: string }> }) {
  const { da } = await searchParams;
  // Solo percorsi interni: niente redirect verso altri siti
  const returnTo = da?.startsWith("/") && !da.startsWith("//") ? da : "/";
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <p className="text-xl font-black tracking-tight">
          2Target <span className="text-sm font-light text-gold">by Golduck</span>
        </p>
        <p className="mt-1 mb-6 text-sm text-muted">Accesso riservato al team</p>
        <LoginForm returnTo={returnTo} />
      </div>
    </main>
  );
}
