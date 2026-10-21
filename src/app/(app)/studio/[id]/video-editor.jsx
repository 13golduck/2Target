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
import { splitAt, timeline, duplicate, TEXT_SIZES, audioLength, VIDEO_SIZES, VIDEO_LIMITS, totalDuration, TEXT_POSITIONS } from 'src/lib/studio/video';

import { Iconify } from 'src/components/iconify';

import { drawTextOverlay } from './text-overlay';
import { VideoTimeline } from './video-timeline';

// ----------------------------------------------------------------------
// Montaggio dello Studio come in un programma di montaggio: anteprima e proprietà dell'elemento scelto in alto,
// timeline con tracce video, scritte e audio in basso. Tasti: spazio riproduce, S divide al cursore, Canc elimina.

const sec = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const PREVIEW_WIDTH = 240;
const POSITION_LABEL = { alto: 'In alto', centro: 'Al centro', basso: 'In basso' };
const SIZE_LABEL = { piccolo: 'Piccola', medio: 'Media', grande: 'Grande' };
const allIds = (v) => [...v.clips, ...v.texts, ...v.audio].map((x) => x.id);

export default function VideoEditor({ video, onChange, videos, tracks, onUploadMusic, uploading, onOpenLibrary }) {
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(null); // { kind: 'video' | 'testi' | 'audio', id }
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState(null); // { kind: 'clip' | 'musica', anchor }
  const total = totalDuration(video);
  const at = Math.min(now, total);

  const item = !selected
    ? null
    : selected.kind === 'video'
      ? video.clips.find((c) => c.id === selected.id)
      : selected.kind === 'testi'
        ? video.texts.find((t) => t.id === selected.id)
        : video.audio.find((a) => a.id === selected.id);

  // ── Azioni ─────────────────────────────────────────────────────────
  const split = () => {
    if (!item || selected.kind === 'testi') return;
    const id = newId(selected.kind === 'video' ? 'c' : 'a', allIds(video));
    const next = splitAt(video, item.id, at, id);
    if (next !== video) onChange(next);
  };
  const dup = () => {
    if (!item) return;
    if (selected.kind === 'testi') {
      const id = newId('t', allIds(video));
      const len = item.to - item.from;
      onChange({ ...video, texts: [...video.texts, { ...item, id, from: Math.min(item.to, total - len), to: Math.min(item.to + len, total) }] });
      return;
    }
    onChange(duplicate(video, item.id, newId(selected.kind === 'video' ? 'c' : 'a', allIds(video))));
  };
  const remove = () => {
    if (!item) return;
    if (selected.kind === 'video' && video.clips.length <= 1) return;
    const key = { video: 'clips', testi: 'texts', audio: 'audio' }[selected.kind];
    onChange({ ...video, [key]: video[key].filter((x) => x.id !== item.id) });
    setSelected(null);
  };
  const update = (changes) => {
    const key = { video: 'clips', testi: 'texts', audio: 'audio' }[selected.kind];
    onChange({ ...video, [key]: video[key].map((x) => (x.id === item.id ? { ...x, ...changes } : x)) });
  };

  const addClip = (v) => {
    setMenu(null);
    if (video.clips.length >= VIDEO_LIMITS.clips) return;
    const id = newId('c', allIds(video));
    onChange({ ...video, clips: [...video.clips, { id, mediaId: v.id, start: 0, end: Math.min(v.durationSec ?? 5, VIDEO_LIMITS.maxTotalSec - total) }] });
    setSelected({ kind: 'video', id });
  };
  const addText = () => {
    if (video.texts.length >= VIDEO_LIMITS.texts) return;
    const id = newId('t', allIds(video));
    const from = Math.min(at, Math.max(0, total - 1));
    onChange({ ...video, texts: [...video.texts, { id, text: 'Nuova scritta', from, to: Math.min(from + 3, total), position: 'basso', size: 'medio', color: '#FFFFFF', background: null }] });
    setSelected({ kind: 'testi', id });
  };
  const addMusic = (t) => {
    setMenu(null);
    if (video.audio.length >= VIDEO_LIMITS.audio) return;
    const id = newId('a', allIds(video));
    const start = Math.min(at, Math.max(0, total - 0.5));
    onChange({ ...video, audio: [...video.audio, { id, mediaId: t.id, start: 0, end: Math.min(t.durationSec ?? total, total - start), at: start, volume: 0.6 }] });
    setSelected({ kind: 'audio', id });
  };

  const onKeyDown = (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key.toLowerCase() === 's') split();
    else if (['Delete', 'Backspace'].includes(e.key)) {
      e.preventDefault();
      remove();
    }
  };

  return (
    <Stack spacing={1.5} tabIndex={0} onKeyDown={onKeyDown} sx={{ outline: 'none' }}>
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: `${PREVIEW_WIDTH}px minmax(0, 1fr)` }, alignItems: 'start' }}>
        <VideoPreview video={video} videos={videos} tracks={tracks} now={at} playing={playing} onTime={setNow} onEnd={() => setPlaying(false)} />

        {/* Proprietà dell'elemento scelto; senza selezione, quelle del video */}
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          {!item && (
            <>
              <Typography variant="subtitle2">Video · {sec(total)}</Typography>
              <TextField select size="small" label="Misura" value={video.size} onChange={(e) => onChange({ ...video, size: e.target.value })} sx={{ maxWidth: 320 }}>
                {Object.entries(VIDEO_SIZES).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v.label}
                  </MenuItem>
                ))}
              </TextField>
              <VolumeSlider label="Audio dei video" value={video.originalVolume} onChange={(v) => onChange({ ...video, originalVolume: v })} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Tocca un blocco nella timeline per modificarlo. Trascina il centro per spostarlo, i bordi per accorciarlo o allungarlo. Tasti: spazio riproduce, S divide al cursore, Canc elimina.
              </Typography>
            </>
          )}
          {item && selected.kind === 'video' && (
            <>
              <Typography variant="subtitle2">Clip · {videos.find((v) => v.id === item.mediaId)?.fileName}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Dal secondo {sec(item.start)} al {sec(item.end)} del video originale ({sec(item.end - item.start)}). Trascina i bordi del blocco per cambiarli.
              </Typography>
            </>
          )}
          {item && selected.kind === 'audio' && (
            <>
              <Typography variant="subtitle2">Musica · {tracks.find((t) => t.id === item.mediaId)?.fileName}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Entra al secondo {sec(item.at)} e usa il brano da {sec(item.start)} a {sec(item.end)} ({sec(audioLength(item))}).
              </Typography>
              <VolumeSlider label="Volume del brano" value={item.volume} onChange={(v) => update({ volume: v })} />
            </>
          )}
          {item && selected.kind === 'testi' && <TextProps text={item} onChange={update} />}
        </Stack>
      </Box>

      {/* Strumenti */}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <IconButton onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausa' : 'Riproduci'}>
          <Iconify icon={playing ? 'solar:pause-bold' : 'solar:play-bold'} />
        </IconButton>
        <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 96 }}>
          {sec(at)} / {sec(total)}
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <ToolButton title="Dividi al cursore (S)" icon="solar:scissors-bold" onClick={split} disabled={!item || selected?.kind === 'testi'} />
        <ToolButton title="Duplica" icon="solar:copy-bold" onClick={dup} disabled={!item} />
        <ToolButton title="Elimina (Canc)" icon="solar:trash-bin-trash-bold" onClick={remove} disabled={!item || (selected?.kind === 'video' && video.clips.length <= 1)} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Button size="small" startIcon={<Iconify icon="solar:videocamera-add-bold" />} onClick={(e) => setMenu({ kind: 'clip', anchor: e.currentTarget })} disabled={video.clips.length >= VIDEO_LIMITS.clips}>
          Clip
        </Button>
        <Button size="small" startIcon={<Iconify icon="solar:text-bold" />} onClick={addText} disabled={video.texts.length >= VIDEO_LIMITS.texts}>
          Scritta
        </Button>
        <Button size="small" startIcon={<Iconify icon="solar:music-note-bold" />} onClick={(e) => setMenu({ kind: 'musica', anchor: e.currentTarget })} disabled={video.audio.length >= VIDEO_LIMITS.audio}>
          Musica
        </Button>
        <Box sx={{ flex: 1 }} />
        <Iconify icon="solar:magnifer-zoom-out-linear" width={18} sx={{ color: 'text.secondary' }} />
        <Slider size="small" value={zoom} min={1} max={6} step={0.25} onChange={(_, v) => setZoom(v)} sx={{ width: 110, mx: 1 }} aria-label="Zoom della timeline" />
        <Iconify icon="solar:magnifer-zoom-in-linear" width={18} sx={{ color: 'text.secondary' }} />
      </Stack>
      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.kind === 'clip' &&
          videos.map((v) => (
            <MenuItem key={v.id} onClick={() => addClip(v)}>
              {v.fileName} · {sec(v.durationSec ?? 0)}
            </MenuItem>
          ))}
        {menu?.kind === 'musica' && [
          ...tracks.map((t) => (
            <MenuItem key={t.id} onClick={() => addMusic(t)}>
              {t.fileName}
              {t.durationSec ? ` · ${sec(t.durationSec)}` : ''}
            </MenuItem>
          )),
          onOpenLibrary && (
            <MenuItem key="libreria" onClick={() => (setMenu(null), onOpenLibrary())}>
              <Iconify icon="solar:library-bold" width={18} sx={{ mr: 1 }} />
              Cerca nelle librerie musicali…
            </MenuItem>
          ),
          <MenuItem key="carica" component="label" disabled={uploading}>
            <Iconify icon="eva:cloud-upload-fill" width={18} sx={{ mr: 1 }} />
            Carica un brano (MP3, M4A)…
            <input hidden type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a" onChange={(e) => e.target.files?.[0] && onUploadMusic(e.target.files[0]).finally(() => (e.target.value = '', setMenu(null)))} />
          </MenuItem>,
        ]}
      </Menu>

      <VideoTimeline video={video} onChange={onChange} videos={videos} tracks={tracks} now={at} onSeek={(t) => (setPlaying(false), setNow(t))} selected={selected} onSelect={setSelected} zoom={zoom} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Usa solo musica con licenza per i social: brani tuoi, librerie con licenza d&apos;uso o la musica delle app (aggiunta nell&apos;app al momento di pubblicare).
      </Typography>
    </Stack>
  );
}

function ToolButton({ title, icon, onClick, disabled }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={title}>
          <Iconify icon={icon} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

function VolumeSlider({ label, value, onChange }) {
  return (
    <Box sx={{ maxWidth: 320 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}: {Math.round(value * 100)}%
      </Typography>
      <Slider size="small" value={value} min={0} max={1} step={0.05} onChange={(_, v) => onChange(v)} aria-label={`Volume: ${label}`} />
    </Box>
  );
}

function TextProps({ text: t, onChange }) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        Scritta · da {sec(t.from)} a {sec(t.to)}
      </Typography>
      <TextField size="small" value={t.text} onChange={(e) => onChange({ text: e.target.value })} slotProps={{ htmlInput: { maxLength: 200, 'aria-label': 'Testo della scritta' } }} fullWidth />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
        <TextField select size="small" value={t.position} onChange={(e) => onChange({ position: e.target.value })} sx={{ minWidth: 120 }} slotProps={{ htmlInput: { 'aria-label': 'Posizione' } }}>
          {TEXT_POSITIONS.map((p) => (
            <MenuItem key={p} value={p}>
              {POSITION_LABEL[p]}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" value={t.size} onChange={(e) => onChange({ size: e.target.value })} sx={{ minWidth: 110 }} slotProps={{ htmlInput: { 'aria-label': 'Dimensione' } }}>
          {Object.keys(TEXT_SIZES).map((s) => (
            <MenuItem key={s} value={s}>
              {SIZE_LABEL[s]}
            </MenuItem>
          ))}
        </TextField>
        <TextField type="color" size="small" value={t.color} onChange={(e) => onChange({ color: e.target.value.toUpperCase() })} sx={{ width: 70 }} slotProps={{ htmlInput: { 'aria-label': 'Colore del testo' } }} />
        <ToggleButton size="small" value="box" selected={!!t.background} onChange={() => onChange({ background: t.background ? null : '#000000' })}>
          Riquadro
        </ToggleButton>
        {t.background && <TextField type="color" size="small" value={t.background} onChange={(e) => onChange({ background: e.target.value.toUpperCase() })} sx={{ width: 70 }} slotProps={{ htmlInput: { 'aria-label': 'Colore del riquadro' } }} />}
      </Stack>
    </Stack>
  );
}

// ----------------------------------------------------------------------

/**
 * Anteprima comandata dal cursore: da fermo mostra il fotogramma al punto scelto; in riproduzione fa avanzare il
 * cursore, passa da una clip all'altra e fa partire ogni spezzone audio quando il cursore ci entra.
 */
function VideoPreview({ video, videos, tracks, now, playing, onTime, onEnd }) {
  const videoRef = useRef(null);
  const audioRefs = useRef(new Map());
  const [overlays, setOverlays] = useState({});
  const { width, height } = VIDEO_SIZES[video.size];
  const items = timeline(video);
  const total = totalDuration(video);
  const clip = items.find((c) => now >= c.offset && now < c.offset + c.length) ?? items.at(-1);
  const urlOf = (list, id) => list.find((m) => m.id === id)?.url;

  // Scritte disegnate con la stessa funzione dell'esportazione
  const textsKey = JSON.stringify([video.size, video.texts]);
  useEffect(() => {
    let alive = true;
    Promise.all(video.texts.map(async (t) => [t.id, (await drawTextOverlay(t, video.size)).toDataURL('image/png')])).then((list) => alive && setOverlays(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si ridisegna solo se cambiano testi o misura
  }, [textsKey]);

  // Da fermo (o al cambio di clip) il video si porta al punto del cursore
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !clip) return;
    const target = clip.start + (now - clip.offset);
    if (!playing || Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
    el.volume = video.originalVolume;
  }, [clip?.id, now, playing]); // eslint-disable-line react-hooks/exhaustive-deps -- segue cursore e clip

  // Riproduzione: il video comanda il tempo; gli spezzoni audio si accendono e spengono intorno al cursore
  const latest = useRef({ clip, items, total, audio: video.audio });
  useEffect(() => {
    latest.current = { clip, items, total, audio: video.audio };
  });
  useEffect(() => {
    const el = videoRef.current;
    if (!playing || !el) {
      el?.pause();
      audioRefs.current.forEach((a) => a.pause());
      return undefined;
    }
    el.play().catch(() => onEnd());
    let frame;
    const tick = () => {
      const { clip: c, items: list, total: tot, audio } = latest.current;
      if (!c) return;
      const t = c.offset + (el.currentTime - c.start);
      if (el.currentTime >= c.end - 0.03) {
        const next = list[list.findIndex((x) => x.id === c.id) + 1];
        if (!next) {
          onTime(tot);
          onEnd();
          return;
        }
        onTime(next.offset);
        el.currentTime = next.start;
      } else onTime(Math.min(t, tot));
      for (const a of audio) {
        const node = audioRefs.current.get(a.id);
        if (!node) continue;
        const inside = t >= a.at && t < a.at + audioLength(a);
        const want = a.start + (t - a.at);
        node.volume = a.volume;
        if (inside && node.paused) {
          node.currentTime = want;
          node.play().catch(() => undefined);
        } else if (inside && Math.abs(node.currentTime - want) > 0.3) node.currentTime = want;
        else if (!inside && !node.paused) node.pause();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps -- il ciclo legge i valori aggiornati da latest

  const visible = video.texts.filter((t) => now >= t.from && now <= t.to);

  return (
    <Box sx={{ position: 'relative', width: PREVIEW_WIDTH, maxWidth: 1, aspectRatio: `${width} / ${height}`, bgcolor: 'common.black', borderRadius: 1, overflow: 'hidden' }}>
      {clip && <Box component="video" ref={videoRef} src={urlOf(videos, clip.mediaId)} playsInline preload="auto" sx={{ width: 1, height: 1, objectFit: 'cover' }} />}
      {visible.map((t) => overlays[t.id] && <Box key={t.id} component="img" src={overlays[t.id]} alt="" sx={{ position: 'absolute', inset: 0, width: 1, height: 1, pointerEvents: 'none' }} />)}
      {video.audio.map((a) => (
        <audio
          key={a.id}
          ref={(node) => (node ? audioRefs.current.set(a.id, node) : audioRefs.current.delete(a.id))}
          src={urlOf(tracks, a.mediaId)}
          preload="auto"
        />
      ))}
    </Box>
  );
}
