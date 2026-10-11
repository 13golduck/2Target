'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { fmtDateTime } from 'src/lib/format';
import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------

const AREA_COLOR = { Server: 'error', 'Check-up AI': 'warning', Accesso: 'info' };

export function ErrorsView({ admin, days, user, people, rows }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(null);

  const go = (patch) => {
    const p = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    router.push(`?${p.toString()}`);
  };

  return (
    <DashboardContent>
      <CustomBreadcrumbs heading="Registro errori" links={[{ name: 'Panoramica' }, { name: 'Registro errori' }]} sx={{ mb: 3 }} />

      <Card sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
            {admin
              ? 'Gli errori di tutti gli utenti e del server. Si conservano 90 giorni.'
              : 'Gli errori che hai incontrato tu. Se qualcosa si ripete, segnalalo a un amministratore.'}
          </Typography>
          {admin && (
            <TextField
              select
              size="small"
              label="Utente"
              value={user}
              onChange={(e) => go({ utente: e.target.value })}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">Tutti</MenuItem>
              <MenuItem value="sistema">Server / sistema</MenuItem>
              {people.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <ToggleButtonGroup size="small" exclusive value={String(days)} onChange={(_, v) => v && go({ giorni: v })}>
            <ToggleButton value="7">7 giorni</ToggleButton>
            <ToggleButton value="30">30 giorni</ToggleButton>
            <ToggleButton value="90">90 giorni</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Card>

      {!rows.length ? (
        <EmptyContent filled title="Nessun errore" description="Nel periodo scelto non è stato registrato nessun errore." sx={{ py: 10 }} />
      ) : (
        <Card>
          {rows.map((r, i) => (
            <Box key={r.id} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider' }}>
              <Stack
                direction="row"
                spacing={1.5}
                onClick={() => setOpen(open === r.id ? null : r.id)}
                sx={{ p: 2, cursor: 'pointer', alignItems: 'flex-start', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Iconify icon="solar:danger-triangle-bold" width={20} sx={{ color: 'error.main', mt: 0.25, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{r.message}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5, alignItems: 'center' }}>
                    <Label color={AREA_COLOR[r.area] ?? 'default'}>{r.area}</Label>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtDateTime(new Date(r.createdAt))}</Typography>
                    {admin && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>· {r.userName ?? 'server / sistema'}</Typography>
                    )}
                  </Stack>
                </Box>
                {(r.path || r.detail) && <Iconify icon={open === r.id ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'} sx={{ flexShrink: 0 }} />}
              </Stack>
              <Collapse in={open === r.id}>
                <Box sx={{ px: 2, pb: 2, pl: { xs: 2, sm: 6.5 } }}>
                  {r.path && (
                    <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                      Pagina:{' '}
                      <Box component={RouterLink} href={r.path} sx={{ color: 'primary.main' }}>
                        {r.path}
                      </Box>
                    </Typography>
                  )}
                  {r.detail && (
                    <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: 'background.neutral', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, overflow: 'auto' }}>
                      {r.detail}
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Box>
          ))}
        </Card>
      )}
    </DashboardContent>
  );
}
