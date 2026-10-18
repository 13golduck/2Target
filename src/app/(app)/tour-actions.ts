"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

/** Tour di benvenuto concluso o saltato: non si ripropone all'accesso (si rivede dalla Guida). */
export async function markTourDone() {
  const me = await requireUser();
  await db.update(users).set({ tourDoneAt: new Date() }).where(eq(users.id, me.id));
  return { ok: true };
}
