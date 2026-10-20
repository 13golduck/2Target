'use client';

import dynamic from 'next/dynamic';
import { useRef, useState, useEffect, useCallback, useTransition } from 'react';

import Box from '@mui/material/Box';
import Step from '@mui/material/Step';
import Card from '@mui/material/Card';
import Popover from '@mui/material/Popover';
import Stepper from '@mui/material/Stepper';
import Divider from '@mui/material/Divider';
import StepButton from '@mui/material/StepButton';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Checkbox from '@mui/material/Checkbox';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { useRouter } from 'src/routes/hooks';
import { formatName, PLATFORM_INFO } from 'src/lib/platforms';
import { brandColors, DESIGN_SIZES, starterDesign } from 'src/lib/studio/design';
import { starterVideo } from 'src/lib/studio/video';

import { AutoRefresh } from 'src/components/auto-refresh';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { PostPreview } from '../../pubblicazioni/[id]/post-preview';
import { upload, videoSize, prepareImage } from '../../pubblicazioni/media-upload';
import { postTargets } from '../../create-post-actions';
import { saveStudioEdit, moveStudioMedia, publishFromStudio, sendStudioMessage, generateStudioImage, restoreStudioVersion, replaceDesignOutputs } from '../../studio-actions';

// L'editor usa il canvas del browser: si carica solo lato client
const DesignEditor = dynamic(() => import('./design-editor'), { ssr: false, loading: () => <LinearProgress /> });
const VideoEditor = dynamic(() => import('./video-editor'), { ssr: false, loading: () => <LinearProgress /> });

// ----------------------------------------------------------------------
// 2Target Studio: chat con l'AI a sinistra, progetto al centro, versioni a destra.
// L'AI e chi lavora cambiano lo stesso progetto; ogni cambio salvato è una versione a cui si può tornare.

const FORMATS = ['post', 'carosello', 'reel', 'storia'];
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
const eur = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const time = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

// Le chiavi si mettono in ordine: il server restituisce la grafica con un ordine diverso da quello del browser
const canonical = (v) => (Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
const sameState = (a, b) =>
  a.title === b.title &&
  a.caption === b.caption &&
  a.hashtags === b.hashtags &&
  a.format === b.format &&
  JSON.stringify(canonical(a.design)) === JSON.stringify(canonical(b.design)) &&
  JSON.stringify(canonical(a.video)) === JSON.stringify(canonical(b.video));

/** Impronta breve della grafica: finisce nel nome dei file esportati, così si sa se l'esportazione è aggiornata. */
function designTag(design) {
  const text = JSON.stringify(canonical(design));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const STEPS = [
  { key: 'contenuto', label: 'Contenuto', hint: 'Testo, hashtag e file' },
  { key: 'grafica', label: 'Grafica o video', hint: 'Facoltativo' },
  { key: 'quando', label: 'Quando e dove', hint: 'Profili, data e ora' },
  { key: 'uscite', label: 'Uscite', hint: 'Stato sui social' },
];
const ACTIVE = ['programmata', 'in_corso', 'pubblicata'];
// Sui grandi schermi lo Studio sta tutto nella finestra: scorrono le singole colonne, non la pagina
const COLUMN_HEIGHT = { lg: 'calc(100vh - 248px)' };

export function StudioView({ item, client, brand, platforms, state, versionN, versions, messages, media, publications, ai }) {
  const router = useRouter();
  const [draft, setDraft] = useState(state);
  const [busy, start] = useTransition();
  const dirty = !sameState(draft, state);
  const [step, setStep] = useState(publications.length ? 'uscite' : 'contenuto');

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
  const postMedia = media.filter((m) => m.inPost);
  const images = media.filter((m) => m.kind === 'image' && m.origin !== 'grafica');
  // L'esportazione è aggiornata se nel post ci sono le immagini della grafica salvata
  // (solo JPEG: le prime esportazioni in PNG vanno rifatte, Instagram non le accetta)
  const exported = !!state.design && postMedia.some((m) => m.origin === 'grafica' && m.fileName.includes(designTag(state.design)) && m.fileName.endsWith('.jpg'));
  const aspect = draft.design ? { quadrato: '1:1', verticale: '4:5', storia: '9:16' }[draft.design.size] : draft.format === 'storia' || draft.format === 'reel' ? '9:16' : '4:5';

  // Montaggio: il file del post nato dall'ultimo «Crea il video» (pronto, in lavorazione o non riuscito)
  const videos = media.filter((m) => m.kind === 'video' && m.origin !== 'video');
  const tracks = media.filter((m) => m.kind === 'audio');
  const videoOutput = postMedia.find((m) => m.origin === 'video');
  const videoBusy = videoOutput?.processState === 'in_lavorazione';
  const videoExported = !!state.video && videoOutput?.processState === 'pronto' && videoOutput.fileName.includes(designTag(state.video));
  const [visual, setVisual] = useState(() => (draft.video ? 'video' : draft.design ? 'grafica' : videos.length && ['reel', 'storia'].includes(draft.format) ? 'video' : 'grafica'));

  const done = {
    contenuto: !!state.caption.trim() || postMedia.length > 0,
    grafica: state.video ? videoExported : state.design ? exported : null,
    quando: publications.some((p) => ACTIVE.includes(p.status)),
    uscite: publications.some((p) => p.status === 'pubblicata'),
  };

  const createDesign = (size, pages) =>
    setDraft({ ...draft, design: starterDesign({ size, pages, headline: draft.title, colors: brandColors(brand.palette), hasLogo: !!brand.logoUrl }) });

  const [exporting, startExport] = useTransition();
  const exportDesign = (blobs, { width, height }) =>
    startExport(async () => {
      // Si esporta la grafica salvata: prima le modifiche diventano una versione
      if (dirty && !(await saveDraft())) return;
      const tag = designTag(draft.design);
      try {
        const ids = [];
        for (const [i, blob] of blobs.entries()) {
          const r = await upload(item.id, { blob, type: 'image/jpeg', name: `grafica-${tag}-${i + 1}.jpg`, width, height }, () => undefined, { origine: 'grafica' });
          ids.push(r.id);
        }
        const r = await replaceDesignOutputs({ itemId: item.id, mediaIds: ids });
        if (r.error) throw new Error(r.error);
        toast.success(blobs.length === 1 ? 'Grafica esportata nel post' : `${blobs.length} immagini esportate nel post`);
      } catch (e) {
        toast.error(e.message);
      }
      router.refresh();
    });

  // L'editor registra qui la sua esportazione, così il pulsante principale in alto la può avviare
  const [exportFn, setExportFn] = useState(null);
  const registerExport = useCallback((fn) => setExportFn(() => fn), []);

  const [rendering, startRender] = useTransition();
  const exportVideo = () =>
    startRender(async () => {
      if (dirty && !(await saveDraft())) return;
      try {
        // Le scritte si disegnano qui e il server le sovrappone: nel video escono come nell'anteprima
        const { drawTextOverlay, overlayBlob } = await import('./text-overlay');
        const form = new FormData();
        form.set('tag', designTag(draft.video));
        for (const t of draft.video.texts) form.set(`overlay_${t.id}`, await overlayBlob(await drawTextOverlay(t, draft.video.size)), `${t.id}.png`);
        const res = await fetch(`/api/studio/video?scheda=${item.id}`, { method: 'POST', body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Montaggio non avviato (${res.status})`);
        toast.success('Montaggio avviato: il video sarà pronto tra poco');
      } catch (e) {
        toast.error(e.message);
      }
      router.refresh();
    });

  const [uploadingMusic, startMusic] = useTransition();
  const uploadMusic = (file) =>
    new Promise((resolve) =>
      startMusic(async () => {
        try {
          await upload(item.id, { blob: file, type: file.type || 'audio/mpeg', name: file.name }, () => undefined, { materiale: '1' });
          toast.success('Musica caricata: sceglila nel menu «Musica»');
        } catch (e) {
          toast.error(e.message);
        }
        router.refresh();
        resolve();
      })
    );

  // Il pulsante principale dice sempre qual è il prossimo passo
  const next = dirty
    ? { label: 'Salva le modifiche', icon: 'eva:checkmark-fill', onClick: save }
    : step === 'contenuto'
      ? { label: 'Avanti: grafica o video', icon: 'eva:arrow-forward-fill', onClick: () => setStep('grafica') }
      : step === 'grafica' && visual === 'video' && videoBusy
        ? { label: 'Montaggio in corso…', icon: 'solar:videocamera-record-bold', onClick: () => undefined, loading: true }
      : step === 'grafica' && visual === 'video' && draft.video && !videoExported
        ? { label: 'Crea il video', icon: 'solar:videocamera-record-bold', onClick: exportVideo, loading: rendering }
      : step === 'grafica' && visual === 'grafica' && draft.design && !exported
        ? { label: 'Esporta nel post', icon: 'solar:export-bold', onClick: () => exportFn?.(), loading: exporting }
        : step === 'grafica'
          ? { label: 'Avanti: quando e dove', icon: 'eva:arrow-forward-fill', onClick: () => setStep('quando') }
          : null;

  const preview = (
    <PostPreview
      clientName={client.name}
      logo={client.logo}
      format={draft.format}
      platform={platforms[0] ?? 'instagram'}
      caption={draft.caption}
      hashtags={draft.hashtags}
      media={postMedia.map((m) => ({ id: m.id, kind: m.kind, url: m.url }))}
      emptyText="Carica foto o video, oppure esporta la grafica"
    />
  );

  return (
    <DashboardContent maxWidth="xl" sx={{ pb: 2 }}>
      {/* Mentre il server compone il video lo Studio si aggiorna da solo (al massimo 15 minuti) */}
      <AutoRefresh active={videoBusy} everyMs={4000} maxMs={15 * 60_000} />

      {/* Intestazione: titolo, versioni e il prossimo passo sempre nello stesso posto */}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" noWrap>
            {state.title}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Studio · {client.name} · spesa AI {eur(totalCost)}
          </Typography>
        </Box>
        <VersionsMenu versions={versions} versionN={versionN} busy={busy} onRestore={restore} />
        <Tooltip title="Scheda completa: script, sponsorizzata, coautori, note">
          <IconButton href={`/pubblicazioni/${item.id}`} aria-label="Apri la scheda completa">
            <Iconify icon="solar:document-text-bold" />
          </IconButton>
        </Tooltip>
        {dirty && (
          <Button color="inherit" onClick={() => setDraft(state)} disabled={busy}>
            Annulla
          </Button>
        )}
        {next && (
          <Button variant="contained" size="large" onClick={next.onClick} loading={next.loading || busy} endIcon={<Iconify icon={next.icon} />}>
            {next.label}
          </Button>
        )}
      </Stack>

      {/* Passi */}
      <Card sx={{ px: 2, py: 1.5, mb: 2 }}>
        <Stepper nonLinear activeStep={STEPS.findIndex((s) => s.key === step)}>
          {STEPS.map((s) => (
            <Step key={s.key} completed={!!done[s.key]}>
              <StepButton onClick={() => setStep(s.key)} optional={<Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.key === 'grafica' && done.grafica === false ? 'Da esportare' : s.hint}</Typography>}>
                {s.label}
              </StepButton>
            </Step>
          ))}
        </Stepper>
      </Card>

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

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr) 340px' }, '& > *': { minWidth: 0, height: COLUMN_HEIGHT, minHeight: { lg: 520 } } }}>
        <StudioChat item={item} messages={messages} aiReady={ai.configured} dirty={dirty} saveDraft={saveDraft} />

        <Card sx={{ overflowY: 'auto', gridColumn: step === 'grafica' && (visual === 'video' ? draft.video : draft.design) ? { lg: 'span 2' } : undefined }}>
          <Box sx={{ p: 2.5 }}>
            {step === 'contenuto' && (
              <Stack spacing={2}>
                <TextField label="Titolo interno" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} size="small" fullWidth />
                <TextField
                  label="Testo del post"
                  value={draft.caption}
                  onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                  multiline
                  minRows={7}
                  maxRows={14}
                  slotProps={{ htmlInput: { maxLength: 5000 } }}
                  helperText={`${draft.caption.length} caratteri`}
                  fullWidth
                />
                <Stack direction="row" spacing={1.5}>
                  <TextField label="Hashtag" value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} slotProps={{ htmlInput: { maxLength: 1000 } }} size="small" fullWidth />
                  <TextField select label="Formato" value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })} size="small" sx={{ minWidth: 150 }}>
                    {FORMATS.map((f) => (
                      <MenuItem key={f} value={f}>
                        {formatName(f)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <StudioMaterial itemId={item.id} media={media} toMaterial={!!draft.design} imagesAvailable={ai.images} defaultAspect={aspect} />
              </Stack>
            )}

            {step === 'grafica' && (
              <ToggleButtonGroup exclusive size="small" value={visual} onChange={(_, v) => v && setVisual(v)} sx={{ mb: 2 }}>
                <ToggleButton value="grafica">
                  <Iconify icon="solar:pallete-2-bold" width={18} sx={{ mr: 0.75 }} />
                  Grafica
                </ToggleButton>
                <ToggleButton value="video">
                  <Iconify icon="solar:videocamera-record-bold" width={18} sx={{ mr: 0.75 }} />
                  Video
                </ToggleButton>
              </ToggleButtonGroup>
            )}

            {step === 'grafica' && visual === 'video' && (
              <VideoStep
                draft={draft}
                state={state}
                dirty={dirty}
                videos={videos}
                tracks={tracks}
                output={videoOutput}
                exported={videoExported}
                // Un montaggio si pubblica come reel (o storia, se già scelta)
                onChange={(video) => setDraft({ ...draft, video, format: video && !['reel', 'storia'].includes(draft.format) ? 'reel' : draft.format })}
                onUploadMusic={uploadMusic}
                uploadingMusic={uploadingMusic}
                onSkip={() => setStep('quando')}
                material={<StudioMaterial itemId={item.id} media={media} toMaterial={!!draft.video} imagesAvailable={ai.images} defaultAspect={aspect} />}
              />
            )}

            {step === 'grafica' && visual === 'grafica' &&
              (draft.design ? (
                <Stack spacing={1.5}>
                  {state.design && !dirty && (
                    <Alert severity={exported ? 'success' : 'warning'} sx={{ py: 0 }}>
                      {exported ? 'La grafica è nel post: è quella che verrà pubblicata.' : 'Grafica non ancora nel post: premi «Esporta nel post» in alto.'}
                    </Alert>
                  )}
                  <DesignEditor design={draft.design} onChange={(design) => setDraft({ ...draft, design })} images={images} logoUrl={brand.logoUrl} onExport={exportDesign} exporting={exporting} wide registerExport={registerExport} />
                  <Button color="inherit" size="small" onClick={() => setDraft({ ...draft, design: null })} sx={{ alignSelf: 'flex-start' }} startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}>
                    Togli la grafica
                  </Button>
                  <StudioMaterial itemId={item.id} media={media} toMaterial imagesAvailable={ai.images} defaultAspect={aspect} />
                </Stack>
              ) : (
                <Stack spacing={3}>
                  <NewDesign format={draft.format} onCreate={createDesign} />
                  <Divider />
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
                      Hai già foto o video pronti? La grafica non serve: si pubblicano i file del post.
                    </Typography>
                    <Button variant="outlined" onClick={() => setStep('quando')}>
                      Salta la grafica
                    </Button>
                  </Stack>
                </Stack>
              ))}

            {step === 'quando' && (
              <StudioPublish
                item={item}
                clientId={client.id}
                hasMedia={postMedia.length > 0}
                hasImage={postMedia.some((m) => m.kind === 'image')}
                blocker={
                  dirty
                    ? 'Salva prima le modifiche (pulsante in alto).'
                    : videoBusy
                      ? 'Il montaggio del video è in corso: aspetta che finisca.'
                      : state.video && !videoExported
                        ? 'Il video non è ancora nel post: crealo prima di programmare.'
                        : state.design && !state.video && !exported
                          ? 'La grafica non è ancora nel post: esportala prima di programmare.'
                          : null
                }
                onGraphic={() => setStep('grafica')}
                onDone={() => setStep('uscite')}
              />
            )}

            {step === 'uscite' && <StudioOutputs item={item} publications={publications} onSchedule={() => setStep('quando')} />}
          </Box>
        </Card>

        {!(step === 'grafica' && (visual === 'video' ? draft.video : draft.design)) && <Box sx={{ overflowY: 'auto' }}>{preview}</Box>}
      </Box>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

/** Versioni in un menu: chi le ha fatte, cosa cambiano, e il ritorno a una precedente. */
function VersionsMenu({ versions, versionN, busy, onRestore }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Button color="inherit" variant="outlined" onClick={(e) => setAnchor(e.currentTarget)} startIcon={<Iconify icon="solar:history-bold" />}>
        Versione {versionN || 1}
      </Button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Stack spacing={1} sx={{ p: 1.5, width: 320, maxHeight: 440, overflowY: 'auto' }}>
          {versions.map((v) => (
            <Box key={v.n} sx={{ p: 1.25, borderRadius: 1, border: 1, borderColor: v.n === versionN ? 'primary.main' : 'divider', bgcolor: v.n === versionN ? 'action.selected' : 'transparent' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                  Versione {v.n}
                </Typography>
                <Label color={v.author === 'ai' ? 'info' : 'default'} variant="soft">
                  {v.author === 'ai' ? 'AI' : 'Tu'}
                </Label>
              </Stack>
              <Typography variant="body2">{v.summary}</Typography>
              <Stack direction="row" sx={{ alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
                  {time(v.createdAt)}
                </Typography>
                {v.n !== versionN && (
                  <Button size="small" onClick={() => (onRestore(v.n), setAnchor(null))} disabled={busy}>
                    Torna a questa
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Popover>
    </>
  );
}

// ----------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const tomorrowAt = (h) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return localInput(d);
};
/** Prossimo giorno con quella fascia oraria (da oggi in avanti). */
function nextSlot(slot) {
  const d = new Date();
  d.setHours(slot.hour, 0, 0, 0);
  while (d.getDay() !== slot.day || d < new Date()) d.setDate(d.getDate() + 1);
  return localInput(d);
}

/** Passo «Quando e dove»: profili, data e ora, poi Programma o Pubblica ora. Tutto in una schermata. */
function StudioPublish({ item, clientId, hasMedia, hasImage, blocker, onGraphic, onDone }) {
  const router = useRouter();
  const [targets, setTargets] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [when, setWhen] = useState('data');
  const [at, setAt] = useState(() => (item.scheduledAt && new Date(item.scheduledAt) > new Date() ? item.scheduledAt : tomorrowAt(18)));
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    postTargets(clientId).then((t) => {
      if (!alive) return;
      setTargets(t);
      setChosen(t.channels.map((c) => c.id));
    });
    return () => {
      alive = false;
    };
  }, [clientId]);

  const chosenChannels = (targets?.channels ?? []).filter((c) => chosen.includes(c.id));
  // Già approvato (dal cliente o da un collega): si programma direttamente
  const needsApproval = !!targets && item.status !== 'approvato' && (targets.approvalEnabled || !targets.canPublish);
  const missing = blocker
    ? blocker
    : !chosen.length
      ? 'Scegli almeno un profilo'
      : chosenChannels.some((c) => c.platform === 'instagram') && !hasMedia
        ? 'Instagram richiede almeno una foto o un video nel post'
        : chosenChannels.some((c) => c.platform === 'pinterest') && !hasImage
          ? 'Pinterest richiede almeno una foto nel post'
          : when === 'data' && (!at || new Date(at) < new Date())
            ? 'Scegli una data futura'
            : null;

  const submit = () =>
    start(async () => {
      const r = await publishFromStudio({ itemId: item.id, channelIds: chosen, when, scheduledAt: when === 'data' ? new Date(at).toISOString() : undefined });
      if (r.error) return toast.error(r.error);
      toast.success(r.pending ? 'Mandato in approvazione: uscirà quando sarà approvato' : when === 'ora' ? `Pubblicazione avviata${r.dryRun ? ' (simulazione)' : ''}` : `Programmato${r.dryRun ? ' (simulazione)' : ''}`);
      router.refresh();
      onDone();
    });

  if (!targets) return <LinearProgress />;

  return (
    <Stack spacing={2.5}>
      {blocker && (
        <Alert severity="warning" action={blocker.includes('grafica') ? <Button color="inherit" size="small" onClick={onGraphic}>Vai alla grafica</Button> : undefined}>
          {blocker}
        </Alert>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Dove esce
        </Typography>
        {targets.channels.length ? (
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {targets.channels.map((c) => (
              <Stack key={c.id} direction="row" spacing={1} component="label" sx={{ alignItems: 'center', p: 0.75, pr: 1.5, borderRadius: 1, border: 1, borderColor: chosen.includes(c.id) ? 'primary.main' : 'divider', cursor: 'pointer' }}>
                <Checkbox size="small" checked={chosen.includes(c.id)} onChange={(e) => setChosen((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))} />
                <Iconify icon={PLATFORM_INFO[c.platform]?.icon} width={20} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {c.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="div">
                    {PLATFORM_INFO[c.platform]?.label ?? c.platform} · @{c.handle}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Box>
        ) : (
          <Alert severity="warning">Il cliente non ha ancora profili collegati: collegali da Canali.</Alert>
        )}
        {targets.tiktok && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
            TikTok si programma dalla scheda completa: chiede di confermare le impostazioni di ogni video.
          </Typography>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Quando
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <ToggleButtonGroup exclusive size="small" value={when} onChange={(_, v) => v && setWhen(v)} sx={{ flexShrink: 0, '& .MuiToggleButton-root': { whiteSpace: 'nowrap' } }}>
            <ToggleButton value="data">In una data</ToggleButton>
            <ToggleButton value="ora">Pubblica ora</ToggleButton>
          </ToggleButtonGroup>
          {when === 'data' && <TextField type="datetime-local" size="small" label="Data e ora (ora italiana)" value={at} onChange={(e) => setAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />}
        </Stack>
        {when === 'data' && !!targets.bestTimes?.length && (
          <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Orari migliori:
            </Typography>
            {targets.bestTimes.map((t) => (
              <Button key={t.label} size="small" variant="outlined" color="inherit" onClick={() => setAt(nextSlot(t))}>
                {t.label}
              </Button>
            ))}
          </Stack>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          {when === 'ora' ? 'Esce adesso sui profili scelti.' : 'Esce alla data e all\'ora scelte; puoi cambiarle fino all\'uscita.'}
        </Typography>
      </Box>

      {needsApproval && (
        <Alert severity="info">
          {targets.approvalEnabled ? 'Per questo cliente è attiva l\'approvazione via link: il post uscirà dopo il suo ok.' : 'Non sei abilitato a pubblicare: il post andrà in «Da approvare» per un collega.'}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Button variant="contained" size="large" onClick={submit} loading={busy} disabled={!!missing} startIcon={<Iconify icon={when === 'ora' ? 'custom:send-fill' : 'solar:calendar-date-bold'} />}>
          {needsApproval ? 'Manda in approvazione' : when === 'ora' ? 'Pubblica ora' : 'Programma'}
        </Button>
        {missing && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {missing}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}

// ----------------------------------------------------------------------

const PUB_STATUS = {
  programmata: { label: 'Programmata', color: 'info' },
  in_corso: { label: 'In uscita', color: 'warning' },
  pubblicata: { label: 'Pubblicata', color: 'success' },
  errore: { label: 'Non riuscita', color: 'error' },
  annullata: { label: 'Annullata', color: 'default' },
};

/** Passo «Uscite»: dove è programmato o uscito il post, con gli eventuali errori. */
function StudioOutputs({ item, publications, onSchedule }) {
  const itemId = item.id;
  if (!publications.length && item.status === 'da_approvare') {
    return (
      <Alert severity="info">
        In attesa di approvazione{item.scheduledAt ? `, con uscita prevista il ${time(item.scheduledAt)}` : ''}. Quando il cliente approva, torna in «Quando e dove» e premi «Programma».
      </Alert>
    );
  }
  if (!publications.length) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Il post non è ancora programmato su nessun profilo.
        </Typography>
        <Button variant="contained" onClick={onSchedule}>
          Vai a «Quando e dove»
        </Button>
      </Stack>
    );
  }
  return (
    <Stack spacing={1.5}>
      {publications.map((p) => (
        <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider' }}>
          <Iconify icon={PLATFORM_INFO[p.platform]?.icon} width={22} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              @{p.handle}
            </Typography>
            <Typography variant="caption" sx={{ color: p.status === 'errore' ? 'error.main' : 'text.secondary' }} component="div">
              {p.status === 'pubblicata' ? `Uscita il ${time(p.publishedAt)}` : p.status === 'errore' ? p.error : `Prevista il ${time(p.scheduledAt)}`}
            </Typography>
          </Box>
          <Label color={PUB_STATUS[p.status]?.color ?? 'default'} variant="soft">
            {PUB_STATUS[p.status]?.label ?? p.status}
          </Label>
          {p.permalink && (
            <Button size="small" href={p.permalink} target="_blank" rel="noopener" endIcon={<Iconify icon="eva:external-link-fill" />}>
              Apri
            </Button>
          )}
        </Stack>
      ))}
      <Button href={`/pubblicazioni/${itemId}#pubblica`} color="inherit" size="small" sx={{ alignSelf: 'flex-start' }}>
        Riprova, annulla o aggiungi TikTok dalla scheda completa
      </Button>
    </Stack>
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
    <Card sx={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', minHeight: 360 }}>
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
          Invia all&apos;AI
        </Button>
      </Box>
    </Card>
  );
}

// ----------------------------------------------------------------------

function StudioMaterial({ itemId, media, toMaterial, imagesAvailable, defaultAspect }) {
  const router = useRouter();
  const [progress, setProgress] = useState(null);
  const [imageDialog, setImageDialog] = useState(false);
  const [moving, startMove] = useTransition();

  const move = (m) =>
    startMove(async () => {
      const r = await moveStudioMedia({ itemId, mediaId: m.id, toPost: !m.inPost });
      if (r.error) toast.error(r.error);
      router.refresh();
    });

  const onFiles = async (files) => {
    for (const [i, file] of [...files].entries()) {
      try {
        setProgress(`Carico ${file.name} (${i + 1}/${files.length})…`);
        const prepared = file.type.startsWith('image/') ? await prepareImage(file) : { blob: file, type: file.type, name: file.name, ...(await videoSize(file)) };
        // Con una grafica, le foto nuove servono a comporla: vanno nel materiale, non direttamente nel post
        await upload(itemId, prepared, () => undefined, toMaterial ? { materiale: '1' } : {});
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
          File {media.length > 0 && `(${media.length})`}
        </Typography>
        <Tooltip title={imagesAvailable ? 'Crea un\'immagine nuova o modifica una foto del progetto' : 'Serve la chiave Google AI in Impostazioni → Integrazioni'}>
          <span>
            <Button size="small" variant="outlined" color="inherit" onClick={() => setImageDialog(true)} disabled={!imagesAvailable} startIcon={<Iconify icon="solar:magic-stick-3-bold" />} sx={{ mr: 1 }}>
              Immagine AI
            </Button>
          </span>
        </Tooltip>
        <Button component="label" size="small" variant="outlined" startIcon={<Iconify icon="eva:cloud-upload-fill" />} disabled={!!progress}>
          Carica foto o video
          <input hidden type="file" multiple accept={ACCEPT} onChange={(e) => e.target.files?.length && onFiles(e.target.files).finally(() => (e.target.value = ''))} />
        </Button>
      </Stack>
      {progress && <LinearProgress sx={{ mb: 1 }} />}
      {media.length ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {media.map((m) => (
            <Box key={m.id} sx={{ width: 84, display: 'grid', gap: 0.5, justifyItems: 'center' }}>
              <Tooltip title={m.fileName}>
                <Box sx={{ width: 72, height: 72, borderRadius: 1, overflow: 'hidden', bgcolor: 'background.neutral', opacity: m.inPost ? 1 : 0.7, outline: m.inPost ? 2 : 0, outlineColor: 'primary.main' }}>
                  {m.kind === 'video' ? (
                    <Box component="video" src={m.url} muted sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                  ) : m.kind === 'audio' ? (
                    <Box sx={{ width: 1, height: 1, display: 'grid', placeItems: 'center' }}>
                      <Iconify icon="solar:music-note-bold" width={28} sx={{ color: 'text.secondary' }} />
                    </Box>
                  ) : (
                    <Box component="img" src={m.url} alt="" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                  )}
                </Box>
              </Tooltip>
              <Tooltip title={m.inPost ? 'Esce con il post: tocca per spostarlo nel materiale' : 'Solo materiale di lavoro: tocca per farlo uscire con il post'}>
                <Box component="span">
                  <Label component="button" type="button" onClick={() => move(m)} disabled={moving} color={m.inPost ? 'primary' : 'default'} variant="soft" sx={{ cursor: 'pointer', border: 0 }}>
                    {m.origin === 'grafica' ? 'Grafica' : m.origin === 'video' ? 'Montaggio' : m.inPost ? 'Nel post' : m.kind === 'audio' ? 'Musica' : m.origin === 'ai' ? 'Immagine AI' : 'Materiale'}
                  </Label>
                </Box>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          L&apos;AI vede i file caricati (tipo, misure, durata) e li usa per formato, testo e grafica. I file «Nel post» escono con il post; il «Materiale» serve solo a comporre la grafica.
        </Typography>
      )}
      {imageDialog && <AiImageDialog itemId={itemId} photos={media.filter((m) => m.kind === 'image')} defaultAspect={defaultAspect} onClose={() => setImageDialog(false)} />}
    </Box>
  );
}

// ----------------------------------------------------------------------

const ASPECTS = [
  ['4:5', 'Verticale 4:5'],
  ['1:1', 'Quadrata 1:1'],
  ['9:16', 'Storia o reel 9:16'],
  ['16:9', 'Orizzontale 16:9'],
];
const MAX_REFERENCES = 3;

/** Immagine AI: nuova da una descrizione, oppure modifica di fino a 3 foto del progetto. Finisce nel materiale. */
function AiImageDialog({ itemId, photos, defaultAspect, onClose }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [refs, setRefs] = useState([]);
  const [aspect, setAspect] = useState(defaultAspect);
  const [busy, start] = useTransition();

  const toggle = (id) => setRefs((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length < MAX_REFERENCES ? [...r, id] : r));
  const submit = () =>
    start(async () => {
      const r = await generateStudioImage({ itemId, prompt, referenceIds: refs, aspectRatio: aspect });
      if (r.error) return toast.error(r.error);
      toast.success(`Immagine pronta nel materiale (${eur(r.costEur)})`);
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Immagine AI</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={refs.length ? 'Cosa cambiare nelle foto scelte' : 'Cosa deve mostrare'}
            placeholder={refs.length ? 'es. metti il vaso su un tavolo di legno chiaro, luce calda del mattino, sfondo sfocato' : 'es. vasi in ceramica artigianale su una mensola, luce naturale, stile fotografico editoriale'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            autoFocus
            fullWidth
          />
          {photos.length > 0 && (
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Foto da modificare o da usare come riferimento (facoltative, al massimo {MAX_REFERENCES}): il prodotto resta fedele all&apos;originale.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
                {photos.map((m) => (
                  <Box key={m.id} component="label" sx={{ position: 'relative', width: 72, height: 72, borderRadius: 1, overflow: 'hidden', cursor: 'pointer', outline: refs.includes(m.id) ? 3 : 0, outlineColor: 'primary.main' }}>
                    <Box component="img" src={m.url} alt={m.fileName} sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                    <Checkbox checked={refs.includes(m.id)} onChange={() => toggle(m.id)} size="small" sx={{ position: 'absolute', top: -4, right: -4, color: 'common.white' }} slotProps={{ input: { 'aria-label': `Usa «${m.fileName}»` } }} />
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
          <TextField select label="Proporzione" size="small" value={aspect} onChange={(e) => setAspect(e.target.value)} sx={{ maxWidth: 240 }}>
            {ASPECTS.map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Costa pochi centesimi (circa 0,05 $ a listino) e rientra nel tetto mensile delle immagini AI. L&apos;immagine finisce nel materiale: usala nella grafica o spostala nel post.
          </Typography>
          {busy && <LinearProgress />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={busy}>
          Annulla
        </Button>
        <Button variant="contained" onClick={submit} loading={busy} disabled={prompt.trim().length < 5} startIcon={<Iconify icon="solar:magic-stick-3-bold" />}>
          {refs.length ? 'Modifica' : 'Crea'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

/** Nessuna grafica ancora: si sceglie la misura (e le pagine per un carosello), oppure la si chiede all'AI. */
function NewDesign({ format, onCreate }) {
  const [size, setSize] = useState(format === 'storia' || format === 'reel' ? 'storia' : 'verticale');
  const [pages, setPages] = useState(format === 'carosello' ? 3 : 1);
  return (
    <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Crea una grafica con i colori e il logo del cliente, poi modificala qui. Oppure chiedila all&apos;AI in chat, es. «fai un carosello di 4 slide con i punti del testo».
      </Typography>
      <Stack direction="row" spacing={1.5}>
        <TextField select label="Misura" size="small" value={size} onChange={(e) => setSize(e.target.value)} sx={{ minWidth: 200 }}>
          {Object.entries(DESIGN_SIZES).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField type="number" label="Pagine" size="small" value={pages} onChange={(e) => setPages(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} slotProps={{ htmlInput: { min: 1, max: 10 } }} sx={{ width: 100 }} />
      </Stack>
      <Button variant="contained" onClick={() => onCreate(size, pages)} startIcon={<Iconify icon="solar:pallete-2-bold" />} sx={{ alignSelf: 'flex-start' }}>
        Crea grafica
      </Button>
    </Stack>
  );
}

// ----------------------------------------------------------------------

/** Passo «Video»: montaggio dei video del progetto, con lo stato dell'ultimo video creato. */
function VideoStep({ draft, state, dirty, videos, tracks, output, exported, onChange, onUploadMusic, uploadingMusic, onSkip, material }) {
  if (!draft.video) {
    const starter = starterVideo(videos, draft.format === 'post' ? 'verticale' : 'storia');
    return (
      <Stack spacing={2.5}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Monta i video del progetto: scegli i pezzi migliori, aggiungi scritte e musica, e 2Target crea il video verticale pronto per i social. Oppure chiedilo all&apos;AI in chat, es. «fai un reel di 15 secondi con i momenti migliori».
        </Typography>
        {starter ? (
          <Button variant="contained" onClick={() => onChange(starter)} startIcon={<Iconify icon="solar:videocamera-record-bold" />} sx={{ alignSelf: 'flex-start' }}>
            Crea un montaggio con {videos.length === 1 ? 'il video caricato' : `i ${videos.length} video caricati`}
          </Button>
        ) : (
          <Alert severity="info">Carica prima uno o più video qui sotto: il montaggio parte da quelli.</Alert>
        )}
        {material}
        <Divider />
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
            Il video è già pronto così com&apos;è? Non serve montarlo: si pubblica il file del post.
          </Typography>
          <Button variant="outlined" onClick={onSkip}>
            Salta
          </Button>
        </Stack>
      </Stack>
    );
  }
  return (
    <Stack spacing={1.5}>
      {state.video && !dirty && (
        <Alert severity={output?.processState === 'errore' ? 'error' : exported ? 'success' : output?.processState === 'in_lavorazione' ? 'info' : 'warning'} sx={{ py: 0 }}>
          {output?.processState === 'errore'
            ? `${output.processNote ?? 'Montaggio non riuscito'}: premi di nuovo «Crea il video».`
            : exported
              ? 'Il video è nel post: è quello che verrà pubblicato.'
              : output?.processState === 'in_lavorazione'
                ? 'Montaggio in corso sul server: di solito bastano pochi secondi per ogni secondo di video.'
                : 'Il video non è ancora nel post: premi «Crea il video» in alto.'}
        </Alert>
      )}
      <VideoEditor video={draft.video} onChange={onChange} videos={videos} tracks={tracks} onUploadMusic={onUploadMusic} uploading={uploadingMusic} />
      <Button color="inherit" size="small" onClick={() => onChange(null)} sx={{ alignSelf: 'flex-start' }} startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}>
        Togli il montaggio
      </Button>
      {material}
    </Stack>
  );
}
