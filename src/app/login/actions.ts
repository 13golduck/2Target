"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";

import { auth, signIn, signOut } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setupOpen } from "@/lib/first-access";
import { checkLoginCode, requestLoginCode } from "@/lib/login-codes";
import { logError } from "@/lib/error-log";

// Limite per indirizzo IP sulle richieste di codice (in memoria: un solo processo Node su Plesk)
const hits = new Map<string, { n: number; t: number }>();
function tooMany(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 15 * 60_000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 20;
}

export type LoginState = { step: "email" | "code" | "totp" | "setup"; email?: string; code?: string; remember?: boolean; error?: string; info?: string };

/** Primo accesso: crea l'account master con la sola email ed entra senza codice. */
async function createMaster(email: string): Promise<LoginState> {
  if (!(await setupOpen())) return { step: "email", email, error: "Il primo accesso è già stato fatto: accedi con il codice." };
  try {
    await signIn("credentials", { email, firstAccess: "true", remember: "false", redirectTo: "/impostazioni?primo=1" });
    return { step: "setup", email };
  } catch (e) {
    if (e instanceof AuthError) return { step: "setup", email, error: "Esiste già un account master con un'altra email: usa quella." };
    throw e; // il redirect di Next passa da qui
  }
}

export async function loginStep(prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const returnTo = String(formData.get("returnTo") ?? "/");

  if (prev.step === "setup") {
    if (!email) return { step: "setup", error: "Scrivi l'email dell'account master." };
    return createMaster(email);
  }

  if (formData.get("action") === "codice" || prev.step === "email") {
    if (!email) return { step: "email", error: "Scrivi la tua email." };
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
    if (tooMany(ip)) return { step: "email", email, error: "Troppe richieste: riprova tra qualche minuto." };
    try {
      const sent = await requestLoginCode(email, ip);
      await audit({ userId: null, actorLabel: email.slice(0, 200), category: "accesso", action: "accesso.codice_richiesto", description: sent ? `Richiesto il codice di accesso per ${email}` : `Richiesta di codice non soddisfatta per ${email} (utente inesistente, disattivato o troppe richieste)` });
    } catch (e) {
      console.error("[login] invio codice:", e);
      await logError({ area: "Accesso", message: `Invio del codice non riuscito: ${e instanceof Error ? e.message : String(e)}`, detail: `Email: ${email}`, path: "/login" });
      return { step: "email", email, error: "Non riesco a inviare l'email in questo momento. Riprova o avvisa l'amministratore." };
    }
    // Stessa risposta per email registrate e non: nessuno può scoprire chi è utente
    return { step: "code", email, info: "Se l'indirizzo è registrato ti abbiamo inviato un codice di 6 cifre. Controlla anche lo spam." };
  }

  const code = String(formData.get("code") ?? prev.code ?? "");
  // Codice email giusto e doppio fattore attivo: si chiede il codice dell'app prima di entrare
  if (prev.step === "code") {
    const user = await checkLoginCode(email, code);
    if (!user) {
      await audit({ userId: null, actorLabel: email.slice(0, 200), category: "accesso", action: "accesso.codice_errato", description: `Accesso non riuscito: codice email errato o scaduto per ${email}` });
      return { step: "code", email, error: "Codice non valido o scaduto. Controlla o chiedine uno nuovo." };
    }
    if (user.totpEnabledAt) return { step: "totp", email, code, remember: formData.get("remember") === "on" };
  }

  try {
    await signIn("credentials", {
      email,
      code,
      totp: String(formData.get("totp") ?? ""),
      remember: formData.get("remember") === "on" || (prev.step === "totp" && prev.remember) ? "true" : "false",
      redirectTo: returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/",
    });
    return { step: "code", email };
  } catch (e) {
    if (e instanceof AuthError) {
      if (prev.step === "totp") return { step: "totp", email, code, remember: prev.remember, error: "Codice dell'app non valido. Riprova o usa un codice di recupero." };
      return { step: "code", email, error: "Codice non valido o scaduto. Controlla o chiedine uno nuovo." };
    }
    throw e; // il redirect di Next passa da qui
  }
}

export async function logout() {
  const id = Number((await auth())?.user?.id);
  if (id) await audit({ userId: id, category: "accesso", action: "accesso.uscita", description: "Uscita dall'app" });
  await signOut({ redirectTo: "/login" });
}
