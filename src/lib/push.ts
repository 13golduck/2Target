import "server-only";

import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import { appSettings, pushSubscriptions, users } from "@/db/schema";
import { appUrl } from "@/lib/integrations/config";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

// Notifiche sul telefono (Web Push, anche su iPhone con l'app aggiunta alla schermata Home).
// Le chiavi VAPID si creano da sole al primo uso e restano nel database (la privata cifrata):
// niente da configurare su Plesk. Le notifiche si aggiungono alle email, non le sostituiscono.

const KEYS = "vapid_keys";

type StoredKeys = { publicKey: string; privateKeyEnc: string };
export type PushMessage = { title: string; body: string; /** Pagina di 2Target da aprire al tocco (percorso, es. /clienti/3/lead). */ url?: string; tag?: string };

let cached: { publicKey: string; privateKey: string } | null = null;

async function vapidKeys() {
  if (cached) return cached;
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEYS));
  const stored = row?.value as StoredKeys | undefined;
  const privateKey = stored ? decryptSecret(stored.privateKeyEnc) : null;
  if (stored && privateKey) return (cached = { publicKey: stored.publicKey, privateKey });
  const fresh = webpush.generateVAPIDKeys();
  // Se due processi le creano insieme vince la prima scritta: si rilegge invece di sovrascrivere
  await db.insert(appSettings).values({ key: KEYS, value: { publicKey: fresh.publicKey, privateKeyEnc: encryptSecret(fresh.privateKey) } }).onDuplicateKeyUpdate({ set: { key: KEYS } });
  cached = null;
  const [again] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEYS));
  const final = again.value as StoredKeys;
  return (cached = { publicKey: final.publicKey, privateKey: decryptSecret(final.privateKeyEnc)! });
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

/** Il percorso da aprire resta dentro 2Target: mai un indirizzo esterno in una notifica. */
export function safePath(url: string | undefined) {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

/** Invia a tutti i dispositivi degli utenti indicati. Gli abbonamenti scaduti (410/404) si cancellano. */
export async function pushToUsers(userIds: number[], msg: PushMessage) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids));
  if (!subs.length) return 0;
  const keys = await vapidKeys();
  const payload = JSON.stringify({ title: msg.title.slice(0, 120), body: msg.body.slice(0, 300), url: safePath(msg.url), tag: msg.tag });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        vapidDetails: { subject: appUrl(), publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 24 * 3600,
        timeout: 10_000,
      });
      await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(eq(pushSubscriptions.id, s.id));
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // Il browser ha revocato l'iscrizione (app disinstallata, permesso tolto): non serve più
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else console.error("[push] invio non riuscito:", status ?? (e as Error).message);
    }
  }
  return sent;
}

/** Come pushToUsers, partendo dagli indirizzi email (i destinatari delle email di avviso). */
export async function pushToEmails(emails: string[], msg: PushMessage) {
  if (!emails.length) return 0;
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.email, emails));
  return pushToUsers(
    rows.map((r) => r.id),
    msg,
  );
}
