import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, clients } from "@/db/schema";
import { requireClientAccess, visibleClientIds } from "@/lib/auth";
import { getClient } from "@/lib/queries";
import { isViewer } from "@/lib/roles";
import { ClientHeader } from "./client-header";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClientAccess(Number(id));
  const client = await getClient(Number(id));
  if (!client) notFound();

  // Viewer: solo KPI, SEO e Lead (doppio controllo oltre al proxy, con il ruolo letto dal DB)
  const viewer = isViewer(user.role);
  if (viewer) {
    const section = ((await headers()).get("x-pathname") ?? "").split("/")[3] ?? "";
    if (!["", "kpi", "seo", "lead"].includes(section)) notFound();
  }
  // Clienti per il selettore in alto (solo quelli visibili all'utente)
  const ids = await visibleClientIds(user);
  const list = await db.select({ id: clients.id, name: clients.name }).from(clients).where(ids ? inArray(clients.id, ids) : undefined).orderBy(asc(clients.name));
  const [kit] = await db.select({ at: brandKits.updatedAt }).from(brandKits).where(and(eq(brandKits.clientId, client.id), isNotNull(brandKits.logo)));

  return (
    <ClientHeader
      client={{ id: client.id, name: client.name, sector: client.sector, logo: kit ? `/api/logo/${client.id}?tipo=icona&v=${kit.at.getTime()}` : null }}
      clients={list}
      viewer={viewer}
    >
      {children}
    </ClientHeader>
  );
}
