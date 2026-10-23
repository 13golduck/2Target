import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, connections, editorialPlans, publications, pushSubscriptions, users } from "@/db/schema";
import { isConfigured } from "@/lib/integrations/config";
import { getMailTest, isMailConfigured } from "@/lib/mail";

// «Primi passi»: cosa resta da preparare perché 2Target lavori da sola. Compare nella Home finché
// non è tutto fatto; ogni passo porta dove si fa e alla pagina della Guida che lo spiega.

export type StartStep = { key: string; label: string; done: boolean; href: string; guide: string };

const count = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

export async function gettingStarted(user: { id: number; role: string }, clientIds: number[] | null): Promise<StartStep[]> {
  const admin = user.role === "superadmin" || user.role === "admin";
  const scope = <T>(col: T) => (clientIds ? inArray(col as never, clientIds.length ? clientIds : [-1]) : undefined);
  const [firstClient] = await db.select({ id: clients.id }).from(clients).where(scope(clients.id)).orderBy(clients.id).limit(1);
  const [conns, plans, pubs, devices, team] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(connections).where(and(eq(connections.status, "attivo"), scope(connections.clientId))),
    db.select({ n: sql<number>`count(*)` }).from(editorialPlans).where(scope(editorialPlans.clientId)),
    db.select({ n: sql<number>`count(*)` }).from(publications).where(scope(publications.clientId)),
    db.select({ n: sql<number>`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
    db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.active, true)),
  ]);
  const clientPath = (tab: string) => (firstClient ? `/clienti/${firstClient.id}/${tab}` : "/");
  const mailOk = (await isMailConfigured()) && (await getMailTest())?.ok === true;

  const steps: (StartStep & { adminOnly?: boolean })[] = [
    { key: "email", label: "Configura l'invio delle email (e manda la prova)", done: mailOk, href: "/impostazioni", guide: "impostazioni", adminOnly: true },
    { key: "meta", label: "Inserisci le chiavi di Meta per Instagram e Facebook", done: isConfigured("meta"), href: "/impostazioni#integrazioni", guide: "integrazioni", adminOnly: true },
    { key: "cliente", label: "Aggiungi il primo cliente", done: !!firstClient, href: "/", guide: "clienti" },
    { key: "canali", label: "Collega i social di un cliente", done: count(conns) > 0, href: clientPath("canali"), guide: "canali" },
    { key: "piano", label: "Prepara un piano editoriale", done: count(plans) > 0, href: clientPath("piano"), guide: "piano-editoriale" },
    { key: "post", label: "Programma il primo post", done: count(pubs) > 0, href: clientPath("piano"), guide: "pubblicare" },
    { key: "notifiche", label: "Attiva le notifiche sul telefono", done: count(devices) > 0, href: "/profilo", guide: "notifiche" },
    { key: "team", label: "Invita i colleghi", done: count(team) > 1, href: "/utenti", guide: "utenti-e-ruoli", adminOnly: true },
  ];
  return steps.filter((st) => admin || !st.adminOnly).map(({ adminOnly: _a, ...st }) => st);
}
