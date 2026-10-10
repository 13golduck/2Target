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

import { fmtDateTime } from 'src/lib/format';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { AiLimitsCard } from './ai-limits-card';
import { saveMail, testMail, lockSettings } from './actions';

// ----------------------------------------------------------------------

// Preimpostazioni dei servizi di posta più usati: server e porta si compilano da soli.
const PRESETS = {
  microsoft: { label: 'Microsoft 365 – app Entra (consigliato)' },
  'microsoft-smtp': { label: 'Microsoft 365 – SMTP con password', host: 'smtp.office365.com', port: 587 },
  google: { label: 'Google Workspace / Gmail – SMTP con password per app', host: 'smtp.gmail.com', port: 587 },
  smtp: { label: 'Altro server SMTP (Aruba, Register, ...)' },
};

const HELP = {
  'microsoft-smtp': (
    <>
      Utente e password della casella Microsoft 365. Nell&apos;interfaccia di amministrazione di Microsoft 365 la casella deve avere{' '}
      <b>SMTP autenticato</b> attivo (Utenti attivi → casella → Posta → Gestisci app di posta elettronica). Con l&apos;autenticazione a più
      fattori serve una password per app. Microsoft disattiva questo metodo per impostazione predefinita da fine 2026: per durare nel
      tempo usa l&apos;app Entra.
    </>
  ),
  google: (
    <>
      Utente: l&apos;indirizzo completo della casella. Password: una <b>password per app</b> di 16 lettere, non quella normale. Accedi come
      quella casella → <Link href="https://myaccount.google.com/security" target="_blank" rel="noopener">Sicurezza</Link> → attiva la
      Verifica in due passaggi → <Link href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Password per le app</Link>{' '}
      → nome «2Target» → Crea. Se non è disponibile, l&apos;amministratore di Google Workspace deve consentire la verifica in due passaggi.
    </>
  ),
  smtp: <>Server, porta, utente e password li trovi nelle istruzioni del tuo provider di posta (porta 587 con STARTTLS oppure 465 con TLS).</>,
};

export function SettingsView({ mail, lastTest, limits, firstAccess }) {
  const [preset, setPreset] = useState(mail.preset ?? (mail.provider === 'smtp' ? 'smtp' : 'microsoft'));
  const [host, setHost] = useState(mail.host);
  const [port, setPort] = useState(mail.port);
  const provider = preset === 'microsoft' ? 'microsoft' : 'smtp';

  const choose = (value) => {
    setPreset(value);
    if (PRESETS[value].host) {
      setHost(PRESETS[value].host);
      setPort(PRESETS[value].port);
    }
  };
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [result, setResult] = useState(null);
  const [savedNow, setSavedNow] = useState(null);

  const when = (iso) => fmtDateTime(new Date(iso));
  // La prova conta solo se è successiva all'ultimo salvataggio
  const testValid = lastTest && (!mail.savedAt || new Date(lastTest.at) >= new Date(mail.savedAt));
  const status = !mail.configured
    ? mail.fromEnv
      ? <Label color="info">Da variabili Plesk</Label>
      : <Label color="error">Da configurare</Label>
    : testValid && lastTest.ok
      ? <Label color="success">Funzionante</Label>
      : testValid
        ? <Label color="error">Ultima prova non riuscita</Label>
        : <Label color="warning">Salvato, da provare</Label>;

  const secretHelp = (has) => (has ? 'Già salvata: lascia vuoto per non cambiarla' : 'Si salva cifrata e non viene più mostrata');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="Impostazioni"
        links={[{ name: 'Panoramica' }, { name: 'Impostazioni' }]}
        action={
          <Button color="inherit" variant="outlined" onClick={() => lockSettings()}>
            Chiudi le Impostazioni
          </Button>
        }
        sx={{ mb: 3 }}
      />

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
          action={status}
        />
        <Box
          component="form"
          action={(fd) =>
            start(async () => {
              const r = await saveMail(fd);
              if (r?.error) toast.error(r.error);
              else {
                setSavedNow(r.savedAt);
                setResult(null);
                toast.success('Impostazioni salvate');
              }
            })
          }
          sx={{ p: 3 }}
        >
          <Stack spacing={2.5} sx={{ maxWidth: 640 }}>
            <TextField select name="preset" label="Servizio di posta" value={preset} onChange={(e) => choose(e.target.value)}>
              {Object.entries(PRESETS).map(([value, p]) => (
                <MenuItem key={value} value={value}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                name="from"
                label="Casella mittente"
                placeholder={preset === 'google' ? 'developer@golduck.eu' : 'noreply@golduck.it'}
                defaultValue={mail.from}
                helperText={provider === 'smtp' ? "Se vuota si usa l'utente" : undefined}
                fullWidth
                required={provider === 'microsoft'}
              />
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
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {HELP[preset]}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    name="host"
                    label="Server SMTP"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    slotProps={{ input: { readOnly: preset !== 'smtp' } }}
                    fullWidth
                    required
                  />
                  <TextField
                    name="port"
                    label="Porta"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    sx={{ width: { sm: 160 } }}
                    helperText="587 o 465"
                  />
                </Stack>
                <TextField name="user" label="Utente (indirizzo email completo)" defaultValue={mail.user} fullWidth required />
                <TextField
                  name="pass"
                  type="password"
                  label={preset === 'google' ? 'Password per app (16 lettere)' : 'Password'}
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

            {savedNow && !result && (
              <Alert severity="info">
                Impostazioni salvate alle {when(savedNow)}. Ora premi <b>Invia email di prova</b> per verificare che l&apos;invio funzioni.
              </Alert>
            )}

            {result ? (
              <Alert severity={result.error ? 'error' : 'success'}>
                {result.error ?? `Email di prova inviata a ${result.to}: l'invio funziona. Controlla la posta (anche lo spam).`}
              </Alert>
            ) : (
              !savedNow &&
              testValid && (
                <Alert severity={lastTest.ok ? 'success' : 'error'}>
                  Ultima prova del {when(lastTest.at)}:{' '}
                  {lastTest.ok ? `riuscita, inviata a ${lastTest.to}.` : `non riuscita. ${lastTest.error}`}
                </Alert>
              )
            )}
          </Stack>
        </Box>
        <Divider />
        <Typography variant="caption" sx={{ display: 'block', p: 3, color: 'text.secondary' }}>
          Il primo accesso senza codice si chiude da solo dopo il primo ingresso. Da quel momento tutti entrano con il codice via email.
        </Typography>
      </Card>

      <Box sx={{ mt: 3, maxWidth: 720 }}>
        <AiLimitsCard limits={limits} />
      </Box>
    </DashboardContent>
  );
}
