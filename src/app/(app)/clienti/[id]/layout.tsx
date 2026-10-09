import { notFound } from "next/navigation";

import { getClient } from "@/lib/queries";
import { ClientHeader } from "./client-header";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(Number(id));
  if (!client) notFound();

  return (
    <ClientHeader client={{ id: client.id, name: client.name, sector: client.sector }}>{children}</ClientHeader>
  );
}
