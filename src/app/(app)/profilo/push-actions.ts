"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { pushToUsers, vapidPublicKey } from "@/lib/push";

// Notifiche sul telefono dell'utente collegato: chiave pubblica, iscrizione del dispositivo, prova, disattivazione.

export async function pushPublicKey() {
  await requireUser();
  return vapidPublicKey();
}

// Forma dell'iscrizione restituita dal browser (PushSubscription.toJSON)
const Subscription = z.object({
  endpoint: z.string().url().max(700).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export async function subscribePush(input: unknown, device: string) {
  const me = await requireUser();
  const p = Subscription.safeParse(input);
  if (!p.success) return { error: "Iscrizione del browser non valida: riprova" };
  const values = { userId: me.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, device: device.slice(0, 120) || null };
  // Lo stesso dispositivo passato a un altro utente (es. computer condiviso) diventa suo
  await db.insert(pushSubscriptions).values(values).onDuplicateKeyUpdate({ set: { userId: me.id, p256dh: values.p256dh, auth: values.auth, device: values.device } });
  await audit({ userId: me.id, category: "utenti", action: "notifiche.attivate", description: `Notifiche attivate su ${values.device ?? "un dispositivo"}` });
  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  const me = await requireUser();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, me.id), eq(pushSubscriptions.endpoint, endpoint.slice(0, 700))));
  return { ok: true };
}

export async function testPush() {
  const me = await requireUser();
  const sent = await pushToUsers([me.id], { title: "2Target", body: "Le notifiche funzionano su questo dispositivo.", url: "/profilo", tag: "prova" });
  return sent ? { ok: true, sent } : { error: "Nessun dispositivo raggiungibile: riattiva le notifiche" };
}
