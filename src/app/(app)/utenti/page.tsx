import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { clients, userClients, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ASSIGNABLE_ROLES, isAdminRole, ROLE_HINTS, ROLE_LABELS } from "@/lib/roles";
import { UsersView } from "./users-view";

export const metadata = { title: "Utenti" };

export default async function UsersPage() {
  const me = await requireUser();
  if (!isAdminRole(me.role)) redirect("/");
  const [list, links, clientList] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(userClients),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
  ]);
  return (
    <UsersView
      meId={me.id}
      roles={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], hint: ROLE_HINTS[r] }))}
      roleLabels={ROLE_LABELS}
      clients={clientList}
      users={list.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        totp: !!u.totpEnabledAt,
        canPublish: u.canPublish,
        clientIds: links.filter((l) => l.userId === u.id).map((l) => l.clientId),
      }))}
    />
  );
}
