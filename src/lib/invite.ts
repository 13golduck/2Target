import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/integrations/config";
import { ROLE_LABELS } from "@/lib/roles";
import { sendMail } from "./mail";

// Email di invito a 2Target: spiega come si entra (email + codice, nessuna password) con il link
// alla pagina di accesso. Non contiene codici: il codice si chiede dalla pagina.

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export async function sendInvite(user: { id: number; email: string; name: string; role: string }, invitedBy: string) {
  const link = `${appUrl()}/login`;
  const role = ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role;
  await sendMail(
    user.email,
    `${invitedBy} ti ha invitato su 2Target`,
    `Ciao ${user.name},\n\n${invitedBy} ti ha dato accesso a 2Target, la piattaforma marketing di Golduck, come ${role}.\n\nPer entrare:\n1. apri ${link}\n2. scrivi la tua email (${user.email}) e premi «Inviami il codice»\n3. inserisci il codice di 6 cifre che ricevi via email\n\nNon serve nessuna password. Se il codice non arriva, controlla lo spam.\n\n2Target · powered by Golduck`,
    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1C1C1C">
      <div style="display:inline-block;background:#CDA434;color:#1C1C1C;font-weight:800;border-radius:12px;padding:10px 14px;font-size:20px">2T</div>
      <p style="font-size:16px">Ciao ${esc(user.name)},</p>
      <p style="font-size:16px"><b>${esc(invitedBy)}</b> ti ha dato accesso a <b>2Target</b>, la piattaforma marketing di Golduck, come <b>${esc(role)}</b>.</p>
      <p style="margin:28px 0"><a href="${esc(link)}" style="background:#1C1C1C;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;display:inline-block">Entra in 2Target</a></p>
      <p style="font-size:15px">Per entrare scrivi la tua email (<b>${esc(user.email)}</b>), premi «Inviami il codice» e inserisci il codice di 6 cifre che ricevi. Non serve nessuna password.</p>
      <p style="color:#637381">Se il codice non arriva, controlla la cartella spam.</p>
      <p style="color:#919EAB;font-size:12px">2Target · powered by Golduck</p>
    </div>`,
  );
  await db.update(users).set({ invitedAt: new Date() }).where(eq(users.id, user.id));
}
