'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { saveMail, testMail } from './actions';

// ----------------------------------------------------------------------

export function SettingsView({ mail, firstAccess }) {
  const [provider, setProvider] = useState(mail.provider);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [result, setResult] = useState(null);

  const secretHelp = (has) => (has ? 'Già salvata: lascia vuoto per non cambiarla' : 'Si salva cifrata e non viene più mostrata');

  return (
    <DashboardContent>
      <CustomBreadcrumbs heading="Impostazioni" links={[{ name: 'Panoramica' }, { name: 'Impostazioni' }]} sx={{ mb: 3 }} />

      {firstAccess && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Primo accesso senza codice. Configura l&apos;invio delle email, salva e premi <b>Invia email di prova</b>: dal prossimo accesso
          servirà il codice ricevuto via email.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Invio email"
          subheader="Serve per i codici di accesso. Le password e i segreti si salvano cifrati."
          action={mail.configured ? <Label color="success">Configurato</Label> : mail.fromEnv ? <Label color="info">Da variabili Plesk</Label> : <Label color="error">Da configurare</Label>}
        />
        <Box
          component="form"
          action={(fd) =>
            start(async () => {
              const r = await saveMail(fd);
              if (r?.error) toast.error(r.error);
              else toast.success('Impostazioni salvate: ora invia una prova');
            })
          }
          sx={{ p: 3 }}
        >
          <Stack spacing={2.5} sx={{ maxWidth: 640 }}>
            <TextField select name="provider" label="Servizio" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <MenuItem value="microsoft">Microsoft 365 (consigliato)</MenuItem>
              <MenuItem value="smtp">Server SMTP (Google Workspace, Aruba, altro)</MenuItem>
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="from" label="Casella mittente" placeholder="noreply@golduck.it" defaultValue={mail.from} fullWidth required={provider === 'microsoft'} />
              <TextField name="fromName" label="Nome visualizzato" defaultValue={mail.fromName} fullWidth />
            </Stack>

            {provider === 'microsoft' ? (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Da <Link href="https://entra.microsoft.com" target="_blank" rel="noopener">Microsoft Entra</Link> → Registrazioni app:
                  ID tenant (directory), ID applicazione (client) e un segreto client. L&apos;app deve avere il permesso{' '}
                  <b>Mail.Send</b> (applicazione) con consenso dell&apos;amministratore. La casella mittente deve esistere in Microsoft 365.
                </Typography>
                <TextField name="tenantId" label="ID tenant (directory)" defaultValue={mail.tenantId} fullWidth required />
                <TextField name="clientId" label="ID applicazione (client)" defaultValue={mail.clientId} fullWidth required />
                <TextField
                  name="clientSecret"
                  type="password"
                  label="Valore del segreto client"
                  autoComplete="new-password"
                  helperText={secretHelp(mail.hasClientSecret)}
                  required={!mail.hasClientSecret}
                  fullWidth
                />
              </>
            ) : (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField name="host" label="Server SMTP" placeholder="smtp.gmail.com" defaultValue={mail.host} fullWidth required />
                  <TextField name="port" label="Porta" type="number" defaultValue={mail.port} sx={{ width: { sm: 160 } }} helperText="587 o 465" />
                </Stack>
                <TextField name="user" label="Utente (casella)" defaultValue={mail.user} fullWidth required />
                <TextField
                  name="pass"
                  type="password"
                  label="Password (per Google: password per app)"
                  autoComplete="new-password"
                  helperText={secretHelp(mail.hasPass)}
                  required={!mail.hasPass}
                  fullWidth
                />
              </>
            )}

            <Stack direction="row" spacing={1.5}>
              <Button type="submit" variant="contained" loading={pending}>
                Salva
              </Button>
              <Button
                variant="outlined"
                loading={testing}
                onClick={() =>
                  startTest(async () => {
                    const r = await testMail();
                    setResult(r);
                    if (r?.error) toast.error('Invio non riuscito');
                    else toast.success(`Email di prova inviata a ${r.to}`);
                  })
                }
              >
                Invia email di prova
              </Button>
            </Stack>

            {result && (
              <Alert severity={result.error ? 'error' : 'success'}>
                {result.error ?? `Inviata a ${result.to}: controlla la posta (anche lo spam).`}
              </Alert>
            )}
          </Stack>
        </Box>
        <Divider />
        <Typography variant="caption" sx={{ display: 'block', p: 3, color: 'text.secondary' }}>
          Il primo accesso senza codice si chiude da solo dopo il primo ingresso. Da quel momento tutti entrano con il codice via email.
        </Typography>
      </Card>
    </DashboardContent>
  );
}
