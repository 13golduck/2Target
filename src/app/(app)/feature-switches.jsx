'use client';

import { useState, useTransition } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------
// Elenco di interruttori delle funzioni (generale in Impostazioni, per cliente nella sua Panoramica).
// `features`: [{ key, label, description, on, locked?, lockedReason? }]. Si salva con un solo pulsante.

export function FeatureSwitches({ id, title, subheader, features, onSave, readOnly }) {
  const [values, setValues] = useState(() => Object.fromEntries(features.map((f) => [f.key, f.on])));
  const [busy, start] = useTransition();
  const changed = features.some((f) => values[f.key] !== f.on);

  const save = () =>
    start(async () => {
      const r = await onSave(values);
      if (r?.error) toast.error(r.error);
      else toast.success('Funzioni aggiornate: i menu si sono adeguati');
    });

  return (
    <Card id={id} sx={{ scrollMarginTop: 96 }}>
      <CardHeader title={title} subheader={subheader} />
      <Stack divider={<Divider flexItem />} sx={{ px: 3, pt: 1 }}>
        {features.map((f) => (
          <Stack key={f.key} direction="row" spacing={2} sx={{ py: 1.25, alignItems: 'center' }}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2">{f.label}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {f.locked ? f.lockedReason : f.description}
              </Typography>
            </Stack>
            <Switch
              checked={!f.locked && !!values[f.key]}
              disabled={readOnly || f.locked || busy}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
              slotProps={{ input: { 'aria-label': f.label } }}
            />
          </Stack>
        ))}
      </Stack>
      {!readOnly && (
        <Stack direction="row" sx={{ p: 3, pt: 2, justifyContent: 'flex-end' }}>
          <Button variant="contained" onClick={save} disabled={!changed} loading={busy}>
            Salva
          </Button>
        </Stack>
      )}
    </Card>
  );
}
