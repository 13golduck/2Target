'use client';

import { platformName } from 'src/lib/platforms';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import FormControlLabel from '@mui/material/FormControlLabel';

import { fmtDate } from 'src/lib/format';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { planAiStatus, startPlanQuestions, startPlanGeneration } from '../../../plan-ai-actions';

// ----------------------------------------------------------------------
// Piano editoriale generato con l'AI: 1) impostazione (periodo, piattaforme, frequenza, check-up di partenza);
// 2) l'AI fa domande su obiettivo e indirizzo; 3) genera il piano, i pilastri e le idee (qualche minuto).

const iso = (d) => d.toISOString().slice(0, 10);

function defaultPeriod() {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  return { startsOn: iso(start), endsOn: iso(end) };
}

async function waitFor(jobId, onProgress) {
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 4000));
    const s = await planAiStatus(jobId);
    if (s.status !== 'in_corso') return s;
    if (s.progress) onProgress(s.progress);
  }
}

export function PlanAiDialog({ open, onClose, clientId, checkups, platforms }) {
  const router = useRouter();
  const [step, setStep] = useState('setup');
  const [setup, setSetup] = useState(() => ({
    ...defaultPeriod(),
    checkupId: checkups[0]?.id ?? '',
    platforms: ['instagram', 'facebook'],
    perWeek: 3,
    notes: '',
  }));
  const [qs, setQs] = useState(null);
  const [answers, setAnswers] = useState({});
  const [progress, setProgress] = useState('');
  const [pending, start] = useTransition();

  const payload = () => ({
    clientId,
    checkupId: setup.checkupId ? Number(setup.checkupId) : null,
    startsOn: setup.startsOn,
    endsOn: setup.endsOn,
    platforms: setup.platforms,
    perWeek: Number(setup.perWeek) || 3,
    notes: setup.notes,
  });

  const close = () => {
    if (pending) return;
    setStep('setup');
    setQs(null);
    setAnswers({});
    onClose();
  };

  const ask = () => {
    setProgress('Leggo il check-up e preparo le domande…');
    start(async () => {
      const r = await startPlanQuestions(payload());
      if (r?.error) return void toast.error(r.error);
      const s = await waitFor(r.jobId, setProgress);
      if (s.status === 'errore') return void toast.error(s.error);
      setQs(s.result);
      setStep('questions');
    });
  };

  const generate = () => {
    // Fuori dalla transizione: la schermata di avanzamento deve comparire subito
    setStep('generating');
    setProgress('Avvio la generazione…');
    start(async () => {
      const list = (qs?.questions ?? []).map((q, i) => ({ question: q.question, answer: answers[i] ?? '' }));
      const r = await startPlanGeneration(payload(), list);
      if (r?.error) {
        setStep('questions');
        return void toast.error(r.error);
      }
      const s = await waitFor(r.jobId, setProgress);
      if (s.status === 'errore') {
        setStep('questions');
        return void toast.error(s.error);
      }
      const res = s.result;
      toast.success(`Piano pronto: ${res.items} contenuti in bozza e ${res.items + res.ideas} idee`);
      setStep('setup');
      setQs(null);
      setAnswers({});
      onClose();
      router.push(`?piano=${res.planId}`);
      router.refresh();
    });
  };

  const togglePlatform = (p) =>
    setSetup((s) => ({ ...s, platforms: s.platforms.includes(p) ? s.platforms.filter((x) => x !== p) : [...s.platforms, p] }));

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Genera il piano editoriale con l&apos;AI</DialogTitle>
      <DialogContent>
        {step === 'setup' && (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              L&apos;AI parte dal check-up (posizionamento, persona, funnel, competitor), dal brand kit e dai canali del cliente, segue la metodologia
              del piano editoriale di Impostazioni e prima di scrivere ti fa qualche domanda su obiettivo e indirizzo.
            </Typography>
            <TextField select label="Check-up di partenza" value={setup.checkupId} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => setSetup({ ...setup, checkupId: e.target.value })} fullWidth>
              {checkups.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.title} · {fmtDate(c.at)}
                </MenuItem>
              ))}
              <MenuItem value="">Nessun check-up (solo scheda cliente e risposte)</MenuItem>
            </TextField>
            {!checkups.length && <Alert severity="warning">Il cliente non ha ancora un check-up completato: il piano sarà meno mirato.</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="date" label="Dal" value={setup.startsOn} onChange={(e) => setSetup({ ...setup, startsOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
              <TextField type="date" label="Al" value={setup.endsOn} onChange={(e) => setSetup({ ...setup, endsOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
              <TextField type="number" label="Contenuti a settimana" value={setup.perWeek} onChange={(e) => setSetup({ ...setup, perWeek: e.target.value })} slotProps={{ htmlInput: { min: 1, max: 21 } }} fullWidth />
            </Stack>
            <Box>
              <Typography variant="subtitle2">Piattaforme</Typography>
              {platforms.map((p) => (
                <FormControlLabel key={p} control={<Checkbox checked={setup.platforms.includes(p)} onChange={() => togglePlatform(p)} />} label={platformName(p)} />
              ))}
            </Box>
            <TextField
              label="Indicazioni per l'AI (facoltative)"
              placeholder="Es. lancio del nuovo servizio a novembre, promo di Natale, niente contenuti sui prezzi…"
              value={setup.notes}
              onChange={(e) => setSetup({ ...setup, notes: e.target.value })}
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        )}

        {step === 'questions' && qs && (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Alert severity="info" icon={<Iconify icon="solar:atom-bold-duotone" />}>
              {qs.understood}
            </Alert>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Rispondi alle domande che ti sembrano utili (puoi lasciarne vuote): servono a indirizzare il piano.
            </Typography>
            {qs.questions.map((q, i) => (
              <Box key={i}>
                <Typography variant="subtitle2">
                  {q.topic && <Chip size="small" label={q.topic} sx={{ mr: 1 }} />}
                  {q.question}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{q.why}</Typography>
                {q.options.length > 0 && (
                  <Stack direction="row" spacing={0.75} sx={{ my: 1 }} flexWrap="wrap" useFlexGap>
                    {q.options.map((o) => (
                      <Chip
                        key={o}
                        label={o}
                        variant={answers[i] === o ? 'filled' : 'outlined'}
                        color={answers[i] === o ? 'primary' : 'default'}
                        onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}
                      />
                    ))}
                  </Stack>
                )}
                <TextField size="small" value={answers[i] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} placeholder="La tua risposta" multiline fullWidth />
              </Box>
            ))}
          </Stack>
        )}

        {(step === 'generating' || (pending && step === 'setup')) && (
          <Box sx={{ py: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>{progress}</Typography>
            <LinearProgress />
            {step === 'generating' && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
                Di solito 3-8 minuti per un piano di tre mesi. Puoi lasciare aperta questa finestra: il piano arriva come bozza, con le idee nella bacheca
                Idee.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={step === 'questions' ? () => setStep('setup') : close} disabled={pending}>
          {step === 'questions' ? 'Indietro' : 'Annulla'}
        </Button>
        {step === 'setup' && (
          <Button variant="contained" onClick={ask} loading={pending} disabled={!setup.platforms.length || !setup.startsOn || !setup.endsOn}>
            Continua: domande dell&apos;AI
          </Button>
        )}
        {step === 'questions' && (
          <Button variant="contained" onClick={generate} loading={pending} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
            Genera il piano
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
