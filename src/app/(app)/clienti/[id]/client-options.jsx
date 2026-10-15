'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
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

import { previewReport, saveReportSettings } from '../../client-settings-actions';

// ----------------------------------------------------------------------
// Report mensile automatico al cliente e stato dell'approvazione via link.

export function ClientOptions({ clientId, options, readOnly }) {
  const [monthly, setMonthly] = useState(options.reportMonthly);
  const [email, setEmail] = useState(options.reportEmail ?? '');
  const [preview, setPreview] = useState(null);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveReportSettings({ clientId, monthly, email });
      if (r.error) toast.error(r.error);
      else toast.success(monthly ? `Report mensile attivo: arriverà a ${email} dal 3 di ogni mese` : 'Report mensile disattivato');
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
      <CardHeader title="Report e approvazione" />
      <Stack spacing={2} sx={{ p: 3, pt: 2 }}>
        <FormControlLabel
          control={<Switch checked={monthly} onChange={(e) => setMonthly(e.target.checked)} disabled={readOnly} />}
          label="Report mensile automatico al cliente"
        />
        <TextField size="small" type="email" label="Email del cliente" value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly || !monthly} fullWidth helperText="Parte il 3 di ogni mese con i dati del mese chiuso" />
        {!readOnly && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" variant="contained" onClick={save} loading={busy}>Salva</Button>
            <Button size="small" onClick={show} disabled={busy}>Anteprima</Button>
            <Button size="small" color="inherit" onClick={test} disabled={busy}>Mandala a me</Button>
          </Stack>
        )}
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
