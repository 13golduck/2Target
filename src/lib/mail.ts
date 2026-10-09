import "server-only";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./secret-box";

// Invio delle email (codici di accesso). Si configura da 2Target → Impostazioni (salvato nel DB,
// password cifrate) oppure, in alternativa, con le variabili SMTP_* su Plesk.
// - "microsoft": Microsoft 365 via Microsoft Graph (registrazione app in Entra ID, permesso Mail.Send).
//   È il metodo consigliato: Microsoft spegne l'SMTP con password semplice (fine 2026).
// - "smtp": qualsiasi server SMTP (Google Workspace con password per app, Aruba, ...).
// In sviluppo, senza configurazione, il messaggio viene stampato nel terminale.

export type MailProvider = "microsoft" | "smtp";

export type MailSettings = {
  provider: MailProvider;
  from: string;
  fromName: string;
  tenantId: string;
  clientId: string;
  clientSecret: string; // cifrato nel DB
  host: string;
  port: number;
  user: string;
  pass: string; // cifrato nel DB
};

const KEY = "mail";
const PURPOSE = "mail-secret";

export const EMPTY_MAIL: MailSettings = {
  provider: "microsoft",
  from: "",
  fromName: "2Target",
  tenantId: "",
  clientId: "",
  clientSecret: "",
  host: "smtp.office365.com",
  port: 587,
  user: "",
  pass: "",
};

/** Configurazione salvata, con i segreti ancora cifrati. */
async function storedSettings(): Promise<MailSettings | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return row ? { ...EMPTY_MAIL, ...(row.value as Partial<MailSettings>) } : null;
}

function envSettings(): MailSettings | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return {
    ...EMPTY_MAIL,
    provider: "smtp",
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    fromName: "",
  };
}

function isComplete(s: MailSettings | null, decrypt: boolean) {
  if (!s) return false;
  const secret = (v: string) => (decrypt ? Boolean(decryptSecret(v, PURPOSE)) : Boolean(v));
  if (s.provider === "microsoft") return Boolean(s.tenantId && s.clientId && s.from && secret(s.clientSecret));
  return Boolean(s.host && s.user && secret(s.pass));
}

export async function isMailConfigured() {
  return isComplete(await storedSettings(), true) || Boolean(envSettings());
}

/** Per la pagina Impostazioni: mai i segreti, solo se sono già presenti. */
export async function getMailSettingsForForm() {
  const s = await storedSettings();
  const base = s ?? EMPTY_MAIL;
  return {
    ...base,
    clientSecret: "",
    pass: "",
    hasClientSecret: Boolean(s?.clientSecret),
    hasPass: Boolean(s?.pass),
    configured: isComplete(s, true),
    fromEnv: !s && Boolean(envSettings()),
  };
}

/** Salva; i campi segreti vuoti mantengono il valore precedente. */
export async function saveMailSettings(input: MailSettings, userId: number) {
  const prev = await storedSettings();
  const value: MailSettings = {
    ...input,
    clientSecret: input.clientSecret ? encryptSecret(input.clientSecret, PURPOSE) : (prev?.clientSecret ?? ""),
    pass: input.pass ? encryptSecret(input.pass.replace(/\s+/g, ""), PURPOSE) : (prev?.pass ?? ""),
  };
  await db.insert(appSettings).values({ key: KEY, value, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value, updatedBy: userId } });
  transport = null;
  graphToken = null;
}

async function activeSettings(): Promise<MailSettings | null> {
  const s = await storedSettings();
  if (isComplete(s, true) && s) {
    return { ...s, clientSecret: decryptSecret(s.clientSecret, PURPOSE) ?? "", pass: decryptSecret(s.pass, PURPOSE) ?? "" };
  }
  return envSettings();
}

// --- SMTP -------------------------------------------------------------------

let transport: { key: string; t: nodemailer.Transporter } | null = null;
function smtp(s: MailSettings) {
  const key = `${s.host}:${s.port}:${s.user}:${s.pass}`;
  if (transport?.key !== key) {
    transport = {
      key,
      t: nodemailer.createTransport({
        host: s.host,
        port: s.port,
        secure: s.port === 465, // 465 = TLS diretto; 587 = STARTTLS
        // Le password per app di Google si copiano a gruppi di 4 lettere separati da spazi
        auth: { user: s.user, pass: s.pass.replace(/\s+/g, "") },
      }),
    };
  }
  return transport.t;
}

// --- Microsoft Graph --------------------------------------------------------

let graphToken: { key: string; token: string; exp: number } | null = null;
async function msToken(s: MailSettings) {
  const key = `${s.tenantId}:${s.clientId}`;
  if (graphToken?.key === key && graphToken.exp > Date.now() + 60_000) return graphToken.token;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(s.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Microsoft: accesso dell'app non riuscito (${data.error ?? res.status}). ${String(data.error_description ?? "").split("\r\n")[0]}`);
  }
  graphToken = { key, token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return graphToken.token;
}

async function sendGraph(s: MailSettings, to: string, subject: string, html: string) {
  const token = await msToken(s);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(s.from)}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: false,
    }),
  });
  if (res.status !== 202) {
    const err = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new Error(`Microsoft: invio non riuscito (${err.error?.code ?? res.status}). ${err.error?.message ?? ""}`);
  }
}

// ----------------------------------------------------------------------------

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const s = await activeSettings();
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("Invio email non configurato (2Target → Impostazioni)");
    console.log(`\n[mail] (sviluppo, nessun invio configurato) a ${to}\n${subject}\n${text}\n`);
    return;
  }
  if (s.provider === "microsoft") return sendGraph(s, to, subject, html);
  const from = s.fromName ? `${s.fromName} <${s.from || s.user}>` : s.from || s.user;
  await smtp(s).sendMail({ from, to, subject, text, html });
}
