'use client';

import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------

const TABS = [
  { href: '', label: 'KPI', icon: 'solar:chart-square-outline' },
  { href: '/checkup', label: 'Check-up', icon: 'solar:notes-bold-duotone' },
  { href: '/idee', label: 'Idee', icon: 'solar:atom-bold-duotone' },
  { href: '/piano', label: 'Piano editoriale', icon: 'solar:calendar-date-bold' },
  { href: '/lead', label: 'Lead', icon: 'solar:users-group-rounded-bold' },
  { href: '/seo', label: 'SEO', icon: 'eva:search-fill' },
  { href: '/brand', label: 'Brand', icon: 'solar:pallete-2-bold' },
  { href: '/canali', label: 'Canali', icon: 'eva:link-2-fill' },
];

// Sezioni visibili al Viewer (cliente): grafici e risultati
const VIEWER_TABS = ['', '/lead', '/seo'];

export function ClientHeader({ client, viewer = false, children }) {
  const pathname = usePathname();
  const tabs = viewer ? TABS.filter((t) => VIEWER_TABS.includes(t.href)) : TABS;
  const base = `/clienti/${client.id}`;
  const current =
    tabs
      .slice()
      .reverse()
      .find((t) => (t.href === '' ? pathname === base : pathname.startsWith(base + t.href)))?.href ?? '';

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading={client.name}
        links={[{ name: 'Clienti', href: '/' }, { name: client.name }]}
        sx={{ mb: 3 }}
      />
      <Card sx={{ mb: 3, px: 2 }}>
        <Tabs value={current} variant="scrollable">
          {tabs.map((t) => (
            <Tab
              key={t.href}
              value={t.href}
              label={t.label}
              icon={<Iconify icon={t.icon} />}
              iconPosition="start"
              component={RouterLink}
              href={base + t.href}
            />
          ))}
        </Tabs>
      </Card>
      {children}
    </DashboardContent>
  );
}
