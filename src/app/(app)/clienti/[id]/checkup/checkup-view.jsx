'use client';

import { ErrorText } from 'src/components/error-text';
import { useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Step from '@mui/material/Step';
import Alert from '@mui/material/Alert';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stepper from '@mui/material/Stepper';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import StepLabel from '@mui/material/StepLabel';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Accordion from '@mui/material/Accordion';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';

import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { fmtDate } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { Scrollbar } from 'src/components/scrollbar';
import { StatusBadge } from 'src/components/status-badge';

import { createCheckup, setCheckupStatus, saveCheckupSection } from '../../../actions';
import { saveAnswers, reviseSection, stopAiCheckup, archiveCheckup, startAiCheckup, resumeAiCheckup, continueAiCheckup } from '../../../checkup-ai-actions';
import { askConfirm } from 'src/components/custom-dialog';

import { FoundationCard } from './foundation-card';

// ----------------------------------------------------------------------

const STATUS = {
  bozza: { label: 'Bozza', color: 'default' },
  in_revisione: { label: 'In revisione', color: 'warning' },
  consegnato: { label: 'Consegnato', color: 'success' },
};
const MODES = [
  { key: 'opus', title: 'Claude Opus 5.5', text: 'Analisi e scrittura più profonde. Per i clienti importanti.', cost: '≈ 5-10 €' },
  { key: 'sonnet', title: 'Claude Sonnet 5.5', text: 'Più veloce, circa metà costo. Analisi un po’ meno profonda.', cost: '≈ 2,5-5 €' },
  { key: 'misto', title: 'Misto', text: 'Sonnet raccoglie i dati e fa le domande, Opus scrive il documento.', cost: '≈ 3-6,5 €' },
];
const STEPS = ['Dati del cliente', 'Ricognizione online', 'Domande al consulente', 'Ricerca approfondita', 'Scrittura', 'Revisione'];
const STEP_OF = { ricognizione: 1, domande: 2, ricerca: 3, scrittura: 4, pronto: 5 };
const WORKING = ['ricognizione', 'ricerca', 'scrittura'];

export function CheckupView({ aiConfigured, history, showArchived, isLatest, previous, client, checkup, questions, runs, template, content }) {
  const router = useRouter();
  const ai = checkup && checkup.aiMode;
  const working = ai && WORKING.includes(checkup.aiState);

  // Mentre l'AI lavora la pagina si aggiorna da sola
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [working, router]);

  const bar = <HistoryBar history={history} current={checkup} isNew={!checkup} showArchived={showArchived} />;

  if (!checkup) {
    return (
      <Stack spacing={3}>
        {history.length > 0 && bar}
        <StartWizard aiConfigured={aiConfigured} client={client} previous={previous} />
      </Stack>
    );
  }

  const readOnly = checkup.status === 'consegnato';
  const reportLink = Object.keys(content ?? {}).length > 0 && (!ai || checkup.aiState === 'pronto') && (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, bgcolor: 'primary.lighter' }}>
      <Iconify icon="solar:document-text-bold" width={32} sx={{ color: 'primary.darker', display: { xs: 'none', sm: 'block' } }} />
      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle1">Report per il cliente</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Pagina web con grafici, da mostrare in call e scaricare in PDF. {checkup.status === 'consegnato' ? 'Visibile anche ai Viewer del cliente.' : 'I Viewer la vedranno quando il check-up sarà consegnato.'}
        </Typography>
      </Box>
      <Button href={`/report/${checkup.id}`} target="_blank" rel="noopener" variant="contained" color="inherit" endIcon={<Iconify icon="eva:external-link-fill" />}>
        Apri il report
      </Button>
    </Card>
  );
  // La base di lavoro si prepara dall'ultimo check-up; su quelli dello storico si vede solo se c'è già
  const foundation = checkup.status === 'consegnato' && (checkup.foundation.state !== 'nessuna' || (isLatest && !checkup.archived)) && (
    <FoundationCard clientId={client.id} checkup={checkup} aiConfigured={aiConfigured} />
  );
  const banner = checkup.archived ? (
    <Alert severity="warning" icon={<Iconify icon="solar:archive-bold" />}>
      Questo check-up è archiviato ({checkup.period}): resta consultabile ma non compare tra quelli su cui si lavora.
    </Alert>
  ) : (
    !isLatest && (
      <Alert severity="info" icon={<Iconify icon="solar:clock-circle-bold" />}>
        Stai guardando un check-up dello storico{checkup.period ? ` (${checkup.period})` : ''}. I dati sono quelli di allora.
      </Alert>
    )
  );

  if (!ai) {
    // check-up compilato a mano
    return (
      <Stack spacing={3}>
        {bar}
        {banner}
        {reportLink}
        {foundation}
        <SectionsEditor checkup={checkup} template={template} content={content} readOnly={readOnly} />
        {checkup.kpiSnapshot.length > 0 && <KpiSnapshotCard checkup={checkup} />}
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {bar}
      {banner}
      <Card sx={{ p: { xs: 2, md: 3 } }}>
        <Stepper
          activeStep={['errore', 'interrotto'].includes(checkup.aiState) ? -1 : STEP_OF[checkup.aiState] ?? 1}
          alternativeLabel
          sx={{ display: { xs: 'none', md: 'flex' } }}
        >
          {STEPS.map((s) => (
            <Step key={s}><StepLabel>{s}</StepLabel></Step>
          ))}
        </Stepper>
        {/* Smartphone: fase corrente e barra di avanzamento al posto dei sei passi */}
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {checkup.aiState === 'interrotto' ? 'Interrotto' : checkup.aiState === 'errore' ? 'Fermo per un errore' : `Fase ${(STEP_OF[checkup.aiState] ?? 1) + 1} di ${STEPS.length}`}
          </Typography>
          <Typography variant="subtitle1">{STEPS[STEP_OF[checkup.aiState] ?? 1]}</Typography>
          <LinearProgress variant="determinate" value={(((STEP_OF[checkup.aiState] ?? 1) + 1) / STEPS.length) * 100} sx={{ mt: 1, height: 6, borderRadius: 1 }} />
        </Box>
      </Card>

      {checkup.aiState === 'errore' && <ErrorPanel checkup={checkup} />}
      {checkup.aiState === 'interrotto' && <InterruptedPanel checkup={checkup} />}
      {working && <WorkingPanel checkup={checkup} runs={runs} />}
      {checkup.aiState === 'domande' && <QuestionsPanel checkup={checkup} questions={questions} />}
      {checkup.aiState === 'pronto' && (
        <>
          {reportLink}
          {foundation}
          <SectionsEditor checkup={checkup} template={template} content={content} withAi={!readOnly} readOnly={readOnly} />
          {checkup.kpiSnapshot.length > 0 && <KpiSnapshotCard checkup={checkup} />}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 7 }}><UsageCard runs={runs} mode={checkup.aiMode} /></Grid>
            <Grid size={{ xs: 12, lg: 5 }}><SourcesCard sources={checkup.sources} findings={checkup.findings} questions={questions} /></Grid>
          </Grid>
        </>
      )}
      {checkup.aiState !== 'pronto' && runs.length > 0 && !working && <UsageCard runs={runs} mode={checkup.aiMode} compact />}
    </Stack>
  );
}

// ----------------------------------------------------------------------

const REGISTER_OPTIONS = [
  { key: 'auto', title: 'Automatico', text: 'Lo sceglie l’AI in base al tipo di cliente' },
  { key: 'istituzionale', title: 'Istituzionale', text: 'Formale: enti pubblici, associazioni nazionali' },
  { key: 'commerciale', title: 'Commerciale', text: 'Dinamico: startup, aziende di prodotto' },
];

/** Scelta a schede: compatta su smartphone (riga con radio e titolo, descrizione breve sotto). */
function OptionGroup({ title, options, value, onChange, columns }) {
  return (
    <>
      <Typography variant="subtitle1" sx={{ mt: 3, mb: 1.5 }}>{title}</Typography>
      <Grid container spacing={{ xs: 1, md: 2 }}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <Grid key={o.key} size={{ xs: 12, md: 12 / columns }}>
              <Card
                variant="outlined"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(o.key)}
                sx={{ p: { xs: 1.25, md: 2 }, height: 1, cursor: 'pointer', borderWidth: 2, borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'primary.lighter' : 'transparent' }}
              >
                <Stack direction="row" sx={{ alignItems: 'center' }}>
                  <Radio checked={on} size="small" sx={{ ml: -1, py: 0.5 }} />
                  {o.icon && <Iconify icon={o.icon} width={18} sx={{ mr: 0.75, color: 'primary.main' }} />}
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>{o.title}</Typography>
                  {o.badge && <Label color="default" sx={{ display: { xs: 'inline-flex', md: 'none' } }}>{o.badge}</Label>}
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary', pl: { xs: 4, md: 0 }, fontSize: { xs: 13, md: 14 } }}>{o.text}</Typography>
                {o.badge && <Label color="default" sx={{ mt: 1, display: { xs: 'none', md: 'inline-flex' } }}>{o.badge} (stima)</Label>}
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </>
  );
}

const REASONING_OPTIONS = [
  { key: 'avanzato', title: 'Avanzato', text: 'Ragiona più a fondo in ogni fase: analisi più ricca, qualche minuto in più', icon: 'solar:atom-bold-duotone' },
  { key: 'veloce', title: 'Veloce', text: 'Ragionamento più breve: più rapido e circa un terzo più economico', icon: 'solar:bolt-bold' },
];

function StartWizard({ aiConfigured, client, previous }) {
  const router = useRouter();
  // Una volta premuto, il pulsante resta bloccato: niente doppi avvii
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState('opus');
  const [reasoning, setReasoning] = useState('avanzato');
  const [register, setRegister] = useState('auto');
  const [pending, start] = useTransition();

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card>
          <CardHeader
            title={previous ? 'Nuovo check-up periodico con l’AI' : 'Check-up iniziale con l’AI'}
            subheader="Inserisci quello che sai: l'AI cerca online, ti fa domande su ciò che non trova e scrive il check-up. Tu rivedi e approvi."
          />
          {previous && (
            <Alert severity="info" sx={{ mx: 3 }}>
              Si parte dal check-up di <b>{previous.period}</b>: l&apos;AI lo legge, verifica cosa è cambiato e lo scrive nel campo
              «Cosa è cambiato rispetto al check-up precedente». Il check-up precedente resta nello storico così com&apos;è.
            </Alert>
          )}
          <Box
            component="form"
            action={(fd) =>
              start(async () => {
                if (started) return;
                setStarted(true);
                const r = await startAiCheckup(fd);
                if (r?.checkupId) {
                  if (r.error) toast.info(r.error);
                  else toast.success('Check-up avviato: l’AI sta facendo la ricognizione online');
                  router.push(`?id=${r.checkupId}`);
                  router.refresh();
                  return;
                }
                if (r?.error) toast.error(r.error);
                setStarted(false);
              })
            }
            sx={{ p: 3 }}
          >
            <input type="hidden" name="clientId" value={client.id} />
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="register" value={register} />
            <input type="hidden" name="reasoning" value={reasoning} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}><TextField name="name" label="Ragione sociale" defaultValue={client.name} required fullWidth /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField name="sector" label="Settore" defaultValue={client.sector ?? ''} fullWidth /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField name="website" label="Sito web" defaultValue={client.website ?? ''} placeholder="www.esempio.it" fullWidth /></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><TextField name="vatNumber" label="Partita IVA" defaultValue={client.vatNumber ?? ''} fullWidth /></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><TextField name="city" label="Città / zona" defaultValue={client.city ?? ''} fullWidth /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField name="contactName" label="Referente" defaultValue={client.contactName ?? ''} fullWidth /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField name="socialLinks" label="Profili social" defaultValue={client.socialLinks ?? ''} placeholder={'instagram.com/…\nfacebook.com/…'} helperText="Uno per riga, se li conosci" multiline minRows={2} fullWidth />
              </Grid>
              <Grid size={12}>
                <TextField
                  name="notes"
                  label="Appunti dell'incontro"
                  defaultValue={client.notes ?? ''}
                  placeholder="Cosa vende, a chi, cosa chiede, problemi percepiti, obiettivi, budget indicativo, concorrenti citati…"
                  helperText="Più contesto dai, più le domande e il check-up saranno precisi"
                  multiline
                  minRows={4}
                  fullWidth
                />
              </Grid>
            </Grid>

            <OptionGroup
              title="Modello per questo check-up"
              value={mode}
              onChange={setMode}
              columns={3}
              options={MODES.map((m) => ({ key: m.key, title: m.title, text: m.text, badge: `${m.cost} a check-up` }))}
            />
            <OptionGroup title="Livello di ragionamento dell’AI" value={reasoning} onChange={setReasoning} columns={2} options={REASONING_OPTIONS} />
            <OptionGroup title="Registro del report" value={register} onChange={setRegister} columns={3} options={REGISTER_OPTIONS} />

            {!aiConfigured && (
              <Alert severity="warning" sx={{ mt: 3 }}>
                Manca la chiave API di Anthropic: un amministratore la inserisce in Impostazioni → Integrazioni.
              </Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} sx={{ mt: 3, alignItems: { xs: 'stretch', sm: 'center' } }}>
              <Button type="submit" variant="contained" size="large" loading={pending || started} disabled={!aiConfigured || started} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
                {started ? 'Avvio in corso…' : 'Avvia la ricognizione'}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>2-4 minuti, poi arrivano le domande</Typography>
            </Stack>
          </Box>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Card sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>Come funziona</Typography>
          <Stack spacing={1.5}>
            {[
              ['solar:notes-bold-duotone', 'Inserisci i dati che hai e gli appunti dell’incontro.'],
              ['eva:search-fill', 'L’AI cerca online: sito, social, recensioni, stampa, concorrenti.'],
              ['solar:chat-round-dots-bold', 'Ti fa domande solo su ciò che online non trova.'],
              ['solar:atom-bold-duotone', 'Approfondisce concorrenti, settore e pubblico.'],
              ['solar:file-text-bold', 'Scrive le 8 sezioni del check-up con le fonti; tu rivedi e approvi.'],
            ].map(([icon, text]) => (
              <Stack key={text} direction="row" spacing={1.5}>
                <Iconify icon={icon} sx={{ color: 'primary.main', flexShrink: 0, mt: 0.25 }} />
                <Typography variant="body2">{text}</Typography>
              </Stack>
            ))}
          </Stack>
        </Card>
        <Card sx={{ p: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Preferisci farlo a mano?</Typography>
          <Stack component="form" action={createCheckup} direction="row" spacing={1}>
            <input type="hidden" name="clientId" value={client.id} />
            <TextField name="period" size="small" placeholder="Periodo" />
            <Button type="submit" variant="outlined" color="inherit">Compila a mano</Button>
          </Stack>
        </Card>
      </Grid>
    </Grid>
  );
}

// ----------------------------------------------------------------------

function WorkingPanel({ checkup, runs }) {
  const label = { ricognizione: 'Ricognizione online in corso', ricerca: 'Ricerca approfondita in corso', scrittura: 'Scrittura del check-up in corso' }[checkup.aiState];
  const spent = runs.reduce((t, r) => t + r.costUsd, 0);
  const searches = runs.reduce((t, r) => t + r.webSearches, 0);
  return (
    <Card sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' }, rowGap: 1.5 }}>
        <Iconify icon="solar:atom-bold-duotone" width={32} sx={{ color: 'primary.main', animation: 'spin 3s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">{label}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{checkup.aiProgress ?? 'Avvio…'}</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right' }}>
          {searches} ricerche finora<br />≈ {spent.toFixed(2).replace('.', ',')} €
        </Typography>
        <StopButton checkupId={checkup.id} />
      </Stack>
      <LinearProgress sx={{ mb: 2 }} />
      {!checkup.running && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={0.5}>
              <ResumeButton checkupId={checkup.id} />
              <ArchiveButton checkupId={checkup.id} archived={checkup.archived} />
            </Stack>
          }
        >
          Il lavoro risulta interrotto (forse l&apos;app è stata riavviata).
        </Alert>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Puoi chiudere la pagina: il lavoro continua e ritrovi qui il risultato.</Typography>
      <Scrollbar sx={{ maxHeight: 260, mt: 2 }}>
        <Stack spacing={0.5}>
          {[...checkup.aiLog].reverse().map((l, i) => (
            <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, color: i === 0 ? 'text.primary' : 'text.secondary' }}>
              {new Date(l.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {l.text}
            </Typography>
          ))}
        </Stack>
      </Scrollbar>
    </Card>
  );
}

/** Interrompe il check-up: ferma l'AI anche a metà di una chiamata. */
function StopButton({ checkupId, size = 'medium' }) {
  const [pending, start] = useTransition();
  return (
    <Button
      color="error"
      variant="outlined"
      size={size}
      loading={pending}
      startIcon={<Iconify icon="solar:stop-circle-bold" />}
      onClick={async () => {
        if (!(await askConfirm({ tone: 'warning', title: 'Interrompere il check-up?', content: 'L’AI si ferma subito. Potrai riprenderlo più tardi da dove si è fermato.', confirmText: 'Interrompi' }))) return;
        start(async () => {
          const r = await stopAiCheckup(checkupId);
          if (r?.ok) toast.success('Check-up interrotto');
        });
      }}
    >
      Interrompi
    </Button>
  );
}

function InterruptedPanel({ checkup }) {
  return (
    <Card sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
        <Iconify icon="solar:stop-circle-bold" width={32} sx={{ color: 'text.disabled', display: { xs: 'none', sm: 'block' } }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">Check-up interrotto</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Il lavoro dell’AI è fermo. Puoi riprenderlo da dove si è fermato oppure lasciarlo così e avviarne uno nuovo.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <ResumeButton checkupId={checkup.id} />
          <ArchiveButton checkupId={checkup.id} archived={checkup.archived} />
        </Stack>
      </Stack>
    </Card>
  );
}

function ResumeButton({ checkupId }) {
  const [pending, start] = useTransition();
  return (
    <Button
      color="inherit"
      size="small"
      loading={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set('checkupId', checkupId);
          const r = await resumeAiCheckup(fd);
          if (r?.error) toast.error(r.error);
        })
      }
    >
      Riprendi
    </Button>
  );
}

/** Archivia un check-up fermo (errore, interrotto o rimasto a metà dopo un riavvio). */
function ArchiveButton({ checkupId, archived }) {
  const [pending, start] = useTransition();
  if (archived) return null;
  return (
    <Button
      color="inherit"
      size="small"
      loading={pending}
      startIcon={<Iconify icon="solar:archive-bold" width={18} />}
      onClick={async () => {
        if (!(await askConfirm({ tone: 'archive', title: 'Archiviare questo check-up?', content: 'Non comparirà più nello storico, ma potrai ritrovarlo in «Archiviati» e ripristinarlo quando vuoi.', confirmText: 'Archivia' }))) return;
        start(async () => {
          const r = await archiveCheckup(checkupId, true);
          if (r?.error) toast.error(r.error);
          else toast.success('Check-up archiviato');
        });
      }}
    >
      Archivia
    </Button>
  );
}

function ErrorPanel({ checkup }) {
  return (
    <Alert severity="error" sx={{ '& .MuiAlert-message': { width: 1 } }}>
      <b>L&apos;AI si è fermata.</b> <Box component="span" sx={{ wordBreak: 'break-word' }}><ErrorText error={checkup.aiError} /></Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <ResumeButton checkupId={checkup.id} />
        <ArchiveButton checkupId={checkup.id} archived={checkup.archived} />
      </Stack>
    </Alert>
  );
}

// ----------------------------------------------------------------------

function QuestionsPanel({ checkup, questions }) {
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState(() => Object.fromEntries(questions.map((q) => [q.id, q.answer ?? ''])));
  const rounds = [...new Set(questions.map((q) => q.round))];
  const answered = questions.filter((q) => answers[q.id]?.trim()).length;

  const submit = (next) => {
    const fd = new FormData();
    fd.set('checkupId', checkup.id);
    fd.set('next', next);
    for (const [id, v] of Object.entries(answers)) fd.set(`q:${id}`, v);
    start(async () => {
      const r = next === 'salva' ? await saveAnswers(fd) : await continueAiCheckup(fd);
      if (r?.error) toast.error(r.error);
      else if (next === 'salva') toast.success('Risposte salvate');
    });
  };

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 5 }}>
        <Card>
          <CardHeader title="Cosa ho trovato online" subheader="Controlla: se qualcosa è sbagliato correggilo nelle risposte" />
          <Scrollbar sx={{ maxHeight: 640 }}>
            <Stack spacing={1.5} sx={{ p: 3, pt: 1 }}>
              {checkup.findings.map((f, i) => (
                <Box key={i}>
                  <Typography variant="body2">{f.fact}</Typography>
                  {f.source && (
                    /^https?:/.test(f.source) ? (
                      <Link href={f.source} target="_blank" rel="noopener" variant="caption" sx={{ wordBreak: 'break-all' }}>{f.source}</Link>
                    ) : (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{f.source}</Typography>
                    )
                  )}
                </Box>
              ))}
            </Stack>
          </Scrollbar>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Card>
          <CardHeader
            title="Domande per te"
            subheader={`${answered} di ${questions.length} risposte · le domande senza risposta vengono trattate come "non noto"`}
            action={<StopButton checkupId={checkup.id} size="small" />}
          />
          <Stack spacing={3} sx={{ p: 3, pt: 1 }}>
            {rounds.map((round) => (
              <Stack key={round} spacing={3}>
                {rounds.length > 1 && <Divider><Label>{round}° giro</Label></Divider>}
                {questions.filter((q) => q.round === round).map((q, i) => (
                  <Box key={q.id}>
                    <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'baseline' }}>
                      <Typography variant="subtitle2" sx={{ color: 'primary.dark' }}>{i + 1}.</Typography>
                      <Typography variant="subtitle2">{q.question}</Typography>
                    </Stack>
                    {q.why && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>{q.why}</Typography>}
                    {q.options.length > 0 && (
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
                        {q.options.map((o) => (
                          <Chip key={o} label={o} size="small" variant={answers[q.id] === o ? 'filled' : 'outlined'} color={answers[q.id] === o ? 'primary' : 'default'} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))} />
                        ))}
                      </Stack>
                    )}
                    <TextField value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Risposta (anche parziale)" multiline minRows={1} fullWidth size="small" />
                  </Box>
                ))}
              </Stack>
            ))}
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="outlined" color="inherit" onClick={() => submit('salva')} disabled={pending}>Salva le risposte</Button>
              <Box sx={{ flex: 1 }} />
              <Button variant="outlined" onClick={() => submit('domande')} disabled={pending || checkup.questionRound >= 3} startIcon={<Iconify icon="solar:chat-round-dots-bold" />}>
                Fammi altre domande
              </Button>
              <Button variant="contained" onClick={() => submit('ricerca')} loading={pending} startIcon={<Iconify icon="eva:search-fill" />}>
                Avvia ricerca e scrittura
              </Button>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Ricerca approfondita e scrittura richiedono 5-12 minuti. Puoi chiudere la pagina.
            </Typography>
          </Stack>
        </Card>
      </Grid>
    </Grid>
  );
}

// ----------------------------------------------------------------------

function SectionsEditor({ checkup, template, content, withAi, readOnly }) {
  const filledOf = (sec) => sec.fields.filter((f) => content[sec.key]?.[f.key]?.trim()).length;
  const total = template.reduce((t, s) => t + s.fields.length, 0);
  const filled = template.reduce((t, s) => t + filledOf(s), 0);

  return (
    <Stack spacing={3}>
      <Card sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' } }}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="h6">{checkup.title} · {checkup.period}</Typography>
              <Label color={STATUS[checkup.status].color}>{STATUS[checkup.status].label}</Label>
              {withAi && <Label color="primary" startIcon={<Iconify icon="solar:atom-bold-duotone" />}>Bozza AI da rivedere</Label>}
              {readOnly && <Label color="default" startIcon={<Iconify icon="solar:lock-password-outline" />}>Sola lettura</Label>}
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              {filled} campi compilati su {total}
              {checkup.deliveredAt && ` · consegnato il ${fmtDate(checkup.deliveredAt)}`}
              {readOnly && ' · per modificarlo riportalo «In revisione»'}
            </Typography>
            <LinearProgress variant="determinate" value={(filled / total) * 100} sx={{ height: 8, borderRadius: 1, maxWidth: 420 }} />
          </Box>
          <Stack component="form" action={setCheckupStatus} direction="row" spacing={1}>
            <input type="hidden" name="checkupId" value={checkup.id} />
            <TextField select name="status" defaultValue={checkup.status} size="small" sx={{ minWidth: 160 }}>
              {Object.entries(STATUS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="outlined">Aggiorna</Button>
          </Stack>
        </Stack>
        {!readOnly && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
            Alla consegna 2Target prepara da solo la base di lavoro: KPI, canali da collegare, rubriche, prime idee e bozza del primo mese di piano.
          </Typography>
        )}
      </Card>
      <Box>
        {template.map((sec, i) => (
          <Section key={sec.key} index={i} section={sec} checkupId={checkup.id} values={content[sec.key] ?? {}} filled={filledOf(sec)} withAi={withAi} readOnly={readOnly} />
        ))}
      </Box>
    </Stack>
  );
}

function Section({ index, section, checkupId, values, filled, withAi, readOnly }) {
  const [pending, start] = useTransition();
  const [revising, startRevise] = useTransition();
  const [open, setOpen] = useState(index === 0);
  const [instruction, setInstruction] = useState('');
  const complete = filled === section.fields.length;
  // Dopo una revisione AI i campi si ricaricano con il nuovo testo
  const version = JSON.stringify(values).length;

  return (
    <Accordion expanded={open} onChange={(_, v) => setOpen(v)} sx={{ mb: 1.5, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<Iconify icon="eva:arrow-ios-downward-fill" />}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', width: 1, pr: 2 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, bgcolor: complete ? 'success.lighter' : 'primary.lighter', color: complete ? 'success.darker' : 'primary.darker' }}>
            {complete ? <Iconify icon="eva:checkmark-fill" width={18} /> : index + 1}
          </Box>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>{section.title}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{filled}/{section.fields.length}</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {withAi && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2.5, p: 1.5, borderRadius: 1.5, bgcolor: 'primary.lighter' }}>
            <TextField
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Chiedi all'AI di rivedere questa sezione: es. «più tecnico per gli chef», «aggiungi i numeri dei follower», «togli la parte sulla GDO»"
              size="small"
              fullWidth
              sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
            />
            <Button
              variant="contained"
              loading={revising}
              disabled={!instruction.trim()}
              startIcon={<Iconify icon="solar:atom-bold-duotone" />}
              sx={{ flexShrink: 0 }}
              onClick={() =>
                startRevise(async () => {
                  const fd = new FormData();
                  fd.set('checkupId', checkupId);
                  fd.set('sectionKey', section.key);
                  fd.set('instruction', instruction);
                  const r = await reviseSection(fd);
                  if (r?.error) toast.error(r.error);
                  else {
                    toast.success('Sezione rivista: controlla il nuovo testo');
                    setInstruction('');
                  }
                })
              }
            >
              Rivedi con l&apos;AI
            </Button>
          </Stack>
        )}
        <Stack
          key={version}
          component="form"
          spacing={2.5}
          action={(fd) =>
            start(async () => {
              await saveCheckupSection(fd);
              toast.success('Sezione salvata');
            })
          }
        >
          <input type="hidden" name="checkupId" value={checkupId} />
          <input type="hidden" name="sectionKey" value={section.key} />
          {section.guide.length > 0 && !withAi && !readOnly && (
            <Alert severity="info" icon={<Iconify icon="solar:info-circle-bold" />}>
              {section.guide.map((g) => <div key={g}>{g}</div>)}
            </Alert>
          )}
          {section.fields.map((f) => (
            <TextField key={f.key} name={`field:${f.key}`} label={f.label} defaultValue={values[f.key] ?? ''} helperText={f.kind === 'elenco' ? 'Una voce per riga' : ' '} multiline minRows={f.kind === 'testo' ? 3 : 4} fullWidth slotProps={{ input: { readOnly } }} />
          ))}
          {!readOnly && <Box><Button type="submit" variant="contained" color="inherit" loading={pending}>Salva sezione</Button></Box>}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

// ----------------------------------------------------------------------

const MODE_SHORT = { opus: 'Opus', sonnet: 'Sonnet', misto: 'Misto' };

function HistoryBar({ history, current, isNew, showArchived }) {
  const [pending, start] = useTransition();
  const currentId = current?.id;
  const archivedCount = history.filter((h) => h.archived).length;
  // Gli archiviati non disturbano: si vedono solo se richiesti (o se è quello aperto)
  const visible = history.filter((h) => showArchived || !h.archived || h.id === currentId);
  const activeOne = history.find((h) => !h.archived && [...WORKING, 'domande'].includes(h.aiState));
  // Si può archiviare tutto ciò su cui l'AI non sta lavorando in questo momento (anche se rimasto a metà)
  const canArchive = current && !current.archived && !current.running;

  const toggleArchive = async (archive) => {
    if (archive && !(await askConfirm({ tone: 'archive', title: 'Archiviare questo check-up?', content: 'Non comparirà più nello storico, ma potrai ritrovarlo in «Archiviati» e ripristinarlo quando vuoi.', confirmText: 'Archivia' }))) return;
    start(async () => {
      const r = await archiveCheckup(current.id, archive);
      if (r?.error) toast.error(r.error);
      else toast.success(archive ? 'Check-up archiviato' : 'Check-up ripristinato');
    });
  };

  return (
    <Card sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <Iconify icon="solar:clock-circle-bold" sx={{ color: 'text.secondary' }} />
          <Typography variant="subtitle2">Storico check-up</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flex: 1, overflowX: 'auto', py: 0.5 }}>
          {visible.map((h) => (
            <Chip
              key={h.id}
              component={RouterLink}
              href={`?id=${h.id}${showArchived ? '&archiviati=1' : ''}`}
              clickable
              color={h.id === currentId ? 'primary' : 'default'}
              variant={h.id === currentId ? 'filled' : 'outlined'}
              icon={h.archived ? <Iconify icon="solar:archive-bold" width={16} /> : undefined}
              label={
                <span>
                  {h.period ?? fmtDate(h.createdAt)}
                  {h.id === history[0]?.id && ' · ultimo'}
                  {' · '}
                  {h.aiState === 'interrotto' ? 'interrotto' : STATUS[h.status].label.toLowerCase()}
                  {h.aiMode && ` · ${MODE_SHORT[h.aiMode]}`}
                  {h.costUsd > 0 && ` · ${h.costUsd.toFixed(2).replace('.', ',')} €`}
                </span>
              }
            />
          ))}
          {archivedCount > 0 && (
            <Chip
              component={RouterLink}
              href={showArchived ? `?id=${currentId ?? ''}` : `?archiviati=1${currentId ? `&id=${currentId}` : ''}`}
              clickable
              variant="soft"
              icon={<Iconify icon="solar:archive-bold" width={16} />}
              label={showArchived ? 'Nascondi archiviati' : `Archiviati (${archivedCount})`}
            />
          )}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {current?.archived ? (
            <Button color="inherit" variant="outlined" loading={pending} onClick={() => toggleArchive(false)} startIcon={<Iconify icon="solar:archive-up-bold" />}>
              Ripristina
            </Button>
          ) : (
            canArchive && (
              <Button color="inherit" variant="outlined" loading={pending} onClick={() => toggleArchive(true)} startIcon={<Iconify icon="solar:archive-bold" />}>
                Archivia
              </Button>
            )
          )}
          <Button
            component={RouterLink}
            href="?nuovo=1"
            variant={isNew ? 'contained' : 'outlined'}
            startIcon={<Iconify icon="mingcute:add-line" />}
            disabled={!!activeOne}
          >
            Nuovo check-up
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

function KpiSnapshotCard({ checkup }) {
  const fmt = (v, unit) => (v == null ? '—' : unit === '%' ? `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%` : unit === '€' ? `${v.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €` : v.toLocaleString('it-IT', { maximumFractionDigits: 2 }));
  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="solar:chart-square-outline" width={24} />}
        title="KPI al momento del check-up"
        subheader={checkup.completedAt ? `Fotografia del ${fmtDate(checkup.completedAt)}: resta nello storico per i confronti` : 'Fotografia salvata alla chiusura'}
      />
      <Scrollbar>
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableHead>
            <TableRow>
              <TableCell>KPI</TableCell>
              <TableCell>Area</TableCell>
              <TableCell align="right">Valore</TableCell>
              <TableCell align="right">Target</TableCell>
              <TableCell align="right">Stato</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checkup.kpiSnapshot.map((k) => (
              <TableRow key={k.label}>
                <TableCell>{k.label}</TableCell>
                <TableCell>{k.scope}</TableCell>
                <TableCell align="right">{fmt(k.value, k.unit)}</TableCell>
                <TableCell align="right">{fmt(k.target, k.unit)}</TableCell>
                <TableCell align="right"><StatusBadge status={k.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Scrollbar>
    </Card>
  );
}

const MODEL_LABEL = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5' };
const k = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k` : String(n));

function UsageCard({ runs, mode, compact }) {
  const tot = runs.reduce(
    (t, r) => ({
      input: t.input + r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens,
      output: t.output + r.outputTokens,
      cache: t.cache + r.cacheReadTokens,
      searches: t.searches + r.webSearches,
      fetches: t.fetches + r.webFetches,
      cost: t.cost + r.costUsd,
      ms: t.ms + (r.durationMs ?? 0),
    }),
    { input: 0, output: 0, cache: 0, searches: 0, fetches: 0, cost: 0, ms: 0 }
  );
  const stats = [
    { label: 'Token in ingresso', value: k(tot.input), sub: `di cui ${k(tot.cache)} dalla cache` },
    { label: 'Token in uscita', value: k(tot.output), sub: 'ragionamento + testo' },
    { label: 'Ricerche web', value: tot.searches, sub: `${tot.fetches} pagine lette` },
    { label: 'Costo stimato', value: `${tot.cost.toFixed(2)} $`, sub: `${Math.round(tot.ms / 60000)} min di lavoro` },
  ];
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader
        avatar={<Iconify icon="solar:chart-square-outline" width={24} />}
        title="Consumo AI di questo check-up"
        subheader={`Modalità: ${MODES.find((m) => m.key === mode)?.title ?? mode} · stima a listino Anthropic, la fattura reale è su platform.claude.com`}
      />
      <Grid container spacing={2} sx={{ px: 3, pb: compact ? 3 : 2 }}>
        {stats.map((s) => (
          <Grid key={s.label} size={{ xs: 6, md: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.label}</Typography>
            <Typography variant="h5">{s.value}</Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>{s.sub}</Typography>
          </Grid>
        ))}
      </Grid>
      {!compact && (
        <Scrollbar>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Fase</TableCell>
                <TableCell>Modello</TableCell>
                <TableCell align="right">Ingresso</TableCell>
                <TableCell align="right">Uscita</TableCell>
                <TableCell align="right">Ricerche</TableCell>
                <TableCell align="right">Costo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.step}</TableCell>
                  <TableCell>{MODEL_LABEL[r.model] ?? r.model}</TableCell>
                  <TableCell align="right">{k(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens)}</TableCell>
                  <TableCell align="right">{k(r.outputTokens)}</TableCell>
                  <TableCell align="right">{r.webSearches || '—'}</TableCell>
                  <TableCell align="right">{r.costUsd.toFixed(3).replace('.', ',')} €</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Scrollbar>
      )}
    </Card>
  );
}

function SourcesCard({ sources, findings, questions }) {
  const [tab, setTab] = useState('fonti');
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader
        title={tab === 'fonti' ? `Fonti consultate (${sources.length})` : `Domande e risposte (${questions.length})`}
        action={
          <Button size="small" onClick={() => setTab(tab === 'fonti' ? 'qa' : 'fonti')}>
            {tab === 'fonti' ? 'Vedi domande' : 'Vedi fonti'}
          </Button>
        }
      />
      <Scrollbar sx={{ maxHeight: 360 }}>
        <Stack spacing={1} sx={{ p: 3, pt: 0 }}>
          {tab === 'fonti'
            ? sources.map((s) => (
                <Link key={s.url} href={s.url} target="_blank" rel="noopener" variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {s.title || s.url}
                </Link>
              ))
            : questions.map((q) => (
                <Box key={q.id}>
                  <Typography variant="subtitle2">{q.question}</Typography>
                  <Typography variant="body2" sx={{ color: q.answer ? 'text.primary' : 'text.disabled' }}>{q.answer || 'Nessuna risposta'}</Typography>
                </Box>
              ))}
          {tab === 'fonti' && !sources.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nessuna fonte registrata</Typography>}
        </Stack>
      </Scrollbar>
      {findings.length > 0 && tab === 'fonti' && (
        <Typography variant="caption" sx={{ display: 'block', px: 3, pb: 2, color: 'text.secondary' }}>
          {findings.length} fatti chiave raccolti nella ricognizione.
        </Typography>
      )}
    </Card>
  );
}

