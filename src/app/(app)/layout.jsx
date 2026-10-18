import { Suspense } from "react";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { brandKits, clients, users } from "@/db/schema";
import { requireUser, visibleClientIds } from "@/lib/auth";
import { isAdminRole, isViewer, ROLE_LABELS } from "@/lib/roles";
import { cleanFlags, isOn } from "@/lib/features";
import { globalFeatures } from "@/lib/features-data";
import { NavIcon } from "src/components/nav-icon";
import { DashboardLayout } from "src/layouts/dashboard";
import { logout } from "../login/actions";
import { ErrorReporter } from "./error-reporter";
import { ConfirmHost } from "src/components/custom-dialog";
import { WelcomeTour } from "./welcome-tour";

/** Logo del cliente al posto dell'icona grigia nel menu. */
function ClientLogo({ id, version, name }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/logo/${id}?tipo=icona&v=${version}`}
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
          .select({ id: clients.id, name: clients.name, logoAt: brandKits.updatedAt, features: clients.features })
          .from(clients)
          .leftJoin(brandKits, and(eq(brandKits.clientId, clients.id), isNotNull(brandKits.logo)))
          .where(ids ? inArray(clients.id, ids) : undefined)
          .orderBy(asc(clients.name));
  const viewer = isViewer(user.role);
  // Funzioni spente: spariscono dal menu (in generale e, per le schede, cliente per cliente)
  const features = await globalFeatures();
  const on = (key, client) => isOn(key, features, client ? cleanFlags(client.features) : null);

  const navData = [
    {
      subheader: "Panoramica",
      items: [
        { title: viewer ? "Clienti" : "Oggi", path: "/", icon: <NavIcon name="ic-dashboard" /> },
        ...(viewer || !on("calendario") ? [] : [{ title: "Calendario", path: "/calendario", icon: <NavIcon name="ic-calendar" /> }]),
        ...(viewer || !on("consumi_ai") ? [] : [{ title: "Consumi AI", path: "/consumi-ai", icon: <NavIcon name="ic-analytics" /> }]),
        ...(viewer || !on("sponsorizzate") ? [] : [{ title: "Sponsorizzate", path: "/sponsorizzate", icon: <NavIcon name="ic-invoice" /> }]),
        ...(isAdminRole(user.role)
          ? [
              { title: "Utenti", path: "/utenti", icon: <NavIcon name="ic-user" /> },
              { title: "Impostazioni", path: "/impostazioni", icon: <NavIcon name="ic-settings" /> },
            ]
          : []),
        // Registro unico: azioni, errori e messaggi di sistema (gli amministratori vedono tutto, gli altri le proprie voci)
        { title: "Registro attività", path: "/audit", icon: <NavIcon name="ic-file" /> },
        // Guida di tutte le funzioni, per tutti
        { title: "Guida", path: "/guida", icon: <NavIcon name="ic-tour" /> },
      ],
    },
    {
      subheader: "Clienti",
      items: list.map((c) => ({
        title: c.name,
        path: `/clienti/${c.id}`,
        icon: c.logoAt ? <ClientLogo id={c.id} version={c.logoAt.getTime()} name={c.name} /> : <NavIcon name="ic-user" />,
        children: (viewer
          ? [
              // Per il cliente parole semplici al posto delle sigle
              { title: "Obiettivi", path: `/clienti/${c.id}/kpi` },
              { title: "Contatti", path: `/clienti/${c.id}/lead`, feature: "lead" },
              { title: "Sito e Google", path: `/clienti/${c.id}/seo`, feature: "seo" },
            ]
          : [
              { title: "Panoramica", path: `/clienti/${c.id}` },
              { title: "Check-up", path: `/clienti/${c.id}/checkup`, feature: "checkup" },
              { title: "Brand", path: `/clienti/${c.id}/brand`, feature: "brand" },
              { title: "Idee", path: `/clienti/${c.id}/idee`, feature: "idee" },
              { title: "Piano editoriale", path: `/clienti/${c.id}/piano` },
              { title: "KPI", path: `/clienti/${c.id}/kpi` },
              { title: "Lead", path: `/clienti/${c.id}/lead`, feature: "lead" },
              { title: "SEO", path: `/clienti/${c.id}/seo`, feature: "seo" },
              { title: "Canali", path: `/clienti/${c.id}/canali` },
            ]
        )
          .filter((x) => !x.feature || on(x.feature, c))
          .map(({ feature: _feature, ...x }) => x),
      })),
    },
  ];

  // Tour di benvenuto alla prima entrata
  const [me] = await db.select({ tourDoneAt: users.tourDoneAt }).from(users).where(eq(users.id, user.id));

  return (
    <DashboardLayout navData={navData} user={{ name: user.name, role: ROLE_LABELS[user.role] ?? user.role }} logoutAction={logout}>
      <ErrorReporter />
      <ConfirmHost />
      <Suspense fallback={null}>
        <WelcomeTour firstTime={!me?.tourDoneAt} viewer={viewer} />
      </Suspense>
      {children}
    </DashboardLayout>
  );
}
