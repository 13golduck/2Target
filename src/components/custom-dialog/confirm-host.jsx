'use client';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// Conferme dell'app al posto di window.confirm: una finestra nello stile di 2Target.
//   if (await askConfirm({ title: 'Archiviare?', content: '…', confirmText: 'Archivia' })) …
// Per i <form action={…}>: onSubmit={(e) => confirmSubmit(e, { … })}

let open = null;

const TONES = {
  error: { icon: 'solar:trash-bin-trash-bold', color: 'error' },
  warning: { icon: 'solar:danger-triangle-bold', color: 'warning' },
  primary: { icon: 'solar:question-circle-bold', color: 'primary' },
  archive: { icon: 'solar:archive-bold', color: 'primary' },
};

/** Chiede conferma: restituisce true se l'utente conferma. Senza ConfirmHost montato ripiega sul confirm del browser. */
export function askConfirm(options) {
  if (!open) return Promise.resolve(window.confirm(options.content ?? options.title));
  return new Promise((resolve) => open({ ...options, resolve }));
}

/** Conferma prima di inviare un form (anche con le Server Actions). */
export function confirmSubmit(event, options) {
  const form = event.currentTarget;
  if (form.dataset.confirmed) {
    delete form.dataset.confirmed;
    return;
  }
  event.preventDefault();
  askConfirm(options).then((ok) => {
    if (!ok) return;
    form.dataset.confirmed = '1';
    form.requestSubmit();
  });
}

/** Conferma prima del clic su un pulsante che invia un form (es. formAction={elimina}). */
export function confirmClick(event, options) {
  const button = event.currentTarget;
  if (button.dataset.confirmed) {
    delete button.dataset.confirmed;
    return;
  }
  event.preventDefault();
  askConfirm(options).then((ok) => {
    if (!ok) return;
    button.dataset.confirmed = '1';
    button.click();
  });
}

export function ConfirmHost() {
  const [state, setState] = useState(null);

  useEffect(() => {
    open = (s) => setState(s);
    return () => {
      open = null;
    };
  }, []);

  const close = (ok) => {
    state?.resolve(ok);
    setState((s) => (s ? { ...s, closing: true } : s));
  };

  const tone = TONES[state?.tone ?? 'primary'];

  return (
    <Dialog
      open={!!state && !state.closing}
      onClose={() => close(false)}
      fullWidth
      maxWidth="xs"
      slotProps={{ transition: { onExited: () => setState(null) } }}
    >
      {state && (
        <>
          <DialogContent sx={{ pt: 3 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: `${tone.color}.lighter`,
                  color: `${tone.color}.main`,
                }}
              >
                <Iconify icon={tone.icon} width={24} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6">{state.title}</Typography>
                {state.content && (
                  <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary' }}>
                    {state.content}
                  </Typography>
                )}
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button variant="outlined" color="inherit" onClick={() => close(false)}>
              {state.cancelText ?? 'Annulla'}
            </Button>
            <Button variant="contained" color={tone.color} onClick={() => close(true)} autoFocus>
              {state.confirmText ?? 'Conferma'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
