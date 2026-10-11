"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userClients, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ASSIGNABLE_ROLES, isAdminRole, type Role } from "@/lib/roles";

async function requireAdmin() {
  const me = await requireUser();
  if (!isAdminRole(me.role)) throw new Error("Solo gli amministratori gestiscono gli utenti");
  return me;
}

const pickRole = (v: FormDataEntryValue | null): Role => ASSIGNABLE_ROLES.find((r) => r === v) ?? "user";
const clientIdsFrom = (f: FormData) =>
  [...new Set(f.getAll("clientIds").map(Number).filter((n) => Number.isInteger(n) && n > 0))];

async function setClients(userId: number, role: Role, clientIds: number[]) {
  await db.delete(userClients).where(eq(userClients.userId, userId));
  if (role === "viewer" && clientIds.length) {
    await db.insert(userClients).values(clientIds.map((clientId) => ({ userId, clientId })));
  }
}

export async function addUser(f: FormData) {
  await requireAdmin();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const name = String(f.get("name") ?? "").trim();
  const role = pickRole(f.get("role"));
  const clientIds = clientIdsFrom(f);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email non valida" };
  if (!name) return { error: "Scrivi il nome" };
  if (role === "viewer" && !clientIds.length) return { error: "Scegli almeno un cliente da mostrare al Viewer" };

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing?.role === "superadmin") return { error: "Questo utente è il Super admin e non può essere modificato" };
  if (existing) await db.update(users).set({ name, role, active: true }).where(eq(users.id, existing.id));
  else await db.insert(users).values({ email, name, role });
  const [saved] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  await setClients(saved.id, role, clientIds);
  revalidatePath("/utenti");
  return { ok: true };
}

export async function updateUser(f: FormData) {
  const me = await requireAdmin();
  const id = Number(f.get("id"));
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return { error: "Utente non trovato" };
  // Il Super admin non si tocca: né ruolo, né stato, né clienti
  if (target.role === "superadmin") return { error: "Il Super admin non può essere modificato né disattivato" };

  const role = pickRole(f.get("role"));
  const active = f.get("active") === "true";
  const clientIds = clientIdsFrom(f);
  if (id === me.id && (!active || !isAdminRole(role))) return { error: "Non puoi togliere a te stesso l'accesso da amministratore" };
  if (role === "viewer" && !clientIds.length) return { error: "Scegli almeno un cliente da mostrare al Viewer" };

  await db.update(users).set({ role, active }).where(eq(users.id, id));
  await setClients(id, role, clientIds);
  revalidatePath("/utenti");
  return { ok: true };
}

/** Azzera il doppio fattore di un utente (telefono perso). Il Super admin può farlo solo per sé dal suo profilo. */
export async function resetUserTotp(id: number) {
  const me = await requireAdmin();
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return { error: "Utente non trovato" };
  if (target.role === "superadmin" && target.id !== me.id) return { error: "Il Super admin non può essere modificato" };
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpRecovery: null }).where(eq(users.id, id));
  revalidatePath("/utenti");
  return { ok: true };
}
