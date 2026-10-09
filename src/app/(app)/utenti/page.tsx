import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { UsersView } from "./users-view";

export const metadata = { title: "Utenti" };

export default async function UsersPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/");
  const list = await db.select().from(users).orderBy(asc(users.name));
  return (
    <UsersView
      meId={me.id}
      users={list.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
    />
  );
}
