import { asc } from "drizzle-orm";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavIcon } from "src/components/nav-icon";
import { DashboardLayout } from "src/layouts/dashboard";
import { logout } from "../login/actions";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const list = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name));

  const navData = [
    {
      subheader: "Panoramica",
      items: [{ title: "Clienti", path: "/", icon: <NavIcon name="ic-dashboard" /> }],
    },
    {
      subheader: "Clienti",
      items: list.map((c) => ({
        title: c.name,
        path: `/clienti/${c.id}`,
        icon: <NavIcon name="ic-user" />,
        children: [
          { title: "KPI", path: `/clienti/${c.id}` },
          { title: "Check-up", path: `/clienti/${c.id}/checkup` },
          { title: "Idee", path: `/clienti/${c.id}/idee` },
          { title: "Piano editoriale", path: `/clienti/${c.id}/piano` },
        ],
      })),
    },
  ];

  return (
    <DashboardLayout navData={navData} user={{ name: user.name, role: user.role }} logoutAction={logout}>
      {children}
    </DashboardLayout>
  );
}
