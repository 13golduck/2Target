'use client';

import { useRef, useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Step from '@mui/material/Step';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Stepper from '@mui/material/Stepper';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import StepLabel from '@mui/material/StepLabel';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { useRouter, usePathname } from 'src/routes/hooks';
import { PLATFORM_INFO, formatName } from 'src/lib/platforms';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { PostPreview } from '../pubblicazioni/[id]/post-preview';
import { upload, videoSize, prepareImage } from '../pubblicazioni/media-upload';
import { createStudioProject } from '../studio-actions';
import { mediaState, postTargets, writeCaption, createBlankItem, createQuickPost, finishQuickPost } from '../create-post-actions';

// ----------------------------------------------------------------------
// «Crea post»: prima si sceglie il cliente e il modo (Semplice, Avanzato, Con l'AI), poi:
// Semplice = tre passi al posto della scheda completa.
//   1. Dove: cliente e profili collegati (già spuntati)
//   2. Cosa: testo (anche scritto dall'AI) e foto/video, con l'anteprima accanto
//   3. Quando: subito o in una data, con gli orari migliori del cliente
// Il formato si deduce dai file; i dettagli (script, sponsorizzata…) restano nella scheda completa.

const STEPS = ['Dove', 'Cosa', 'Quando'];

const MODES = [
  { value: 'semplice', title: 'Semplice', icon: 'solar:bolt-bold-duotone', text: 'Ho già foto o video. Tre passi: dove, cosa, quando.' },
  { value: 'avanzato', title: 'Avanzato', icon: 'solar:document-text-bold-duotone', text: 'Scheda completa: piano editoriale, script, sponsorizzata, coautori.' },
  { value: 'ai', title: "Con l'AI", icon: 'solar:atom-bold-duotone', text: "Descrivi l'idea: l'AI prepara il post e lo correggete insieme nello Studio." },
];

// L'ultimo modo usato resta evidenziato la volta dopo (solo una comodità: senza memoria si parte da «Semplice»)
const MODE_KEY = 'crea-post:modo';
const readMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) ?? 'semplice';
  } catch {
    return 'semplice';
  }
};
const rememberMode = (m) => {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // memoria del browser non disponibile: nessun problema
  }
};
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Prossimo giorno con quella fascia oraria (da oggi in avanti). */
function nextSlot(slot) {
  const d = new Date();
  d.setHours(slot.hour, 0, 0, 0);
  while (d.getDay() !== slot.day || d < new Date()) d.setDate(d.getDate() + 1);
  return localInput(d);
}

const tomorrowAt = (h) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return localInput(d);
};

export function CreatePostButton({ clients }) {
  const [open, setOpen] = useState(false);
  if (!clients.length) return null;
  return (
    <>
      <Button variant="contained" size="small" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setOpen(true)}>
        Crea post
      </Button>
      {open && <CreatePostDialog clients={clients} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreatePostDialog({ clients, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  // Dentro la pagina di un cliente si parte da quel cliente
  const fromPath = Number(pathname.match(/^\/clienti\/(\d+)/)?.[1]);
  const [clientId, setClientId] = useState(clients.some((c) => c.id === fromPath) ? fromPath : clients.length === 1 ? clients[0].id : '');
  const [targets, setTargets] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [screen, setScreen] = useState('modo'); // 'modo', poi 'semplice' o 'ai'
  const [brief, setBrief] = useState('');
  const [lastMode] = useState(readMode);
  const [step, setStep] = useState(0);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [idea, setIdea] = useState('');
  const [files, setFiles] = useState([]); // { file, kind, url }
  const [when, setWhen] = useState('data');
  const [at, setAt] = useState(tomorrowAt(18));
  const [progress, setProgress] = useState(null); // testo dello stato durante l'invio
  const [busy, start] = useTransition();
  const [writing, startWriting] = useTransition();

  const client = clients.find((c) => c.id === clientId);
  const format = files.length >= 2 ? 'carosello' : files[0]?.kind === 'video' ? 'reel' : 'post';
  const chosenChannels = (targets?.channels ?? []).filter((c) => chosen.includes(c.id));

  // Profili del cliente: si caricano quando lo si sceglie, tutti spuntati
  useEffect(() => {
    if (!clientId) return;
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

  // Gli indirizzi temporanei delle anteprime si liberano alla chiusura della finestra (non a ogni modifica)
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const addFiles = (list) => {
    const next = [...list]
      .filter((f) => ACCEPT.includes(f.type))
      .map((f) => ({ file: f, kind: f.type.startsWith('video') ? 'video' : 'image', url: URL.createObjectURL(f) }));
    if (next.length < list.length) toast.warning('Alcuni file non sono foto (JPEG, PNG) o video (MP4, MOV): li ho saltati');
    setFiles((prev) => [...prev, ...next].slice(0, 10));
  };

  const removeFile = (n) => {
    URL.revokeObjectURL(files[n].url);
    setFiles((prev) => prev.filter((_, i) => i !== n));
  };

  const aiWrite = () =>
    startWriting(async () => {
      const r = await writeCaption({ clientId, idea, platforms: chosenChannels.map((c) => c.platform), format });
      if (r.error) return toast.error(r.error);
      setCaption(r.caption);
      setHashtags(r.hashtags);
      toast.success('Testo pronto: rileggilo e correggilo se serve');
    });

  const chooseMode = (m) => {
    if (!clientId) return toast.info('Scegli prima il cliente');
    rememberMode(m);
    if (m === 'semplice' || m === 'ai') return setScreen(m);
    start(async () => {
      const r = await createBlankItem({ clientId });
      if (r.error) return toast.error(r.error);
      onClose();
      router.push(`/pubblicazioni/${r.itemId}`);
    });
  };

  const openStudio = () =>
    start(async () => {
      const r = await createStudioProject({ clientId, brief });
      if (r.error) return toast.error(r.error);
      onClose();
      router.push(`/studio/${r.itemId}`);
    });

  // Cosa manca per andare avanti, detto in parole semplici
  const missing =
    step === 0
      ? !clientId
        ? 'Scegli il cliente'
        : !chosen.length
          ? 'Scegli almeno un profilo'
          : null
      : step === 1
        ? !caption.trim() && !files.length
          ? 'Scrivi il testo o carica una foto o un video'
          : chosenChannels.some((c) => c.platform === 'instagram') && !files.length
            ? 'Instagram richiede almeno una foto o un video'
            : chosenChannels.some((c) => c.platform === 'pinterest') && !files.some((f) => f.kind === 'image')
              ? 'Pinterest richiede almeno una foto'
              : null
        : when === 'data' && (!at || new Date(at) < new Date())
          ? 'Scegli una data futura'
          : null;

  const submit = () =>
    start(async () => {
      setProgress('Creo la pubblicazione…');
      const created = await createQuickPost({
        clientId,
        caption: caption.trim(),
        hashtags: hashtags.trim() || undefined,
        files: files.map((f) => ({ kind: f.kind })),
        channelIds: chosen,
        when,
        scheduledAt: when === 'data' ? new Date(at).toISOString() : undefined,
      });
      if (created.error) {
        setProgress(null);
        return toast.error(created.error);
      }
      const { itemId } = created;
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setProgress(`Carico il file ${i + 1} di ${files.length}…`);
          const prepared = f.kind === 'image' ? await prepareImage(f.file) : { blob: f.file, type: f.file.type, name: f.file.name, ...(await videoSize(f.file)) };
          await upload(itemId, prepared, () => undefined);
        }
        // I video si adattano ai social sul server: si aspetta che siano pronti (al massimo ~3 minuti)
        for (let i = 0; i < 60; i++) {
          const st = await mediaState(itemId);
          if (st.failed) throw new Error('Un video non si è potuto preparare per i social: aprilo nella scheda e ricaricalo');
          if (!st.busy) break;
          setProgress('Preparo il video per i social…');
          await new Promise((r) => setTimeout(r, 3000));
        }
        setProgress(when === 'ora' ? 'Pubblico…' : 'Programmo…');
        const done = await finishQuickPost({ itemId, channelIds: chosen, when });
        if (done.error) throw new Error(done.error);
        toast.success(
          done.pending
            ? 'Post creato e mandato in approvazione: uscirà quando sarà approvato'
            : when === 'ora'
              ? `Pubblicazione avviata${done.dryRun ? ' (simulazione)' : ''}`
              : `Programmato${done.dryRun ? ' (simulazione)' : ''}`
        );
        onClose();
        router.refresh();
      } catch (e) {
        // La pubblicazione esiste già: si apre la scheda completa per sistemare il punto che non va
        toast.error(`${e.message}. Ti porto alla scheda per sistemarlo.`);
        onClose();
        router.push(`/pubblicazioni/${itemId}`);
      } finally {
        setProgress(null);
      }
    });

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Crea post</DialogTitle>
      <DialogContent>
        {screen === 'modo' && <ModeChooser clients={clients} clientId={clientId} onClient={setClientId} lastMode={lastMode} busy={busy} onChoose={chooseMode} />}

        {screen === 'ai' && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Scrivi cosa ti serve per <b>{client?.name}</b>. Nello Studio l&apos;AI prepara titolo, testo, hashtag e formato; poi correggi a mano o chiedi modifiche in chat. Foto e video li carichi lì.
            </Typography>
            <TextField
              label="Cosa ti serve?"
              placeholder="es. post per la promo di ottobre: -20% sui trattamenti viso fino al 31, tono caldo, invito a prenotare"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              multiline
              minRows={4}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              autoFocus
              fullWidth
            />
            {busy && <LinearProgress />}
          </Stack>
        )}

        {screen === 'semplice' && <>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 0 && (
          <Stack spacing={2.5}>
            <TextField select label="Cliente" value={clientId} onChange={(e) => setClientId(Number(e.target.value))} fullWidth>
              {clients.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            {clientId && !targets && <LinearProgress />}
            {targets && (
              <>
                {targets.channels.length ? (
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Dove esce</Typography>
                    {targets.channels.map((c) => (
                      <Stack
                        key={c.id}
                        direction="row"
                        spacing={1.5}
                        component="label"
                        sx={{ alignItems: 'center', p: 1, borderRadius: 1, border: 1, borderColor: chosen.includes(c.id) ? 'primary.main' : 'divider', cursor: 'pointer' }}
                      >
                        <Checkbox checked={chosen.includes(c.id)} onChange={(e) => setChosen((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))} />
                        <Avatar src={c.pictureUrl ?? undefined} sx={{ width: 32, height: 32 }}>
                          {c.name.slice(0, 1)}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {c.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {PLATFORM_INFO[c.platform]?.label ?? c.platform} · @{c.handle}
                          </Typography>
                        </Box>
                        <Iconify icon={PLATFORM_INFO[c.platform]?.icon} width={22} />
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Alert
                    severity="warning"
                    action={
                      <Button color="inherit" size="small" onClick={() => router.push(`/clienti/${clientId}/canali`)}>
                        Vai a Canali
                      </Button>
                    }
                  >
                    Questo cliente non ha ancora profili collegati per pubblicare.
                  </Alert>
                )}
                {targets.tiktok && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Per TikTok usa la scheda completa: TikTok chiede di confermare le impostazioni di ogni video.</Typography>}
                {targets.approvalEnabled && <Alert severity="info">Per questo cliente è attiva l&apos;approvazione via link: il post uscirà dopo il suo ok.</Alert>}
                {!targets.canPublish && <Alert severity="info">Non sei abilitato a pubblicare: il post andrà in «Da approvare» per un collega.</Alert>}
              </>
            )}
          </Stack>
        )}

        {step === 1 && (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    label="Di cosa parla? (per l'AI)"
                    placeholder="es. apertura sabato, sconto 10% sui vasi"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <Button variant="outlined" onClick={aiWrite} loading={writing} disabled={idea.trim().length < 3} startIcon={<Iconify icon="solar:atom-bold-duotone" />} sx={{ flexShrink: 0 }}>
                    Scrivi con l&apos;AI
                  </Button>
                </Stack>
                <TextField label="Testo del post" value={caption} onChange={(e) => setCaption(e.target.value)} multiline minRows={6} fullWidth helperText={`${caption.length} caratteri`} />
                <TextField label="Hashtag (facoltativi)" value={hashtags} onChange={(e) => setHashtags(e.target.value)} size="small" fullWidth />
                <Box
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5, textAlign: 'center' }}
                >
                  <Button component="label" variant="soft" startIcon={<Iconify icon="eva:cloud-upload-fill" />}>
                    Aggiungi foto o video
                    <input hidden type="file" multiple accept={ACCEPT} onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
                  </Button>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                    oppure trascinali qui · un video = reel, più file = carosello
                  </Typography>
                  {!!files.length && (
                    <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1, justifyContent: 'center' }}>
                      {files.map((f, n) => (
                        <Box key={f.url} sx={{ position: 'relative', width: 72, height: 72, borderRadius: 1, overflow: 'hidden', bgcolor: 'background.neutral' }}>
                          {f.kind === 'video' ? (
                            <Box component="video" src={f.url} muted sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                          ) : (
                            <Box component="img" src={f.url} alt="" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                          )}
                          <IconButton size="small" aria-label="Togli il file" onClick={() => removeFile(n)} sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', p: 0.25 }}>
                            <Iconify icon="mingcute:close-line" width={14} />
                          </IconButton>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Formato: <b>{formatName(format)}</b>
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <PostPreview
                clientName={client?.name ?? ''}
                logo={client?.logo}
                format={format}
                platform={chosenChannels[0]?.platform ?? 'instagram'}
                caption={caption}
                hashtags={hashtags}
                media={files.map((f, n) => ({ id: n, kind: f.kind, url: f.url }))}
                channels={chosenChannels}
                emptyText="Aggiungi foto o video qui a sinistra"
              />
            </Grid>
          </Grid>
        )}

        {step === 2 && (
          <Stack spacing={2.5}>
            <ToggleButtonGroup exclusive value={when} onChange={(_, v) => v && setWhen(v)} fullWidth>
              <ToggleButton value="data">In una data</ToggleButton>
              <ToggleButton value="ora">Pubblica ora</ToggleButton>
            </ToggleButtonGroup>
            {when === 'data' && (
              <>
                <TextField type="datetime-local" label="Data e ora (ora italiana)" value={at} onChange={(e) => setAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                {!!targets?.bestTimes?.length && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Orari migliori per questo cliente (dagli ultimi 6 mesi):
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 1 }}>
                      {targets.bestTimes.map((t) => (
                        <Button key={t.label} size="small" variant="outlined" color="inherit" onClick={() => setAt(nextSlot(t))}>
                          {t.label}
                        </Button>
                      ))}
                    </Stack>
                  </Box>
                )}
              </>
            )}
            <Alert severity="info" icon={false}>
              {chosenChannels.length} {chosenChannels.length === 1 ? 'profilo' : 'profili'}: {chosenChannels.map((c) => PLATFORM_INFO[c.platform]?.label ?? c.platform).join(', ')} · {formatName(format)}
              {files.length ? ` con ${files.length} ${files.length === 1 ? 'file' : 'file'}` : ' di solo testo'}
            </Alert>
          </Stack>
        )}

        </>}

        {progress && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {progress}
            </Typography>
            <LinearProgress />
          </Box>
        )}
      </DialogContent>
      {screen === 'modo' ? (
        <DialogActions>
          <Button color="inherit" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
        </DialogActions>
      ) : screen === 'ai' ? (
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button color="inherit" onClick={() => setScreen('modo')} disabled={busy}>
            Indietro
          </Button>
          <Button variant="contained" onClick={openStudio} loading={busy} disabled={brief.trim().length < 5} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
            Apri lo Studio
          </Button>
        </DialogActions>
      ) : (
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Button color="inherit" onClick={step === 0 ? () => setScreen('modo') : () => setStep(step - 1)} disabled={busy}>
          Indietro
        </Button>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          {missing && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {missing}
            </Typography>
          )}
          {step < 2 ? (
            <Button variant="contained" onClick={() => setStep(step + 1)} disabled={!!missing}>
              Avanti
            </Button>
          ) : (
            <Button variant="contained" onClick={submit} loading={busy} disabled={!!missing}>
              {when === 'ora' ? 'Pubblica ora' : 'Programma'}
            </Button>
          )}
        </Stack>
      </DialogActions>
      )}
    </Dialog>
  );
}

/** Primo schermo: cliente e modo. L'ultimo modo usato è evidenziato. */
function ModeChooser({ clients, clientId, onClient, lastMode, busy, onChoose }) {
  const studioOn = clients.find((c) => c.id === clientId)?.studio !== false;
  const modes = MODES.filter((m) => m.value !== 'ai' || studioOn);
  return (
    <Stack spacing={3} sx={{ pt: 1 }}>
      <TextField select label="Cliente" value={clientId} onChange={(e) => onClient(Number(e.target.value))} fullWidth>
        {clients.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: `repeat(${modes.length}, 1fr)` } }}>
        {modes.map((m) => (
          <Box
            key={m.value}
            component="button"
            type="button"
            onClick={() => onChoose(m.value)}
            disabled={busy}
            sx={{
              p: 2.5,
              display: 'grid',
              gap: 1,
              alignContent: 'start',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              cursor: 'pointer',
              bgcolor: 'background.paper',
              borderRadius: 1.5,
              border: 2,
              borderColor: m.value === lastMode ? 'primary.main' : 'divider',
              '&:hover': { borderColor: 'primary.main' },
              '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <Iconify icon={m.icon} width={28} sx={{ color: 'primary.main' }} />
            <Typography variant="subtitle1">{m.title}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {m.text}
            </Typography>
          </Box>
        ))}
      </Box>
      {busy && <LinearProgress />}
    </Stack>
  );
}
