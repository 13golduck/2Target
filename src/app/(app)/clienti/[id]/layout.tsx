import Link from "next/link";
import { notFound } from "next/navigation";

import { getClient } from "@/lib/queries";
import { Tabs } from "./tabs";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(Number(id));
  if (!client) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">← Clienti</Link>
        <h1 className="mt-1 text-2xl font-bold">{client.name}</h1>
        <p className="text-sm text-muted">{client.sector}</p>
      </div>
      <Tabs base={`/clienti/${client.id}`} />
      {children}
    </div>
  );
}
