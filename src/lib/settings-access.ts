import "server-only";
import { cookies } from "next/headers";

import { isMailConfigured } from "./mail";
import { signPayload, verifyPayload } from "./secret-box";

// Seconda verifica per le Impostazioni: anche da collegato, l'amministratore deve inserire un codice
// nuovo ricevuto via email. Lo sblocco vale SETTINGS_TTL_MIN minuti, solo per quell'utente e quel browser.
// Unica eccezione: invio email non ancora configurato (primo accesso), perché il codice non potrebbe arrivare.

export const SETTINGS_TTL_MIN = 15;
const COOKIE = "2t_impostazioni";

type Grant = { kind: "settings"; uid: number; exp: number };

export async function settingsUnlocked(userId: number) {
  if (!(await isMailConfigured())) return true;
  const grant = verifyPayload<Grant>((await cookies()).get(COOKIE)?.value);
  return grant?.kind === "settings" && grant.uid === userId;
}

export async function grantSettingsAccess(userId: number) {
  (await cookies()).set(COOKIE, signPayload({ kind: "settings", uid: userId }, SETTINGS_TTL_MIN * 60), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SETTINGS_TTL_MIN * 60,
  });
}

export async function revokeSettingsAccess() {
  (await cookies()).delete(COOKIE);
}
