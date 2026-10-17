'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Radio from '@mui/material/Radio';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import TableContainer from '@mui/material/TableContainer';
import FormControlLabel from '@mui/material/FormControlLabel';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { importPlanItems, planImportStatus, analyzePlanDocument } from '../../../plan-import-actions';

// ----------------------------------------------------------------------
// Importazione del piano editoriale da Excel, Word, PDF o CSV: l'AI legge il documento, il consulente
// controlla e corregge le pubblicazioni trovate, poi sceglie se crearne un nuovo piano o aggiungerle a quello aperto.

const ACCEPT = '.xlsx,.docx,.pdf,.csv,.txt,.md';

export function PlanImportDialog({ open, onClose, clientId, plan, formats, platforms }) {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [target, setTarget] = useState(plan ? 'current' : 'new');
  const [planName, setPlanName] = useState('');
  const [planMeta, setPlanMeta] = useState(null);
  const [reading, startReading] = useTransition();
  const [importing, startImport] = useTransition();

  const reset = () => {
    setPlanMeta(null);
    setFile(null);
    setRows(null);
    setWarnings([]);
  };
  const close = () => {
    reset();
    onClose();
  };

  const read = () =>
    startReading(async () => {
      const fd = new FormData();
      fd.set('clientId', clientId);
      if (plan) fd.set('planId', plan.id);
      fd.set('file', file);
      const start = await analyzePlanDocument(fd);
      if (start?.error) {
        toast.error(start.error);
        return;
      }
      // La lettura gira sul server: chiedo l'esito ogni 4 secondi (un piano lungo può richiedere qualche minuto)
      let s;
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 4000));
        s = await planImportStatus(start.jobId);
        if (s.status !== 'in_corso') break;
      }
      if (s.status === 'errore') {
        toast.error(s.error || 'Lettura non riuscita');
        return;
      }
      const r = s.result;
      setRows(r.items.map((it, i) => ({ ...it, key: i, selected: true })));
      setWarnings(r.warnings ?? []);
      setPlanMeta({ startsOn: r.startsOn, endsOn: r.endsOn, brief: r.brief });
      setPlanName(r.planName || file.name.replace(/\.\w+$/, ''));
      if (!r.items.length) toast.error('Nel documento non ho trovato pubblicazioni');
    });

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows?.filter((r) => r.selected) ?? [];
  const incomplete = chosen.filter((r) => !r.platform || !r.format || !r.title.trim());

  const doImport = () =>
    startImport(async () => {
      const r = await importPlanItems({
        clientId,
        planId: target === 'current' ? plan.id : null,
        newPlanName: target === 'new' ? planName : null,
        newPlan: target === 'new' ? planMeta : null,
        items: chosen.map(({ key, selected, ...it }) => it),
      });
      if (r?.error) toast.error(r.error);
      else {
        toast.success(`Importate ${chosen.length} pubblicazioni come bozze`);
        close();
        router.push(`?piano=${r.planId}`);
        router.refresh();
      }
    });

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth={rows ? 'xl' : 'sm'}>
      <DialogTitle>Importa il piano da un documento</DialogTitle>
      <DialogContent>
        {!rows ? (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Carica il piano editoriale in Excel (.xlsx), Word (.docx), PDF o CSV, fino a 5 MB. L&apos;AI legge il documento e propone le pubblicazioni:
              le controlli e le correggi qui prima di importarle. Non viene pubblicato nulla: arrivano come bozze.
            </Typography>
            <Button component="label" variant="outlined" color="inherit" startIcon={<Iconify icon="eva:cloud-upload-fill" />} disabled={reading}>
              {file ? file.name : 'Scegli il file'}
              <input hidden type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Button>
            {reading && (
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Leggo il documento ed estraggo le pubblicazioni: da 30 secondi a qualche minuto per i piani lunghi. Puoi lasciare aperta questa finestra…
                </Typography>
                <LinearProgress sx={{ mt: 1 }} />
              </Box>
            )}
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Trovate <b>{rows.length}</b> pubblicazioni in «{file?.name}». Togli la spunta a quelle da non importare e correggi date, piattaforma e formato se serve.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2">Imposta per tutte:</Typography>
              <TextField select size="small" label="Piattaforma" value="" onChange={(e) => setRows((rs) => rs.map((x) => ({ ...x, platform: e.target.value, alsoOn: x.alsoOn.filter((p) => p !== e.target.value) })))} sx={{ minWidth: 160 }}>
                {platforms.map((p) => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Anche su"
                value=""
                onChange={(e) => setRows((rs) => rs.map((x) => (x.platform === e.target.value || x.alsoOn.includes(e.target.value) ? x : { ...x, alsoOn: [...x.alsoOn, e.target.value] })))}
                sx={{ minWidth: 160 }}
              >
                {platforms.map((p) => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </TextField>
              <Button size="small" color="inherit" onClick={() => setRows((rs) => rs.map((x) => ({ ...x, alsoOn: [] })))}>
                Togli le ricondivisioni
              </Button>
            </Stack>
            {warnings.length > 0 && (
              <Alert severity="warning">
                {warnings.slice(0, 6).map((w, i) => (
                  <Box key={i}>• {w}</Box>
                ))}
              </Alert>
            )}
            <TableContainer sx={{ maxHeight: 420, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={chosen.length === rows.length}
                        indeterminate={chosen.length > 0 && chosen.length < rows.length}
                        onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, selected: e.target.checked })))}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Data</TableCell>
                    <TableCell sx={{ minWidth: 100 }}>Ora</TableCell>
                    <TableCell sx={{ minWidth: 130 }}>Piattaforma</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Formato</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>Titolo</TableCell>
                    <TableCell sx={{ minWidth: 320 }}>Testo / note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} sx={{ opacity: r.selected ? 1 : 0.45, verticalAlign: 'top' }}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={r.selected} onChange={(e) => update(r.key, { selected: e.target.checked })} />
                      </TableCell>
                      <TableCell>
                        <TextField type="date" size="small" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} error={!r.date} fullWidth />
                      </TableCell>
                      <TableCell>
                        <TextField type="time" size="small" value={r.time} onChange={(e) => update(r.key, { time: e.target.value })} fullWidth />
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" value={r.platform} onChange={(e) => update(r.key, { platform: e.target.value, alsoOn: r.alsoOn.filter((p) => p !== e.target.value) })} error={!r.platform} fullWidth>
                          {platforms.map((p) => (
                            <MenuItem key={p} value={p}>{p}</MenuItem>
                          ))}
                        </TextField>
                        {r.alsoOn.length > 0 && (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>+ {r.alsoOn.join(', ')}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" value={r.format} onChange={(e) => update(r.key, { format: e.target.value })} error={!r.format} fullWidth>
                          {formats.map((f) => (
                            <MenuItem key={f} value={f}>{f}</MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField size="small" value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} error={!r.title.trim()} fullWidth multiline maxRows={3} />
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                          {r.pillar && <Chip size="small" label={r.pillar} />}
                          {r.sponsored && <Chip size="small" color="warning" variant="soft" label="Sponsorizzata" onDelete={() => update(r.key, { sponsored: false })} />}
                          {r.needsMaterial && <Chip size="small" color="error" variant="soft" label="Serve materiale" />}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ display: 'block', whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto', color: 'text.secondary' }}>
                          {[r.hook && `Gancio: ${r.hook}`, r.caption, r.script && `Script: ${r.script}`, r.hashtags, r.cta && `CTA: ${r.cta}`, r.notes && `Layout: ${r.notes}`, r.production && `⚠ ${r.production}`].filter(Boolean).join('\n') || '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Dove importare</Typography>
              <RadioGroup row value={target} onChange={(e) => setTarget(e.target.value)}>
                <FormControlLabel value="new" control={<Radio />} label="In un nuovo piano" />
                {plan && <FormControlLabel value="current" control={<Radio />} label={`Nel piano aperto «${plan.name}»`} />}
              </RadioGroup>
              {target === 'new' && (
                <>
                  <TextField size="small" label="Nome del nuovo piano" value={planName} onChange={(e) => setPlanName(e.target.value)} sx={{ mt: 1, minWidth: 320 }} />
                  {planMeta?.brief && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                      Strategia, budget e note introduttive del documento vanno nel brief del nuovo piano.
                    </Typography>
                  )}
                </>
              )}
            </Box>
            {incomplete.length > 0 && (
              <Alert severity="error">
                {incomplete.length} pubblicazioni selezionate senza titolo, piattaforma o formato: completale (in rosso) o togli la spunta.
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={rows ? reset : close} disabled={reading || importing}>
          {rows ? 'Cambia file' : 'Annulla'}
        </Button>
        {!rows ? (
          <Button variant="contained" onClick={read} disabled={!file} loading={reading} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
            Leggi il documento
          </Button>
        ) : (
          <Button variant="contained" onClick={doImport} disabled={!chosen.length || incomplete.length > 0} loading={importing}>
            Importa {chosen.length} pubblicazioni
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
