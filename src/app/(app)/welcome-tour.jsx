'use client';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import MobileStepper from '@mui/material/MobileStepper';

import { useRouter, usePathname, useSearchParams } from 'src/routes/hooks';

import { Iconify } from 'src/components/iconify';

import { markTourDone } from './tour-actions';

// ----------------------------------------------------------------------
// Tour di benvenuto: alla prima entrata (e dalla Guida con ?tour=1). Poche schermate, parole semplici.

const TEAM_STEPS = [
  {
    icon: 'solar:home-angle-bold-duotone',
    title: 'Benvenuto in 2Target',
    text: 'Qui gestisci il marketing di ogni cliente in un posto solo: dalla strategia ai post pubblicati, fino ai risultati e ai contatti arrivati.',
  },
  {
    icon: 'solar:notes-bold-duotone',
    title: 'Il percorso di ogni cliente',
    flow: [
      { icon: 'solar:notes-bold-duotone', label: 'Check-up' },
      { icon: 'solar:calendar-date-bold', label: 'Piano' },
      { icon: 'custom:send-fill', label: 'Pubblica' },
      { icon: 'solar:chart-square-outline', label: 'Risultati' },
    ],
    text: 'Si parte dal check-up (cosa funziona e cosa no), si prepara il piano dei contenuti, si pubblica sui social e si guardano i risultati. Ogni tappa è una scheda del cliente.',
  },
  {
    icon: 'solar:check-circle-bold',
    title: 'Ogni mattina parti da «Oggi»',
    text: 'La prima pagina ti dice cosa fare: post in uscita, contenuti da approvare, problemi da sistemare e contatti da richiamare. Tocca una riga e arrivi dove si risolve.',
  },
  {
    icon: 'eva:link-2-fill',
    title: 'Collega i social una volta sola',
    text: 'Nella scheda «Canali» del cliente colleghi Instagram, Facebook, TikTok e gli altri. Da lì 2Target legge i dati da solo e pubblica i post all’ora giusta.',
  },
  {
    icon: 'solar:info-circle-bold',
    title: 'Se hai un dubbio',
    text: 'Apri «Guida» nel menu: ogni funzione è spiegata passo per passo, con la ricerca. Dal tuo Profilo puoi anche attivare le notifiche sul telefono.',
  },
];

const VIEWER_STEPS = [
  {
    icon: 'solar:chart-square-outline',
    title: 'Benvenuto in 2Target',
    text: 'Qui trovi i risultati del tuo marketing, sempre aggiornati: obiettivi (KPI), contatti arrivati (Lead) e andamento del sito (SEO).',
  },
  {
    icon: 'solar:info-circle-bold',
    title: 'Se hai un dubbio',
    text: 'Apri «Guida» nel menu: trovi spiegato cosa significa ogni numero e come leggerlo.',
  },
];

export function WelcomeTour({ firstTime, viewer }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get('tour') === '1';
  const [open, setOpen] = useState(firstTime);
  const [step, setStep] = useState(0);
  const steps = viewer ? VIEWER_STEPS : TEAM_STEPS;
  const s = steps[step];
  const last = step === steps.length - 1;

  // Riaperto dalla Guida: si riparte dalla prima schermata
  useEffect(() => {
    if (!requested) return;
    queueMicrotask(() => {
      setStep(0);
      setOpen(true);
    });
  }, [requested]);

  const close = () => {
    setOpen(false);
    if (requested) router.replace(pathname);
    if (firstTime) markTourDone();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <Box sx={{ p: 4, pb: 2, textAlign: 'center' }}>
        <Iconify icon={s.icon} width={48} sx={{ color: 'primary.main', mb: 2 }} />
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {s.title}
        </Typography>
        {s.flow && (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
            {s.flow.map((f, i) => (
              <Stack key={f.label} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Stack sx={{ alignItems: 'center', width: 64 }}>
                  <Iconify icon={f.icon} width={28} sx={{ color: 'text.secondary' }} />
                  <Typography variant="caption">{f.label}</Typography>
                </Stack>
                {i < s.flow.length - 1 && <Iconify icon="eva:arrow-forward-fill" width={16} sx={{ color: 'text.disabled' }} />}
              </Stack>
            ))}
          </Stack>
        )}
        <Typography variant="body1" sx={{ color: 'text.secondary', minHeight: 96 }}>
          {s.text}
        </Typography>
      </Box>
      <MobileStepper
        variant="dots"
        steps={steps.length}
        position="static"
        activeStep={step}
        sx={{ px: 3, pb: 3, bgcolor: 'transparent' }}
        backButton={
          step === 0 ? (
            <Button color="inherit" onClick={close}>
              Salta
            </Button>
          ) : (
            <Button color="inherit" onClick={() => setStep(step - 1)}>
              Indietro
            </Button>
          )
        }
        nextButton={
          <Button variant="contained" onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? 'Inizia' : 'Avanti'}
          </Button>
        }
      />
    </Dialog>
  );
}
