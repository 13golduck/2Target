'use client';

import { useRef, useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Collapse from '@mui/material/Collapse';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

import { fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { askConfirm } from 'src/components/custom-dialog';

import { deleteReview, reviewUpload } from './design-actions';

// ----------------------------------------------------------------------
// Revisione da art director: si carica la grafica (PNG/JPG), l'AI la valuta con il brand kit e propone le correzioni.

const VERDICT = {
  pronta: { label: 'Pronta', color: 'success' },
  piccole_correzioni: { label: 'Piccole correzioni', color: 'warning' },
  da_rifare: { label: 'Da rifare', color: 'error' },
};
const SEVERITY = { alta: 'error', media: 'warning', bassa: 'default' };
const AREA = {
  gerarchia: 'Gerarchia',
  leggibilita: 'Leggibilità',
  contrasto: 'Contrasto',
  allineamento: 'Allineamento',
  spaziatura: 'Spaziatura',
  brand: 'Brand',
  testo: 'Testo',
  formato: 'Formato',
  messaggio: 'Messaggio',
};

/** Miniatura JPEG lato browser (si conserva solo questa, non l'originale). */
function makeThumb(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 360 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.75));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve('');
    img.src = URL.createObjectURL(file);
  });
}

export function DesignReviewPanel({ clientId, itemId, reviews, aiConfigured }) {
  const input = useRef(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(reviews[0]?.id ?? null);

  const upload = (file) =>
    start(async () => {
      const fd = new FormData();
      fd.set('clientId', clientId);
      if (itemId) fd.set('itemId', itemId);
      fd.set('file', file);
      fd.set('thumb', await makeThumb(file));
      const r = await reviewUpload(fd);
      if (r?.error) toast.error(r.error);
      else toast.success('Revisione pronta');
    });

  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="solar:eye-bold" width={24} sx={{ color: 'primary.main' }} />}
        title="Revisione grafica"
        subheader="Carica la grafica finita: l’AI la controlla come un art director, con il brand kit del cliente"
      />
      <Box sx={{ p: 3, pt: 1 }}>
        <Box
          onClick={() => !pending && input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          sx={{
            p: 3,
            borderRadius: 2,
            border: '2px dashed',
            borderColor: 'divider',
            textAlign: 'center',
            cursor: pending ? 'wait' : 'pointer',
            bgcolor: 'background.neutral',
            '&:hover': { borderColor: 'primary.main' },
          }}
        >
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
          <Iconify icon={pending ? 'svg-spinners:3-dots-fade' : 'solar:cloud-upload-bold'} width={36} sx={{ color: 'text.disabled' }} />
          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            {pending ? 'L’AI sta guardando la grafica…' : 'Trascina qui la grafica o clicca per sceglierla'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            PNG, JPG o WebP fino a 5 MB · per un carosello, una slide alla volta · {aiConfigured ? 'circa 0,05 $ a revisione' : 'AI spenta'}
          </Typography>
        </Box>

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {reviews.map((r) => {
            const v = VERDICT[r.result.verdict] ?? VERDICT.piccole_correzioni;
            const isOpen = open === r.id;
            return (
              <Box key={r.id} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
                <Stack direction="row" spacing={1.5} sx={{ p: 1.5, alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r.id)}>
                  {r.thumb ? (
                    <Box component="img" src={r.thumb} alt="" sx={{ width: 48, height: 48, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <Iconify icon="solar:gallery-bold" width={32} sx={{ color: 'text.disabled' }} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {r.fileName || 'Grafica'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {fmtDateTime(new Date(r.createdAt))}
                    </Typography>
                  </Box>
                  <Typography variant="h5" sx={{ color: r.result.score >= 8 ? 'success.main' : r.result.score >= 6 ? 'warning.main' : 'error.main' }}>
                    {r.result.score}
                    <Box component="span" sx={{ typography: 'caption', color: 'text.disabled' }}>/10</Box>
                  </Typography>
                  <Label color={v.color}>{v.label}</Label>
                  <Iconify icon={isOpen ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'} />
                </Stack>
                <Collapse in={isOpen}>
                  <Box sx={{ p: 2, pt: 0 }}>
                    <Typography variant="body2" sx={{ mb: 1.5 }}>{r.result.summary}</Typography>
                    {r.result.strengths.length > 0 && (
                      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
                        {r.result.strengths.map((s, i) => (
                          <Stack key={i} direction="row" spacing={1}>
                            <Iconify icon="solar:check-circle-bold" width={18} sx={{ color: 'success.main', mt: 0.2, flexShrink: 0 }} />
                            <Typography variant="body2">{s}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                    <Stack spacing={1}>
                      {r.result.issues.map((it, i) => (
                        <Box key={i} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                          <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                            <Label color={SEVERITY[it.severity]}>{it.severity}</Label>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>{AREA[it.area] ?? it.area}</Typography>
                          </Stack>
                          <Typography variant="body2">{it.problem}</Typography>
                          <Typography variant="body2" sx={{ color: 'primary.darker', mt: 0.5 }}>
                            → {it.fix}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                    <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 1 }}>
                      <IconButton size="small" onClick={async () => {
                          if (!(await askConfirm({ tone: 'error', title: 'Eliminare la revisione?', confirmText: 'Elimina' }))) return;
                          start(async () => {
                            await deleteReview(r.id);
                            toast.success('Revisione eliminata');
                          });
                        }}
                        title="Elimina revisione"
                        aria-label="Elimina revisione"
                      >
                        <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                      </IconButton>
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
          {!reviews.length && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Nessuna revisione ancora.
            </Typography>
          )}
        </Stack>
      </Box>
    </Card>
  );
}
