import "server-only";
import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { loginCodes, users } from "@/db/schema";
import { sendMail } from "./mail";

// Accesso senza password: codice di 6 cifre via email, monouso, valido 10 minuti,
// massimo 5 tentativi sbagliati, massimo 5 codici richiesti ogni 15 minuti per utente.

export const CODE_TTL_MIN = 10;
export const MAX_ATTEMPTS = 5;
const MAX_REQUESTS = 5;
const REQUEST_WINDOW_MIN = 15;

function hashCode(code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET non impostato");
  const key = Buffer.from(hkdfSync("sha256", secret, "2target", "login-code", 32));
  return createHmac("sha256", key).update(code).digest("hex");
}

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const normalizeCode = (c: string) => c.replace(/\D/g, "");

/** Confronto a tempo costante tra il codice inserito e l'impronta salvata. */
export function codeMatches(input: string, storedHash: string) {
  const a = Buffer.from(hashCode(normalizeCode(input)), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Invia un codice se l'utente esiste ed è attivo. Non rivela mai se l'email è registrata. */
export async function requestLoginCode(emailRaw: string, ip: string | null) {
  const email = emailRaw.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.active) return;

  const since = new Date(Date.now() - REQUEST_WINDOW_MIN * 60_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginCodes)
    .where(and(eq(loginCodes.userId, user.id), gte(loginCodes.createdAt, since)));
  if (Number(n) >= MAX_REQUESTS) return;

  const code = newCode();
  // Un solo codice valido alla volta: i precedenti non usati vengono annullati
  await db.update(loginCodes).set({ usedAt: new Date() }).where(and(eq(loginCodes.userId, user.id), isNull(loginCodes.usedAt)));
  await db.insert(loginCodes).values({
    userId: user.id,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    requestIp: ip?.slice(0, 64) ?? null,
  });

  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  await sendMail(
    user.email,
    `Codice di accesso a 2Target: ${pretty}`,
    `Ciao ${user.name},\n\nil tuo codice per entrare in 2Target è: ${pretty}\n\nVale ${CODE_TTL_MIN} minuti e una sola volta. Se non hai chiesto tu l'accesso, ignora questa email.\n\n2Target · powered by Golduck`,
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
      <div style="display:inline-block;background:#CDA434;color:#1C1C1C;font-weight:800;border-radius:12px;padding:10px 14px;font-size:20px">2T</div>
      <p style="font-size:16px">Ciao ${user.name.replace(/[<>&]/g, "")},</p>
      <p style="font-size:16px">il tuo codice per entrare in <b>2Target</b> è:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:6px;margin:16px 0">${pretty}</p>
      <p style="color:#637381">Vale ${CODE_TTL_MIN} minuti e una sola volta. Se non hai chiesto tu l'accesso, ignora questa email.</p>
      <p style="color:#919EAB;font-size:12px">2Target · powered by Golduck</p>
    </div>`,
  );
}

/** Verifica il codice: se valido lo consuma e restituisce l'utente. */
export async function consumeLoginCode(emailRaw: string, codeRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const code = normalizeCode(codeRaw);
  if (code.length !== 6) return null;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.active) return null;

  const [row] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.userId, user.id), isNull(loginCodes.usedAt)))
    .orderBy(desc(loginCodes.id))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now() || row.attempts >= MAX_ATTEMPTS) return null;

  if (!codeMatches(code, row.codeHash)) {
    await db.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id));
    return null;
  }
  // Consumo atomico: vale una sola volta anche con due richieste contemporanee
  const [res] = await db.update(loginCodes).set({ usedAt: new Date() }).where(and(eq(loginCodes.id, row.id), isNull(loginCodes.usedAt)));
  return res.affectedRows === 1 ? user : null;
}
