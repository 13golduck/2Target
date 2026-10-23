import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings, clients } from "@/db/schema";
import { cleanFlags, isOn, type FeatureFlags, type FeatureKey } from "./features";

// Lettura e salvataggio degli interruttori delle funzioni (vedi ./features per le regole).

const KEY = "features";

export async function globalFeatures(): Promise<FeatureFlags> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  return cleanFlags(row?.value);
}

export async function saveGlobalFeatures(flags: FeatureFlags, userId: number) {
  const value = cleanFlags(flags);
  await db.insert(appSettings).values({ key: KEY, value, updatedBy: userId }).onDuplicateKeyUpdate({ set: { value, updatedBy: userId } });
  return value;
}

export async function clientFeatures(clientId: number): Promise<FeatureFlags> {
  const [row] = await db.select({ features: clients.features }).from(clients).where(eq(clients.id, clientId));
  return cleanFlags(row?.features);
}

/** La funzione è accesa per questo cliente (o in generale, senza cliente)? */
export async function featureOn(key: FeatureKey, clientId?: number) {
  return isOn(key, await globalFeatures(), clientId ? await clientFeatures(clientId) : null);
}
