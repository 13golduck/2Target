'use client';

import { useRef, useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { useRouter } from 'src/routes/hooks';
import { formatName } from 'src/lib/platforms';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { PostPreview } from '../../pubblicazioni/[id]/post-preview';
import { upload, videoSize, prepareImage } from '../../pubblicazioni/media-upload';
import { saveStudioEdit, sendStudioMessage, restoreStudioVersion } from '../../studio-actions';

// ----------------------------------------------------------------------
// 2Target Studio: chat con l'AI a sinistra, progetto al centro, versioni a destra.
// L'AI e chi lavora cambiano lo stesso progetto; ogni cambio salvato è una versione a cui si può tornare.

const FORMATS = ['post', 'carosello', 'reel', 'storia'];
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const eur = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const time = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const sameState = (a, b) => a.title === b.title && a.caption === b.caption && a.hashtags === b.hashtags && a.format === b.format;

export function StudioView({ item, client, platforms, state, versionN, versions, messages, media, ai }) {
  const router = useRouter();
  const [draft, setDraft] = useState(state);
  const [tab, setTab] = useState('testo');
  const [busy, start] = useTransition();
  const dirty = !sameState(draft, state);

  // Una versione nuova (dell'AI o ripristinata) sostituisce la bozza solo se non ci sono modifiche a mano in corso
  const seen = useRef(versionN);
  useEffect(() => {
    if (seen.current === versionN) return;
    seen.current = versionN;
    setDraft(state);
  }, [versionN, state]);

  const saveDraft = async () => {
    const r = await saveStudioEdit({ itemId: item.id, state: draft });
    if (r.error) toast.error(r.error);
    return !r.error;
  };

  const save = () =>
    start(async () => {
      if (await saveDraft()) {
        toast.success('Salvato come nuova versione');
        router.refresh();
      }
    });

  const restore = (n) =>
    start(async () => {
      const r = await restoreStudioVersion({ itemId: item.id, n });
      if (r.error) return toast.error(r.error);
      toast.success(`Tornato alla versione ${n}`);
      router.refresh();
    });

  const totalCost = messages.reduce((sum, m) => sum + (m.costEur ?? 0), 0);

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading={`Studio · ${state.title}`}
        links={[{ name: client.name, href: `/clienti/${client.id}` }, { name: 'Studio' }]}
        action={
          <Stack direction="row" spacing={1}>
            <Button href={`/pubblicazioni/${item.id}`} color="inherit" variant="outlined" startIcon={<Iconify icon="solar:document-text-bold" />}>
              Scheda completa
            </Button>
            <Tooltip title={dirty ? 'Salva prima le modifiche' : ''}>
              <span>
                <Button href={`/pubblicazioni/${item.id}#pubblica`} variant="contained" disabled={dirty} startIcon={<Iconify icon="custom:send-fill" />}>
                  Programma o pubblica
                </Button>
              </span>
            </Tooltip>
          </Stack>
        }
        sx={{ mb: 3 }}
      />

      {!ai.configured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          L&apos;AI non è configurata: puoi lavorare a mano, ma la chat non risponde finché un amministratore non inserisce la chiave in Impostazioni → Integrazioni.
        </Alert>
      )}
      {ai.budgetWarning && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Il budget AI del mese è quasi esaurito: l&apos;AI si ferma al tetto impostato in Consumi AI.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr) 260px' } }}>
        <StudioChat item={item} messages={messages} aiReady={ai.configured} dirty={dirty} saveDraft={saveDraft} />

        <Card sx={{ minWidth: 0 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="testo" label="Testo" icon={<Iconify icon="solar:pen-bold" width={18} />} iconPosition="start" />
            <Tab value="grafica" label="Grafica" disabled icon={<Iconify icon="solar:pallete-2-bold" width={18} />} iconPosition="start" />
            <Tab value="video" label="Video" disabled icon={<Iconify icon="solar:videocamera-record-bold" width={18} />} iconPosition="start" />
          </Tabs>
          {/* Anteprima accanto ai campi solo quando la colonna è larga (a tutta pagina); con le tre colonne va sotto */}
          <Box sx={{ p: 3, display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px', lg: '1fr' }, alignItems: 'start', '& > :last-child': { width: 1, maxWidth: 380, justifySelf: 'center' } }}>
            <Stack spacing={2}>
              <TextField label="Titolo interno" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} size="small" fullWidth />
              <TextField
                label="Testo del post"
                value={draft.caption}
                onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                multiline
                minRows={8}
                slotProps={{ htmlInput: { maxLength: 5000 } }}
                helperText={`${draft.caption.length} caratteri`}
                fullWidth
              />
              <TextField label="Hashtag" value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} slotProps={{ htmlInput: { maxLength: 1000 } }} size="small" fullWidth />
              <TextField select label="Formato" value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })} size="small" sx={{ maxWidth: 240 }}>
                {FORMATS.map((f) => (
                  <MenuItem key={f} value={f}>
                    {formatName(f)}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button variant="contained" onClick={save} disabled={!dirty || busy} loading={busy}>
                  Salva come versione
                </Button>
                {dirty && (
                  <Button color="inherit" onClick={() => setDraft(state)} disabled={busy}>
                    Annulla le modifiche
                  </Button>
                )}
              </Stack>
              <StudioMaterial itemId={item.id} media={media} />
            </Stack>
            <PostPreview
              clientName={client.name}
              logo={client.logo}
              format={draft.format}
              platform={platforms[0] ?? 'instagram'}
              caption={draft.caption}
              hashtags={draft.hashtags}
              media={media.map((m) => ({ id: m.id, kind: m.kind, url: m.url }))}
              emptyText="Carica foto o video in «Materiale»"
            />
          </Box>
        </Card>

        <Card>
          <CardHeader title="Versioni" subheader={`Spesa AI: ${eur(totalCost)}`} sx={{ pb: 1 }} />
          <Stack spacing={1} sx={{ p: 2 }}>
            {versions.map((v) => (
              <Box key={v.n} sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: v.n === versionN ? 'primary.main' : 'divider', bgcolor: v.n === versionN ? 'action.selected' : 'transparent' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="subtitle2">Versione {v.n}</Typography>
                  <Label color={v.author === 'ai' ? 'info' : 'default'} variant="soft">
                    {v.author === 'ai' ? 'AI' : 'Tu'}
                  </Label>
                </Stack>
                <Typography variant="body2">{v.summary}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {time(v.createdAt)}
                </Typography>
                {v.n !== versionN && (
                  <Button size="small" onClick={() => restore(v.n)} disabled={busy} sx={{ display: 'block', mt: 0.5, px: 0 }}>
                    Torna a questa
                  </Button>
                )}
              </Box>
            ))}
          </Stack>
        </Card>
      </Box>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function StudioChat({ item, messages, aiReady, dirty, saveDraft }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [thinking, start] = useTransition();
  const endRef = useRef(null);
  const pending = messages.at(-1)?.role === 'utente';

  const send = (message) =>
    start(async () => {
      // Le modifiche a mano non salvate diventano una versione prima che l'AI lavori sul progetto
      if (dirty && !(await saveDraft())) return;
      const r = await sendStudioMessage({ itemId: item.id, text: message || undefined });
      if (r.error) toast.error(r.error);
      else setText('');
      router.refresh();
    });

  // Progetto appena creato: la richiesta iniziale parte da sola, una volta
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !aiReady || messages.length !== 1 || !pending) return;
    started.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all'apertura del progetto
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, thinking]);

  return (
    <Card sx={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', maxHeight: { lg: 'calc(100vh - 200px)' }, minHeight: 360 }}>
      <CardHeader title="Chat con l'AI" subheader="Chiedi una modifica: l'AI la applica come nuova versione" sx={{ pb: 1 }} />
      <Stack spacing={1.5} sx={{ p: 2, overflowY: 'auto' }}>
        {messages.map((m) => (
          <Box
            key={m.id}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              maxWidth: '92%',
              whiteSpace: 'pre-wrap',
              ...(m.role === 'utente' ? { alignSelf: 'flex-end', bgcolor: 'grey.800', color: 'common.white' } : { alignSelf: 'flex-start', bgcolor: 'background.neutral' }),
            }}
          >
            <Typography variant="body2">{m.text}</Typography>
            {m.role === 'ai' && m.versionN && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                → versione {m.versionN}
              </Typography>
            )}
          </Box>
        ))}
        {thinking && (
          <Box sx={{ alignSelf: 'flex-start', width: 180 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              L&apos;AI sta lavorando…
            </Typography>
            <LinearProgress />
          </Box>
        )}
        {pending && !thinking && aiReady && (
          <Button size="small" onClick={() => send()} startIcon={<Iconify icon="solar:restart-bold" />} sx={{ alignSelf: 'flex-start' }}>
            L&apos;AI non ha ancora risposto: riprova
          </Button>
        )}
        <div ref={endRef} />
      </Stack>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send(text.trim());
        }}
        sx={{ p: 2, pt: 0, display: 'grid', gap: 1 }}
      >
        <TextField
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) send(text.trim());
          }}
          placeholder="es. accorcia il testo e aggiungi un invito a prenotare"
          multiline
          minRows={2}
          maxRows={6}
          disabled={!aiReady || thinking}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={!aiReady || thinking || !text.trim()} startIcon={<Iconify icon="custom:send-fill" />}>
          Invia
        </Button>
      </Box>
    </Card>
  );
}

// ----------------------------------------------------------------------

function StudioMaterial({ itemId, media }) {
  const router = useRouter();
  const [progress, setProgress] = useState(null);

  const onFiles = async (files) => {
    for (const [i, file] of [...files].entries()) {
      try {
        setProgress(`Carico ${file.name} (${i + 1}/${files.length})…`);
        const prepared = file.type.startsWith('image/') ? await prepareImage(file) : { blob: file, type: file.type, name: file.name, ...(await videoSize(file)) };
        await upload(itemId, prepared, () => undefined);
      } catch (e) {
        toast.error(e.message);
      }
    }
    setProgress(null);
    router.refresh();
  };

  return (
    <Box sx={{ p: 2, borderRadius: 1.5, border: '1px dashed', borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Materiale {media.length > 0 && `(${media.length})`}
        </Typography>
        <Button component="label" size="small" variant="outlined" startIcon={<Iconify icon="eva:cloud-upload-fill" />} disabled={!!progress}>
          Carica foto o video
          <input hidden type="file" multiple accept={ACCEPT} onChange={(e) => e.target.files?.length && onFiles(e.target.files).finally(() => (e.target.value = ''))} />
        </Button>
      </Stack>
      {progress && <LinearProgress sx={{ mb: 1 }} />}
      {media.length ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {media.map((m) => (
            <Tooltip key={m.id} title={m.fileName}>
              <Box sx={{ width: 64, height: 64, borderRadius: 1, overflow: 'hidden', bgcolor: 'background.neutral' }}>
                {m.kind === 'video' ? <Box component="video" src={m.url} muted sx={{ width: 1, height: 1, objectFit: 'cover' }} /> : <Box component="img" src={m.url} alt="" sx={{ width: 1, height: 1, objectFit: 'cover' }} />}
              </Box>
            </Tooltip>
          ))}
        </Stack>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          L&apos;AI vede i file caricati (tipo, misure, durata) e ne tiene conto per formato e testo.
        </Typography>
      )}
    </Box>
  );
}
