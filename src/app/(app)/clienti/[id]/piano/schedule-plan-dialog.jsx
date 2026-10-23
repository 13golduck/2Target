'use client';

import { useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';

import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { schedulePlan, planScheduleOverview } from '../../../publish-actions';

// ----------------------------------------------------------------------
// «Programma il piano»: tutte le schede pronte vanno in programmazione con un clic.
// L'elenco mostra anche cosa è già programmato e, per le altre, cosa manca (così si sistemano dalla scheda).

export function SchedulePlanButton({ planId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="contained" startIcon={<Iconify icon="solar:calendar-mark-bold" />} onClick={() => setOpen(true)}>
        Programma il piano
      </Button>
      {open && <SchedulePlanDialog planId={planId} onClose={() => setOpen(false)} />}
    </>
  );
}

function SchedulePlanDialog({ planId, onClose }) {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [results, setResults] = useState(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();

  // Lettura al primo disegno: il risultato arriva nella callback della transizione, non nel corpo dell'effetto
  useEffect(() => {
    startLoad(async () => {
      const r = await planScheduleOverview(planId);
      if (r.error) setError(r.error);
      else {
        setRows(r.rows);
        setSelected(new Set(r.rows.filter((x) => x.ready.length).map((x) => x.itemId)));
      }
    });
  }, [planId]);

  const ready = rows?.filter((r) => r.ready.length) ?? [];
  const done = rows?.filter((r) => !r.ready.length && r.done.length && !r.problems.length) ?? [];
  const blocked = rows?.filter((r) => !r.ready.length && r.problems.length) ?? [];

  const toggle = (id) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = () =>
    startSend(async () => {
      const r = await schedulePlan(planId, [...selected]);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setResults(r.results);
      toast.success(`${r.scheduled} schede programmate${r.dryRun ? ' (simulazione)' : ''}`);
      router.refresh();
    });

  return (
    <Dialog open fullWidth maxWidth="md" onClose={sending ? undefined : onClose}>
      <DialogTitle>Programma il piano</DialogTitle>
      <DialogContent>
        {loading && <LinearProgress sx={{ my: 2 }} />}
        {error && <Alert severity="error">{error}</Alert>}

        {results ? (
          <Stack spacing={1}>
            {results.map((r) => (
              <Stack key={r.itemId} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <Iconify icon={r.ok ? 'eva:checkmark-circle-2-fill' : 'solar:danger-triangle-bold'} sx={{ color: r.ok ? 'success.main' : 'error.main', mt: 0.25, flexShrink: 0 }} />
                <Box>
                  <Typography variant="subtitle2">{r.title}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{r.ok ? `Programmata su ${r.message}` : r.message}</Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        ) : (
          rows && (
            <Stack spacing={2.5}>
              {!rows.length && <Alert severity="info">Nessuna scheda da programmare in questo piano.</Alert>}

              {ready.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Pronte da programmare ({ready.length})</Typography>
                  <Stack divider={<Divider sx={{ borderStyle: 'dashed' }} />}>
                    {ready.map((r) => (
                      <Stack key={r.itemId} direction="row" spacing={1} sx={{ alignItems: 'flex-start', py: 0.5 }}>
                        <Checkbox size="small" checked={selected.has(r.itemId)} onChange={() => toggle(r.itemId)} sx={{ mt: -0.5 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap>{r.title}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {fmtDateTime(new Date(r.scheduledAt))} · {r.ready.map((x) => x.label).join(', ')}
                          </Typography>
                          {[...r.problems, ...r.warnings].map((p) => (
                            <Typography key={p} variant="caption" component="p" sx={{ color: 'warning.dark' }}>{p}</Typography>
                          ))}
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {blocked.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Da sistemare ({blocked.length})</Typography>
                  <Stack spacing={1}>
                    {blocked.map((r) => (
                      <Stack key={r.itemId} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                        <Iconify icon="solar:danger-triangle-bold" sx={{ color: 'warning.main', mt: 0.25, flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" component={RouterLink} href={`/pubblicazioni/${r.itemId}`} sx={{ color: 'text.primary' }}>
                            {r.title}
                          </Typography>
                          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>{r.problems.join(' · ')}</Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {done.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Già programmate ({done.length})</Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {done.map((r) => (
                      <Label key={r.itemId} color="success" variant="soft">{r.title}</Label>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>{results ? 'Chiudi' : 'Annulla'}</Button>
        {!results && (
          <Button variant="contained" onClick={run} loading={sending} disabled={!selected.size} startIcon={<Iconify icon="solar:calendar-mark-bold" />}>
            Programma {selected.size} {selected.size === 1 ? 'scheda' : 'schede'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
