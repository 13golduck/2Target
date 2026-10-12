'use client';

import { useEffect, useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

import { fmtDateTime } from 'src/lib/format';

import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';

import { DesignReviewPanel } from '../../../design-review-panel';
import { LogoEditor, LOGO_MAX_FILE } from './logo-editor';
import { saveBrandKit, proposeBrandKit } from '../../../design-actions';

// ----------------------------------------------------------------------
// Brand kit del cliente: colori, font, tono visivo, regole. È la base dei brief grafici e delle revisioni.

const EMPTY = { palette: [], fonts: [], visualTone: '', imagery: '', layoutRules: [], dos: [], donts: [] };
const toLines = (a) => (a ?? []).join('\n');
const fromLines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);

/** Carica da Google Fonts i font del kit, così l'anteprima è fedele. */
function useGoogleFonts(fonts) {
  useEffect(() => {
    const names = fonts.map((f) => f.name.trim()).filter(Boolean);
    if (!names.length) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${names.map((n) => `family=${encodeURIComponent(n)}:wght@400;700`).join('&')}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [fonts]);
}

export function BrandView({ clientId, aiConfigured, kit, reviews }) {
  const [data, setData] = useState(kit?.data ?? EMPTY);
  const [logo, setLogo] = useState(kit?.logo ?? '');
  const [icon, setIcon] = useState(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [saving, startSave] = useTransition();
  const [proposing, startPropose] = useTransition();
  useGoogleFonts(data.fonts);

  const set = (patch) => setData((d) => ({ ...d, ...patch }));
  const setColor = (i, patch) => set({ palette: data.palette.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setFont = (i, patch) => set({ fonts: data.fonts.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  const save = () =>
    startSave(async () => {
      const fd = new FormData();
      fd.set('clientId', clientId);
      fd.set('data', JSON.stringify(data));
      fd.set('logo', logoChanged ? logo : 'keep');
      if (logoChanged) fd.set('icon', icon ?? '');
      const r = await saveBrandKit(fd);
      if (r?.error) toast.error(r.error);
      else {
        setLogoChanged(false);
        toast.success('Brand kit salvato');
      }
    });

  const propose = () =>
    startPropose(async () => {
      const r = await proposeBrandKit(clientId);
      if (r?.error) toast.error(r.error);
      else {
        setData(r.data);
        toast.success('Proposta pronta: rivedila e salva');
      }
    });

  // Il logo passa dall'editor: margini tolti, compressione e icona quadrata
  const pickLogo = (file) => {
    if (!file) return;
    if (file.size > LOGO_MAX_FILE) {
      toast.error('Immagine troppo grande: massimo 20 MB');
      return;
    }
    setLogoFile(file);
  };

  const headFont = data.fonts[0]?.name || 'inherit';
  const bodyFont = data.fonts[1]?.name || headFont;
  const bg = data.palette.find((c) => /sfondo|background/i.test(c.role))?.hex ?? '#FFFFFF';
  const ink = data.palette.find((c) => /testo|text/i.test(c.role))?.hex ?? '#1C1C1C';
  const accent = data.palette.find((c) => /primar|accent/i.test(c.role))?.hex ?? data.palette[0]?.hex ?? '#CDA434';

  return (
    <Grid container spacing={3}>
      <LogoEditor
        file={logoFile}
        onClose={() => setLogoFile(null)}
        onConfirm={(r) => {
          setLogo(r.logo);
          setIcon(r.icon);
          setLogoChanged(true);
          setLogoFile(null);
          toast.success('Logo pronto: salva il brand kit per confermarlo');
        }}
      />
      <Grid size={{ xs: 12, lg: 7 }}>
        <Card>
          <CardHeader
            sx={{ flexWrap: 'wrap', gap: 1.5, '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }}
            title="Brand kit"
            subheader={kit ? `Aggiornato il ${fmtDateTime(new Date(kit.updatedAt))}` : 'Colori, font e regole visive del cliente: li usa l’AI per brief e revisioni'}
            action={
              <Button variant="outlined" color="inherit" onClick={propose} loading={proposing} disabled={!aiConfigured} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
                Proponi con l’AI
              </Button>
            }
          />
          <Stack spacing={3} sx={{ p: 3 }}>
            {!kit && (
              <Alert severity="info">
                Nessun brand kit. Puoi compilarlo a mano o farlo proporre all’AI partendo dal posizionamento del check-up.
              </Alert>
            )}

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Logo</Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 96, height: 96, borderRadius: 2, border: 1, borderColor: 'divider', display: 'grid', placeItems: 'center', bgcolor: 'background.neutral', overflow: 'hidden' }}>
                  {logo ? <Box component="img" src={logo} alt="Logo" sx={{ maxWidth: '90%', maxHeight: '90%' }} /> : <Iconify icon="solar:gallery-bold" width={28} sx={{ color: 'text.disabled' }} />}
                </Box>
                <Button component="label" variant="outlined" color="inherit" size="small">
                  Carica logo
                  <input
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    onChange={(e) => {
                      pickLogo(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </Button>
                {logo && (
                  <Button size="small" color="inherit" onClick={() => { setLogo(''); setIcon(null); setLogoChanged(true); }}>
                    Rimuovi
                  </Button>
                )}
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Palette</Typography>
              <Stack spacing={1}>
                {data.palette.map((c, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'grid',
                      gap: 1,
                      alignItems: 'center',
                      gridTemplateColumns: { xs: '44px 1fr 36px', sm: '44px 120px 1fr 1fr 36px' },
                      pb: { xs: 1.5, sm: 0 },
                      borderBottom: { xs: 1, sm: 0 },
                      borderColor: 'divider',
                    }}
                  >
                    <Box component="input" type="color" value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} sx={{ width: 44, height: 40, p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer' }} />
                    <TextField size="small" label="HEX" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value })} />
                    <IconButton size="small" onClick={() => set({ palette: data.palette.filter((_, j) => j !== i) })} sx={{ order: { xs: 0, sm: 5 } }}>
                      <Iconify icon="mingcute:close-line" />
                    </IconButton>
                    <TextField size="small" label="Nome" value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 1, sm: 3 } }} />
                    <TextField size="small" label="Ruolo" value={c.role} onChange={(e) => setColor(i, { role: e.target.value })} placeholder="primario, accento, sfondo, testo" sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 2, sm: 4 } }} />
                  </Box>
                ))}
                <Button size="small" sx={{ alignSelf: 'flex-start' }} startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => set({ palette: [...data.palette, { name: '', hex: '#CDA434', role: '' }] })}>
                  Aggiungi colore
                </Button>
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Font</Typography>
              <Stack spacing={1}>
                {data.fonts.map((f, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'grid',
                      gap: 1,
                      alignItems: 'center',
                      gridTemplateColumns: { xs: '1fr 36px', sm: '1fr 1fr 1fr 36px' },
                      pb: { xs: 1.5, sm: 0 },
                      borderBottom: { xs: 1, sm: 0 },
                      borderColor: 'divider',
                    }}
                  >
                    <TextField size="small" label="Font (Google Fonts)" value={f.name} onChange={(e) => setFont(i, { name: e.target.value })} />
                    <IconButton size="small" onClick={() => set({ fonts: data.fonts.filter((_, j) => j !== i) })} sx={{ order: { xs: 0, sm: 5 } }}>
                      <Iconify icon="mingcute:close-line" />
                    </IconButton>
                    <TextField size="small" label="Uso" value={f.use} onChange={(e) => setFont(i, { use: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 1, sm: 2 } }} />
                    <TextField size="small" label="Alternativa Canva" value={f.alternative} onChange={(e) => setFont(i, { alternative: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 2, sm: 3 } }} />
                  </Box>
                ))}
                <Button size="small" sx={{ alignSelf: 'flex-start' }} startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => set({ fonts: [...data.fonts, { name: '', use: '', alternative: '' }] })}>
                  Aggiungi font
                </Button>
              </Stack>
            </Box>

            <TextField label="Tono visivo" value={data.visualTone} onChange={(e) => set({ visualTone: e.target.value })} multiline minRows={2} fullWidth />
            <TextField label="Stile di foto e illustrazioni" value={data.imagery} onChange={(e) => set({ imagery: e.target.value })} multiline minRows={2} fullWidth />
            <TextField label="Regole di composizione (una per riga)" value={toLines(data.layoutRules)} onChange={(e) => set({ layoutRules: fromLines(e.target.value) })} multiline minRows={3} fullWidth />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Da fare (una per riga)" value={toLines(data.dos)} onChange={(e) => set({ dos: fromLines(e.target.value) })} multiline minRows={4} fullWidth />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Da evitare (una per riga)" value={toLines(data.donts)} onChange={(e) => set({ donts: fromLines(e.target.value) })} multiline minRows={4} fullWidth />
              </Grid>
            </Grid>

            <Button variant="contained" onClick={save} loading={saving} sx={{ alignSelf: 'flex-start' }}>
              Salva brand kit
            </Button>
          </Stack>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 5 }}>
        <Stack spacing={3}>
          {/* Anteprima del kit applicato */}
          <Card>
            <CardHeader title="Anteprima" subheader="Come appare un post con questo kit" />
            <Box sx={{ p: 3, pt: 1 }}>
              <Box sx={{ aspectRatio: '4 / 5', borderRadius: 2, bgcolor: bg, color: ink, p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: 1, borderColor: 'divider' }}>
                {logo ? <Box component="img" src={logo} alt="" sx={{ height: 28, alignSelf: 'flex-start' }} /> : <Box />}
                <Box>
                  <Typography sx={{ fontFamily: `'${headFont}', sans-serif`, fontWeight: 700, fontSize: 30, lineHeight: 1.1 }}>Un titolo breve e forte</Typography>
                  <Typography sx={{ fontFamily: `'${bodyFont}', sans-serif`, fontSize: 14, mt: 1.5, opacity: 0.8 }}>
                    Una riga di supporto che spiega il beneficio, senza affollare la grafica.
                  </Typography>
                </Box>
                <Box sx={{ alignSelf: 'flex-start', px: 2, py: 1, borderRadius: 1, bgcolor: accent, color: '#fff', fontFamily: `'${bodyFont}', sans-serif`, fontWeight: 700, fontSize: 13 }}>
                  Scopri di più
                </Box>
              </Box>
              <Stack direction="row" sx={{ mt: 2, borderRadius: 1, overflow: 'hidden', height: 40 }}>
                {data.palette.map((c, i) => (
                  <Box key={i} title={`${c.name} ${c.hex}`} sx={{ flex: 1, bgcolor: c.hex }} />
                ))}
              </Stack>
            </Box>
          </Card>

          <DesignReviewPanel clientId={clientId} reviews={reviews} aiConfigured={aiConfigured} />
        </Stack>
      </Grid>
    </Grid>
  );
}
