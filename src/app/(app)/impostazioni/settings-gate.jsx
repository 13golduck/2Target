'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { requestSettingsCode, verifySettingsCode } from './actions';

// ----------------------------------------------------------------------
// Seconda verifica per entrare in Impostazioni: come un nuovo login, con il codice via email.

export function SettingsGate({ minutes }) {
  const router = useRouter();
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setError(null);
      const r = await requestSettingsCode();
      if (r?.error) setError(r.error);
      else setSentTo(r.email);
    });

  return (
    <DashboardContent>
      <CustomBreadcrumbs heading="Impostazioni" links={[{ name: 'Panoramica' }, { name: 'Impostazioni' }]} sx={{ mb: 3 }} />
      <Card sx={{ maxWidth: 480, mx: 'auto', p: { xs: 3, sm: 5 } }}>
        <Stack spacing={2.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.lighter',
              color: 'primary.darker',
            }}
          >
            <Iconify icon="solar:lock-password-outline" width={32} />
          </Box>
          <Typography variant="h5">Area riservata</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Per entrare nelle Impostazioni conferma che sei tu: ti inviamo un codice via email, come per l&apos;accesso. Lo sblocco vale{' '}
            {minutes} minuti.
          </Typography>
        </Stack>

        {!sentTo ? (
          <Stack spacing={2} sx={{ mt: 4 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Button size="large" variant="contained" color="inherit" loading={pending} onClick={send} fullWidth>
              Inviami il codice
            </Button>
          </Stack>
        ) : (
          <Stack
            component="form"
            spacing={2}
            sx={{ mt: 4 }}
            action={(fd) =>
              start(async () => {
                setError(null);
                const r = await verifySettingsCode(fd);
                if (r?.error) setError(r.error);
                else router.refresh();
              })
            }
          >
            <Alert severity="info">Codice inviato a {sentTo}. Controlla anche lo spam.</Alert>
            <TextField
              name="code"
              label="Codice di 6 cifre"
              autoComplete="one-time-code"
              required
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 7, style: { letterSpacing: 6, fontSize: 22, textAlign: 'center' } } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" size="large" variant="contained" color="inherit" loading={pending} fullWidth>
              Entra nelle Impostazioni
            </Button>
            <Button size="small" disabled={pending} onClick={send}>
              Inviami un nuovo codice
            </Button>
          </Stack>
        )}
      </Card>
    </DashboardContent>
  );
}
