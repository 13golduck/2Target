"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

async function requireAdmin() {
  const me = await requireUser();
  if (me.role !== "admin") throw new Error("Solo gli amministratori gestiscono gli utenti");
  return me;
}

export async function addUser(f: FormData) {
  await requireAdmin();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const name = String(f.get("name") ?? "").trim();
  const role = f.get("role") === "admin" ? "admin" : "consulente";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email non valida" };
  if (!name) return { error: "Scrivi il nome" };
  await db.insert(users).values({ email, name, role }).onDuplicateKeyUpdate({ set: { name, role, active: true } });
  revalidatePath("/utenti");
  return { ok: true };
}

export async function updateUser(f: FormData) {
  const me = await requireAdmin();
  const id = Number(f.get("id"));
  const role = f.get("role") === "admin" ? "admin" : "consulente";
  const active = f.get("active") === "true";
  if (id === me.id && (!active || role !== "admin")) return { error: "Non puoi togliere a te stesso l'accesso da amministratore" };
  // Resta sempre almeno un amministratore attivo
  if (role !== "admin" || !active) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, id)));
    if (Number(n) === 0) return { error: "Serve almeno un amministratore attivo" };
  }
  await db.update(users).set({ role, active }).where(eq(users.id, id));
  revalidatePath("/utenti");
  return { ok: true };
}
