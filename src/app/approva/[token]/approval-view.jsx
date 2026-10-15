'use client';

import { useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { sendFeedback } from '../actions';
import { PostPreview } from '../../(app)/pubblicazioni/[id]/post-preview';

// ----------------------------------------------------------------------
// Il cliente vede i contenuti in arrivo come appariranno sui social e li approva o chiede modifiche (come Planable).

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : 'data da definire';

export function ApprovalView({ invalid, token, client, channels, items }) {
  const [author, setAuthor] = useState('');
  // Nome ricordato nel browser (se il browser lo consente): si legge dopo il primo disegno
  useEffect(() => {
    let saved = '';
    try {
      saved = localStorage.getItem('2t-approva-nome') ?? '';
    } catch {
      /* nessuna memoria nel browser: si riscrive il nome */
    }
    if (saved) queueMicrotask(() => setAuthor(saved));
  }, []);
  const remember = (v) => {
    setAuthor(v);
    try {
      localStorage.setItem('2t-approva-nome', v);
    } catch {
      /* niente */
    }
  };

  if (invalid) {
    return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
        <Iconify icon="solar:shield-check-bold" width={56} sx={{ color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" sx={{ mb: 1 }}>Link non più valido</Typography>
        <Typography sx={{ color: 'text.secondary' }}>Il link è scaduto o l&apos;approvazione è stata disattivata. Chiedi a Golduck un nuovo link.</Typography>
      </Container>
    );
  }

  const pending = items.filter((i) => i.status === 'da_approvare');
  const others = items.filter((i) => i.status !== 'da_approvare');

  return (
    <Box sx={{ bgcolor: 'background.neutral', minHeight: '100vh' }}>
      <Box sx={{ bgcolor: '#121212', color: '#fff' }}>
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ bgcolor: '#CDA434', color: '#121212', fontWeight: 800, borderRadius: 1, px: 1, py: 0.25 }}>2T</Box>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>2Target · Golduck</Typography>
          </Stack>
          <Typography variant="h4" sx={{ mt: 3 }}>Contenuti da approvare · {client.name}</Typography>
          <Typography sx={{ color: 'grey.400', mt: 0.5 }}>
            Guarda come appariranno sui social. Approva quelli che vanno bene, oppure scrivi cosa cambiare: il team Golduck riceve subito la risposta.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Card sx={{ p: 2.5, mb: 4 }}>
          <TextField label="Il tuo nome" value={author} onChange={(e) => remember(e.target.value)} placeholder="es. Mario Rossi" size="small" sx={{ minWidth: 280 }} helperText="Compare accanto alle tue risposte" />
        </Card>

        {pending.length === 0 && (
          <Alert severity="success" sx={{ mb: 4 }}>
            Niente da approvare in questo momento. Grazie!
          </Alert>
        )}

        <Stack spacing={4}>
          {pending.map((i) => (
            <ItemCard key={i.id} item={i} token={token} author={author} channels={channels} clientName={client.name} />
          ))}
        </Stack>

        {others.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 6, mb: 2 }}>Già approvati o in lavorazione</Typography>
            <Stack spacing={2}>
              {others.map((i) => (
                <Card key={i.id} sx={{ p: 2 }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>{i.title}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmt(i.scheduledAt)} · {i.format}</Typography>
                    </Box>
                    <Label color={i.status === 'approvato' ? 'success' : 'warning'}>{i.status === 'approvato' ? 'Approvato' : 'Modifiche in corso'}</Label>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </>
        )}

        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 6, textAlign: 'center' }}>
          Pagina riservata al cliente · non condividere questo link · <a href="/privacy">Privacy</a>
        </Typography>
      </Container>
    </Box>
  );
}

function ItemCard({ item, token, author, channels, clientName }) {
  const [message, setMessage] = useState('');
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();

  const send = (decision) =>
    start(async () => {
      const r = await sendFeedback({ token, itemId: item.id, decision, author, message: message || undefined });
      if (r.error) toast.error(r.error);
      else {
        setDone(decision);
        toast.success(decision === 'approvato' ? 'Approvato, grazie!' : 'Richiesta inviata al team');
      }
    });

  return (
    <Card>
      <Grid container>
        <Grid size={{ xs: 12, md: 5 }} sx={{ bgcolor: 'background.neutral' }}>
          <PostPreview clientName={clientName} format={item.format} platform={item.platform} caption={item.caption} hashtags={item.hashtags} media={item.media} channels={channels} emptyText="Immagine o video in preparazione" />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2} sx={{ p: 3, height: 1 }}>
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                {fmt(item.scheduledAt)} · {item.format} · {[item.platform, ...item.crossPost].join(' + ')}
              </Typography>
              <Typography variant="h6">{item.title}</Typography>
            </Box>

            {item.feedback.length > 0 && (
              <Stack spacing={1}>
                {item.feedback.slice(0, 3).map((f) => (
                  <Alert key={f.id} severity={f.decision === 'approvato' ? 'success' : 'info'} icon={false} sx={{ py: 0 }}>
                    <b>{f.author}</b>: {f.decision === 'approvato' ? 'approvato' : f.message}
                  </Alert>
                ))}
              </Stack>
            )}

            <Box sx={{ flex: 1 }} />
            <Divider />

            {done ? (
              <Alert severity={done === 'approvato' ? 'success' : 'info'}>{done === 'approvato' ? 'Hai approvato questo contenuto.' : 'Richiesta di modifiche inviata.'}</Alert>
            ) : asking ? (
              <Stack spacing={1.5}>
                <TextField label="Cosa vuoi cambiare?" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={3} autoFocus fullWidth />
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                  <Button color="inherit" onClick={() => setAsking(false)}>Annulla</Button>
                  <Button variant="contained" color="warning" loading={pending} disabled={!message.trim() || author.trim().length < 2} onClick={() => send('modifiche')}>
                    Invia richiesta
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button fullWidth size="large" variant="outlined" color="inherit" startIcon={<Iconify icon="solar:pen-bold" />} onClick={() => setAsking(true)}>
                  Chiedi modifiche
                </Button>
                <Button fullWidth size="large" variant="contained" color="success" loading={pending} disabled={author.trim().length < 2} startIcon={<Iconify icon="eva:checkmark-fill" />} onClick={() => send('approvato')}>
                  Approva
                </Button>
              </Stack>
            )}
            {!done && author.trim().length < 2 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Scrivi il tuo nome in alto per rispondere.</Typography>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Card>
  );
}
