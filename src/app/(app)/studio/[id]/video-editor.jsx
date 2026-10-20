'use client';

import '@fontsource-variable/montserrat';

import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';

import { newId } from 'src/lib/studio/design';
import { timeline, TEXT_SIZES, VIDEO_SIZES, VIDEO_LIMITS, totalDuration, TEXT_POSITIONS } from 'src/lib/studio/video';

import { Iconify } from 'src/components/iconify';

import { drawTextOverlay } from './text-overlay';

// ----------------------------------------------------------------------
// Montaggio dello Studio: clip in fila (pezzi dei video caricati), scritte a tempo, musica e volumi.
// L'anteprima riproduce le clip una dopo l'altra con le scritte sopra; il video vero lo compone il server.

/** Intervallo da uno slider a due maniglie, con una distanza minima tra le due (lo slider non la impone). */
function withGap([a, b], gap, max) {
  if (b - a >= gap) return [a, b];
  return a + gap <= max ? [a, a + gap] : [Math.max(0, b - gap), b];
}

const sec = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const PREVIEW_WIDTH = 260;
const POSITION_LABEL = { alto: 'In alto', centro: 'Al centro', basso: 'In basso' };
const SIZE_LABEL = { piccolo: 'Piccola', medio: 'Media', grande: 'Grande' };

export default function VideoEditor({ video, onChange, videos, tracks, onUploadMusic, uploading }) {
  const [selected, setSelected] = useState(video.clips[0]?.id ?? null);
  const [addAnchor, setAddAnchor] = useState(null);
  const total = totalDuration(video);
  const items = timeline(video);
  const urlOf = (id) => videos.find((v) => v.id === id)?.url;
  const durationOf = (id) => videos.find((v) => v.id === id)?.durationSec ?? 0;

  const setClips = (clips) => onChange({ ...video, clips });
  const updateClip = (id, changes) => setClips(video.clips.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  const moveClip = (id, dir) => {
    const i = video.clips.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= video.clips.length) return;
    const clips = [...video.clips];
    [clips[i], clips[j]] = [clips[j], clips[i]];
    setClips(clips);
  };
  const removeClip = (id) => {
    if (video.clips.length <= 1) return;
    setClips(video.clips.filter((c) => c.id !== id));
    setSelected(null);
  };
  const addClip = (v) => {
    setAddAnchor(null);
    if (video.clips.length >= VIDEO_LIMITS.clips) return;
    const id = newId('c', video.clips.map((c) => c.id));
    setClips([...video.clips, { id, mediaId: v.id, start: 0, end: Math.min(v.durationSec ?? 5, VIDEO_LIMITS.maxTotalSec - total) }]);
    setSelected(id);
  };

  const setTexts = (texts) => onChange({ ...video, texts });
  const addText = () => {
    if (video.texts.length >= VIDEO_LIMITS.texts) return;
    const id = newId('t', video.texts.map((t) => t.id));
    setTexts([...video.texts, { id, text: 'Nuova scritta', from: 0, to: Math.min(3, total), position: 'basso', size: 'medio', color: '#FFFFFF', background: null }]);
  };
  const updateText = (id, changes) => setTexts(video.texts.map((t) => (t.id === id ? { ...t, ...changes } : t)));

  const clip = video.clips.find((c) => c.id === selected);

  return (
    <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: `${PREVIEW_WIDTH}px minmax(0, 1fr)` }, alignItems: 'start' }}>
      <Stack spacing={1}>
        <VideoPreview video={video} items={items} urlOf={urlOf} musicUrl={tracks.find((t) => t.id === video.music?.mediaId)?.url} />
        <TextField select size="small" label="Misura" value={video.size} onChange={(e) => onChange({ ...video, size: e.target.value })}>
          {Object.entries(VIDEO_SIZES).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack spacing={2} sx={{ minWidth: 0 }}>
        {/* Clip */}
        <Box>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Clip · {sec(total)} {total >= VIDEO_LIMITS.maxTotalSec && `(massimo ${VIDEO_LIMITS.maxTotalSec} s)`}
            </Typography>
            <Button size="small" variant="outlined" startIcon={<Iconify icon="mingcute:add-line" />} onClick={(e) => setAddAnchor(e.currentTarget)} disabled={video.clips.length >= VIDEO_LIMITS.clips || total >= VIDEO_LIMITS.maxTotalSec}>
              Aggiungi clip
            </Button>
            <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
              {videos.map((v) => (
                <MenuItem key={v.id} onClick={() => addClip(v)}>
                  {v.fileName} · {sec(v.durationSec ?? 0)}
                </MenuItem>
              ))}
            </Menu>
          </Stack>
          {/* Fila delle clip, larghe in proporzione alla durata */}
          <Stack direction="row" spacing={0.5} sx={{ overflowX: 'auto', pb: 0.5 }}>
            {items.map((c, i) => (
              <Box
                key={c.id}
                component="button"
                type="button"
                onClick={() => setSelected(c.id)}
                sx={{
                  flex: `${Math.max(c.length, 1)} 0 64px`,
                  minWidth: 64,
                  p: 1,
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'common.white',
                  cursor: 'pointer',
                  borderRadius: 1,
                  border: 2,
                  borderColor: c.id === selected ? 'primary.main' : 'transparent',
                  bgcolor: 'grey.800',
                }}
              >
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }} noWrap>
                  {i + 1}. {videos.find((v) => v.id === c.mediaId)?.fileName ?? 'video'}
                </Typography>
                <Typography variant="caption">{sec(c.length)}</Typography>
              </Box>
            ))}
          </Stack>
          {clip && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1.5 }}>
              <Box sx={{ flex: 1, px: 1 }}>
                <Slider
                  size="small"
                  value={[clip.start, clip.end]}
                  min={0}
                  max={Math.max(durationOf(clip.mediaId), clip.end)}
                  step={0.1}
                  disableSwap
                  onChange={(_, value) => {
                    const [start, end] = withGap(value, VIDEO_LIMITS.minClipSec, Math.max(durationOf(clip.mediaId), clip.end));
                    updateClip(clip.id, { start, end });
                  }}
                  valueLabelDisplay="auto"
                  valueLabelFormat={sec}
                  getAriaLabel={(i) => (i === 0 ? 'Inizio della clip' : 'Fine della clip')}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Dal secondo {sec(clip.start)} al {sec(clip.end)} del video originale
                </Typography>
              </Box>
              <Tooltip title="Sposta prima">
                <IconButton size="small" onClick={() => moveClip(clip.id, -1)} aria-label="Sposta la clip prima">
                  <Iconify icon="eva:arrow-back-fill" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Sposta dopo">
                <IconButton size="small" onClick={() => moveClip(clip.id, 1)} aria-label="Sposta la clip dopo">
                  <Iconify icon="eva:arrow-forward-fill" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Togli la clip">
                <span>
                  <IconButton size="small" color="error" onClick={() => removeClip(clip.id)} disabled={video.clips.length <= 1} aria-label="Togli la clip">
                    <Iconify icon="solar:trash-bin-trash-bold" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          )}
        </Box>

        <Divider />

        {/* Scritte */}
        <Box>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Scritte
            </Typography>
            <Button size="small" variant="outlined" startIcon={<Iconify icon="mingcute:add-line" />} onClick={addText} disabled={video.texts.length >= VIDEO_LIMITS.texts}>
              Aggiungi scritta
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {video.texts.map((t) => (
              <Box key={t.id} sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TextField size="small" value={t.text} onChange={(e) => updateText(t.id, { text: e.target.value })} slotProps={{ htmlInput: { maxLength: 200, 'aria-label': 'Testo della scritta' } }} fullWidth />
                  <IconButton size="small" color="error" onClick={() => setTexts(video.texts.filter((x) => x.id !== t.id))} aria-label="Togli la scritta">
                    <Iconify icon="solar:trash-bin-trash-bold" />
                  </IconButton>
                </Stack>
                <Box sx={{ px: 1, mt: 1 }}>
                  <Slider
                    size="small"
                    value={[Math.min(t.from, total), Math.min(t.to, total)]}
                    min={0}
                    max={total}
                    step={0.1}
                    disableSwap
                    onChange={(_, value) => {
                      const [from, to] = withGap(value, 0.3, total);
                      updateText(t.id, { from, to });
                    }}
                    valueLabelDisplay="auto"
                    valueLabelFormat={sec}
                    getAriaLabel={(i) => (i === 0 ? 'Compare al secondo' : 'Sparisce al secondo')}
                  />
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
                  <TextField select size="small" value={t.position} onChange={(e) => updateText(t.id, { position: e.target.value })} sx={{ minWidth: 120 }} slotProps={{ htmlInput: { 'aria-label': 'Posizione' } }}>
                    {TEXT_POSITIONS.map((p) => (
                      <MenuItem key={p} value={p}>
                        {POSITION_LABEL[p]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" value={t.size} onChange={(e) => updateText(t.id, { size: e.target.value })} sx={{ minWidth: 110 }} slotProps={{ htmlInput: { 'aria-label': 'Dimensione' } }}>
                    {Object.keys(TEXT_SIZES).map((s) => (
                      <MenuItem key={s} value={s}>
                        {SIZE_LABEL[s]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField type="color" size="small" value={t.color} onChange={(e) => updateText(t.id, { color: e.target.value.toUpperCase() })} sx={{ width: 70 }} slotProps={{ htmlInput: { 'aria-label': 'Colore del testo' } }} />
                  <ToggleButton size="small" value="box" selected={!!t.background} onChange={() => updateText(t.id, { background: t.background ? null : '#000000' })}>
                    Riquadro
                  </ToggleButton>
                  {t.background && <TextField type="color" size="small" value={t.background} onChange={(e) => updateText(t.id, { background: e.target.value.toUpperCase() })} sx={{ width: 70 }} slotProps={{ htmlInput: { 'aria-label': 'Colore del riquadro' } }} />}
                </Stack>
              </Box>
            ))}
            {!video.texts.length && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Titoli, sottotitoli o un invito finale: compaiono sopra il video negli intervalli scelti.
              </Typography>
            )}
          </Stack>
        </Box>

        <Divider />

        {/* Audio */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Audio
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <TextField select size="small" label="Musica" value={video.music?.mediaId ?? ''} onChange={(e) => onChange({ ...video, music: e.target.value ? { mediaId: Number(e.target.value), volume: video.music?.volume ?? 0.6 } : null })} sx={{ minWidth: 220 }}>
              <MenuItem value="">Nessuna</MenuItem>
              {tracks.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.fileName}
                </MenuItem>
              ))}
            </TextField>
            <Button component="label" size="small" variant="outlined" color="inherit" loading={uploading} startIcon={<Iconify icon="solar:music-note-bold" />}>
              Carica musica
              <input hidden type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a" onChange={(e) => e.target.files?.[0] && onUploadMusic(e.target.files[0]).finally(() => (e.target.value = ''))} />
            </Button>
          </Stack>
          <Stack direction="row" spacing={3} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
            <VolumeSlider label="Audio dei video" value={video.originalVolume} onChange={(v) => onChange({ ...video, originalVolume: v })} />
            {video.music && <VolumeSlider label="Musica" value={video.music.volume} onChange={(v) => onChange({ ...video, music: { ...video.music, volume: v } })} />}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
            Usa solo musica con licenza per i social (libreria acquistata o brani tuoi). Quella di Instagram e TikTok non si può usare da strumenti esterni.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function VolumeSlider({ label, value, onChange }) {
  return (
    <Box sx={{ width: 200 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}: {Math.round(value * 100)}%
      </Typography>
      <Slider size="small" value={value} min={0} max={1} step={0.05} onChange={(_, v) => onChange(v)} aria-label={`Volume: ${label}`} />
    </Box>
  );
}

// ----------------------------------------------------------------------

/** Anteprima: le clip una dopo l'altra, con le scritte (le stesse immagini del video finale) e la musica. */
function VideoPreview({ video, items, urlOf, musicUrl }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [overlays, setOverlays] = useState({});
  const { width, height } = VIDEO_SIZES[video.size];
  const clip = items[Math.min(index, items.length - 1)];

  // Le scritte si ridisegnano quando cambiano (stessa funzione dell'esportazione)
  const textsKey = JSON.stringify([video.size, video.texts]);
  useEffect(() => {
    let alive = true;
    Promise.all(video.texts.map(async (t) => [t.id, (await drawTextOverlay(t, video.size)).toDataURL('image/png')])).then((list) => alive && setOverlays(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si ridisegna solo se cambiano testi o misura
  }, [textsKey]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !clip) return;
    el.currentTime = clip.start;
    el.volume = video.originalVolume;
    if (playing) el.play().catch(() => setPlaying(false));
  }, [clip?.id, clip?.start]); // eslint-disable-line react-hooks/exhaustive-deps -- si riposiziona solo al cambio di clip

  const onTime = () => {
    const el = videoRef.current;
    if (!el || !clip) return;
    setNow(clip.offset + Math.max(0, el.currentTime - clip.start));
    if (el.currentTime >= clip.end - 0.05) {
      if (index < items.length - 1) setIndex(index + 1);
      else stop();
    }
  };

  const play = () => {
    if (index >= items.length - 1 && now >= totalDuration(video) - 0.1) setIndex(0);
    setPlaying(true);
    videoRef.current?.play().catch(() => setPlaying(false));
    if (audioRef.current && video.music) {
      audioRef.current.volume = video.music.volume;
      audioRef.current.currentTime = now % (audioRef.current.duration || Infinity);
      audioRef.current.play().catch(() => undefined);
    }
  };
  const stop = () => {
    setPlaying(false);
    videoRef.current?.pause();
    audioRef.current?.pause();
  };

  const visible = video.texts.filter((t) => now >= t.from && now <= t.to);

  return (
    <Box>
      <Box sx={{ position: 'relative', width: PREVIEW_WIDTH, maxWidth: 1, aspectRatio: `${width} / ${height}`, bgcolor: 'common.black', borderRadius: 1, overflow: 'hidden' }}>
        {clip && <Box component="video" ref={videoRef} src={urlOf(clip.mediaId)} muted={false} playsInline onTimeUpdate={onTime} sx={{ width: 1, height: 1, objectFit: 'cover' }} />}
        {visible.map((t) => overlays[t.id] && <Box key={t.id} component="img" src={overlays[t.id]} alt="" sx={{ position: 'absolute', inset: 0, width: 1, height: 1, pointerEvents: 'none' }} />)}
        {musicUrl && <audio ref={audioRef} src={musicUrl} loop preload="auto" />}
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
        <IconButton size="small" onClick={playing ? stop : play} aria-label={playing ? 'Pausa' : 'Riproduci'}>
          <Iconify icon={playing ? 'solar:pause-bold' : 'solar:play-bold'} />
        </IconButton>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {sec(now)} / {sec(totalDuration(video))} · clip {index + 1} di {items.length}
        </Typography>
      </Stack>
    </Box>
  );
}
