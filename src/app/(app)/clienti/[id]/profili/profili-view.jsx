'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { checkProfiles, fixFacebookField, prepareProfileKit, saveProfileSetup } from '../../../profile-actions';

// ----------------------------------------------------------------------
// Profili social: completare quelli collegati e creare da zero quelli mancanti con il kit dell'AI.

const PLATFORM = {
  facebook: { label: 'Pagina Facebook', icon: 'socials:facebook', create: 'https://www.facebook.com/pages/create' },
  instagram: { label: 'Profilo Instagram', icon: 'socials:instagram', create: 'https://www.instagram.com/accounts/emailsignup/' },
  tiktok: { label: 'Account TikTok', icon: 'socials:tiktok', create: 'https://www.tiktok.com/signup' },
  google_business: { label: 'Scheda Google', icon: 'socials:google', create: 'https://business.google.com/create' },
};

// Passi della procedura di creazione/completamento, per piattaforma (spuntabili e ricordati)
const STEPS = {
  facebook: ['Crea la Pagina con nome e categoria', 'Carica immagine del profilo e copertina', 'Compila descrizione, sito, contatti', 'Imposta il pulsante d’azione', 'Pubblica i primi contenuti', 'Collega la Pagina a 2Target'],
  instagram: ['Crea l’account e passa a professionale', 'Imposta nome, foto e categoria', 'Scrivi la bio con link e invito all’azione', 'Crea le storie in evidenza', 'Pubblica almeno 9 contenuti', 'Collega l’account a 2Target'],
  tiktok: ['Crea l’account e passa a Business', 'Imposta nome, foto e bio', 'Aggiungi il link al sito', 'Pubblica i primi video', 'Collega l’account a 2Target'],
  google_business: ['Crea la scheda dell’attività', 'Verifica la titolarità (per posta/telefono/video)', 'Compila categoria, orari, contatti e zone', 'Aggiungi foto e descrizione', 'Pubblica il primo aggiornamento'],
};

// Campi del kit mostrati come testo da copiare, con il limite di caratteri della piattaforma
const KIT_FIELDS = [
  { key: 'displayName', label: 'Nome visualizzato' },
  { key: 'usernames', label: 'Nomi utente proposti', list: true },
  { key: 'category', label: 'Categoria' },
  { key: 'bio', label: 'Bio', multiline: true, show: (p) => p === 'instagram' || p === 'tiktok' },
  { key: 'about', label: 'Descrizione breve', multiline: true, show: (p) => p === 'facebook' || p === 'google_business' },
  { key: 'longDescription', label: 'Descrizione estesa', multiline: true },
  { key: 'actionButton', label: 'Pulsante d’azione' },
  { key: 'highlights', label: 'Storie in evidenza', list: true, show: (p) => p === 'instagram' },
  { key: 'hashtags', label: 'Hashtag', list: true, hash: true },
  { key: 'notes', label: 'Da chiedere al cliente', multiline: true },
];

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiato');
  } catch {
    toast.error('Copia non riuscita');
  }
}

export function ProfiliView({ clientId, canConnect, aiReady, platforms }) {
  const [checking, startCheck] = useTransition();

  const runCheck = () =>
    startCheck(async () => {
      const r = await checkProfiles(clientId);
      if (r.error) toast.error(r.error);
      else if (!r.checked && !r.errors.length) toast.info('Nessun profilo Facebook o Instagram collegato da controllare');
      else {
        if (r.checked) toast.success(`Controllati ${r.checked} profili`);
        r.errors.forEach((e) => toast.warning(e));
      }
    });

  return (
    <Box sx={{ mb: 5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5">Profili social</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Completa i profili collegati e crea da zero quelli che mancano, con i testi preparati dall&apos;AI.
          </Typography>
        </Box>
        <Button variant="outlined" color="inherit" startIcon={<Iconify icon="solar:refresh-bold" />} loading={checking} onClick={runCheck}>
          Controlla i collegati
        </Button>
      </Stack>

      <Grid container spacing={3}>
        {platforms.map((p) => (
          <Grid key={p.platform} size={{ xs: 12, md: 6 }}>
            <ProfileCard clientId={clientId} canConnect={canConnect} aiReady={aiReady} data={p} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// ----------------------------------------------------------------------

function ProfileCard({ clientId, canConnect, aiReady, data }) {
  const meta = PLATFORM[data.platform];
  const connected = data.channel?.connected && data.channel?.hasToken;
  const canReadHealth = data.platform === 'facebook' || data.platform === 'instagram';

  return (
    <Card sx={{ height: 1 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 2.5 }}>
        <Iconify icon={meta.icon} width={28} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>{meta.label}</Typography>
          {data.channel && <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{data.channel.name}</Typography>}
        </Box>
        {connected ? <Label color="success">Collegato</Label> : data.channel ? <Label color="warning">Da collegare</Label> : <Label color="default">Da creare</Label>}
      </Stack>
      <Divider />

      {connected && canReadHealth && data.health && <HealthPanel channelId={data.channel.id} platform={data.platform} health={data.health} />}

      {connected && canReadHealth && !data.health && (
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Premi «Controlla i collegati» in alto per misurare la completezza di questo profilo.
          </Typography>
        </Box>
      )}

      {!connected && (
        <KitPanel clientId={clientId} canConnect={canConnect} aiReady={aiReady} data={data} meta={meta} />
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------
// Completezza del profilo collegato, con correzione dei campi dove Meta lo consente (solo Facebook).

function HealthPanel({ channelId, platform, health }) {
  const items = health.items ?? [];
  const score = health.score ?? 0;
  const color = score >= 80 ? 'success' : score >= 50 ? 'warning' : 'error';

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Completezza</Typography>
        <Label color={color}>{score}/100</Label>
      </Stack>
      <LinearProgress variant="determinate" value={score} color={color} sx={{ mb: 2, height: 8, borderRadius: 1 }} />
      <Stack spacing={1.25}>
        {items.map((it) => (
          <HealthItem key={it.key} channelId={channelId} platform={platform} item={it} />
        ))}
      </Stack>
    </Box>
  );
}

function HealthItem({ channelId, platform, item }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.value ?? '');
  const [pending, start] = useTransition();
  // Solo alcuni campi della Pagina Facebook sono modificabili via API
  const canFix = platform === 'facebook' && item.fixable;

  const save = () =>
    start(async () => {
      const r = await fixFacebookField({ channelId, field: item.key, value });
      if (r.error) toast.error(r.error);
      else {
        toast.success('Aggiornato');
        setEditing(false);
      }
    });

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Iconify
          icon={item.ok ? 'eva:checkmark-circle-2-fill' : 'solar:danger-triangle-bold'}
          width={18}
          sx={{ color: item.ok ? 'success.main' : 'warning.main', mt: 0.3, flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2">{item.label}</Typography>
          {item.value && !editing && <Typography variant="caption" sx={{ color: 'text.secondary', wordBreak: 'break-word' }}>{item.value}</Typography>}
          {!item.ok && item.hint && !editing && <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{item.hint}</Typography>}
        </Box>
        {canFix && !editing && (
          <Button size="small" color="inherit" onClick={() => { setValue(item.value ?? ''); setEditing(true); }}>
            {item.ok ? 'Modifica' : 'Correggi'}
          </Button>
        )}
      </Stack>
      {editing && (
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start' }}>
          <TextField size="small" fullWidth multiline minRows={item.key === 'about' ? 2 : 1} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <Button size="small" variant="contained" loading={pending} onClick={save} disabled={!value.trim()}>Salva</Button>
          <Button size="small" color="inherit" onClick={() => setEditing(false)}>Annulla</Button>
        </Stack>
      )}
    </Box>
  );
}

// ----------------------------------------------------------------------
// Creazione da zero (o profilo non collegato): kit di testi dall'AI + procedura a passi.

function KitPanel({ clientId, canConnect, aiReady, data, meta }) {
  const { platform } = data;
  const [kit, setKit] = useState(data.kit);
  const [steps, setSteps] = useState(data.steps ?? {});
  const [preparing, startPrepare] = useTransition();
  const [, startSave] = useTransition();

  const prepare = () =>
    startPrepare(async () => {
      const r = await prepareProfileKit(clientId, platform);
      if (r.error) toast.error(r.error);
      else {
        setKit(r.kit);
        toast.success('Kit pronto');
      }
    });

  const toggleStep = (label) => {
    const next = { ...steps, [label]: !steps[label] };
    setSteps(next);
    startSave(async () => {
      const r = await saveProfileSetup({ clientId, platform, steps: next });
      if (r.error) toast.error(r.error);
    });
  };

  const stepList = STEPS[platform] ?? [];
  const doneCount = stepList.filter((s) => steps[s]).length;

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      {!canConnect && (
        <Alert severity="info" sx={{ mb: 2 }}>Il tuo profilo non può creare o collegare profili.</Alert>
      )}

      {/* Procedura a passi */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Come si crea</Typography>
        <Label color={doneCount === stepList.length ? 'success' : 'default'}>{doneCount}/{stepList.length}</Label>
      </Stack>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        {stepList.map((s) => (
          <Stack
            key={s}
            direction="row"
            spacing={1}
            onClick={() => toggleStep(s)}
            sx={{ alignItems: 'center', cursor: 'pointer', borderRadius: 1, px: 1, py: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Iconify icon={steps[s] ? 'eva:checkmark-circle-2-fill' : 'eva:radio-button-off-fill'} width={18} sx={{ color: steps[s] ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ textDecoration: steps[s] ? 'line-through' : 'none', color: steps[s] ? 'text.disabled' : 'text.primary' }}>{s}</Typography>
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: kit ? 2 : 0 }}>
        <Button
          component="a"
          href={meta.create}
          target="_blank"
          rel="noopener"
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<Iconify icon="solar:add-circle-bold" />}
        >
          Apri la creazione
        </Button>
        {aiReady && (
          <Button size="small" variant="contained" loading={preparing} startIcon={<Iconify icon="solar:magic-stick-3-bold" />} onClick={prepare} disabled={!canConnect}>
            {kit ? 'Rigenera testi' : 'Prepara i testi con l’AI'}
          </Button>
        )}
      </Stack>
      {!aiReady && <Typography variant="caption" sx={{ color: 'text.disabled' }}>Per i testi automatici serve la chiave API di Anthropic (Impostazioni → Integrazioni).</Typography>}

      {kit && (
        <>
          <Divider sx={{ my: 2, borderStyle: 'dashed' }} />
          <Stack spacing={1.5}>
            {KIT_FIELDS.filter((f) => !f.show || f.show(platform)).map((f) => (
              <KitField key={f.key} field={f} value={kit[f.key]} />
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}

function KitField({ field, value }) {
  if (value == null || (Array.isArray(value) && !value.length) || value === '') return null;
  const text = field.list ? (value ?? []).map((v) => (field.hash ? `#${v}` : v)).join(field.hash ? ' ' : '\n') : String(value);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.25 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>{field.label}</Typography>
        <Tooltip title="Copia">
          <IconButton size="small" onClick={() => copy(text)}>
            <Iconify icon="solar:copy-bold" width={15} />
          </IconButton>
        </Tooltip>
      </Stack>
      {field.list && !field.hash ? (
        <Stack spacing={0.5}>
          {(value ?? []).map((v, i) => (
            <Typography key={i} variant="body2" sx={{ wordBreak: 'break-word' }}>{v}</Typography>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: field.multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>{text}</Typography>
      )}
    </Box>
  );
}
