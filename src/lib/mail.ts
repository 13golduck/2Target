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
// - preset "google-relay": relay SMTP di Google Workspace, autorizzato per IP del server: nessuna password salvata.
// In sviluppo, senza configurazione, il messaggio viene stampato nel terminale.

export type MailProvider = "microsoft" | "smtp";

/** Preimpostazione scelta in Impostazioni (solo per l'interfaccia). */
export type MailPreset = "microsoft" | "microsoft-smtp" | "google" | "google-relay" | "smtp";

const isRelay = (s: MailSettings) => s.provider === "smtp" && s.preset === "google-relay";

export type MailSettings = {
  provider: MailProvider;
  preset?: MailPreset;
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
  provider: "smtp",
  preset: "microsoft-smtp",
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
  // Relay per IP: basta server e mittente (Google riconosce il server dall'indirizzo IP)
  if (isRelay(s)) return Boolean(s.host && s.from);
  return Boolean(s.host && s.user && secret(s.pass));
}

export async function isMailConfigured() {
  return isComplete(await storedSettings(), true) || Boolean(envSettings());
}

/** Esito dell'ultima email di prova (per mostrare se l'invio funziona davvero). */
export type MailTest = { ok: boolean; at: string; to?: string; error?: string; savedAt?: string };

export async function getMailTest(): Promise<MailTest | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "mail_test")).limit(1);
  return (row?.value as MailTest) ?? null;
}

export async function saveMailTest(value: MailTest, userId: number) {
  await db.insert(appSettings).values({ key: "mail_test", value, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value, updatedBy: userId } });
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
    savedAt: s ? (await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1))[0]?.updatedAt?.toISOString() ?? null : null,
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
  // Con il relay per IP la vecchia password resta salvata ma non si usa: permette di tornare indietro
  // se il relay non è ancora attivo. Una volta verificato, la si revoca in Google.
  await db.insert(appSettings).values({ key: KEY, value, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value, updatedBy: userId } });
  transport = null;
  graphToken = null;
}

async function activeSettings(): Promise<MailSettings | null> {
  const s = await storedSettings();
  if (isComplete(s, true) && s) {
    return { ...s, clientSecret: decryptSecret(s.clientSecret, PURPOSE) ?? "", pass: isRelay(s) ? "" : (decryptSecret(s.pass, PURPOSE) ?? "") };
  }
  return envSettings();
}

// --- SMTP -------------------------------------------------------------------

const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};

let transport: { key: string; t: nodemailer.Transporter } | null = null;
function smtp(s: MailSettings) {
  const key = `${s.preset}:${s.host}:${s.port}:${s.user}:${s.pass}`;
  if (transport?.key !== key) {
    transport = {
      key,
      t: nodemailer.createTransport({
        host: s.host,
        port: s.port,
        secure: s.port === 465, // 465 = TLS diretto; 587 = STARTTLS
        ...(isRelay(s)
          ? {
              // Relay Google: niente credenziali, TLS obbligatorio e nome del server nel saluto SMTP
              requireTLS: true,
              name: hostOf(process.env.APP_URL) ?? "2target.it",
            }
          : {
              // Le password per app di Google si copiano a gruppi di 4 lettere separati da spazi
              auth: { user: s.user, pass: s.pass.replace(/\s+/g, "") },
            }),
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

/** Spiega in italiano gli errori più comuni dei server di posta, lasciando il dettaglio originale. */
export function explainMailError(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  const hints: [RegExp, string][] = [
    [/5\.7\.8|BadCredentials/i, "Google non accetta utente e password: serve la password per app di 16 lettere, non la password normale."],
    [/5\.7\.139|SmtpClientAuthentication is disabled/i, "Microsoft 365: per questa casella l'SMTP autenticato è disattivato. Va attivato nell'interfaccia di amministrazione."],
    [/5\.7\.3|Authentication unsuccessful/i, "Microsoft 365 non accetta utente e password. Controllali; con l'autenticazione a più fattori serve una password per app, e la casella deve avere l'SMTP autenticato attivo."],
    [/relay denied|Invalid credentials for relay|5\.7\.0.*relay/i, "Relay di Google: l'IP del server non è autorizzato. Nella console Google → Gmail → Routing → Servizio di inoltro SMTP aggiungi l'IP del server e salva (l'attivazione può richiedere fino a un'ora)."],
    [/Must issue a STARTTLS|TLS required|5\.7\.11/i, "Il server richiede una connessione cifrata: usa la porta 587 (STARTTLS) o 465 (TLS)."],
    [/ENOTFOUND|EAI_AGAIN/i, "Server SMTP sconosciuto: controlla il nome del server."],
    [/ETIMEDOUT|ECONNREFUSED|ECONNECTION/i, "Il server SMTP non risponde su questa porta: prova 587 oppure 465."],
    [/wrong version number|SSL routines/i, "Porta e cifratura non coincidono: usa 587 (STARTTLS) oppure 465 (TLS)."],
    [/5\.7\.60|SendAsDenied|not allowed to send as/i, "La casella mittente è diversa dall'utente e non c'è il permesso \"Invia come\": usa la stessa casella."],
  ];
  const hint = hints.find(([re]) => re.test(raw))?.[1];
  return hint ? `${hint} (dettaglio: ${raw})` : raw;
}

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
