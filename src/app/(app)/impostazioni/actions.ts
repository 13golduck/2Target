"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { EMPTY_MAIL, type MailProvider, saveMailSettings, sendMail } from "@/lib/mail";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveMail(f: FormData) {
  const me = await requireUser();
  if (me.role !== "admin") return { error: "Solo un amministratore può cambiare l'invio email" };
  const provider: MailProvider = str(f, "provider") === "smtp" ? "smtp" : "microsoft";
  const from = str(f, "from").toLowerCase();
  if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return { error: "Indirizzo mittente non valido" };
  const port = Number(str(f, "port")) || EMPTY_MAIL.port;
  await saveMailSettings(
    {
      provider,
      from,
      fromName: str(f, "fromName") || "2Target",
      tenantId: str(f, "tenantId"),
      clientId: str(f, "clientId"),
      clientSecret: str(f, "clientSecret"),
      host: str(f, "host"),
      port,
      user: str(f, "user"),
      pass: str(f, "pass"),
    },
    me.id,
  );
  revalidatePath("/impostazioni");
  return { ok: true };
}

/** Invia un'email di prova all'utente collegato. */
export async function testMail() {
  const me = await requireUser();
  if (me.role !== "admin") return { error: "Solo un amministratore" };
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, me.id)).limit(1);
  try {
    await sendMail(
      u.email,
      "Prova di invio da 2Target",
      `Ciao ${u.name}, l'invio delle email di 2Target funziona. Da ora l'accesso avviene con il codice via email.`,
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px"><p style="font-size:16px">Ciao ${u.name.replace(/[<>&]/g, "")},</p><p style="font-size:16px">l'invio delle email di <b>2Target</b> funziona. Da ora l'accesso avviene con il codice via email.</p><p style="color:#919EAB;font-size:12px">2Target · powered by Golduck</p></div>`,
    );
    return { ok: true, to: u.email };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invio non riuscito" };
  }
}
