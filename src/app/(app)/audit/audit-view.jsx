'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { fmtDateTime } from 'src/lib/format';
import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------

const CATEGORIES = {
  accesso: { label: 'Accessi', color: 'info', icon: 'solar:login-3-bold' },
  utenti: { label: 'Utenti', color: 'secondary', icon: 'solar:users-group-rounded-bold' },
  impostazioni: { label: 'Impostazioni', color: 'error', icon: 'solar:settings-bold' },
  clienti: { label: 'Clienti e KPI', color: 'primary', icon: 'solar:case-round-bold' },
  checkup: { label: 'Check-up', color: 'warning', icon: 'solar:clipboard-check-bold' },
  contenuti: { label: 'Idee e piano', color: 'success', icon: 'solar:calendar-bold' },
  lead: { label: 'Lead e costi', color: 'info', icon: 'solar:user-plus-bold' },
  canali: { label: 'Canali', color: 'secondary', icon: 'solar:link-round-bold' },
  grafica: { label: 'Studio grafico', color: 'primary', icon: 'solar:pallete-2-bold' },
  sistema: { label: 'Sistema', color: 'default', icon: 'solar:server-bold' },
};

const DAYS = [
  ['1', 'Oggi'],
  ['7', '7 giorni'],
  ['30', '30 giorni'],
  ['90', '90 giorni'],
  ['365', '1 anno'],
];

/** Collegamento all'oggetto toccato, quando ha una pagina. */
function targetHref(r) {
  const [kind, id] = (r.target ?? '').split(':');
  if (kind === 'checkup' && r.clientId) return `/clienti/${r.clientId}/checkup?id=${id}`;
  if (kind === 'pubblicazione') return `/pubblicazioni/${id}`;
  if (kind === 'lead' && r.clientId) return `/clienti/${r.clientId}/lead`;
  if (kind === 'utente') return '/utenti';
  if (r.clientId) return `/clienti/${r.clientId}`;
  return null;
}

export function AuditView({ filters, people, clients, rows }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState(filters.q);

  const go = (patch) => {
    const p = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    router.push(`?${p.toString()}`);
  };

  const select = (label, key, value, options, minWidth = 170) => (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => go({ [key]: e.target.value })}
      slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
      sx={{ minWidth, flex: { xs: '1 1 140px', md: '0 0 auto' } }}
    >
      {options}
    </TextField>
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="Audit trail"
        links={[{ name: 'Panoramica' }, { name: 'Audit trail' }]}
        action={
          <Button
            component="a"
            href={`/audit/export?${params.toString()}`}
            variant="outlined"
            color="inherit"
            startIcon={<Iconify icon="solar:download-bold" />}
          >
            Esporta CSV
          </Button>
        }
        sx={{ mb: 3 }}
      />

      <Card sx={{ p: 2, mb: 3 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Chi ha fatto cosa, su quale cliente, quando e da dove: accessi, utenti, impostazioni, check-up, contenuti, lead, canali e
          studio grafico. Le voci non si possono modificare né cancellare e si conservano 2 anni. Password, codici e chiavi non
          vengono mai registrati.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Cerca nelle descrizioni…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go({ q })}
            onBlur={() => q !== filters.q && go({ q })}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flex: { xs: '1 1 100%', md: '1 1 220px' } }}
          />
          {select('Periodo', 'giorni', String(filters.days), DAYS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>), 130)}
          {select('Categoria', 'categoria', filters.category, [
            <MenuItem key="" value="">Tutte</MenuItem>,
            ...Object.entries(CATEGORIES).map(([k, c]) => <MenuItem key={k} value={k}>{c.label}</MenuItem>),
          ])}
          {select('Utente', 'utente', filters.user, [
            <MenuItem key="" value="">Tutti</MenuItem>,
            <MenuItem key="sistema" value="sistema">Sistema (AI, sito, automatismi)</MenuItem>,
            ...people.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>),
          ])}
          {select('Cliente', 'cliente', filters.client, [
            <MenuItem key="" value="">Tutti</MenuItem>,
            ...clients.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>),
          ])}
        </Stack>
      </Card>

      {!rows.length ? (
        <EmptyContent filled title="Nessuna attività" description="Con questi filtri non c'è nessuna voce nel periodo scelto." sx={{ py: 10 }} />
      ) : (
        <Card>
          {rows.length >= 500 && (
            <Typography variant="caption" sx={{ display: 'block', px: 2, pt: 1.5, color: 'text.secondary' }}>
              Mostro le 500 voci più recenti: restringi i filtri o esporta il CSV per vederle tutte.
            </Typography>
          )}
          {rows.map((r, i) => {
            const cat = CATEGORIES[r.category] ?? CATEGORIES.sistema;
            const href = targetHref(r);
            const failed = /non riuscit|errat/i.test(r.description);
            return (
              <Box key={r.id} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider' }}>
                <Stack
                  direction="row"
                  spacing={1.5}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  sx={{ p: 2, cursor: 'pointer', alignItems: 'flex-start', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Iconify
                    icon={failed ? 'solar:shield-warning-bold' : cat.icon}
                    width={20}
                    sx={{ color: failed ? 'error.main' : 'text.secondary', mt: 0.25, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{r.description}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
                      <Label color={cat.color}>{cat.label}</Label>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtDateTime(new Date(r.createdAt))}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>· {r.actor?.replace(/\s*<.*>$/, '') ?? 'Sistema'}</Typography>
                      {r.clientName && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>· {r.clientName}</Typography>
                      )}
                    </Stack>
                  </Box>
                  <Iconify icon={open === r.id ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'} sx={{ flexShrink: 0 }} />
                </Stack>
                <Collapse in={open === r.id} unmountOnExit>
                  <Box sx={{ px: 2, pb: 2, pl: { xs: 2, sm: 6.5 } }}>
                    <Box
                      component="dl"
                      sx={{
                        m: 0,
                        display: 'grid',
                        gridTemplateColumns: 'max-content 1fr',
                        columnGap: 2,
                        rowGap: 0.5,
                        typography: 'caption',
                        '& dt': { color: 'text.secondary' },
                        '& dd': { m: 0, wordBreak: 'break-all' },
                      }}
                    >
                      <dt>Chi</dt>
                      <dd>{r.actor ?? 'Sistema'}</dd>
                      <dt>Azione</dt>
                      <dd>{r.action}</dd>
                      {r.target && (
                        <>
                          <dt>Oggetto</dt>
                          <dd>
                            {href ? (
                              <Box component={RouterLink} href={href} sx={{ color: 'primary.main' }}>
                                {r.target}
                              </Box>
                            ) : (
                              r.target
                            )}
                          </dd>
                        </>
                      )}
                      <dt>IP</dt>
                      <dd>{r.ip ?? '—'}</dd>
                    </Box>
                    {r.meta && (
                      <Box
                        component="pre"
                        sx={{ m: 0, mt: 1, p: 1.5, borderRadius: 1, bgcolor: 'background.neutral', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, overflow: 'auto' }}
                      >
                        {JSON.stringify(r.meta, null, 2)}
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Card>
      )}
    </DashboardContent>
  );
}
