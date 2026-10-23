'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Tabs from '@mui/material/Tabs';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';

import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';

import { createBrief } from '../../design-actions';

// ----------------------------------------------------------------------
// Brief grafico del Senior Graphic Designer AI: concept, layout, slide/scene, palette, tipografia,
// passi per Canva e per Adobe, checklist prima della pubblicazione.

function briefToText(b) {
  return [
    `CONCEPT: ${b.concept}`,
    `PERCHÉ: ${b.why}`,
    `FORMATO: ${b.format}`,
    `LAYOUT: ${b.layout}`,
    '',
    ...b.frames.map((f, i) => `${i + 1}. ${f.title}\n   Visual: ${f.visual}\n   Testo: ${f.text}`),
    '',
    `TITOLO: ${b.hierarchy.headline}`,
    `SUPPORTO: ${b.hierarchy.support}`,
    `CTA: ${b.hierarchy.cta}`,
    `PALETTE: ${b.palette.map((p) => `${p.hex} (${p.use})`).join(', ')}`,
    `TIPOGRAFIA: ${b.typography}`,
    `IMMAGINI: ${b.imagery}`,
    '',
    `CANVA: ${b.tools.canva}`,
    `ADOBE: ${b.tools.adobe}`,
    '',
    `CHECKLIST:\n${b.checklist.map((c) => `- ${c}`).join('\n')}`,
  ].join('\n');
}

export function BriefPanel({ itemId, brief: initial, aiConfigured, hasBrandKit, clientId }) {
  const [brief, setBrief] = useState(initial);
  const [note, setNote] = useState('');
  const [tool, setTool] = useState('canva');
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      const r = await createBrief(itemId, note);
      if (r?.error) toast.error(r.error);
      else {
        setBrief(r.brief);
        setNote('');
        toast.success('Brief grafico pronto');
      }
    });

  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="solar:pallete-2-bold" width={24} sx={{ color: 'primary.main' }} />}
        title="Brief grafico"
        subheader="Il Senior Graphic Designer AI: concept, layout e istruzioni per Canva o Adobe"
        action={
          brief && (
            <Button
              size="small"
              color="inherit"
              startIcon={<Iconify icon="solar:copy-bold" />}
              onClick={() => navigator.clipboard.writeText(briefToText(brief)).then(() => toast.success('Brief copiato'))}
            >
              Copia
            </Button>
          )
        }
      />
      <Box sx={{ p: 3, pt: 1 }}>
        {!hasBrandKit && (
          <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: 'warning.dark' }}>
            Il cliente non ha ancora un brand kit: il brief sarà più preciso dopo averlo definito in{' '}
            <Box component="a" href={`/clienti/${clientId}/brand`} sx={{ color: 'inherit' }}>Brand</Box>.
          </Typography>
        )}

        {brief ? (
          <Stack spacing={2.5}>
            <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: 'primary.lighter' }}>
              <Typography variant="overline" sx={{ color: 'primary.darker' }}>Concept</Typography>
              <Typography variant="h6" sx={{ lineHeight: 1.35 }}>{brief.concept}</Typography>
              <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>{brief.why}</Typography>
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Field label="Formato" value={brief.format} />
                <Field label="Layout" value={brief.layout} />
                <Field label="Tipografia" value={brief.typography} />
                <Field label="Immagini" value={brief.imagery} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>GERARCHIA</Typography>
                <Box sx={{ p: 2, mt: 0.5, mb: 2, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>{brief.hierarchy.headline}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{brief.hierarchy.support}</Typography>
                  <Box sx={{ display: 'inline-block', mt: 1, px: 1.25, py: 0.5, borderRadius: 1, bgcolor: 'text.primary', color: 'background.paper', typography: 'caption', fontWeight: 700 }}>
                    {brief.hierarchy.cta}
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>PALETTE</Typography>
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                  {brief.palette.map((p, i) => (
                    <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: 0.75, bgcolor: p.hex, border: 1, borderColor: 'divider', flexShrink: 0 }} />
                      <Typography variant="body2">
                        <b>{p.hex}</b> · {p.use}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
            </Grid>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                {brief.frames.length > 1 ? `SLIDE / SCENE (${brief.frames.length})` : 'GRAFICA'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1, mt: 0.5 }}>
                {brief.frames.map((f, i) => (
                  <Box key={i} sx={{ minWidth: 200, maxWidth: 240, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider', bgcolor: 'background.neutral' }}>
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>
                      {i + 1}. {f.title}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{f.visual}</Typography>
                    {f.text && (
                      <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                        “{f.text}”
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              <Tabs value={tool} onChange={(_, v) => setTool(v)} sx={{ mb: 1 }}>
                <Tab value="canva" label="In Canva" />
                <Tab value="adobe" label="In Adobe" />
              </Tabs>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.65 }}>
                {tool === 'canva' ? brief.tools.canva : brief.tools.adobe}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>CHECKLIST PRIMA DI PUBBLICARE</Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {brief.checklist.map((c, i) => (
                  <Stack key={i} direction="row" spacing={1}>
                    <Iconify icon="solar:check-square-bold" width={18} sx={{ color: 'success.main', mt: 0.2, flexShrink: 0 }} />
                    <Typography variant="body2">{c}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            L’AI legge la scheda (formato, gancio, testo, CTA), il brand kit e il posizionamento del cliente e prepara il brief per chi realizza la grafica.
          </Typography>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2.5 }}>
          <TextField
            size="small"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={brief ? 'Cosa cambiare? Es. più minimal, foto al posto dell’illustrazione…' : 'Indicazioni facoltative per il designer'}
            fullWidth
          />
          <Button variant="outlined" onClick={generate} loading={pending} disabled={!aiConfigured} startIcon={<Iconify icon="solar:atom-bold-duotone" />} sx={{ flexShrink: 0 }}>
            {brief ? 'Rigenera' : 'Crea il brief'}
          </Button>
        </Stack>
        {!aiConfigured && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>AI spenta: manca la chiave API.</Typography>
        )}
      </Box>
    </Card>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{label.toUpperCase()}</Typography>
      <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{value}</Typography>
    </Box>
  );
}
