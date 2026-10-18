'use client';

import { ErrorText } from 'src/components/error-text';
import { GettingStartedCard } from './getting-started-card';
import { platformName } from 'src/lib/platforms';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';

import { RouterLink } from 'src/routes/components';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// «Oggi»: le cose da fare su tutti i clienti. Ogni riga porta dritta dove si risolve.

const STATUS_LABEL = { bozza: 'Bozza', da_approvare: 'Da approvare', approvato: 'Approvato', pubblicato: 'Pubblicato', annullato: 'Annullato' };
const FORMAT_COLOR = { reel: '#B8860B', post: '#2E7D32', carosello: '#0288D1', storia: '#7B1FA2', video: '#C62828' };

const dayLabel = (iso) => {
  if (!iso) return 'senza data';
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 86_400_000);
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  if (diff === 0) return `oggi ${time}`;
  if (diff === 1) return `domani ${time}`;
  return `${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })} ${time}`;
};

// Da quanto aspetta un lead: in ore (per il colore) e in parole (per l'etichetta)
const waitingHours = (iso) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const waitingLabel = (iso) => {
  const h = waitingHours(iso);
  if (h < 1) return 'da meno di un\u2019ora';
  if (h < 24) return `da ${Math.floor(h)} ${Math.floor(h) === 1 ? 'ora' : 'ore'}`;
  const d = Math.floor(h / 24);
  return `da ${d} ${d === 1 ? 'giorno' : 'giorni'}`;
};

export function TodayView({ board, userName, start }) {
  const hour = new Date().getHours();
  const hello = hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const problems = board.fallite.length + board.collegamenti.length + board.checkup.length + (board.salute?.length ?? 0);

  const counters = [
    { label: 'In uscita in 7 giorni', value: board.inUscita.length, icon: 'solar:calendar-date-bold', color: 'info' },
    { label: 'Da approvare', value: board.daApprovare.length, icon: 'solar:check-circle-bold', color: 'warning' },
    { label: 'Da sistemare', value: problems, icon: 'solar:danger-triangle-bold', color: 'error' },
    { label: 'KPI fuori obiettivo', value: board.kpi.length, icon: 'solar:chart-square-outline', color: 'secondary' },
  ];

  return (
    <Box sx={{ mb: 5 }}>
      <Typography variant="h4">
        {hello}
        {userName ? `, ${userName.split(' ')[0]}` : ''}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' })} · ecco cosa richiede attenzione su tutti i clienti
      </Typography>

      {start && <GettingStartedCard steps={start} />}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {counters.map((c) => (
          <Grid key={c.label} size={{ xs: 6, md: 3 }}>
            <Card sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: `${c.color}.lighter`, color: `${c.color}.dark`, width: 48, height: 48 }}>
                <Iconify icon={c.icon} width={26} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ lineHeight: 1.1 }}>{c.value}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{c.label}</Typography>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Panel title="In uscita nei prossimi 7 giorni" icon="solar:calendar-date-bold" empty="Niente in programma questa settimana." action={board.calendario === false ? undefined : { label: 'Calendario', href: '/calendario' }}>
            {board.inUscita.map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                right={i.note === 'pronta' ? <Label color="success">Pronta</Label> : i.note ? <Label color="error">{i.note}</Label> : <Label color="default">{STATUS_LABEL[i.status] ?? i.status}</Label>}
              />
            ))}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={3}>
            {problems > 0 && (
              <Panel title="Da sistemare" icon="solar:danger-triangle-bold" color="error.main">
                {board.fallite.map((i) => (
                  <ItemRow key={`f${i.id}`} item={i} secondary={<>Pubblicazione non riuscita · <ErrorText error={i.note} /></>} right={<Label color="error">Errore</Label>} />
                ))}
                {board.collegamenti.map((c) => (
                  <LinkRow
                    key={`c${c.id}`}
                    href={`/clienti/${c.clientId}/canali`}
                    primary={`${c.clientName} · ${c.provider === 'meta' ? 'Meta' : c.provider === 'google' ? 'Google' : 'TikTok'} da ricollegare`}
                    secondary={c.lastError ? <ErrorText error={c.lastError} /> : c.accountName}
                    right={<Label color="error">Collegamento</Label>}
                  />
                ))}
                {board.checkup.map((c) => (
                  <LinkRow
                    key={`k${c.id}`}
                    href={`/clienti/${c.clientId}/checkup?id=${c.id}`}
                    primary={`${c.clientName} · check-up`}
                    secondary={c.aiState === 'domande' ? 'Aspetta le tue risposte per proseguire' : c.aiState === 'errore' ? (c.aiError ? <ErrorText error={c.aiError} /> : 'Fermato da un errore') : 'Fermato: premi Riprendi'}
                    right={<Label color={c.aiState === 'domande' ? 'info' : 'warning'}>{c.aiState === 'domande' ? 'Domande' : 'Fermo'}</Label>}
                  />
                ))}
                {(board.salute ?? []).map((s) => (
                  <LinkRow
                    key={`s${s.id}`}
                    href={`/clienti/${s.clientId}/canali`}
                    primary={`${s.clientName} · sito`}
                    secondary={s.problems[0] ?? 'Controllo salute del sito'}
                    right={<Label color={s.severity === 'grave' ? 'error' : 'warning'}>{s.severity === 'grave' ? 'Sito' : 'Sito'}</Label>}
                  />
                ))}
              </Panel>
            )}

            {(board.leadNuovi ?? []).length > 0 && (
              <Panel title="Lead da contattare" icon="solar:user-plus-bold" color="warning.main">
                {board.leadNuovi.map((l) => (
                  <LinkRow
                    key={`l${l.id}`}
                    href={`/clienti/${l.clientId}/lead`}
                    primary={`${l.clientName} · ${l.name ?? l.email ?? l.phone ?? 'Contatto senza nome'}`}
                    secondary={[l.phone, l.email].filter(Boolean).join(' · ') || 'Nessun recapito'}
                    right={<Label color={waitingHours(l.receivedAt) >= 24 ? 'error' : 'warning'}>{waitingLabel(l.receivedAt)}</Label>}
                  />
                ))}
              </Panel>
            )}

            {(board.usciti ?? []).length > 0 && (
              <Panel title="Usciti nelle ultime 24 ore" icon="solar:check-read-linear" color="success.main">
                {board.usciti.map((u) => (
                  <LinkRow
                    key={`u${u.id}`}
                    href={`/pubblicazioni/${u.itemId}`}
                    primary={u.title}
                    secondary={`${u.clientName} · ${platformName(u.platform)} @${u.handle} · ${dayLabel(u.publishedAt)}`}
                    right={
                      u.permalink ? (
                        // Non un <a>: la riga è già un link alla scheda (link annidati non sono validi)
                        <Label
                          component="span"
                          role="link"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(u.permalink, '_blank', 'noopener');
                          }}
                          color="success"
                          sx={{ cursor: 'pointer' }}
                        >
                          Apri il post
                        </Label>
                      ) : (
                        <Label color="success">Uscito</Label>
                      )
                    }
                  />
                ))}
              </Panel>
            )}

            <Panel title="Da approvare" icon="solar:check-circle-bold" empty="Nessun contenuto in attesa di approvazione.">
              {board.daApprovare.map((i) => (
                <ItemRow key={i.id} item={i} right={<Label color="warning">Da approvare</Label>} />
              ))}
            </Panel>

            {board.materiali.length > 0 && (
              <Panel title="Materiale da chiedere ai clienti" icon="solar:camera-add-bold">
                {board.materiali.map((i) => (
                  <ItemRow key={i.id} item={i} secondary={`${dayLabel(i.scheduledAt)}${i.note ? ` · ${i.note}` : ''}`} right={<Label color="warning">Materiale</Label>} />
                ))}
              </Panel>
            )}

            {board.kpi.length > 0 && (
              <Panel title="KPI fuori obiettivo" icon="solar:chart-square-outline">
                {board.kpi.slice(0, 8).map((k) => (
                  <LinkRow
                    key={k.id}
                    href={`/clienti/${k.clientId}/kpi`}
                    primary={`${k.clientName} · ${k.label}`}
                    secondary={k.message}
                    right={<Label color={k.status === 'troppo_male' ? 'error' : 'warning'}>{k.status === 'troppo_male' ? 'Troppo male' : 'Male'}</Label>}
                  />
                ))}
              </Panel>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

// ----------------------------------------------------------------------

function Panel({ title, icon, color = 'text.primary', empty, action, children }) {
  const rows = [children].flat(2).filter(Boolean);
  return (
    <Card>
      <CardHeader
        title={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Iconify icon={icon} sx={{ color }} />
            <span>{title}</span>
            {rows.length > 0 && <Label>{rows.length}</Label>}
          </Stack>
        }
        action={
          action && (
            <Typography component={RouterLink} href={action.href} variant="body2" sx={{ color: 'primary.dark', textDecoration: 'none', fontWeight: 600 }}>
              {action.label} →
            </Typography>
          )
        }
        sx={{ pb: 1 }}
      />
      {rows.length ? (
        <List dense sx={{ px: 1, pb: 1, maxHeight: 420, overflow: 'auto' }}>{rows}</List>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, pb: 3, pt: 1 }}>
          {empty}
        </Typography>
      )}
    </Card>
  );
}

function ItemRow({ item, secondary, right }) {
  return (
    <LinkRow
      href={`/pubblicazioni/${item.id}`}
      dot={FORMAT_COLOR[item.format]}
      primary={item.title}
      secondary={secondary ?? `${item.clientName} · ${dayLabel(item.scheduledAt)} · ${item.format}`}
      right={right}
    />
  );
}

function LinkRow({ href, primary, secondary, right, dot }) {
  return (
    <ListItemButton component={RouterLink} href={href} sx={{ borderRadius: 1, gap: 1.5 }}>
      {dot && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }} />}
      <ListItemText
        primary={primary}
        secondary={secondary}
        slotProps={{ primary: { typography: 'subtitle2', noWrap: true }, secondary: { noWrap: true } }}
        sx={{ minWidth: 0 }}
      />
      <Box sx={{ flexShrink: 0 }}>{right}</Box>
    </ListItemButton>
  );
}
