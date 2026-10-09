import "server-only";
import nodemailer from "nodemailer";

// Invio email via SMTP (variabili SMTP_* su Plesk). In sviluppo, senza SMTP, il messaggio
// viene stampato nel terminale del server: così si può accedere anche in locale.

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: nodemailer.Transporter | null = null;
function smtp() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS diretto; 587 = STARTTLS
    // Le password per app di Google si copiano a gruppi di 4 lettere separati da spazi
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "") },
  });
  return transport;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Invio email non configurato (SMTP_HOST, SMTP_USER, SMTP_PASS)");
    console.log(`\n[mail] (sviluppo, nessun SMTP) a ${to}\n${subject}\n${text}\n`);
    return;
  }
  await smtp().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
}
