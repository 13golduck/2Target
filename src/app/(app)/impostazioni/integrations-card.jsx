'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { askConfirm } from 'src/components/custom-dialog';

import { saveIntegrations, setPublishingLive } from './actions';

// ----------------------------------------------------------------------
// Chiavi delle app di Golduck su Meta e Google: si inseriscono qui (cifrate nel database), non su Plesk.
// Una volta inserite, collegamento dei clienti, lettura dei dati e pubblicazione avvengono tutti dentro 2Target.

const SOURCE = {
  app: { label: 'Impostata in 2Target', color: 'success' },
  plesk: { label: 'Da Plesk (riserva)', color: 'info' },
  mancante: { label: 'Mancante', color: 'warning' },
};

const GROUPS = [
  {
    key: 'meta',
    title: 'Meta (Facebook e Instagram)',
    icon: 'socials:facebook',
    where: 'Meta for Developers → app 2Target → Impostazioni app → Di base; la configurazione in Facebook Login for Business → Configurazioni.',
    callback: '/api/connect/meta/callback',
    fields: [
      { name: 'metaAppId', label: 'ID app' },
      { name: 'metaAppSecret', label: 'Chiave segreta', secret: true },
      {
        name: 'metaConfigId',
        label: 'ID configurazione (Facebook Login for Business)',
      },
    ],
  },
  {
    key: 'anthropic',
    title: 'Anthropic (AI dei check-up e dello studio grafico)',
    icon: 'solar:atom-bold-duotone',
    where: 'console.anthropic.com → organizzazione Golduck → API Keys.',
    callback: null,
    fields: [{ name: 'anthropicApiKey', label: 'Chiave API Anthropic', secret: true }],
  },
  {
    key: 'google',
    title: 'Google (Search Console, Analytics, PageSpeed)',
    icon: 'socials:google',
    where: 'Google Cloud → progetto 2Target → API e servizi → Credenziali.',
    callback: '/api/connect/google/callback',
    fields: [
      { name: 'googleClientId', label: 'ID client OAuth' },
      {
        name: 'googleClientSecret',
        label: 'Segreto client OAuth',
        secret: true,
      },
      {
        name: 'googlePageSpeedKey',
        label: 'Chiave API PageSpeed',
        secret: true,
      },
    ],
  },
];

function Field({ f, st, clear, onClear }) {
  const source = SOURCE[st.source];
  return (
    <Box>
      <TextField
        name={f.name}
        label={f.label}
        fullWidth
        size="small"
        type={f.secret ? 'password' : 'text'}
        autoComplete="off"
        defaultValue={f.secret ? '' : st.source === 'app' ? (st.value ?? '') : ''}
        placeholder={
          f.secret
            ? st.source === 'mancante'
              ? 'Incolla qui'
              : 'Già impostata: lascia vuoto per non cambiarla'
            : st.source === 'plesk'
              ? `Da Plesk: ${st.value}`
              : ''
        }
        slotProps={{ inputLabel: { shrink: true } }}
        disabled={clear}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
        <Label color={clear ? 'default' : source.color}>{clear ? 'Verrà rimossa' : source.label}</Label>
        {st.source === 'app' && (
          <Button size="small" color="inherit" onClick={onClear} sx={{ fontSize: 12, py: 0 }}>
            {clear ? 'Annulla' : 'Rimuovi'}
          </Button>
        )}
        {clear && <input type="hidden" name={`clear:${f.name}`} value="1" />}
      </Stack>
    </Box>
  );
}

export function IntegrationsCard({ status, appUrl }) {
  const [pending, start] = useTransition();
  const [cleared, setCleared] = useState([]);
  const host = (() => {
    try {
      return new URL(appUrl).host;
    } catch {
      return '';
    }
  })();
  const live = status.publishLiveHost?.source !== 'mancante' && status.publishLiveHost?.value === host;

  const toggleLive = async (on) => {
    const ok = await askConfirm(
      on
        ? {
            tone: 'warning',
            title: 'Attivare la pubblicazione reale?',
            content: `Da ora i post programmati e «Pubblica ora» usciranno davvero sui profili dei clienti, solo da ${host}. Le copie di prova restano in simulazione.`,
            confirmText: 'Attiva',
          }
        : { tone: 'primary', title: 'Spegnere la pubblicazione reale?', content: 'Da ora 2Target simula soltanto: nulla verrà inviato a Meta finché non la riattivi.', confirmText: 'Spegni' }
    );
    if (!ok) return;
    start(async () => {
      const r = await setPublishingLive(on);
      if (r?.error) toast.error(r.error);
      else toast.success(on ? 'Pubblicazione reale attiva' : 'Pubblicazione reale spenta');
    });
  };

  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copiato'));

  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="eva:link-2-fill" width={24} sx={{ color: 'primary.main' }} />}
        title="Integrazioni"
        subheader="Chiavi delle app di Golduck su Meta e Google. Si inseriscono una volta: poi collegamento dei clienti, dati e pubblicazione avvengono dentro 2Target."
      />
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            const r = await saveIntegrations(fd);
            if (r?.error) toast.error(r.error);
            else {
              toast.success(r.changed ? 'Integrazioni salvate' : 'Nessuna modifica');
              setCleared([]);
            }
          })
        }
        sx={{ p: 3, pt: 1 }}
      >
        <Alert
          severity={live ? 'success' : 'info'}
          sx={{ mb: 3, alignItems: 'center' }}
          action={<Switch checked={live} disabled={pending} onChange={(e) => toggleLive(e.target.checked)} inputProps={{ 'aria-label': 'Pubblicazione reale' }} />}
        >
          <b>Pubblicazione reale sui social: {live ? `attiva su ${host}` : 'spenta (simulazione)'}</b>
          <Box component="span" sx={{ display: 'block', typography: 'caption' }}>
            Vale solo per questo indirizzo: una copia di 2Target su un altro indirizzo resta sempre in simulazione.
          </Box>
        </Alert>
        <Stack spacing={3} divider={<Divider flexItem />}>
          {GROUPS.map((gr) => (
            <Box key={gr.key}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Iconify icon={gr.icon} width={20} />
                <Typography variant="subtitle1">{gr.title}</Typography>
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 2 }}>
                Dove si trovano: {gr.where}
              </Typography>
              <Grid container spacing={2}>
                {gr.fields.map((f) => (
                  <Grid key={f.name} size={{ xs: 12, md: 4 }}>
                    <Field
                      f={f}
                      st={status[f.name]}
                      clear={cleared.includes(f.name)}
                      onClear={() => setCleared((c) => (c.includes(f.name) ? c.filter((x) => x !== f.name) : [...c, f.name]))}
                    />
                  </Grid>
                ))}
              </Grid>
              {gr.callback && (
                <TextField
                  label="Indirizzo di ritorno da registrare nell'app"
                  value={`${appUrl}${gr.callback}`}
                  size="small"
                  fullWidth
                  sx={{ mt: 2 }}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Copia">
                            <IconButton size="small" onClick={() => copy(`${appUrl}${gr.callback}`)}>
                              <Iconify icon="solar:copy-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            </Box>
          ))}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3, alignItems: { sm: 'center' } }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
            Le chiavi segrete sono cifrate e non vengono più mostrate. Ogni modifica finisce nell&apos;audit trail (solo i nomi dei campi). Le variabili su
            Plesk restano valide come riserva.
          </Typography>
          <Button type="submit" variant="contained" loading={pending} startIcon={<Iconify icon="eva:checkmark-fill" />}>
            Salva integrazioni
          </Button>
        </Stack>
      </Box>
    </Card>
  );
}
