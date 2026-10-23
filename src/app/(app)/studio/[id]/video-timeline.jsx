'use client';

import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { timeline, audioLength, VIDEO_LIMITS, totalDuration } from 'src/lib/studio/video';

// ----------------------------------------------------------------------
// Timeline del montaggio: righello, traccia video (clip in fila), traccia scritte e traccia audio (spezzoni liberi).
// Trascinando il corpo di un blocco lo si sposta, trascinando i bordi lo si accorcia o allunga; il cursore rosso
// segna il punto di riproduzione. I movimenti si agganciano ai bordi degli altri blocchi e al cursore.

const LABEL_WIDTH = 72;
const HANDLE_PX = 7;
const SNAP_PX = 8;
const ROWS = [
  { key: 'video', label: 'Video', height: 46, color: '#3D5A80' },
  { key: 'testi', label: 'Scritte', height: 30, color: '#8A6B12' },
  { key: 'audio', label: 'Audio', height: 36, color: '#4F6B45' },
];
const round = (n) => Math.round(n * 20) / 20; // passo di 0,05 s

/** Passo delle etichette del righello in base allo zoom: mai troppo fitte. */
const tickStep = (pps) => [0.5, 1, 2, 5, 10, 15, 30].find((s) => s * pps >= 48) ?? 30;

export function VideoTimeline({ video, onChange, videos, tracks, now, onSeek, selected, onSelect, zoom }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState(null); // { kind, id, mode, x0, origin, dx }
  // Copia per i gestori del mouse sulla finestra (leggono l'ultimo valore senza ricrearsi a ogni movimento)
  const dragRef = useRef(null);
  useEffect(() => {
    dragRef.current = drag;
  });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = totalDuration(video);
  const audioEnd = Math.max(0, ...video.audio.map((a) => a.at + audioLength(a)));
  // Spazio oltre la fine: si vede dove finisce il video anche con un brano più lungo
  const span = Math.max(total, audioEnd, 1) * 1.08;
  const pps = ((width - LABEL_WIDTH) / span) * zoom;
  const x = (t) => LABEL_WIDTH + t * pps;
  const items = timeline(video);
  const durationOf = (list, id) => list.find((m) => m.id === id)?.durationSec ?? null;

  // Punti a cui agganciarsi: bordi dei blocchi, inizio, fine e cursore
  const snapPoints = (excludeId) => [
    0,
    total,
    now,
    ...items.flatMap((c) => (c.id === excludeId ? [] : [c.offset, c.offset + c.length])),
    ...video.texts.flatMap((t) => (t.id === excludeId ? [] : [t.from, t.to])),
    ...video.audio.flatMap((a) => (a.id === excludeId ? [] : [a.at, a.at + audioLength(a)])),
  ];
  const snap = (t, excludeId) => {
    const near = snapPoints(excludeId).find((p) => Math.abs(p - t) * pps <= SNAP_PX);
    return near ?? round(t);
  };

  // ── Trascinamento ─────────────────────────────────────────────────
  const startDrag = (e, kind, item) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const local = e.clientX - rect.left;
    const mode = local <= HANDLE_PX ? 'start' : local >= rect.width - HANDLE_PX ? 'end' : 'move';
    onSelect({ kind, id: item.id });
    setDrag({ kind, id: item.id, mode, x0: e.clientX, origin: item, dx: 0 });
  };


  // Durante il trascinamento si mostra il risultato; al rilascio lo si conferma
  const preview = (d) => {
    const dt = d.dx / pps;
    const o = d.origin;
    const min = VIDEO_LIMITS.minClipSec;
    if (d.kind === 'video') {
      const max = durationOf(videos, o.mediaId) ?? o.end;
      if (d.mode === 'start') return { ...o, start: Math.min(Math.max(0, round(o.start + dt)), o.end - min) };
      if (d.mode === 'end') return { ...o, end: Math.max(Math.min(max, round(o.end + dt)), o.start + min) };
      return o;
    }
    if (d.kind === 'testi') {
      const len = o.to - o.from;
      if (d.mode === 'start') return { ...o, from: Math.min(Math.max(0, snap(o.from + dt, o.id)), o.to - 0.3) };
      if (d.mode === 'end') return { ...o, to: Math.max(Math.min(total, snap(o.to + dt, o.id)), o.from + 0.3) };
      const from = Math.min(Math.max(0, snap(o.from + dt, o.id)), Math.max(0, total - len));
      return { ...o, from, to: from + len };
    }
    const max = durationOf(tracks, o.mediaId) ?? o.end;
    if (d.mode === 'start') {
      // Il bordo sinistro taglia l'inizio del brano e lo fa entrare più tardi
      const start = Math.min(Math.max(0, round(o.start + dt)), o.end - min);
      return { ...o, start, at: Math.max(0, o.at + (start - o.start)) };
    }
    if (d.mode === 'end') return { ...o, end: Math.max(Math.min(max, round(o.end + dt)), o.start + min) };
    return { ...o, at: Math.max(0, snap(o.at + dt, o.id)) };
  };

  function apply(d) {
    if (Math.abs(d.dx) < 2) return; // un clic, non uno spostamento
    const next = preview(d);
    if (d.kind === 'video' && d.mode === 'move') {
      // Spostando una clip si cambia l'ordine: va dove cade il suo centro
      const from = items.findIndex((c) => c.id === d.id);
      const center = items[from].offset + items[from].length / 2 + d.dx / pps;
      const others = items.filter((c) => c.id !== d.id);
      const to = others.filter((c) => c.offset + c.length / 2 < center).length;
      const clips = video.clips.filter((c) => c.id !== d.id);
      clips.splice(to, 0, video.clips[from]);
      onChange({ ...video, clips });
      return;
    }
    if (d.kind === 'video') onChange({ ...video, clips: video.clips.map((c) => (c.id === d.id ? next : c)) });
    if (d.kind === 'testi') onChange({ ...video, texts: video.texts.map((t) => (t.id === d.id ? next : t)) });
    if (d.kind === 'audio') onChange({ ...video, audio: video.audio.map((a) => (a.id === d.id ? next : a)) });
  }

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => setDrag((d) => d && { ...d, dx: e.clientX - d.x0 });
    const up = () => {
      if (dragRef.current) apply(dragRef.current);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si ascolta per tutta la durata del trascinamento
  }, [drag?.id, drag?.mode]);

  // Cursore: clic o trascinamento sul righello
  const seekFrom = (clientX) => {
    const rect = boxRef.current.getBoundingClientRect();
    onSeek(Math.min(Math.max(0, (clientX - rect.left - LABEL_WIDTH) / pps), total));
  };
  const startSeek = (e) => {
    seekFrom(e.clientX);
    const move = (ev) => seekFrom(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── Disegno ───────────────────────────────────────────────────────
  const block = (kind, item, left, len, color, label) => {
    const live = drag?.id === item.id ? drag : null;
    const shown = live ? preview(live) : null;
    let l = left;
    let w = len;
    if (shown && kind === 'testi') [l, w] = [shown.from, shown.to - shown.from];
    if (shown && kind === 'audio') [l, w] = [shown.at, audioLength(shown)];
    if (shown && kind === 'video') {
      w = shown.end - shown.start;
      if (live.mode === 'move') l = left + live.dx / pps;
    }
    const isSel = selected?.id === item.id;
    return (
      <Box
        key={item.id}
        onPointerDown={(e) => startDrag(e, kind, item)}
        title={label}
        sx={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: x(l),
          width: Math.max(w * pps, 6),
          bgcolor: color,
          color: 'common.white',
          borderRadius: 0.75,
          px: 1,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          cursor: live?.mode === 'move' ? 'grabbing' : 'grab',
          outline: isSel ? '2px solid' : 'none',
          outlineColor: 'warning.main',
          zIndex: live ? 3 : 1,
          opacity: live ? 0.85 : 1,
          userSelect: 'none',
          touchAction: 'none',
          // Maniglie ai bordi per accorciare e allungare
          '&::before, &::after': { content: '""', position: 'absolute', top: 0, bottom: 0, width: HANDLE_PX, cursor: 'ew-resize', bgcolor: 'rgba(255,255,255,0.18)' },
          '&::before': { left: 0 },
          '&::after': { right: 0 },
        }}
      >
        <Typography variant="caption" noWrap sx={{ fontWeight: 600, pointerEvents: 'none' }}>
          {label}
        </Typography>
      </Box>
    );
  };

  const step = tickStep(pps);
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
  const nameOf = (list, id) => list.find((m) => m.id === id)?.fileName ?? 'file';

  return (
    <Box ref={boxRef} sx={{ position: 'relative', userSelect: 'none', overflow: 'hidden', borderRadius: 1, bgcolor: 'background.neutral', pb: 0.5 }}>
      {/* Righello */}
      <Box onPointerDown={startSeek} sx={{ position: 'relative', height: 22, cursor: 'pointer', borderBottom: 1, borderColor: 'divider' }}>
        {ticks.map((t) => (
          <Typography key={t} variant="caption" sx={{ position: 'absolute', left: x(t), top: 2, transform: 'translateX(-50%)', color: 'text.secondary', fontSize: 10, pointerEvents: 'none' }}>
            {t % 1 ? t.toFixed(1) : t}s
          </Typography>
        ))}
        {/* Fine del video: oltre, l'audio non si sente */}
        <Box sx={{ position: 'absolute', left: x(total), top: 0, bottom: -400, borderLeft: '1px dashed', borderColor: 'text.disabled', pointerEvents: 'none' }} />
      </Box>

      {ROWS.map((row) => (
        <Box key={row.key} sx={{ position: 'relative', height: row.height, borderBottom: 1, borderColor: 'divider' }} onPointerDown={() => onSelect(null)}>
          <Typography variant="caption" sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'text.secondary', fontWeight: 600 }}>
            {row.label}
          </Typography>
          {row.key === 'video' && items.map((c, i) => block('video', c, c.offset, c.length, row.color, `${i + 1}. ${nameOf(videos, c.mediaId)}`))}
          {row.key === 'testi' && video.texts.map((t) => block('testi', t, t.from, t.to - t.from, row.color, t.text))}
          {row.key === 'audio' && video.audio.map((a) => block('audio', a, a.at, audioLength(a), row.color, nameOf(tracks, a.mediaId)))}
        </Box>
      ))}

      {/* Cursore di riproduzione */}
      <Box onPointerDown={startSeek} sx={{ position: 'absolute', top: 0, bottom: 0, left: x(now) - 6, width: 12, cursor: 'ew-resize', zIndex: 4 }}>
        <Box sx={{ position: 'absolute', left: 5, top: 0, bottom: 0, width: 2, bgcolor: 'error.main' }} />
        <Box sx={{ position: 'absolute', left: 0, top: 0, width: 12, height: 10, bgcolor: 'error.main', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
      </Box>
    </Box>
  );
}
