'use client';

import { ErrorText } from 'src/components/error-text';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { AutoRefresh } from 'src/components/auto-refresh';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { askConfirm } from 'src/components/custom-dialog';

import { cancelPublication, deleteMedia, reorderMedia, retryPublication, schedulePublication } from '../../publish-actions';

import { PLATFORM_INFO } from 'src/lib/platforms';

import { EMPTY_TIKTOK, TikTokSettings } from './tiktok-settings';

// ----------------------------------------------------------------------
// Pubblicazione della scheda sui profili del cliente (Facebook, Instagram, TikTok, LinkedIn, Threads, Pinterest, YouTube, scheda Google).
// Si vedono e si scelgono SOLO i profili collegati a questo cliente, con foto e nome: niente profili sbagliati.

const PLATFORM = PLATFORM_INFO;

const PUB_STATUS = {
  programmata: { label: 'Programmata', color: 'info' },
  in_corso: { label: 'In pubblicazione…', color: 'warning' },
  pubblicata: { label: 'Pubblicata', color: 'success' },
  errore: { label: 'Non riuscita', color: 'error' },
  annullata: { label: 'Annullata', color: 'default' },
};

// Instagram accetta solo JPEG: le immagini si convertono nel browser prima del caricamento
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  if (file.type === 'image/jpeg') return { blob: file, type: 'image/jpeg', width, height, name: file.name };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  return { blob, type: 'image/jpeg', width, height, name: file.name.replace(/\.\w+$/, '.jpg') };
}

function videoSize(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve({ width: null, height: null });
    v.src = URL.createObjectURL(file);
  });
}

function upload(itemId, prepared, onProgress) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ scheda: itemId, nome: prepared.name });
    if (prepared.width) q.set('w', prepared.width);
    if (prepared.height) q.set('h', prepared.height);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/media/carica?${q}`);
    xhr.setRequestHeader('Content-Type', prepared.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* risposta non JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `Caricamento non riuscito (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Connessione interrotta durante il caricamento'));
    xhr.send(prepared.blob);
  });
}

function ChannelAvatar({ channel, size = 36 }) {
  const p = PLATFORM[channel.platform];
  return (
    <Box sx={{ position: 'relative', flexShrink: 0 }}>
      <Avatar src={channel.pictureUrl ?? undefined} alt={channel.name ?? channel.handle} sx={{ width: size, height: size }}>
        {(channel.name ?? channel.handle).slice(0, 1).toUpperCase()}
      </Avatar>
      <Box sx={{ position: 'absolute', right: -4, bottom: -4, bgcolor: 'background.paper', borderRadius: '50%', p: '2px', display: 'flex' }}>
        <Iconify icon={p.icon} width={14} />
      </Box>
    </Box>
  );
}

export function PublishPanel({ item, client, canPublish, dryRun, scheduledAt, scheduledFuture, channels, media, publications, preselect }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Post veloce da Canali: il profilo scelto arriva già selezionato
  const [selected, setSelected] = useState(() => (preselect && channels.some((c) => c.id === preselect && c.ready) ? [preselect] : []));
  const [progress, setProgress] = useState(null);
  const [tiktok, setTiktok] = useState(EMPTY_TIKTOK);
  const [tiktokValid, setTiktokValid] = useState(false);

  const byId = Object.fromEntries(channels.map((c) => [c.id, c]));
  const busyChannels = new Set(publications.filter((p) => ['programmata', 'in_corso', 'pubblicata'].includes(p.status)).map((p) => p.socialAccountId));
  const approved = item.status === 'approvato' || item.status === 'pubblicato';
  const when = scheduledAt ? new Date(scheduledAt) : null;
  const future = !!when && scheduledFuture;

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  // TikTok: le impostazioni si scelgono ogni volta (nessuna preselezione) e vanno completate prima dell'invio
  const tiktokChannel = selected.map((id) => byId[id]).find((c) => c?.platform === 'tiktok');
  const blocked = !!tiktokChannel && !tiktokValid;
  const caption = [item.caption?.trim(), item.hashtags?.trim()].filter(Boolean).join('\n\n');

  const onFiles = async (files) => {
    for (const [i, file] of [...files].entries()) {
      try {
        setProgress({ name: file.name, value: 0, index: i + 1, total: files.length });
        let prepared;
        if (file.type.startsWith('image/')) prepared = await prepareImage(file);
        else if (['video/mp4', 'video/quicktime'].includes(file.type)) prepared = { blob: file, type: file.type, name: file.name, ...(await videoSize(file)) };
        else throw new Error(`${file.name}: formato non supportato (foto JPEG/PNG, video MP4/MOV)`);
        await upload(item.id, prepared, (v) => setProgress((p) => ({ ...p, value: v })));
      } catch (e) {
        toast.error(e.message);
      }
    }
    setProgress(null);
    router.refresh();
  };

  const run = (fn, ok) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });

  const go = async (mode) => {
    const list = selected.map((id) => byId[id]);
    const ok = await askConfirm({
      tone: mode === 'ora' ? 'warning' : 'primary',
      title: mode === 'ora' ? 'Pubblicare adesso?' : 'Programmare la pubblicazione?',
      content: (
        <Box component="span" sx={{ display: 'block' }}>
          «{item.title}» uscirà {mode === 'ora' ? <b>subito</b> : <>il <b>{fmtDateTime(when)}</b></>} sui profili di <b>{client.name}</b>:
          {list.map((c) => (
            <Box component="span" key={c.id} sx={{ display: 'block', mt: 0.5 }}>
              • {PLATFORM[c.platform].label} <b>@{c.handle}</b>
              {c.name && c.name !== c.handle ? ` (${c.name})` : ''}
              {c.route === 'instagram' ? ' · Instagram diretto' : ''}
            </Box>
          ))}
          {tiktokChannel && (
            <Box component="span" sx={{ display: 'block', mt: 1 }}>
              TikTok: visibilità <b>{{ PUBLIC_TO_EVERYONE: 'tutti', MUTUAL_FOLLOW_FRIENDS: 'amici', FOLLOWER_OF_CREATOR: 'follower', SELF_ONLY: 'solo io' }[tiktok.privacyLevel] ?? tiktok.privacyLevel}</b>
              {tiktok.disclose ? ` · contenuto commerciale (${[tiktok.brandOrganic && 'il tuo brand', tiktok.brandContent && 'sponsorizzato'].filter(Boolean).join(' e ')})` : ''}
            </Box>
          )}
          {dryRun && (
            <Box component="span" sx={{ display: 'block', mt: 1, color: 'warning.dark' }}>
              Modalità simulazione: non verrà inviato nulla a Meta né a TikTok.
            </Box>
          )}
        </Box>
      ),
      confirmText: mode === 'ora' ? 'Pubblica ora' : 'Programma',
    });
    if (!ok) return;
    run(
      () => schedulePublication(item.id, selected, mode, tiktokChannel ? tiktok : undefined),
      mode === 'ora' ? (tiktokChannel ? 'Pubblicazione avviata: su TikTok il post può richiedere qualche minuto' : 'Pubblicazione avviata') : 'Pubblicazione programmata'
    );
    setSelected([]);
    setTiktok(EMPTY_TIKTOK);
  };

  const move = (index, dir) => {
    const ids = media.map((m) => m.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => reorderMedia(item.id, ids));
  };

  return (
    <Card id="pubblica" sx={preselect ? { border: 2, borderColor: 'primary.main' } : undefined}>
      {/* Video in conversione: la scheda si aggiorna da sola finché non è pronto (al massimo 15 minuti) */}
      <AutoRefresh active={media.some((m) => m.processState === 'in_lavorazione')} everyMs={5000} maxMs={15 * 60_000} />
      <CardHeader
        avatar={<Iconify icon="custom:send-fill" width={24} sx={{ color: 'primary.main' }} />}
        title="Pubblica sui profili del cliente"
        subheader={`Solo i profili collegati a ${client.name}: la scheda non può uscire altrove`}
      />
      <Box sx={{ p: 3, pt: 1 }}>
        {dryRun && (
          <Alert severity="warning" sx={{ mb: 2 }}>
<b>Modalità simulazione.</b> Il percorso è completo ma nulla viene inviato a Meta o TikTok (ambiente di prova).
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* File */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Foto e video {media.length > 0 && `(${media.length})`}
              </Typography>
              <Button component="label" size="small" variant="outlined" startIcon={<Iconify icon="eva:cloud-upload-fill" />} disabled={!!progress}>
                Carica
                <input hidden type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={(e) => e.target.files?.length && onFiles(e.target.files).finally(() => (e.target.value = ''))} />
              </Button>
            </Stack>
            {progress && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Carico {progress.name} ({progress.index}/{progress.total})…
                </Typography>
                <LinearProgress variant="determinate" value={Math.round(progress.value * 100)} />
              </Box>
            )}
            {media.length ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1.5 }}>
                {media.map((m, i) => (
                  <Box key={m.id} sx={{ position: 'relative', borderRadius: 1.5, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.neutral' }}>
                    <Box sx={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center' }}>
                      {m.kind === 'image' ? (
                        <Box component="img" src={m.url} alt={m.fileName} loading="lazy" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                      ) : (
                        <Box component="video" src={m.url} muted preload="metadata" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                      )}
                    </Box>
                    <Label sx={{ position: 'absolute', top: 6, left: 6 }}>{i + 1}</Label>
                    {m.kind === 'video' && <Iconify icon="solar:play-circle-bold" width={28} sx={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', color: 'common.white' }} />}
                    {m.processState === 'in_lavorazione' && (
                      <Tooltip title={m.processNote ?? 'Controllo del video in corso'}>
                        <Label color="info" sx={{ position: 'absolute', top: 6, right: 6 }}>In preparazione</Label>
                      </Tooltip>
                    )}
                    {m.processState === 'errore' && (
                      <Tooltip title={m.processNote ?? ''}>
                        <Label color="error" sx={{ position: 'absolute', top: 6, right: 6 }}>Da ricaricare</Label>
                      </Tooltip>
                    )}
                    {m.processState === 'pronto' && m.processNote && (
                      <Tooltip title={m.processNote}>
                        <Label color="success" sx={{ position: 'absolute', top: 6, right: 6 }}>Convertito</Label>
                      </Tooltip>
                    )}
                    <Stack direction="row" sx={{ px: 0.5, py: 0.25, alignItems: 'center', bgcolor: 'background.paper' }}>
                      <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }} title={m.fileName}>
                        {m.width && m.height ? `${m.width}×${m.height}` : m.fileName}
                        {m.durationSec ? ` · ${Math.round(m.durationSec)} s` : ''}
                      </Typography>
                      {media.length > 1 && (
                        <>
                          <IconButton size="small" disabled={i === 0 || pending} onClick={() => move(i, -1)}><Iconify icon="eva:arrow-ios-back-fill" width={16} /></IconButton>
                          <IconButton size="small" disabled={i === media.length - 1 || pending} onClick={() => move(i, 1)}><Iconify icon="eva:arrow-ios-forward-fill" width={16} /></IconButton>
                        </>
                      )}
                      <Tooltip title="Elimina">
                        <IconButton
                          size="small"
                          color="error"
                          disabled={pending}
                          onClick={async () => {
                            if (await askConfirm({ tone: 'error', title: 'Eliminare il file?', content: m.fileName, confirmText: 'Elimina' })) run(() => deleteMedia(m.id), 'File eliminato');
                          }}
                        >
                          <Iconify icon="solar:trash-bin-trash-bold" width={16} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                Carica le grafiche o il video definitivi. Le immagini diventano JPEG (richiesto da Instagram); per il carosello carica da 2 a 10 file e mettili in ordine.
              </Typography>
            )}
          </Grid>

          {/* Profili e invio */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Profili di {client.name}</Typography>
            {channels.length ? (
              <Stack spacing={1}>
                {channels.map((c) => {
                  const busy = busyChannels.has(c.id);
                  const disabled = !c.ready || busy || !canPublish;
                  const on = selected.includes(c.id);
                  return (
                    <Stack
                      key={c.id}
                      direction="row"
                      spacing={1.5}
                      onClick={() => !disabled && toggle(c.id)}
                      sx={{
                        p: 1.25,
                        borderRadius: 1.5,
                        alignItems: 'center',
                        border: 2,
                        borderColor: on ? 'primary.main' : 'divider',
                        bgcolor: on ? 'primary.lighter' : 'transparent',
                        cursor: disabled ? 'default' : 'pointer',
                        opacity: disabled && !busy ? 0.55 : 1,
                      }}
                    >
                      <ChannelAvatar channel={c} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>@{c.handle}</Typography>
                        <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                          {PLATFORM[c.platform].label}
                          {c.route === 'instagram' ? ' diretto' : ''}
                          {c.name && c.name !== c.handle ? ` · ${c.name}` : ''}
                        </Typography>
                        {!c.ready && c.problem && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>
                            {c.problem.replace(/^(è|non)/, (m) => m[0].toUpperCase() + m.slice(1))}
                          </Typography>
                        )}
                        {c.ready && c.contentProblem && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'error.main' }}>{c.contentProblem}</Typography>
                        )}
                        {c.ready &&
                          (c.warnings ?? []).map((w) => (
                            <Typography key={w} variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>{w}</Typography>
                          ))}
                      </Box>
                      {busy ? (
                        <Label color="info">Già in programma</Label>
                      ) : !c.ready ? (
                        <Label>Da collegare</Label>
                      ) : (
                        <Iconify icon={on ? 'solar:check-circle-bold' : 'solar:add-circle-bold'} width={22} sx={{ color: on ? 'primary.main' : 'text.disabled' }} />
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Nessun profilo Facebook, Instagram o TikTok collegato a {client.name}.
              </Typography>
            )}
            <Button size="small" href={`/clienti/${client.id}/canali`} sx={{ mt: 1 }} startIcon={<Iconify icon="eva:link-2-fill" />}>
              Gestisci i profili in Canali
            </Button>

            {tiktokChannel && (
              <Box sx={{ mt: 2 }}>
                <TikTokSettings key={tiktokChannel.id} channel={tiktokChannel} format={item.format} media={media} caption={caption} value={tiktok} onChange={setTiktok} onValid={setTiktokValid} />
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {!canPublish ? (
              <Alert severity="info">Non sei abilitato a pubblicare. Un amministratore può abilitarti da Utenti.</Alert>
            ) : !approved ? (
              <Alert severity="info">Per programmarla, porta la pubblicazione in «Approvato» (lo stato in alto): si salva da sola.</Alert>
            ) : (
              <Stack spacing={1}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={!selected.length || !future || pending || blocked}
                  loading={pending}
                  onClick={() => go('programmata')}
                  startIcon={<Iconify icon="solar:calendar-date-bold" />}
                >
                  {when ? `Programma per ${fmtDateTime(when)}` : 'Imposta data e ora nella scheda'}
                </Button>
                <Button variant="outlined" color="inherit" disabled={!selected.length || pending || blocked} onClick={() => go('ora')} startIcon={<Iconify icon="custom:send-fill" />}>
                  Pubblica ora
                </Button>
                {when && !future && (
                  <Typography variant="caption" sx={{ color: 'warning.dark' }}>
                    La data della scheda è passata: aggiornala per programmare, oppure pubblica ora.
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Si pubblicano testo del post, hashtag e file. Se li modifichi prima dell&apos;uscita, la pubblicazione si aggiorna da sola.
                </Typography>
              </Stack>
            )}
          </Grid>
        </Grid>

        {publications.length > 0 && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Uscite</Typography>
            <Stack spacing={1}>
              {publications.map((p) => {
                const c = byId[p.socialAccountId];
                const st = PUB_STATUS[p.status];
                return (
                  <Stack key={p.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral', alignItems: { sm: 'center' } }}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
                      {c ? <ChannelAvatar channel={c} size={32} /> : <Avatar sx={{ width: 32, height: 32 }}>?</Avatar>}
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2">{c ? `@${c.handle}` : 'Profilo rimosso'}</Typography>
                          <Label color={st.color}>{st.label}</Label>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {p.status === 'pubblicata' ? `Uscita il ${fmtDateTime(new Date(p.publishedAt))}` : `Prevista il ${fmtDateTime(new Date(p.scheduledAt))}`} · {p.files} file
                        </Typography>
                        {p.error && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'error.main', wordBreak: 'break-word' }}><ErrorText error={p.error} /></Typography>
                        )}
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                      {p.permalink && (
                        <Button size="small" href={p.permalink} target="_blank" rel="noopener" endIcon={<Iconify icon="eva:external-link-fill" width={16} />}>
                          Apri il post
                        </Button>
                      )}
                      {canPublish && p.status === 'errore' && (
                        <Button
                          size="small"
                          color="inherit"
                          disabled={pending}
                          onClick={async () => {
                            if (await askConfirm({ tone: 'warning', title: 'Riprovare la pubblicazione?', content: 'Prima controlla sul profilo che il post non sia già uscito, per evitare un doppione.', confirmText: 'Riprova' }))
                              run(() => retryPublication(p.id), 'Nuovo tentativo avviato');
                          }}
                        >
                          Riprova
                        </Button>
                      )}
                      {canPublish && (p.status === 'programmata' || p.status === 'errore') && (
                        <Button
                          size="small"
                          color="error"
                          disabled={pending}
                          onClick={async () => {
                            if (await askConfirm({ tone: 'error', title: 'Annullare la pubblicazione?', content: `Non uscirà su @${c?.handle ?? 'profilo'}.`, confirmText: 'Annulla pubblicazione', cancelText: 'Indietro' }))
                              run(() => cancelPublication(p.id), 'Pubblicazione annullata');
                          }}
                        >
                          Annulla
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          </>
        )}
      </Box>
    </Card>
  );
}
