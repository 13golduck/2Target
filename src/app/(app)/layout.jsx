import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { isAdminRole, isViewer, ROLE_LABELS } from "@/lib/roles";
import { NavIcon } from "src/components/nav-icon";
import { DashboardLayout } from "src/layouts/dashboard";
import { logout } from "../login/actions";
import { ErrorReporter } from "./error-reporter";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const ids = await visibleClientIds(user);
  const list =
    ids && !ids.length
      ? []
      : await db
          .select({ id: clients.id, name: clients.name })
          .from(clients)
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
        { title: "Registro errori", path: "/errori", icon: <NavIcon name="ic-disabled" /> },
      ],
    },
    {
      subheader: "Clienti",
      items: list.map((c) => ({
        title: c.name,
        path: `/clienti/${c.id}`,
        icon: <NavIcon name="ic-user" />,
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
      {children}
    </DashboardLayout>
  );
}
