'use client';

import '@fontsource-variable/montserrat';
import '@fontsource-variable/oswald';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/lora';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Rect, Text, Group, Stage, Layer as KLayer, Image as KImage, Transformer } from 'react-konva';

import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { newId, MAX_PAGES, MAX_LAYERS, DESIGN_FONTS, DESIGN_SIZES } from 'src/lib/studio/design';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// Editor della grafica dello Studio. Il disegno è in pixel della misura finale (es. 1080×1350) e si mostra
// in scala; l'esportazione ridisegna ogni pagina alla misura piena, in JPEG. Ogni livello è un gruppo Konva
// posizionato in (x, y) con i contenuti da 0 a larghezza/altezza: così spostare, ridimensionare e ruotare
// funziona allo stesso modo per testi, foto, logo e forme.

const MAX_PREVIEW_WIDTH = 520;
// Spazio occupato sopra e sotto la tela nello Studio (intestazione, passi, pagine, pulsanti)
const CHROME_HEIGHT = 380;
const MIN_PREVIEW_HEIGHT = 320;
const JPEG_QUALITY = 0.92;
const FONT_LABELS = Object.fromEntries(DESIGN_FONTS.map((f) => [f, f.replace(' Variable', '')]));

// Immagini già caricate, condivise tra le pagine (stesso indirizzo = stesso file)
const imageCache = new Map();
function loadImage(url) {
  if (!imageCache.has(url)) {
    const img = new window.Image();
    const promise = new Promise((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    });
    img.src = url;
    imageCache.set(url, { img, promise });
  }
  return imageCache.get(url).promise;
}

function useImage(url) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    let alive = true;
    if (url) loadImage(url).then((loaded) => alive && setImg(loaded));
    return () => {
      alive = false;
    };
  }, [url]);
  return url ? img : null;
}

/** Rettangolo dell'immagine dentro il riquadro: «riempi» ritaglia, «contieni» lascia margini. */
function fitImage(img, w, h, fit) {
  if (!img) return { x: 0, y: 0, width: w, height: h };
  const scale = fit === 'riempi' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

function LayerContent({ layer, mediaUrl, logoUrl }) {
  const url = layer.type === 'immagine' ? mediaUrl(layer.mediaId) : layer.type === 'logo' ? logoUrl : null;
  const img = useImage(url);
  const { width: w, height: h } = layer;

  if (layer.type === 'forma') {
    return <Rect width={w} height={h} fill={layer.fill} cornerRadius={layer.shape === 'cerchio' ? Math.min(w, h) / 2 : layer.radius} />;
  }
  if (layer.type === 'testo') {
    const pad = layer.background ? Math.round(layer.fontSize * 0.35) : 0;
    return (
      <>
        {layer.background && <Rect width={w} height={h} fill={layer.background} cornerRadius={Math.round(layer.fontSize * 0.2)} />}
        <Text
          width={w}
          height={h}
          padding={pad}
          text={layer.text || ' '}
          fontFamily={`'${layer.fontFamily}'`}
          fontSize={layer.fontSize}
          fontStyle={layer.bold ? 'bold' : 'normal'}
          fill={layer.color}
          align={layer.align}
          verticalAlign="middle"
          lineHeight={1.15}
          wrap="word"
        />
      </>
    );
  }
  // Foto e logo: ritagliati al riquadro
  const fit = fitImage(img, w, h, layer.type === 'logo' ? 'contieni' : layer.fit);
  return (
    <Group clipX={0} clipY={0} clipWidth={w} clipHeight={h}>
      {img ? <KImage image={img} {...fit} /> : <Rect width={w} height={h} fill="#E9ECEE" />}
    </Group>
  );
}

// ----------------------------------------------------------------------

export default function DesignEditor({ design, onChange, images, logoUrl, onExport, exporting, wide, registerExport }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [fontsReady, setFontsReady] = useState(0);
  const [addAnchor, setAddAnchor] = useState(null);
  const boxRef = useRef(null);
  const stageRef = useRef(null);
  const trRef = useRef(null);
  const nodes = useRef(new Map());
  const [boxWidth, setBoxWidth] = useState(MAX_PREVIEW_WIDTH);
  const [viewHeight, setViewHeight] = useState(900);

  const { width, height } = DESIGN_SIZES[design.size];
  // La tela sta tutta nello schermo: si adatta alla larghezza della colonna e all'altezza della finestra
  const scale = Math.min(Math.min(boxWidth, MAX_PREVIEW_WIDTH) / width, Math.max(MIN_PREVIEW_HEIGHT, viewHeight - CHROME_HEIGHT) / height);
  const page = design.pages[Math.min(pageIndex, design.pages.length - 1)];
  const selected = page.layers.find((l) => l.id === selectedId) ?? null;
  const mediaUrl = useCallback((id) => images.find((m) => m.id === id)?.url ?? null, [images]);

  // Larghezza disponibile: l'anteprima si adatta alla colonna
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    const onResize = () => setViewHeight(window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // I font si scaricano solo quando servono: appena pronti si ridisegna (Konva non lo fa da solo)
  useEffect(() => {
    const families = [...new Set(design.pages.flatMap((p) => p.layers.filter((l) => l.type === 'testo').map((l) => `${l.bold ? 700 : 400} 40px '${l.fontFamily}'`)))];
    let alive = true;
    Promise.all(families.map((f) => document.fonts.load(f))).then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [design]);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodes.current.get(selectedId) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, pageIndex, design, fontsReady]);

  // ── Modifiche ─────────────────────────────────────────────────────
  const setPage = (fn) => onChange({ ...design, pages: design.pages.map((p, i) => (i === pageIndex ? fn(p) : p)) });
  const updateLayer = (id, changes) => setPage((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...changes } : l)) }));
  const removeLayer = (id) => {
    setPage((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
    setSelectedId(null);
  };
  const moveLayer = (id, dir) =>
    setPage((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.layers.length) return p;
      const layers = [...p.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...p, layers };
    });

  const addLayer = (kind, extra = {}) => {
    setAddAnchor(null);
    if (page.layers.length >= MAX_LAYERS) return;
    const id = newId('l', page.layers.map((l) => l.id));
    const m = Math.round(width * 0.08);
    const base = { id, rotation: 0, opacity: 1 };
    const layer =
      kind === 'testo'
        ? { ...base, type: 'testo', text: 'Nuovo testo', x: m, y: Math.round(height * 0.4), width: width - m * 2, height: Math.round(width * 0.2), fontFamily: 'Montserrat Variable', fontSize: Math.round(width * 0.06), bold: true, color: '#1C252E', align: 'left', background: null }
        : kind === 'immagine'
          ? { ...base, type: 'immagine', mediaId: extra.mediaId, fit: 'riempi', x: 0, y: 0, width, height }
          : kind === 'logo'
            ? { ...base, type: 'logo', x: width - m - 160, y: m, width: 160, height: 160 }
            : { ...base, type: 'forma', shape: 'rettangolo', fill: '#CDA434', radius: 0, x: m, y: m, width: Math.round(width * 0.3), height: Math.round(width * 0.3) };
    // Una foto a tutta pagina va sotto agli altri livelli, il resto sopra
    setPage((p) => ({ ...p, layers: kind === 'immagine' ? [layer, ...p.layers] : [...p.layers, layer] }));
    setSelectedId(id);
  };

  const addPage = () => {
    if (design.pages.length >= MAX_PAGES) return;
    const id = newId('p', design.pages.map((p) => p.id));
    onChange({ ...design, pages: [...design.pages, { id, background: page.background, layers: [] }] });
    setPageIndex(design.pages.length);
    setSelectedId(null);
  };
  const duplicatePage = () => {
    if (design.pages.length >= MAX_PAGES) return;
    const id = newId('p', design.pages.map((p) => p.id));
    const pages = [...design.pages];
    pages.splice(pageIndex + 1, 0, { ...structuredClone(page), id });
    onChange({ ...design, pages });
    setPageIndex(pageIndex + 1);
  };
  const removePage = () => {
    if (design.pages.length <= 1) return;
    onChange({ ...design, pages: design.pages.filter((_, i) => i !== pageIndex) });
    setPageIndex(Math.max(0, pageIndex - 1));
    setSelectedId(null);
  };

  // Spostamento e ridimensionamento: la scala del gruppo si trasforma in larghezza/altezza
  const onTransformEnd = (layer, node) => {
    const w = Math.max(10, layer.width * node.scaleX());
    const h = Math.max(10, layer.height * node.scaleY());
    node.scale({ x: 1, y: 1 });
    updateLayer(layer.id, { x: Math.round(node.x()), y: Math.round(node.y()), width: Math.round(w), height: Math.round(h), rotation: Math.round(node.rotation()) });
  };

  // ── Esportazione: ogni pagina alla misura piena, senza la selezione ──────────
  const exportPages = async () => {
    setSelectedId(null);
    const urls = design.pages.flatMap((p) => p.layers.map((l) => (l.type === 'immagine' ? mediaUrl(l.mediaId) : l.type === 'logo' ? logoUrl : null))).filter(Boolean);
    await Promise.all(urls.map(loadImage));
    await document.fonts.ready;
    const blobs = [];
    for (let i = 0; i < design.pages.length; i++) {
      setPageIndex(i);
      // Si aspetta che React mostri la pagina; toBlob la ridisegna da sé. Niente requestAnimationFrame:
      // con la scheda del browser in secondo piano non scatta e l'esportazione resterebbe ferma
      await new Promise((r) => setTimeout(r, 80));
      // JPEG: Instagram non accetta PNG; la pagina ha sempre uno sfondo pieno, quindi la trasparenza non serve
      const blob = await stageRef.current.toBlob({ pixelRatio: 1 / scale, mimeType: 'image/jpeg', quality: JPEG_QUALITY });
      blobs.push(blob);
    }
    setPageIndex(0);
    onExport(blobs, { width, height });
  };

  // Il pulsante «Esporta nel post» in alto nello Studio chiama la stessa esportazione
  const exportRef = useRef(exportPages);
  useEffect(() => {
    exportRef.current = exportPages;
  });
  useEffect(() => {
    registerExport?.(() => exportRef.current());
    return () => registerExport?.(null);
  }, [registerExport]);

  const onKeyDown = (e) => {
    if (!selected || !['Delete', 'Backspace'].includes(e.key)) return;
    e.preventDefault();
    removeLayer(selected.id);
  };

  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: wide ? { xs: '1fr', md: 'minmax(0, 1fr) 260px' } : { xs: '1fr', xl: 'minmax(0, 1fr) 260px' }, alignItems: 'start' }}>
      <Stack spacing={1.5} sx={{ minWidth: 0 }}>
        {/* Pagine */}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          {design.pages.map((p, i) => (
            <Button key={p.id} size="small" variant={i === pageIndex ? 'contained' : 'outlined'} color="inherit" onClick={() => (setPageIndex(i), setSelectedId(null))} sx={{ minWidth: 36 }}>
              {i + 1}
            </Button>
          ))}
          <Tooltip title="Aggiungi pagina">
            <span>
              <IconButton size="small" onClick={addPage} disabled={design.pages.length >= MAX_PAGES} aria-label="Aggiungi pagina">
                <Iconify icon="mingcute:add-line" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Duplica pagina">
            <span>
              <IconButton size="small" onClick={duplicatePage} disabled={design.pages.length >= MAX_PAGES} aria-label="Duplica pagina">
                <Iconify icon="solar:copy-bold" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Elimina pagina">
            <span>
              <IconButton size="small" onClick={removePage} disabled={design.pages.length <= 1} aria-label="Elimina pagina">
                <Iconify icon="solar:trash-bin-trash-bold" />
              </IconButton>
            </span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" startIcon={<Iconify icon="mingcute:add-line" />} onClick={(e) => setAddAnchor(e.currentTarget)} disabled={page.layers.length >= MAX_LAYERS}>
            Aggiungi
          </Button>
          <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
            <MenuItem onClick={() => addLayer('testo')}>Testo</MenuItem>
            <MenuItem onClick={() => addLayer('forma')}>Forma</MenuItem>
            {logoUrl && <MenuItem onClick={() => addLayer('logo')}>Logo del cliente</MenuItem>}
            {images.length ? (
              images.map((m) => (
                <MenuItem key={m.id} onClick={() => addLayer('immagine', { mediaId: m.id })}>
                  <Box component="img" src={m.url} alt="" sx={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 0.5, mr: 1 }} />
                  Foto «{m.fileName}»
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled>Carica una foto nel materiale per usarla</MenuItem>
            )}
          </Menu>
        </Stack>

        {/* Tela */}
        <Box ref={boxRef} tabIndex={0} onKeyDown={onKeyDown} sx={{ outline: 'none', '&:focus-visible': { outline: 2, outlineColor: 'primary.main' } }}>
          <Box sx={{ width: width * scale, height: height * scale, mx: 'auto', boxShadow: (t) => t.vars.customShadows.z8, borderRadius: 0.5, overflow: 'hidden' }}>
            <Stage
              ref={stageRef}
              width={width * scale}
              height={height * scale}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={(e) => e.target === e.target.getStage() && setSelectedId(null)}
              onTouchStart={(e) => e.target === e.target.getStage() && setSelectedId(null)}
            >
              <KLayer key={fontsReady}>
                <Rect width={width} height={height} fill={page.background} onMouseDown={() => setSelectedId(null)} />
                {page.layers.map((l) => (
                  <Group
                    key={l.id}
                    ref={(node) => (node ? nodes.current.set(l.id, node) : nodes.current.delete(l.id))}
                    x={l.x}
                    y={l.y}
                    rotation={l.rotation}
                    opacity={l.opacity}
                    draggable
                    onMouseDown={() => setSelectedId(l.id)}
                    onTap={() => setSelectedId(l.id)}
                    onDragEnd={(e) => updateLayer(l.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
                    onTransformEnd={(e) => onTransformEnd(l, e.target)}
                  >
                    <LayerContent layer={l} mediaUrl={mediaUrl} logoUrl={logoUrl} />
                  </Group>
                ))}
                <Transformer ref={trRef} rotationSnaps={[0, 90, 180, 270]} keepRatio={false} borderStroke="#CDA434" anchorStroke="#CDA434" anchorSize={8} />
              </KLayer>
            </Stage>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {DESIGN_SIZES[design.size].label} · {width}×{height} · pagina {pageIndex + 1} di {design.pages.length}
          </Typography>
        </Stack>
        <Button variant="contained" color="inherit" onClick={exportPages} loading={exporting} startIcon={<Iconify icon="solar:export-bold" />} sx={{ alignSelf: 'center' }}>
          Esporta nel post ({design.pages.length} {design.pages.length === 1 ? 'immagine' : 'immagini'})
        </Button>
      </Stack>

      {/* Proprietà */}
      <Stack spacing={2}>
        <TextField select label="Misura" size="small" value={design.size} onChange={(e) => onChange({ ...design, size: e.target.value })}>
          {Object.entries(DESIGN_SIZES).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField type="color" label="Sfondo della pagina" size="small" value={page.background} onChange={(e) => setPage((p) => ({ ...p, background: e.target.value.toUpperCase() }))} />
        <Divider />
        {selected ? (
          <LayerProps layer={selected} onChange={(changes) => updateLayer(selected.id, changes)} onRemove={() => removeLayer(selected.id)} onMove={(dir) => moveLayer(selected.id, dir)} />
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Seleziona un elemento sulla grafica per modificarlo: trascinalo per spostarlo, usa le maniglie per ridimensionarlo o ruotarlo.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

// ----------------------------------------------------------------------

const KIND_LABEL = { testo: 'Testo', immagine: 'Foto', logo: 'Logo', forma: 'Forma' };

function LayerProps({ layer, onChange, onRemove, onMove }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {KIND_LABEL[layer.type]}
        </Typography>
        <Tooltip title="Porta indietro">
          <IconButton size="small" onClick={() => onMove(-1)} aria-label="Porta indietro">
            <Iconify icon="solar:arrow-down-bold" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Porta avanti">
          <IconButton size="small" onClick={() => onMove(1)} aria-label="Porta avanti">
            <Iconify icon="solar:arrow-up-bold" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Elimina (tasto Canc)">
          <IconButton size="small" color="error" onClick={onRemove} aria-label="Elimina elemento">
            <Iconify icon="solar:trash-bin-trash-bold" />
          </IconButton>
        </Tooltip>
      </Stack>

      {layer.type === 'testo' && (
        <>
          <TextField label="Testo" value={layer.text} onChange={(e) => onChange({ text: e.target.value })} multiline minRows={3} size="small" slotProps={{ htmlInput: { maxLength: 600 } }} />
          <TextField select label="Font" size="small" value={layer.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
            {DESIGN_FONTS.map((f) => (
              <MenuItem key={f} value={f} sx={{ fontFamily: `'${f}'` }}>
                {FONT_LABELS[f]}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <TextField type="number" label="Corpo (px)" size="small" value={layer.fontSize} onChange={(e) => onChange({ fontSize: Math.min(400, Math.max(8, Number(e.target.value) || 8)) })} />
            <TextField type="color" label="Colore" size="small" value={layer.color} onChange={(e) => onChange({ color: e.target.value.toUpperCase() })} sx={{ minWidth: 90 }} />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ToggleButtonGroup size="small" exclusive value={layer.align} onChange={(_, v) => v && onChange({ align: v })}>
              <ToggleButton value="left" aria-label="Allinea a sinistra">
                <Iconify icon="solar:align-left-bold" width={18} />
              </ToggleButton>
              <ToggleButton value="center" aria-label="Centra">
                <Iconify icon="solar:align-horizontal-center-bold" width={18} />
              </ToggleButton>
              <ToggleButton value="right" aria-label="Allinea a destra">
                <Iconify icon="solar:align-right-bold" width={18} />
              </ToggleButton>
            </ToggleButtonGroup>
            <ToggleButton size="small" value="bold" selected={layer.bold} onChange={() => onChange({ bold: !layer.bold })} aria-label="Grassetto">
              <b>G</b>
            </ToggleButton>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ToggleButton size="small" value="box" selected={!!layer.background} onChange={() => onChange({ background: layer.background ? null : '#FFFFFF' })}>
              Riquadro
            </ToggleButton>
            {layer.background && <TextField type="color" label="Colore riquadro" size="small" value={layer.background} onChange={(e) => onChange({ background: e.target.value.toUpperCase() })} sx={{ minWidth: 110 }} />}
          </Stack>
        </>
      )}

      {layer.type === 'immagine' && (
        <ToggleButtonGroup size="small" exclusive value={layer.fit} onChange={(_, v) => v && onChange({ fit: v })}>
          <ToggleButton value="riempi">Riempi</ToggleButton>
          <ToggleButton value="contieni">Intera</ToggleButton>
        </ToggleButtonGroup>
      )}

      {layer.type === 'forma' && (
        <>
          <ToggleButtonGroup size="small" exclusive value={layer.shape} onChange={(_, v) => v && onChange({ shape: v })}>
            <ToggleButton value="rettangolo">Rettangolo</ToggleButton>
            <ToggleButton value="cerchio">Cerchio</ToggleButton>
          </ToggleButtonGroup>
          <TextField type="color" label="Colore" size="small" value={layer.fill} onChange={(e) => onChange({ fill: e.target.value.toUpperCase() })} />
        </>
      )}

      <TextField
        type="number"
        label="Opacità (%)"
        size="small"
        value={Math.round(layer.opacity * 100)}
        onChange={(e) => onChange({ opacity: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })}
        slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
      />
    </Stack>
  );
}
