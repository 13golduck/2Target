'use client';

import { formatName, platformName, platformsText } from 'src/lib/platforms';
import { useRef, useState, useEffect, useTransition } from 'react';
import Calendar from '@fullcalendar/react';
import listPlugin from '@fullcalendar/list';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Tabs from '@mui/material/Tabs';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import ListItem from '@mui/material/ListItem';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import ToggleButton from '@mui/material/ToggleButton';
import ListItemText from '@mui/material/ListItemText';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemButton from '@mui/material/ListItemButton';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { fmtDate, fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { EmptyContent } from 'src/components/empty-content';
import { CalendarRoot } from 'src/components/calendar/styles';

import { createItem, createPlan, rescheduleItem } from '../../../actions';

import { PlanAiDialog } from './plan-ai-dialog';
import { ApprovalButton } from './approval-dialog';
import { RecyclePanel } from './recycle-panel';
import { SchedulePlanButton } from './schedule-plan-dialog';
import { PlanImportDialog } from './plan-import-dialog';

// ----------------------------------------------------------------------

// Colori per formato nel calendario (lo stile del kit li mostra in versione tenue)
const FORMAT_COLOR = { reel: '#B78A0F', post: '#00A76F', carosello: '#00B8D9', storia: '#8E33FF', video: '#637381' };
const STATUS = {
  bozza: { label: 'Bozza', color: 'default' },
  da_approvare: { label: 'Da approvare', color: 'warning' },
  approvato: { label: 'Approvato', color: 'info' },
  pubblicato: { label: 'Pubblicato', color: 'success' },
  annullato: { label: 'Annullato', color: 'error' },
};

export function PlanView({ clientId, plans, plan, items, issues, formats, platforms, checkups, approval, recycle, manual }) {
  const [tab, setTab] = useState('calendario');
  const [newAt, setNewAt] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {plans.map((p) => (
          <Button
            key={p.id}
            component={RouterLink}
            href={`?piano=${p.id}`}
            variant={plan?.id === p.id ? 'contained' : 'outlined'}
            color={plan?.id === p.id ? 'primary' : 'inherit'}
          >
            {p.name}
          </Button>
        ))}
        {/* Senza piani gli stessi comandi sono nel riquadro centrale: qui non si ripetono */}
        {(plans.length > 0 || manual) && (
          <>
            <Button component={RouterLink} href="?nuovo=1" startIcon={<Iconify icon="mingcute:add-line" />}>
              Nuovo piano
            </Button>
            <Button startIcon={<Iconify icon="solar:atom-bold-duotone" />} onClick={() => setAiOpen(true)}>
              Genera con l&apos;AI
            </Button>
          </>
        )}
        <PlanAiDialog open={aiOpen} onClose={() => setAiOpen(false)} clientId={clientId} checkups={checkups} platforms={platforms} />
        {(plans.length > 0 || manual) && (
          <Button color="inherit" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={() => setImportOpen(true)}>
            Importa da file
          </Button>
        )}
        <PlanImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          clientId={clientId}
          plan={plan ? { id: plan.id, name: plan.name } : null}
          formats={formats}
          platforms={platforms}
        />
        {plan && approval && <ApprovalButton clientId={clientId} planId={plan.id} {...approval} />}
        {plan && <SchedulePlanButton planId={plan.id} />}
        {plan && (
          <Button
            component="a"
            href={`/api/piano/${plan.id}/word`}
            download
            variant="outlined"
            color="inherit"
            startIcon={<Iconify icon="solar:download-bold" />}
            sx={{ ml: { sm: 'auto' } }}
          >
            Scarica Word
          </Button>
        )}
      </Stack>

      {!plan && !manual ? (
        // Nessun piano: prima si sceglie la strada, poi (solo a mano) il modulo
        <Card sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <Iconify icon="solar:calendar-date-bold" width={48} sx={{ color: 'primary.main', mb: 1 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>
            Non c&apos;è ancora un piano editoriale
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 520, mx: 'auto' }}>
            Il piano è il calendario dei contenuti da pubblicare. Scegli come prepararlo: potrai sempre modificarlo.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" size="large" startIcon={<Iconify icon="solar:atom-bold-duotone" />} onClick={() => setAiOpen(true)}>
              Fallo preparare all&apos;AI (consigliato)
            </Button>
            <Button variant="outlined" size="large" color="inherit" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={() => setImportOpen(true)}>
              Importa da Word o Excel
            </Button>
            <Button size="large" color="inherit" component={RouterLink} href="?nuovo=1" startIcon={<Iconify icon="mingcute:add-line" />}>
              Crealo a mano
            </Button>
          </Stack>
        </Card>
      ) : !plan ? (
        <NewPlanForm clientId={clientId} platforms={platforms} />
      ) : (
        <>
          <Summary plan={plan} items={items} issues={issues} />
          {recycle?.length > 0 && <RecyclePanel planId={plan.id} suggestions={recycle} />}

          <Card>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ px: 2, alignItems: { sm: 'center' }, borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ flex: 1 }}>
                <Tab value="calendario" label="Calendario" icon={<Iconify icon="solar:calendar-date-bold" />} iconPosition="start" />
                <Tab value="elenco" label={`Elenco (${items.length})`} icon={<Iconify icon="solar:list-bold" />} iconPosition="start" />
              </Tabs>
              <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setNewAt('')} sx={{ my: 1 }}>
                Nuova pubblicazione
              </Button>
            </Stack>
            {tab === 'calendario' ? (
              <PlanCalendar plan={plan} items={items} onSelectDay={(d) => setNewAt(d)} />
            ) : (
              <PlanList items={items} />
            )}
          </Card>

          <NewItemDialog planId={plan.id} at={newAt} onClose={() => setNewAt(null)} formats={formats} />
        </>
      )}
    </Stack>
  );
}

// ----------------------------------------------------------------------

function Summary({ plan, items, issues }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const active = items.filter((i) => i.status !== 'annullato');
  const paid = active.filter((i) => i.isPaid);
  const paidTotal = paid.reduce((t, i) => t + (i.adBudget ?? 0), 0);
  const errors = items.reduce((t, i) => t + i.errors, 0) + issues.filter((i) => i.level === 'errore').length;
  const warnings = items.reduce((t, i) => t + i.warnings, 0) + issues.filter((i) => i.level === 'avviso').length;

  return (
    <>
      <Grid container spacing={3}>
        {Object.entries(plan.formatQuotas).map(([fmt, quota]) => {
          const n = active.filter((i) => i.format === fmt).length;
          return (
            <Grid key={fmt} size={{ xs: 6, md: 3 }}>
              <Card sx={{ p: 3 }}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
                  {fmt}
                </Typography>
                <Typography variant="h3">
                  {n}
                  <Box component="span" sx={{ typography: 'h6', color: 'text.disabled' }}> / {quota}</Box>
                </Typography>
                <LinearProgress variant="determinate" value={Math.min(100, (n / (quota || 1)) * 100)} sx={{ mt: 1.5, height: 6, borderRadius: 1 }} />
              </Card>
            </Grid>
          );
        })}
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>Sponsorizzate</Typography>
            <Typography variant="h3">{paid.length}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {paidTotal.toLocaleString('it-IT')} €{plan.adsBudget != null && ` di ${plan.adsBudget.toLocaleString('it-IT')} €`}
            </Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>Da sistemare</Typography>
            <Typography variant="h3" sx={{ color: errors ? 'error.main' : 'success.main' }}>{errors}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{warnings} {warnings === 1 ? 'avviso' : 'avvisi'}</Typography>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {plan.name} · {fmtDate(plan.startsOn)} → {fmtDate(plan.endsOn)} · minimo {plan.minPerWeek} a settimana
            </Typography>
            {plan.fromCheckup && (
              <Label color="info" startIcon={<Iconify icon="solar:notes-bold-duotone" />} sx={{ mb: 1 }}>
                Bozza dal check-up: titoli e angoli pronti, testi da scrivere
              </Label>
            )}
            {plan.brief && (
              <>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap', ...(!briefOpen && { maxHeight: 120, overflow: 'hidden', maskImage: plan.brief.length > 300 ? 'linear-gradient(#000 60%, transparent)' : 'none' }) }}
                >
                  <b>Brief e strategia.</b> {plan.brief}
                </Typography>
                {plan.brief.length > 300 && (
                  <Button size="small" color="inherit" onClick={() => setBriefOpen((o) => !o)} sx={{ mt: 0.5, px: 0 }}>
                    {briefOpen ? 'Riduci' : 'Leggi tutto'}
                  </Button>
                )}
              </>
            )}
          </Box>
          {issues.length > 0 && (
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Controlli sul piano</Typography>
              <Box sx={{ maxHeight: 140, overflow: 'auto' }}>
                {issues.map((i, n) => (
                  <Typography key={n} variant="body2" sx={{ color: i.level === 'errore' ? 'error.main' : 'warning.dark' }}>
                    • {i.message}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </Card>
    </>
  );
}

// ----------------------------------------------------------------------

function PlanCalendar({ plan, items, onSelectDay }) {
  const ref = useRef(null);
  const router = useRouter();
  const [, start] = useTransition();
  // Su smartphone e tablet piccoli il mese è illeggibile: si parte dall'elenco
  const small = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const [chosen, setView] = useState(null); // vista scelta dall'utente, altrimenti quella adatta allo schermo
  const view = chosen ?? (small ? 'listMonth' : 'dayGridMonth');
  const [title, setTitle] = useState('');

  const api = () => ref.current?.getApi();
  // Si apre sul primo contenuto da oggi in poi (o su oggi), non sull'inizio del piano che può essere vuoto o passato
  const today = new Date().toISOString().slice(0, 10);
  const dated = items.filter((i) => i.scheduledAt).map((i) => i.scheduledAt.slice(0, 10)).sort();
  const initialDate = dated.find((d) => d >= today) ?? (today >= plan.startsOn && today <= plan.endsOn ? today : dated.at(-1) ?? plan.startsOn);
  // Il calendario è un componente esterno: gli si comunica la vista quando cambia lo schermo
  useEffect(() => {
    const cal = ref.current?.getApi();
    if (cal && cal.view.type !== view) cal.changeView(view);
  }, [view]);
  const events = items
    .filter((i) => i.scheduledAt)
    .map((i) => ({
      id: String(i.id),
      title: `${i.isPaid ? '€ ' : ''}${i.title}`,
      start: i.scheduledAt,
      allDay: false,
      backgroundColor: FORMAT_COLOR[i.format] ?? '#637381',
      borderColor: FORMAT_COLOR[i.format] ?? '#637381',
      textColor: FORMAT_COLOR[i.format] ?? '#637381',
      extendedProps: { format: i.format },
    }));

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ p: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <IconButton onClick={() => api()?.prev()}><Iconify icon="eva:arrow-ios-back-fill" /></IconButton>
        <Typography variant="h6" sx={{ minWidth: { xs: 0, sm: 180 }, flex: { xs: 1, sm: 'none' }, textTransform: 'capitalize' }}>{title}</Typography>
        <IconButton onClick={() => api()?.next()}><Iconify icon="eva:arrow-ios-forward-fill" /></IconButton>
        <Button size="small" variant="outlined" color="inherit" onClick={() => api()?.today()}>Oggi</Button>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
          {Object.entries(FORMAT_COLOR).map(([f, c]) => (
            <Stack key={f} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />
              <Typography variant="caption">{formatName(f)}</Typography>
            </Stack>
          ))}
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth={small}
          value={view}
          onChange={(_, v) => {
            if (!v) return;
            setView(v);
            api()?.changeView(v);
          }}
        >
          <ToggleButton value="dayGridMonth">Mese</ToggleButton>
          <ToggleButton value="timeGridWeek">Settimana</ToggleButton>
          <ToggleButton value="listMonth">Elenco</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <CalendarRoot sx={{ px: 1, pb: 1 }}>
        <Calendar
          ref={ref}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          initialDate={initialDate}
          locale="it"
          firstDay={1}
          headerToolbar={false}
          height={small ? 'auto' : 720}
          editable
          selectable
          dayMaxEvents={3}
          eventDisplay="block"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          buttonText={{ today: 'Oggi' }}
          noEventsText="Nessuna pubblicazione"
          allDayText="Giorno"
          validRange={{ start: plan.startsOn, end: dayAfter(plan.endsOn) }}
          events={events}
          datesSet={(arg) => setTitle(arg.view.title)}
          eventClick={(arg) => router.push(`/pubblicazioni/${arg.event.id}`)}
          dateClick={(arg) => onSelectDay(`${arg.dateStr.slice(0, 10)}T18:00`)}
          eventDrop={(arg) => {
            start(async () => {
              const r = await rescheduleItem(Number(arg.event.id), arg.event.start.toISOString()).catch(() => ({ error: 'errore di rete' }));
              // Se il salvataggio non riesce, la pubblicazione torna dov'era: il calendario non deve mentire
              if (r?.error) {
                arg.revert();
                toast.error(`Non sono riuscito a spostarla (${r.error}): riprova`);
              } else toast.success(`Spostato a ${fmtDateTime(arg.event.start)}`);
            });
          }}
        />
      </CalendarRoot>
    </Box>
  );
}

const dayAfter = (d) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

// ----------------------------------------------------------------------

function PlanList({ items }) {
  if (!items.length) {
    return <EmptyContent title="Nessuna pubblicazione" description="Creane una o pianifica un'idea approvata." sx={{ py: 8 }} />;
  }
  return (
    <List disablePadding>
      {items.map((i, n) => (
        <Box key={i.id}>
          {n > 0 && <Divider sx={{ borderStyle: 'dashed' }} />}
          <ListItem disablePadding>
            <ListItemButton component={RouterLink} href={`/pubblicazioni/${i.id}`} sx={{ px: 3, py: 1.5, gap: 2 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: FORMAT_COLOR[i.format] ?? 'grey.500', flexShrink: 0 }} />
              <ListItemText
                primary={i.title}
                secondary={`${fmtDateTime(i.scheduledAt ? new Date(i.scheduledAt) : null)} · ${formatName(i.format)} · ${platformsText([i.platform, ...i.crossPost])}`}
                slotProps={{ primary: { typography: 'subtitle2' } }}
              />
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                {i.isPaid && <Label color="secondary" startIcon={<Iconify icon="solar:wad-of-money-bold" />}>{i.adBudget ?? 0} €</Label>}
                {i.errors > 0 ? (
                  <Label color="error">{i.errors} da completare</Label>
                ) : i.warnings > 0 ? (
                  <Label color="warning">{i.warnings} {i.warnings === 1 ? 'avviso' : 'avvisi'}</Label>
                ) : (
                  <Label color="success">Completa</Label>
                )}
                <Label variant="outlined" color={STATUS[i.status].color}>{STATUS[i.status].label}</Label>
              </Stack>
            </ListItemButton>
          </ListItem>
        </Box>
      ))}
    </List>
  );
}

// ----------------------------------------------------------------------

function NewItemDialog({ planId, at, onClose, formats }) {
  return (
    <Dialog open={at !== null} onClose={onClose} fullWidth maxWidth="sm">
      <Box component="form" action={createItem}>
        <DialogTitle>Nuova pubblicazione</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <input type="hidden" name="planId" value={planId} />
            <TextField name="title" label="Titolo" required autoFocus fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField select name="format" label="Formato" defaultValue="reel" fullWidth>
                {formats.map((f) => <MenuItem key={f} value={f}>{formatName(f)}</MenuItem>)}
              </TextField>
              <TextField
                name="scheduledAt"
                type="datetime-local"
                label="Data e ora"
                defaultValue={at ?? ''}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>
            <Alert severity="info">Dopo si apre la pubblicazione completa: testo, riprese, invito all’azione e sponsorizzata.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="contained">Crea e apri la pubblicazione</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function NewPlanForm({ clientId, platforms }) {
  return (
    <Card sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 3 }}>Nuovo piano editoriale</Typography>
      <Box component="form" action={createPlan}>
        <input type="hidden" name="clientId" value={clientId} />
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 6 }}><TextField name="name" label="Nome" placeholder="es. Piano settembre – gennaio" fullWidth /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><TextField name="startsOn" type="date" label="Dal" required slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><TextField name="endsOn" type="date" label="Al" required slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField name="minPerWeek" label="Minimo a settimana" defaultValue={3} fullWidth /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField name="quota:reel" label="Reel richiesti" fullWidth /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField name="quota:post" label="Post richiesti" fullWidth /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField name="quota:carosello" label="Caroselli" fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField name="adsBudget" label="Budget sponsorizzate €" fullWidth /></Grid>
          <Grid size={12}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Piattaforme</Typography>
            {platforms.map((p) => (
              <FormControlLabel key={p} control={<Checkbox name="platforms" value={p} defaultChecked={p === 'instagram'} />} label={platformName(p)} />
            ))}
          </Grid>
          <Grid size={12}><TextField name="brief" label="Brief del cliente" multiline minRows={4} fullWidth /></Grid>
          <Grid size={12}><Button type="submit" variant="contained" size="large">Crea piano</Button></Grid>
        </Grid>
      </Box>
    </Card>
  );
}

