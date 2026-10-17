'use client';

import { useRef, useMemo, useState, useEffect, useTransition } from 'react';
import Calendar from '@fullcalendar/react';
import listPlugin from '@fullcalendar/list';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { useRouter } from 'src/routes/hooks';
import { fmtDateTime } from 'src/lib/format';
import { EXIT_LABEL } from 'src/lib/publishing/exit-state';
import { DashboardContent } from 'src/layouts/dashboard';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CalendarRoot } from 'src/components/calendar/styles';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { rescheduleItem } from '../actions';

// ----------------------------------------------------------------------
// Tutti i contenuti di tutti i clienti: un colore per cliente, filtri per cliente, formato e stato.

const PALETTE = ['#B78A0F', '#00A76F', '#00B8D9', '#8E33FF', '#FF5630', '#1877F2', '#E1306C', '#22C55E', '#637381', '#FFAB00'];
const STATUS_LABEL = { bozza: 'Bozza', da_approvare: 'Da approvare', approvato: 'Approvato', pubblicato: 'Pubblicato' };

// Stato reale dell'uscita sui profili (dalle pubblicazioni automatiche)
const EXIT_STYLE = {
  errore: { icon: 'solar:danger-triangle-bold', color: 'error.main' },
  in_corso: { icon: 'solar:clock-circle-outline', color: 'warning.main' },
  programmata: { icon: 'solar:clock-circle-bold', color: 'info.main' },
  pubblicata: { icon: 'solar:check-circle-bold', color: 'success.main' },
};
const PUB_LABEL = { programmata: 'programmata', in_corso: 'in pubblicazione', pubblicata: 'uscita', errore: 'non uscita' };
const PLATFORM = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' };

function EventContent({ arg }) {
  const { exit, channels } = arg.event.extendedProps;
  const style = exit ? EXIT_STYLE[exit] : null;
  const body = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden', px: 0.25 }}>
      {style && <Iconify icon={style.icon} width={14} sx={{ color: style.color, flexShrink: 0 }} />}
      {arg.timeText && <Box component="span" sx={{ fontWeight: 600, flexShrink: 0 }}>{arg.timeText}</Box>}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arg.event.title}</Box>
    </Box>
  );
  if (!channels?.length) return body;
  return (
    <Tooltip
      arrow
      title={
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{EXIT_LABEL[exit]}</Typography>
          {channels.map((c, n) => (
            <Typography key={n} variant="caption" sx={{ display: 'block' }}>
              {PLATFORM[c.platform] ?? c.platform} @{c.handle}: {PUB_LABEL[c.status] ?? c.status}
              {c.error ? ` · ${c.error}` : ''}
            </Typography>
          ))}
        </Box>
      }
    >
      {body}
    </Tooltip>
  );
}

export function GlobalCalendar({ clients, items, readOnly }) {
  const ref = useRef(null);
  const router = useRouter();
  const [, start] = useTransition();
  const small = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const [chosen, setView] = useState(null);
  const view = chosen ?? (small ? 'listWeek' : 'dayGridMonth');
  const [title, setTitle] = useState('');
  const [hidden, setHidden] = useState([]);
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState('');
  const [exit, setExit] = useState('');

  const color = useMemo(() => Object.fromEntries(clients.map((c, n) => [c.id, PALETTE[n % PALETTE.length]])), [clients]);
  const name = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);
  const api = () => ref.current?.getApi();

  useEffect(() => {
    const cal = ref.current?.getApi();
    if (cal && cal.view.type !== view) cal.changeView(view);
  }, [view]);

  const events = items
    .filter(
      (i) =>
        !hidden.includes(i.clientId) &&
        (!format || i.format === format) &&
        (!status || i.status === status) &&
        (!exit || (exit === 'manuale' ? !i.exit : i.exit === exit)),
    )
    .map((i) => ({
      id: String(i.id),
      title: `${name[i.clientId]} · ${i.isPaid ? '€ ' : ''}${i.title}`,
      start: i.scheduledAt,
      allDay: false,
      backgroundColor: color[i.clientId],
      borderColor: color[i.clientId],
      textColor: color[i.clientId],
      // Già uscita o in uscita: non si sposta più dal calendario
      editable: !readOnly && i.status !== 'pubblicato' && i.exit !== 'pubblicata' && i.exit !== 'in_corso',
      extendedProps: { exit: i.exit, channels: i.channels },
      ...(i.exit === 'errore' && { classNames: ['exit-error'] }),
    }));

  // Contenuti da controllare: non usciti per un errore su almeno un profilo
  const failed = items.filter((i) => i.exit === 'errore' && !hidden.includes(i.clientId)).length;

  const formats = [...new Set(items.map((i) => i.format))];
  const toggle = (id) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs heading="Calendario" links={[{ name: 'Oggi', href: '/' }, { name: 'Calendario' }]} sx={{ mb: 3 }} />

      <Card>
        <Stack direction="row" spacing={1} sx={{ p: 2, pb: 1, flexWrap: 'wrap', gap: 1 }}>
          {clients.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              size="small"
              onClick={() => toggle(c.id)}
              variant={hidden.includes(c.id) ? 'outlined' : 'filled'}
              sx={{ fontWeight: 600, ...(!hidden.includes(c.id) && { bgcolor: `${color[c.id]}22`, color: color[c.id], '&:hover': { bgcolor: `${color[c.id]}33` } }) }}
              icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color[c.id], ml: '8px !important' }} />}
            />
          ))}
          {hidden.length > 0 && (
            <Button size="small" color="inherit" onClick={() => setHidden([])}>
              Mostra tutti
            </Button>
          )}
          {failed > 0 && (
            <Chip
              size="small"
              color="error"
              variant={exit === 'errore' ? 'filled' : 'soft'}
              icon={<Iconify icon="solar:danger-triangle-bold" width={16} />}
              label={`${failed} ${failed === 1 ? 'contenuto non uscito' : 'contenuti non usciti'}`}
              onClick={() => setExit(exit === 'errore' ? '' : 'errore')}
              sx={{ ml: 'auto' }}
            />
          )}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <IconButton onClick={() => api()?.prev()}><Iconify icon="eva:arrow-ios-back-fill" /></IconButton>
          <Typography variant="h6" sx={{ minWidth: { xs: 0, sm: 200 }, flex: { xs: 1, sm: 'none' }, textTransform: 'capitalize' }}>{title}</Typography>
          <IconButton onClick={() => api()?.next()}><Iconify icon="eva:arrow-ios-forward-fill" /></IconButton>
          <Button size="small" variant="outlined" color="inherit" onClick={() => api()?.today()}>Oggi</Button>
          <Box sx={{ flex: 1 }} />
          <TextField select size="small" label="Formato" value={format} onChange={(e) => setFormat(e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="">Tutti</MenuItem>
            {formats.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Stato" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">Tutti</MenuItem>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Uscita" value={exit} onChange={(e) => setExit(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">Tutte</MenuItem>
            {Object.entries(EXIT_LABEL).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            <MenuItem value="manuale">Senza uscita automatica</MenuItem>
          </TextField>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, v) => {
              if (!v) return;
              setView(v);
              api()?.changeView(v);
            }}
          >
            <ToggleButton value="dayGridMonth">Mese</ToggleButton>
            <ToggleButton value="timeGridWeek">Settimana</ToggleButton>
            <ToggleButton value="listWeek">Elenco</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ px: 2, pb: 1, flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(EXIT_STYLE).map(([k, v]) => (
            <Stack key={k} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Iconify icon={v.icon} width={14} sx={{ color: v.color }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{EXIT_LABEL[k]}</Typography>
            </Stack>
          ))}
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>Senza icona: nessuna uscita automatica programmata</Typography>
        </Stack>

        <CalendarRoot sx={{ px: 1, pb: 1, '& .exit-error': { outline: (t) => `2px solid ${t.palette.error.main}` } }}>
          <Calendar
            ref={ref}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={view}
            locale="it"
            firstDay={1}
            headerToolbar={false}
            height={small ? 'auto' : 760}
            dayMaxEvents={4}
            eventDisplay="block"
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            noEventsText="Nessuna pubblicazione"
            allDayText="Giorno"
            events={events}
            eventContent={(arg) => <EventContent arg={arg} />}
            datesSet={(arg) => setTitle(arg.view.title)}
            eventClick={(arg) => router.push(`/pubblicazioni/${arg.event.id}`)}
            eventDrop={(arg) => {
              start(async () => {
                await rescheduleItem(Number(arg.event.id), arg.event.start.toISOString());
                toast.success(`Spostato a ${fmtDateTime(arg.event.start)}`);
              });
            }}
          />
        </CalendarRoot>
      </Card>
    </DashboardContent>
  );
}
