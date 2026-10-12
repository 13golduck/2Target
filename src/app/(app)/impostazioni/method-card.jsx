'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';

import { updateMethodology } from './actions';
import { askConfirm } from 'src/components/custom-dialog';

// ----------------------------------------------------------------------
// Metodologia Golduck del check-up: le istruzioni che l'AI segue. Ogni salvataggio è una nuova versione;
// i check-up già avviati restano sulla versione con cui sono partiti.

const KINDS = {
  checkup: {
    title: 'Metodologia del check-up',
    subheader: 'Le istruzioni che l’AI segue in ogni check-up: struttura del report, stile, framework, regole sui dati',
    note: 'I check-up già avviati continuano con la versione con cui sono partiti; i nuovi usano quella salvata qui.',
  },
  piano: {
    title: 'Metodologia del piano editoriale',
    subheader: 'Le istruzioni che l’AI segue quando genera un piano: struttura, pilastri, CTA, sponsorizzate, calendario, stile delle caption',
    note: 'Vale per i piani generati da adesso in poi. Più è precisa (esempi, regole, cose da evitare), migliori sono i piani.',
  },
};

export function MethodCard({ method, kind = 'checkup' }) {
  const k = KINDS[kind];
  const [text, setText] = useState(method.text);
  const [pending, start] = useTransition();
  const changed = text.trim() !== method.text.trim();

  const submit = (reset) =>
    start(async () => {
      const fd = new FormData();
      fd.set('text', text);
      fd.set('kind', kind);
      if (reset) fd.set('reset', '1');
      const r = await updateMethodology(fd);
      if (r?.error) toast.error(r.error);
      else toast.success(`Metodologia salvata: versione ${r.version}`);
    });

  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="solar:notes-bold-duotone" width={24} sx={{ color: 'primary.main' }} />}
        title={k.title}
        subheader={k.subheader}
        action={
          <Stack direction="row" spacing={1}>
            <Label color="primary">Versione {method.version}</Label>
            {method.isDefault && <Label>Predefinita</Label>}
          </Stack>
        }
      />
      <Box sx={{ p: 3, pt: 1 }}>
        <TextField
          value={text}
          onChange={(e) => setText(e.target.value)}
          multiline
          minRows={14}
          maxRows={30}
          fullWidth
          slotProps={{ htmlInput: { style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.55 } } }}
        />
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          {method.at === 'predefinita' ? 'Testo predefinito Golduck.' : `Ultima modifica: ${fmtDateTime(new Date(method.at))}.`} {k.note}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
          <Button variant="contained" loading={pending} disabled={!changed} onClick={() => submit(false)}>
            Salva nuova versione
          </Button>
          {changed && (
            <Button color="inherit" disabled={pending} onClick={() => setText(method.text)}>
              Annulla modifiche
            </Button>
          )}
          {!method.isDefault && (
            <Button
              color="inherit"
              disabled={pending}
              onClick={async () => {
                if (await askConfirm({ tone: 'warning', title: `Ripristinare la ${k.title.toLowerCase()} Golduck?`, content: 'Il testo predefinito verrà salvato come nuova versione. Le versioni precedenti restano nello storico.', confirmText: 'Ripristina' })) submit(true);
              }}
            >
              Ripristina predefinita
            </Button>
          )}
        </Stack>
      </Box>
    </Card>
  );
}
