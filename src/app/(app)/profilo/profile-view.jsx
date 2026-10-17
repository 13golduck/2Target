'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { fmtDateTime } from 'src/lib/format';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { confirmTotp, disableTotp, startTotpSetup, setWeeklyDigest, regenerateRecovery, sendWeeklyDigestPreview } from './actions';
import { askConfirm } from 'src/components/custom-dialog';

// ----------------------------------------------------------------------

export function ProfileView({ user }) {
  const [setup, setSetup] = useState(null); // { qr, secret }
  const [codes, setCodes] = useState(null); // codici di recupero appena creati
  const [code, setCode] = useState('');
  const [pending, start] = useTransition();
  const enabled = !!user.totpEnabledAt;

  const run = (fn, ok) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else ok?.(r);
    });

  return (
    <DashboardContent maxWidth="md">
      <CustomBreadcrumbs heading="Profilo e sicurezza" links={[{ name: 'Panoramica' }, { name: 'Profilo' }]} sx={{ mb: 3 }} />

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6">{user.name}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{user.email}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Label>{user.role}</Label>
          {user.lastLoginAt && <Label variant="outlined">Ultimo accesso {fmtDateTime(new Date(user.lastLoginAt))}</Label>}
        </Stack>
      </Card>

      {user.weeklyDigest != null && (
        <Card sx={{ mb: 3 }}>
          <CardHeader
            avatar={<Iconify icon="solar:letter-bold" width={28} sx={{ color: user.weeklyDigest ? 'primary.main' : 'text.disabled' }} />}
            title="Riepilogo settimanale"
            subheader="Ogni lunedì un’email con cosa è uscito, cosa non è uscito, cosa manca da approvare e cosa esce nei prossimi 7 giorni"
            action={<Switch checked={user.weeklyDigest} disabled={pending} onChange={(e) => run(() => setWeeklyDigest(e.target.checked), () => toast.success(e.target.checked ? 'Riepilogo attivato' : 'Riepilogo disattivato'))} />}
            sx={{ flexWrap: 'wrap', gap: 1, '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }}
          />
          <Box sx={{ px: 3, pb: 2.5, pt: 1 }}>
            <Button size="small" variant="outlined" color="inherit" disabled={pending} startIcon={<Iconify icon="solar:letter-outline" />} onClick={() => run(sendWeeklyDigestPreview, (r) => toast.success(`Anteprima inviata a ${r.email}`))}>
              Mandami un’anteprima ora
            </Button>
          </Box>
        </Card>
      )}

      <Card>
        <CardHeader
          avatar={<Iconify icon="solar:shield-check-bold" width={28} sx={{ color: enabled ? 'success.main' : 'text.disabled' }} />}
          title="Doppio fattore di autenticazione"
          subheader="Oltre al codice via email, all’accesso serve il codice di un’app sul telefono"
          action={enabled ? <Label color="success">Attivo</Label> : <Label color="warning">Non attivo</Label>}
          sx={{ flexWrap: 'wrap', gap: 1, '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }}
        />
        <Box sx={{ p: 3, pt: 1 }}>
          {codes && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Codici di recupero: salvali adesso, non verranno più mostrati.</Typography>
              <Typography variant="body2" sx={{ mb: 1.5 }}>Ognuno vale una volta sola e serve se perdi il telefono. Conservali in un posto sicuro (es. gestore password).</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, max-content)', gap: 1, fontFamily: 'monospace', fontSize: 16, mb: 1.5 }}>
                {codes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </Box>
              <Button size="small" variant="outlined" color="inherit" startIcon={<Iconify icon="solar:copy-bold" />} onClick={() => navigator.clipboard.writeText(codes.join('\n')).then(() => toast.success('Codici copiati'))}>
                Copia i codici
              </Button>
            </Alert>
          )}

          {!enabled && !setup && (
            <Stack spacing={2}>
              <Typography variant="body2">
                Ti serve un’app di autenticazione sul telefono: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> o il gestore password che usi già.
                Se qualcuno riuscisse a leggere la tua email, senza il telefono non potrebbe comunque entrare.
              </Typography>
              <Button variant="contained" loading={pending} sx={{ alignSelf: 'flex-start' }} startIcon={<Iconify icon="solar:shield-check-bold" />} onClick={() => run(startTotpSetup, (r) => setSetup(r))}>
                Attiva il doppio fattore
              </Button>
            </Stack>
          )}

          {!enabled && setup && (
            <Stack spacing={2.5}>
              <Typography variant="subtitle2">1. Inquadra il QR code con l’app</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: { sm: 'center' } }}>
                <Box component="img" src={setup.qr} alt="QR code per l'app di autenticazione" sx={{ width: 200, height: 200, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: '#fff', p: 1 }} />
                <Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>Non riesci a inquadrarlo? Inserisci a mano questa chiave:</Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 16, mt: 0.5, wordBreak: 'break-all' }}>{setup.secret}</Typography>
                </Box>
              </Stack>
              <Typography variant="subtitle2">2. Scrivi il codice di 6 cifre che compare nell’app</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField value={code} onChange={(e) => setCode(e.target.value)} label="Codice dell’app" autoComplete="one-time-code" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 7 } }} />
                <Button
                  variant="contained"
                  loading={pending}
                  onClick={() =>
                    run(
                      () => confirmTotp(code),
                      (r) => {
                        setCodes(r.codes);
                        setSetup(null);
                        setCode('');
                        toast.success('Doppio fattore attivato');
                      }
                    )
                  }
                >
                  Conferma e attiva
                </Button>
                <Button color="inherit" disabled={pending} onClick={() => setSetup(null)}>
                  Annulla
                </Button>
              </Stack>
            </Stack>
          )}

          {enabled && (
            <Stack spacing={2}>
              <Typography variant="body2">
                Attivo dal {fmtDateTime(new Date(user.totpEnabledAt))}. Codici di recupero ancora validi: <b>{user.recoveryLeft}</b>.
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Per generare nuovi codici di recupero o disattivare il doppio fattore inserisci un codice dell’app.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField value={code} onChange={(e) => setCode(e.target.value)} label="Codice dell’app" size="small" autoComplete="one-time-code" />
                <Button variant="outlined" color="inherit" loading={pending} onClick={() => run(() => regenerateRecovery(code), (r) => { setCodes(r.codes); setCode(''); })}>
                  Nuovi codici di recupero
                </Button>
                <Button
                  color="error"
                  loading={pending}
                  onClick={async () => {
                    if (!(await askConfirm({ tone: 'warning', title: 'Disattivare il doppio fattore?', content: 'L’accesso tornerà a richiedere solo il codice email.', confirmText: 'Disattiva' }))) return;
                    run(() => disableTotp(code), () => { setCode(''); toast.success('Doppio fattore disattivato'); });
                  }}
                >
                  Disattiva
                </Button>
              </Stack>
            </Stack>
          )}
        </Box>
      </Card>
    </DashboardContent>
  );
}
