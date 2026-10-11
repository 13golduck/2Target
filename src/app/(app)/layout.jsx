import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, clients } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { isAdminRole, isViewer, ROLE_LABELS } from "@/lib/roles";
import { NavIcon } from "src/components/nav-icon";
import { DashboardLayout } from "src/layouts/dashboard";
import { logout } from "../login/actions";
import { ErrorReporter } from "./error-reporter";
import { ConfirmHost } from "src/components/custom-dialog";

/** Logo del cliente al posto dell'icona grigia nel menu. */
function ClientLogo({ id, version, name }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/logo/${id}?v=${version}`}
      alt={name}
      width={24}
      height={24}
      style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4, background: "#fff" }}
    />
  );
}

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const ids = await visibleClientIds(user);
  const list =
    ids && !ids.length
      ? []
      : await db
          // Solo la data del logo (non il logo): l'immagine arriva da /api/logo
          .select({ id: clients.id, name: clients.name, logoAt: brandKits.updatedAt })
          .from(clients)
          .leftJoin(brandKits, and(eq(brandKits.clientId, clients.id), isNotNull(brandKits.logo)))
          .where(ids ? inArray(clients.id, ids) : undefined)
          .orderBy(asc(clients.name));
  const viewer = isViewer(user.role);

  const navData = [
    {
      subheader: "Panoramica",
      items: [
        { title: "Clienti", path: "/", icon: <NavIcon name="ic-dashboard" /> },
        ...(viewer ? [] : [{ title: "Consumi AI", path: "/consumi-ai", icon: <NavIcon name="ic-analytics" /> }]),
        ...(isAdminRole(user.role)
          ? [
              { title: "Utenti", path: "/utenti", icon: <NavIcon name="ic-user" /> },
              { title: "Impostazioni", path: "/impostazioni", icon: <NavIcon name="ic-settings" /> },
            ]
          : []),
        // Registro unico: azioni, errori e messaggi di sistema (gli amministratori vedono tutto, gli altri le proprie voci)
        { title: "Audit trail", path: "/audit", icon: <NavIcon name="ic-file" /> },
      ],
    },
    {
      subheader: "Clienti",
      items: list.map((c) => ({
        title: c.name,
        path: `/clienti/${c.id}`,
        icon: c.logoAt ? <ClientLogo id={c.id} version={c.logoAt.getTime()} name={c.name} /> : <NavIcon name="ic-user" />,
        children: viewer
          ? [
              { title: "KPI", path: `/clienti/${c.id}` },
              { title: "Lead", path: `/clienti/${c.id}/lead` },
              { title: "SEO", path: `/clienti/${c.id}/seo` },
            ]
          : [
              { title: "KPI", path: `/clienti/${c.id}` },
              { title: "Check-up", path: `/clienti/${c.id}/checkup` },
              { title: "Idee", path: `/clienti/${c.id}/idee` },
              { title: "Piano editoriale", path: `/clienti/${c.id}/piano` },
              { title: "Lead", path: `/clienti/${c.id}/lead` },
              { title: "SEO", path: `/clienti/${c.id}/seo` },
              { title: "Brand", path: `/clienti/${c.id}/brand` },
              { title: "Canali", path: `/clienti/${c.id}/canali` },
            ],
      })),
    },
  ];

  return (
    <DashboardLayout navData={navData} user={{ name: user.name, role: ROLE_LABELS[user.role] ?? user.role }} logoutAction={logout}>
      <ErrorReporter />
      <ConfirmHost />
      {children}
    </DashboardLayout>
  );
}
