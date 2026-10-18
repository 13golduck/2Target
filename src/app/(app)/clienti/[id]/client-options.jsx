'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';

import { RouterLink } from 'src/routes/components';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';

import { previewReport, saveReportSettings, monthlyReportLinkAction } from '../../client-settings-actions';

// ----------------------------------------------------------------------
// Report mensile automatico al cliente e stato dell'approvazione via link.

export function ClientOptions({ clientId, options, readOnly }) {
  const [monthly, setMonthly] = useState(options.reportMonthly);
  const [notify, setNotify] = useState(options.notifyPublished);
  const [email, setEmail] = useState(options.reportEmail ?? '');
  const [preview, setPreview] = useState(null);
  // Ultimi 6 mesi chiusi, dal più recente: il report si apre per il mese scelto
  const [months] = useState(() =>
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - 1 - i);
      return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
    }),
  );
  const [month, setMonth] = useState(months[0].value);

  const openReport = () =>
    start(async () => {
      const r = await monthlyReportLinkAction(clientId, month);
      if (r.error) toast.error(r.error);
      else window.open(r.link, '_blank', 'noopener');
    });
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveReportSettings({ clientId, monthly, notifyPublished: notify, email });
      if (r.error) toast.error(r.error);
      else toast.success(monthly || notify ? `Salvato: le email arriveranno a ${email}` : 'Report e avvisi al cliente disattivati');
    });

  const show = () =>
    start(async () => {
      const r = await previewReport(clientId);
      if (r.error) toast.error(r.error);
      else setPreview(r);
    });

  const test = () =>
    start(async () => {
      const r = await previewReport(clientId, true);
      if (r.error) toast.error(r.error);
      else toast.success(`Prova inviata a ${r.sentTo}`);
    });

  return (
    <Card>
      <CardHeader title="Report, avvisi e approvazione" />
      <Stack spacing={2} sx={{ p: 3, pt: 2 }}>
        <FormControlLabel
          control={<Switch checked={monthly} onChange={(e) => setMonthly(e.target.checked)} disabled={readOnly} />}
          label="Report mensile automatico al cliente"
        />
        <FormControlLabel
          control={<Switch checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={readOnly} />}
          label="Avvisa il cliente quando un post esce (con il link)"
        />
        <TextField
          size="small"
          type="email"
          label="Email del cliente"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={readOnly || !(monthly || notify)}
          fullWidth
          helperText="Report: il 3 di ogni mese con i dati del mese chiuso. Avvisi: appena il post è online (mai per le prove in simulazione)."
        />
        {!readOnly && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="contained" onClick={save} loading={busy}>Salva</Button>
            <Button size="small" onClick={show} disabled={busy}>Anteprima</Button>
            <Button size="small" color="inherit" onClick={test} disabled={busy}>Inviami una prova</Button>
          </Stack>
        )}
        <Stack direction="row" spacing={1} sx={{ pt: 1, borderTop: 1, borderColor: 'divider', alignItems: 'center' }}>
          <TextField select size="small" label="Report del mese" value={month} onChange={(e) => setMonth(e.target.value)} sx={{ flex: 1, textTransform: 'capitalize' }}>
            {months.map((m) => (
              <MenuItem key={m.value} value={m.value} sx={{ textTransform: 'capitalize' }}>{m.label}</MenuItem>
            ))}
          </TextField>
          <Button size="small" variant="outlined" onClick={openReport} disabled={busy}>Apri (PDF e video)</Button>
        </Stack>
        <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>Approvazione via link</Typography>
            <Label color={options.approvalEnabled ? 'success' : 'default'}>{options.approvalEnabled ? 'Attiva' : 'Spenta'}</Label>
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Facoltativa. Si gestisce da <RouterLink href={`/clienti/${clientId}/piano`}>Piano editoriale → Approvazione cliente</RouterLink>.
          </Typography>
        </Box>
      </Stack>

      <Dialog open={!!preview} onClose={() => setPreview(null)} fullWidth maxWidth="md">
        <DialogTitle>{preview?.subject}</DialogTitle>
        <DialogContent>
          {preview && <Box component="iframe" title="Anteprima del report" srcDoc={preview.html} sx={{ width: 1, height: 600, border: 0, borderRadius: 1, bgcolor: '#f4f6f8' }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
