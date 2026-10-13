import { setupOpen } from "@/lib/first-access";
import { msSsoConfigured } from "@/lib/sso-microsoft";
import { LoginView } from "./login-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ da?: string; sso?: string }> }) {
  const { da, sso } = await searchParams;
  // Solo percorsi interni: niente redirect verso altri siti
  const returnTo = da?.startsWith("/") && !da.startsWith("//") ? da : "/";
  // Database non raggiungibile: si mostra il login normale (la diagnosi è su /api/stato)
  const setup = await setupOpen().catch(() => false);
  const microsoft = await msSsoConfigured().catch(() => false);
  return <LoginView returnTo={returnTo} setup={setup} microsoft={microsoft} ssoError={SSO_ERRORS[sso ?? ""] ?? null} />;
}

const SSO_ERRORS: Record<string, string> = {
  nessun_utente: "Il tuo account Microsoft non corrisponde a un utente attivo di 2Target. Chiedi a un amministratore di aggiungerti con la stessa email.",
  tenant: "Puoi entrare con Microsoft solo con un account Golduck.",
  stato: "L'accesso con Microsoft è scaduto o non è valido: riprova.",
  microsoft: "Microsoft non ha completato l'accesso: riprova o entra con il codice via email.",
  annullato: "Accesso con Microsoft annullato.",
  non_configurato: "L'accesso con Microsoft non è ancora configurato.",
}
