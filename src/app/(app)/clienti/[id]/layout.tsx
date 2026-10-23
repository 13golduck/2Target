import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, clients } from "@/db/schema";
import { requireClientAccess, visibleClientIds } from "@/lib/auth";
import { getClient } from "@/lib/queries";
import { isViewer } from "@/lib/roles";
import { FEATURES, featureOfTab, isOn } from "@/lib/features";
import { clientFeatures, globalFeatures } from "@/lib/features-data";
import { FeatureOff } from "src/components/feature-off";
import { ClientHeader } from "./client-header";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClientAccess(Number(id));
  const client = await getClient(Number(id));
  if (!client) notFound();

  const section = ((await headers()).get("x-pathname") ?? "").split("/")[3] ?? "";
  // Viewer: solo KPI, SEO e Lead (doppio controllo oltre al proxy, con il ruolo letto dal DB)
  const viewer = isViewer(user.role);
  if (viewer && !["", "kpi", "seo", "lead"].includes(section)) notFound();
  // Funzioni spente (in generale o per questo cliente): via dalle schede, e un avviso se si apre il loro indirizzo
  const [global, mine] = await Promise.all([globalFeatures(), clientFeatures(client.id)]);
  const hiddenTabs = FEATURES.filter((f) => f.tab && !isOn(f.key, global, mine)).map((f) => f.tab!);
  const current = featureOfTab(section);
  const off = current && !isOn(current.key, global, mine) ? current : null;
  // Clienti per il selettore in alto (solo quelli visibili all'utente)
  const ids = await visibleClientIds(user);
  const list = await db.select({ id: clients.id, name: clients.name }).from(clients).where(ids ? inArray(clients.id, ids) : undefined).orderBy(asc(clients.name));
  const [kit] = await db.select({ at: brandKits.updatedAt }).from(brandKits).where(and(eq(brandKits.clientId, client.id), isNotNull(brandKits.logo)));

  return (
    <ClientHeader
      client={{ id: client.id, name: client.name, sector: client.sector, logo: kit ? `/api/logo/${client.id}?tipo=icona&v=${kit.at.getTime()}` : null }}
      clients={list}
      viewer={viewer}
      hiddenTabs={hiddenTabs}
    >
      {off ? (
        <FeatureOff
          label={off.label}
          where={global[off.key] === false ? "Impostazioni → Funzioni" : "Panoramica del cliente → Funzioni per questo cliente"}
          href={global[off.key] === false ? "/impostazioni#funzioni" : `/clienti/${client.id}#funzioni`}
        />
      ) : (
        children
      )}
    </ClientHeader>
  );
}
