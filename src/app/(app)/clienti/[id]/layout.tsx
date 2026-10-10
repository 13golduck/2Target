import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireClientAccess } from "@/lib/auth";
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
    if (!["", "seo", "lead"].includes(section)) notFound();
  }

  return (
    <ClientHeader client={{ id: client.id, name: client.name, sector: client.sector }} viewer={viewer}>
      {children}
    </ClientHeader>
  );
}
