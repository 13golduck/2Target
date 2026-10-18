'use client';

import { useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { runBackupNow } from './actions';

// ----------------------------------------------------------------------
// Stato di 2Target a colpo d'occhio: semaforo per ogni controllo e backup del database conservati.
// Gli stessi controlli mandano un'email agli amministratori quando qualcosa diventa rosso.

const LEVEL = {
  ok: { color: 'success', icon: 'eva:checkmark-circle-2-fill', word: 'ok' },
  attenzione: { color: 'warning', icon: 'solar:danger-triangle-bold', word: 'da guardare' },
  errore: { color: 'error', icon: 'solar:danger-triangle-bold', word: 'da sistemare' },
};

const size = (b) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function SystemCard({ checks, backups, backupDir }) {
  const [busy, start] = useTransition();
  const worst = checks.some((c) => c.level === 'errore') ? 'errore' : checks.some((c) => c.level === 'attenzione') ? 'attenzione' : 'ok';

  const backup = () =>
    start(async () => {
      const r = await runBackupNow();
      if (r.error) toast.error(r.error);
      else toast.success(`Backup eseguito (${size(r.bytes)})`);
    });

  return (
    <Card id="sistema">
      <CardHeader
        title="Stato del sistema"
        subheader="Controlli automatici ogni 15 minuti: se qualcosa diventa rosso gli amministratori ricevono un'email."
        action={<Label color={LEVEL[worst].color}>{worst === 'ok' ? 'Tutto ok' : LEVEL[worst].word}</Label>}
      />
      <Stack divider={<Divider flexItem />} sx={{ px: 3, pt: 2 }}>
        {checks.map((c) => (
          <Stack key={c.key} direction="row" spacing={1.5} sx={{ py: 1.25, alignItems: 'center' }}>
            <Iconify icon={LEVEL[c.level].icon} sx={{ color: `${LEVEL[c.level].color}.main`, flexShrink: 0 }} />
            <Typography variant="subtitle2" sx={{ width: 240, flexShrink: 0 }}>
              {c.label}
            </Typography>
            <Typography variant="body2" sx={{ color: c.level === 'ok' ? 'text.secondary' : `${LEVEL[c.level].color}.dark` }}>
              {c.detail}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ p: 3 }}>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            Backup del database
          </Typography>
          <Button variant="outlined" onClick={backup} loading={busy} startIcon={<Iconify icon="solar:restart-bold" />}>
            Esegui backup ora
          </Button>
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          Ogni notte alle 2. Si conservano gli ultimi 7 giorni, 4 settimane e 6 mesi nella cartella privata del server{' '}
          <code>{backupDir}</code> (fuori dal sito, non scaricabile dal browser). Per un ripristino chiedi al tecnico: è un file SQL
          compresso.
        </Typography>
        {backups.length ? (
          <Stack spacing={0.5}>
            {backups.slice(0, 5).map((b) => (
              <Typography key={b.name} variant="body2">
                {fmtDateTime(new Date(b.at))} · {size(b.bytes)}
              </Typography>
            ))}
            {backups.length > 5 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                e altri {backups.length - 5} più vecchi
              </Typography>
            )}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Ancora nessun backup.
          </Typography>
        )}
      </Box>
    </Card>
  );
}
