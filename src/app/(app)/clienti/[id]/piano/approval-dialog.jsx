'use client';

import { useState, useTransition } from 'react';

import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';

import { useRouter } from 'src/routes/hooks';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { setApproval, getApprovalLink, sendForApproval } from '../../../client-settings-actions';

// ----------------------------------------------------------------------
// Approvazione del cliente via link (facoltativa): si attiva per cliente, si mandano in approvazione le schede pronte
// e si copia il link da girare al cliente (WhatsApp, email). Il cliente approva o chiede modifiche senza account.

export function ApprovalButton({ clientId, planId, enabled, readyCount, pendingCount }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(enabled);
  const [link, setLink] = useState('');
  const [busy, start] = useTransition();

  const toggle = (value) =>
    start(async () => {
      const r = await setApproval(clientId, value);
      if (r.error) return toast.error(r.error);
      setOn(value);
      setLink(r.link ?? '');
      router.refresh();
    });

  const makeLink = () =>
    start(async () => {
      const r = await getApprovalLink(clientId);
      if (r.error) toast.error(r.error);
      else setLink(r.link);
    });

  const send = () =>
    start(async () => {
      const r = await sendForApproval(planId);
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.count ? `${r.count} ${r.count === 1 ? 'contenuto mandato' : 'contenuti mandati'} in approvazione` : 'Nessuna bozza completa da mandare');
        router.refresh();
      }
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiato: incollalo nel messaggio al cliente');
    } catch {
      toast.error('Copia non riuscita: seleziona il link e copialo a mano');
    }
  };

  return (
    <>
      <Button color="inherit" startIcon={<Iconify icon="solar:check-circle-bold" />} onClick={() => setOpen(true)}>
        Approvazione cliente{pendingCount ? ` (${pendingCount})` : ''}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Approvazione del cliente via link</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Il cliente apre un link, vede i contenuti «Da approvare» come appariranno sui social e li approva o chiede modifiche. Non serve un account. È facoltativo: se lo spegni, i link già inviati smettono di funzionare.
            </Typography>
            <FormControlLabel control={<Switch checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />} label={on ? 'Attiva per questo cliente' : 'Disattivata'} />

            {on && (
              <>
                <Alert severity="info" action={<Button color="inherit" size="small" onClick={send} loading={busy} disabled={!readyCount}>Manda {readyCount || ''}</Button>}>
                  {readyCount
                    ? `${readyCount} ${readyCount === 1 ? 'bozza completa' : 'bozze complete'} dei prossimi 30 giorni ${readyCount === 1 ? 'può essere mandata' : 'possono essere mandate'} in approvazione.`
                    : 'Nessuna bozza completa nei prossimi 30 giorni. Puoi anche cambiare lo stato di una scheda in «Da approvare».'}
                </Alert>
                {link ? (
                  <TextField
                    value={link}
                    label="Link per il cliente (valido 60 giorni)"
                    fullWidth
                    slotProps={{ input: { readOnly: true, endAdornment: <InputAdornment position="end"><IconButton onClick={copy}><Iconify icon="solar:copy-bold" /></IconButton></InputAdornment> } }}
                  />
                ) : (
                  <Button variant="outlined" onClick={makeLink} loading={busy} startIcon={<Iconify icon="eva:link-2-fill" />}>
                    Crea il link da mandare al cliente
                  </Button>
                )}
                {pendingCount > 0 && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {pendingCount === 1 ? "Ora c'è 1 contenuto" : `Ora ci sono ${pendingCount} contenuti`} in attesa della risposta del cliente.
                  </Typography>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
