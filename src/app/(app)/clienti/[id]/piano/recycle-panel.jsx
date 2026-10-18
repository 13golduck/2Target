'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

import { useRouter } from 'src/routes/hooks';
import { fmtDate } from 'src/lib/format';
import { RouterLink } from 'src/routes/components';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { recycleItem } from '../../../recycle-actions';

// ----------------------------------------------------------------------
// Contenuti da riproporre: usciti da almeno 3 mesi, «sempre validi» o tra i più seguiti del cliente.
// «Riproponi» crea una copia in bozza in questo piano (senza data): passa dall'approvazione come le altre.

export function RecyclePanel({ planId, suggestions }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(null);
  const [, start] = useTransition();

  const recycle = (s) => {
    setBusy(s.itemId);
    start(async () => {
      const r = await recycleItem({ itemId: s.itemId, planId });
      setBusy(null);
      if (r.error) toast.error(r.error);
      else {
        toast.success('Copia creata in bozza: la trovi in «Elenco» tra le schede da programmare');
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Iconify icon="solar:refresh-circle-bold" sx={{ color: 'success.main' }} />
            <span>Da riproporre</span>
            <Label>{suggestions.length}</Label>
          </Stack>
        }
        subheader="Contenuti usciti da almeno 3 mesi che hanno funzionato o che sono sempre validi"
        action={
          <IconButton onClick={() => setOpen(!open)}>
            <Iconify icon={open ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'} />
          </IconButton>
        }
        sx={{ pb: open ? 1 : 2 }}
      />
      <Collapse in={open}>
        <Stack spacing={1} sx={{ px: 3, pb: 2.5 }}>
          {suggestions.map((s) => (
            <Stack key={s.itemId} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap component={RouterLink} href={`/pubblicazioni/${s.itemId}`} sx={{ color: 'text.primary', display: 'block' }}>
                  {s.title}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {s.format} · uscito il {fmtDate(s.publishedAt)}
                </Typography>
              </Box>
              <Label color={s.reason === 'sempre valido' ? 'info' : 'success'} variant="soft">{s.reason}</Label>
              <Button size="small" variant="outlined" loading={busy === s.itemId} disabled={busy != null} onClick={() => recycle(s)}>
                Riproponi
              </Button>
            </Stack>
          ))}
        </Stack>
      </Collapse>
    </Card>
  );
}
