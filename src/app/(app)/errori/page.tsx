import { and, desc, eq, gte, isNull, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { errorLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { nowDate } from "@/lib/format";
import { ErrorsView } from "./errors-view";

export const metadata = { title: "Registro errori" };

// Registro errori: ogni utente vede i propri; Super admin e Administrator vedono quelli di tutti (anche del server).
export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ utente?: string; giorni?: string }> }) {
  const me = await requireUser();
  const admin = isAdminRole(me.role);
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.giorni)) ? Number(sp.giorni) : 30;

  const where: SQL[] = [gte(errorLogs.createdAt, new Date(nowDate().getTime() - days * 86_400_000))];
  if (!admin) where.push(eq(errorLogs.userId, me.id));
  else if (sp.utente === "sistema") where.push(isNull(errorLogs.userId));
  else if (sp.utente) where.push(eq(errorLogs.userId, Number(sp.utente)));

  const rows = await db
    .select({
      id: errorLogs.id,
      area: errorLogs.area,
      message: errorLogs.message,
      detail: errorLogs.detail,
      path: errorLogs.path,
      createdAt: errorLogs.createdAt,
      userId: errorLogs.userId,
      userName: users.name,
    })
    .from(errorLogs)
    .leftJoin(users, eq(users.id, errorLogs.userId))
    .where(and(...where))
    .orderBy(desc(errorLogs.id))
    .limit(300);

  const people = admin ? await db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name) : [];

  return (
    <ErrorsView
      admin={admin}
      days={days}
      user={sp.utente ?? ""}
      people={people}
      rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), detail: admin ? r.detail : null }))}
    />
  );
}
