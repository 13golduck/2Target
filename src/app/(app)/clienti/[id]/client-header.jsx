'use client';

import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Avatar from '@mui/material/Avatar';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useRouter, usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------
// Schede del cliente in ordine di lavoro: Panoramica · Strategia · Contenuti · Risultati · Canali.
// Il selettore in alto cambia cliente restando nella stessa sezione (come il selettore dei marchi di Metricool).

const GROUPS = [
  { tabs: [{ href: '', label: 'Panoramica', icon: 'solar:home-angle-bold-duotone' }] },
  {
    label: 'Strategia',
    tabs: [
      { href: '/checkup', label: 'Check-up', icon: 'solar:notes-bold-duotone' },
      { href: '/brand', label: 'Brand', icon: 'solar:palette-bold' },
      { href: '/concorrenti', label: 'Concorrenti', icon: 'solar:cup-star-bold' },
    ],
  },
  {
    label: 'Contenuti',
    tabs: [
      { href: '/idee', label: 'Idee', icon: 'solar:atom-bold-duotone' },
      { href: '/piano', label: 'Piano editoriale', icon: 'solar:calendar-date-bold' },
    ],
  },
  {
    label: 'Risultati',
    tabs: [
      { href: '/kpi', label: 'KPI', icon: 'solar:chart-square-outline' },
      { href: '/lead', label: 'Lead', icon: 'solar:users-group-rounded-bold' },
      { href: '/seo', label: 'SEO', icon: 'eva:search-fill' },
    ],
  },
  {
    tabs: [
      { href: '/canali', label: 'Canali', icon: 'eva:link-2-fill' },
      { href: '/profili', label: 'Profili', icon: 'solar:user-id-bold' },
    ],
  },
];

// Sezioni visibili al Viewer (cliente): grafici e risultati
const VIEWER_TABS = ['/kpi', '/lead', '/seo'];

export function ClientHeader({ client, clients, viewer = false, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/clienti/${client.id}`;
  const all = GROUPS.flatMap((g) => g.tabs);
  const visible = viewer ? all.filter((t) => VIEWER_TABS.includes(t.href)) : all;
  const current =
    visible
      .slice()
      .reverse()
      .find((t) => (t.href === '' ? pathname === base : pathname.startsWith(base + t.href)))?.href ?? false;
  const section = current === false ? '' : current;

  // Separatori tra i gruppi (non selezionabili)
  const items = [];
  GROUPS.forEach((g, n) => {
    const tabs = g.tabs.filter((t) => visible.includes(t));
    if (!tabs.length) return;
    if (items.length) {
      items.push(
        <Tab
          key={`sep${n}`}
          disabled
          value={`sep${n}`}
          label={g.label ? <Typography variant="overline" sx={{ color: 'text.disabled', fontSize: 10 }}>{g.label}</Typography> : ''}
          sx={{ minWidth: 0, px: 1, ml: 1, borderLeft: 1, borderColor: 'divider', opacity: '1 !important' }}
        />,
      );
    }
    tabs.forEach((t) =>
      items.push(<Tab key={t.href} value={t.href} label={t.label} icon={<Iconify icon={t.icon} />} iconPosition="start" component={RouterLink} href={base + t.href} />),
    );
  });

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {client.logo && <Avatar src={client.logo} variant="rounded" sx={{ width: 40, height: 40, bgcolor: '#fff', '& img': { objectFit: 'contain' } }} />}
            {client.name}
          </span>
        }
        links={[{ name: viewer ? 'Clienti' : 'Oggi', href: '/' }, { name: client.name }]}
        action={
          clients?.length > 1 && (
            <TextField
              select
              size="small"
              label="Cliente"
              value={client.id}
              onChange={(e) => router.push(`/clienti/${e.target.value}${viewer && section === '' ? '/kpi' : section}`)}
              sx={{ minWidth: 220 }}
              slotProps={{ input: { startAdornment: <Iconify icon="solar:users-group-rounded-bold" width={18} sx={{ mr: 1, color: 'text.secondary' }} /> } }}
            >
              {clients.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          )
        }
        sx={{ mb: 3 }}
      />
      <Card sx={{ mb: 3, px: 2 }}>
        <Tabs value={current} variant="scrollable" scrollButtons="auto">
          {items}
        </Tabs>
      </Card>
      {children}
    </DashboardContent>
  );
}
