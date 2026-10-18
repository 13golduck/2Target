'use client';

import { errorMessage } from 'src/components/error-text';
import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import ToggleButton from '@mui/material/ToggleButton';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

// ----------------------------------------------------------------------
// Preparazione del logo nel browser, prima del salvataggio:
// - accetta immagini grandi (fino a 20 MB) e le comprime;
// - rifila i margini vuoti (trasparenti o del colore di sfondo);
// - ridimensiona il logo (lato lungo massimo 1000 px) mantenendo le proporzioni;
// - ricava un'icona quadrata 256×256 per menu ed elenchi: si sceglie la parte del logo trascinando un riquadro e con lo zoom.

export const LOGO_MAX_FILE = 20 * 1024 * 1024;
const LOGO_MAX_SIDE = 1000;
const ICON_SIZE = 256;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non leggibile'));
    };
    img.src = url;
  });
}

/** Disegna l'immagine su un canvas di lavoro (gli SVG senza dimensioni si rasterizzano a 1000 px). */
function toCanvas(img) {
  let w = img.naturalWidth || 1000;
  let h = img.naturalHeight || 1000;
  const scale = Math.min(1, 3000 / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}

/** Riquadro del contenuto: esclude bordi trasparenti o dello stesso colore degli angoli. */
function contentBox(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const px = (x, y) => {
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const transparentBg = corners.every((c) => c[3] < 16);
  const bg = corners[0];
  const solidBg = !transparentBg && corners.every((c) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < 30 && c[3] > 240);
  if (!transparentBg && !solidBg) return { x: 0, y: 0, w, h, bg: null };
  const isBg = (x, y) => {
    const p = px(x, y);
    if (transparentBg) return p[3] < 16;
    return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 30;
  };
  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;
  const rowEmpty = (y) => {
    for (let x = 0; x < w; x += 1) if (!isBg(x, y)) return false;
    return true;
  };
  const colEmpty = (x, y0, y1) => {
    for (let y = y0; y <= y1; y += 1) if (!isBg(x, y)) return false;
    return true;
  };
  while (top < bottom && rowEmpty(top)) top += 1;
  while (bottom > top && rowEmpty(bottom)) bottom -= 1;
  while (left < right && colEmpty(left, top, bottom)) left += 1;
  while (right > left && colEmpty(right, top, bottom)) right -= 1;
  // un filo di margine per non tagliare l'antialiasing
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.02);
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  return { x, y, w: Math.min(w, right + pad + 1) - x, h: Math.min(h, bottom + pad + 1) - y, bg: transparentBg ? 'transparent' : `rgb(${bg[0]},${bg[1]},${bg[2]})` };
}

/** Esporta in WebP (se il browser lo sa fare), altrimenti PNG. Ritorna un data URL. */
function exportCanvas(c) {
  const webp = c.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

function renderLogo(src, box) {
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(box.w, box.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(box.w * scale));
  c.height = Math.max(1, Math.round(box.h * scale));
  c.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  return exportCanvas(c);
}

// ── Inquadratura dell'icona ──────────────────────────────────────────
// Il logo (rifilato) sta al centro di un'area quadrata di lato FULL = lato lungo / 0,84 (zoom 1 = logo intero
// con margine). Il riquadro dell'icona ha lato FULL / zoom e centro (cx, cy) in coordinate del logo.

const fullSide = (box) => Math.max(box.w, box.h) / 0.84;
const MAX_ZOOM = 8;

/** Tiene il riquadro dentro l'area quadrata attorno al logo. */
function clampFrame(box, f) {
  const full = fullSide(box);
  const side = full / f.zoom;
  const minX = box.w / 2 - full / 2 + side / 2;
  const maxX = box.w / 2 + full / 2 - side / 2;
  const minY = box.h / 2 - full / 2 + side / 2;
  const maxY = box.h / 2 + full / 2 - side / 2;
  return { zoom: f.zoom, cx: Math.min(maxX, Math.max(minX, f.cx)), cy: Math.min(maxY, Math.max(minY, f.cy)) };
}

const wholeFrame = (box) => ({ zoom: 1, cx: box.w / 2, cy: box.h / 2 });

/** Icona quadrata 256×256: la parte del logo dentro il riquadro, su sfondo trasparente o pieno. */
function renderIcon(src, box, frame, background) {
  const c = document.createElement('canvas');
  c.width = ICON_SIZE;
  c.height = ICON_SIZE;
  const ctx = c.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  }
  const side = fullSide(box) / frame.zoom;
  const scale = ICON_SIZE / side;
  const left = frame.cx - side / 2;
  const top = frame.cy - side / 2;
  ctx.drawImage(src, box.x, box.y, box.w, box.h, -left * scale, -top * scale, box.w * scale, box.h * scale);
  return exportCanvas(c);
}

/** Area di inquadratura: il logo con sopra il riquadro dorato da trascinare. */
function FrameStage({ logo, box, frame, onChange }) {
  const STAGE = 300;
  const full = fullSide(box);
  const k = STAGE / full; // px dello schermo per px del logo
  const imgW = box.w * k;
  const imgH = box.h * k;
  const side = (full / frame.zoom) * k;
  const left = STAGE / 2 + (frame.cx - box.w / 2) * k - side / 2;
  const top = STAGE / 2 + (frame.cy - box.h / 2) * k - side / 2;

  const startDrag = (e) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, cx: frame.cx, cy: frame.cy };
    const move = (ev) => onChange(clampFrame(box, { zoom: frame.zoom, cx: start.cx + (ev.clientX - start.x) / k, cy: start.cy + (ev.clientY - start.y) / k }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        width: STAGE,
        height: STAGE,
        maxWidth: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        touchAction: 'none',
        backgroundImage: 'repeating-conic-gradient(#F4F6F8 0% 25%, #fff 0% 50%)',
        backgroundSize: '16px 16px',
      }}
    >
      <Box component="img" src={logo} alt="" draggable={false} sx={{ position: 'absolute', left: (STAGE - imgW) / 2, top: (STAGE - imgH) / 2, width: imgW, height: imgH, userSelect: 'none', pointerEvents: 'none' }} />
      {/* Fuori dal riquadro si scurisce: si vede subito cosa finisce nell'icona */}
      <Box
        onPointerDown={startDrag}
        sx={{
          position: 'absolute',
          left,
          top,
          width: side,
          height: side,
          border: '2px solid #CDA434',
          borderRadius: 1,
          boxShadow: '0 0 0 9999px rgba(28,37,46,0.45)',
          cursor: 'move',
        }}
      />
    </Box>
  );
}

export function LogoEditor({ file, onClose, onConfirm }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [trim, setTrim] = useState(true);
  const [frame, setFrame] = useState(null);
  const [iconBg, setIconBg] = useState('trasparente');

  // Lettura del file
  useEffect(() => {
    if (!file) return undefined;
    let url;
    let alive = true;
    loadImage(file)
      .then(({ img, url: u }) => {
        url = u;
        if (!alive) return;
        const canvas = toCanvas(img);
        const box = contentBox(canvas);
        setState({ canvas, box, full: { x: 0, y: 0, w: canvas.width, h: canvas.height, bg: box.bg }, original: { w: img.naturalWidth, h: img.naturalHeight, size: file.size } });
        setFrame(wholeFrame(box));
      })
      .catch((e) => setError(errorMessage(e.message)));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const box = state ? (trim ? state.box : state.full) : null;
  const background = iconBg === 'bianco' ? '#FFFFFF' : iconBg === 'sfondo' && box?.bg && box.bg !== 'transparent' ? box.bg : null;
  const logo = state ? renderLogo(state.canvas, box) : null;
  const icon = state && frame ? renderIcon(state.canvas, box, frame, background) : null;
  const ratio = box ? box.w / box.h : 1;
  const stretched = ratio > 2.2 || ratio < 0.45;
  const kb = (dataUrl) => Math.round((dataUrl.length * 3) / 4 / 1024);

  return (
    <Dialog open={!!file} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Prepara il logo</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {state && (
          <Stack spacing={2.5}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Originale {state.original.w}×{state.original.h} px, {Math.round(state.original.size / 1024)} KB → logo {kb(logo)} KB e icona {kb(icon)} KB.
              Le proporzioni del logo restano quelle originali; l&apos;icona quadrata serve per il menu e gli elenchi.
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
              <Box sx={{ flex: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Logo</Typography>
                {/* Altezza fissa e immagine contenuta: anche un logo molto alto resta dentro il riquadro */}
                <Box
                  sx={{
                    height: 200,
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    p: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundImage: 'repeating-conic-gradient(#F4F6F8 0% 25%, #fff 0% 50%)',
                    backgroundSize: '16px 16px',
                  }}
                >
                  <Box component="img" src={logo} alt="Logo" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
                </Box>
                <FormControlLabel sx={{ mt: 1.5, display: 'flex' }} control={
                    <Switch
                      checked={trim}
                      onChange={(e) => {
                        // Cambia il logo: il riquadro dell'icona riparte dal logo intero
                        setTrim(e.target.checked);
                        setFrame(wholeFrame(e.target.checked ? state.box : state.full));
                      }}
                    />
                  } label="Togli i margini vuoti" />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2">Icona per menu ed elenchi</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
                  Trascina il riquadro dorato sulla parte del logo da usare e ingrandiscila con lo zoom.
                </Typography>
                {frame && <FrameStage logo={logo} box={box} frame={frame} onChange={setFrame} />}
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1, maxWidth: 300 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Zoom</Typography>
                  <Slider
                    size="small"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.05}
                    value={frame?.zoom ?? 1}
                    onChange={(_, v) => setFrame((f) => clampFrame(box, { ...f, zoom: v }))}
                    aria-label="Zoom dell'icona"
                  />
                  <Button size="small" color="inherit" onClick={() => setFrame(wholeFrame(box))} sx={{ flexShrink: 0 }}>
                    Logo intero
                  </Button>
                </Stack>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end', mt: 1.5 }}>
                  <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Box component="img" src={icon} alt="Icona" sx={{ width: 96, height: 96, borderRadius: 2, border: 1, borderColor: 'divider', backgroundImage: 'repeating-conic-gradient(#F4F6F8 0% 25%, #fff 0% 50%)', backgroundSize: '16px 16px' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>icona</Typography>
                  </Stack>
                  <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Box component="img" src={icon} alt="" sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: '#fff', border: 1, borderColor: 'divider' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>elenco</Typography>
                  </Stack>
                  <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Box component="img" src={icon} alt="" sx={{ width: 24, height: 24, borderRadius: 0.5, bgcolor: '#fff' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>menu</Typography>
                  </Stack>
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, mb: 0.5, color: 'text.secondary' }}>Sfondo dell&apos;icona</Typography>
                <ToggleButtonGroup size="small" exclusive value={iconBg} onChange={(_, v) => v && setIconBg(v)}>
                  <ToggleButton value="trasparente">Trasparente</ToggleButton>
                  <ToggleButton value="bianco">Bianco</ToggleButton>
                  {box.bg && box.bg !== 'transparent' && <ToggleButton value="sfondo">Come il logo</ToggleButton>}
                </ToggleButtonGroup>
              </Box>
            </Stack>

            {stretched && (
              <Alert severity="info">
                Il logo è molto {ratio > 1 ? 'largo' : 'alto'}: intero, nel menu diventa piccolo e poco leggibile. Sposta il riquadro sul simbolo (o sulle iniziali) e alza lo zoom finché riempie l&apos;icona.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Annulla
        </Button>
        <Button variant="contained" disabled={!state} onClick={() => onConfirm({ logo, icon })}>
          Usa questo logo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
