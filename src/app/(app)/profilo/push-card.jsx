'use client';

import { useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { testPush, pushPublicKey, subscribePush, unsubscribePush } from './push-actions';

// ----------------------------------------------------------------------
// Notifiche sul telefono (o sul computer) per lead nuovi, post non usciti e problemi del sistema.
// Si attivano per dispositivo. Su iPhone servono iOS 16.4+ e 2Target aggiunta alla schermata Home.

function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(padded), (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return `${os}${browser ? ` · ${browser}` : ''}`;
}

async function detect() {
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { state: ios && !standalone ? 'ios-install' : 'unsupported' };
  if (Notification.permission === 'denied') return { state: 'denied' };
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const subscription = await reg.pushManager.getSubscription();
    return { state: subscription ? 'on' : 'off', subscription };
  } catch {
    return { state: 'unsupported' };
  }
}

export function PushCard() {
  // 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
  const [state, setState] = useState('loading');
  const [sub, setSub] = useState(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    // Stato del dispositivo letto in modo asincrono (permesso, service worker, iscrizione esistente)
    detect().then(({ state: next, subscription }) => {
      setSub(subscription ?? null);
      setState(next);
    });
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'denied' : 'off');
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await pushPublicKey()) });
        const r = await subscribePush(s.toJSON(), deviceName());
        if (r.error) throw new Error(r.error);
        setSub(s);
        setState('on');
        toast.success('Notifiche attivate su questo dispositivo');
      } catch (e) {
        toast.error(`Attivazione non riuscita: ${e.message}`);
      }
    });

  const disable = () =>
    start(async () => {
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setSub(null);
      setState('off');
      toast.success('Notifiche disattivate su questo dispositivo');
    });

  const test = () =>
    start(async () => {
      const r = await testPush();
      if (r.error) toast.error(r.error);
      else toast.success('Notifica di prova inviata: arriva in pochi secondi');
    });

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        avatar={<Iconify icon="solar:bell-bing-bold-duotone" width={28} sx={{ color: state === 'on' ? 'primary.main' : 'text.disabled' }} />}
        title="Notifiche sul telefono"
        subheader="Lead nuovi, post che non sono usciti e problemi del sistema, anche ad app chiusa. Si attivano su ogni dispositivo."
        action={state === 'on' ? <Label color="success">Attive qui</Label> : null}
        sx={{ flexWrap: 'wrap', gap: 1, '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }}
      />
      <Box sx={{ px: 3, pb: 2.5, pt: 1 }}>
        {state === 'ios-install' && (
          <Alert severity="info">
            Su iPhone prima aggiungi 2Target alla schermata Home: in Safari tocca <b>Condividi</b> (il quadrato con la freccia) →{' '}
            <b>Aggiungi alla schermata Home</b>. Poi apri 2Target dall&apos;icona e torna qui.
          </Alert>
        )}
        {state === 'unsupported' && <Alert severity="warning">Questo browser non supporta le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati.</Alert>}
        {state === 'denied' && (
          <Alert severity="warning">
            Le notifiche sono bloccate per 2Target in questo browser. Riattivale dalle impostazioni del sito (icona del lucchetto accanto
            all&apos;indirizzo) e ricarica la pagina.
          </Alert>
        )}
        {(state === 'off' || state === 'on') && (
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {state === 'off' ? (
              <Button variant="contained" onClick={enable} loading={busy} startIcon={<Iconify icon="solar:bell-bing-bold-duotone" />}>
                Attiva su questo dispositivo
              </Button>
            ) : (
              <>
                <Button variant="outlined" color="inherit" onClick={test} disabled={busy}>
                  Manda una prova
                </Button>
                <Button color="inherit" onClick={disable} disabled={busy}>
                  Disattiva qui
                </Button>
              </>
            )}
          </Stack>
        )}
        {state === 'loading' && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Controllo del dispositivo…
          </Typography>
        )}
      </Box>
    </Card>
  );
}
