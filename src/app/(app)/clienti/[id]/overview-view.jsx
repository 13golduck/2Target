'use client';

import { formatName } from 'src/lib/platforms';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemButton from '@mui/material/ListItemButton';

import { RouterLink } from 'src/routes/components';
import { fmtDate, fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';

import { ClientOptions } from './client-options';
import { FeatureSwitches } from '../../feature-switches';
import { saveClientFeatures } from '../../client-settings-actions';

// ----------------------------------------------------------------------
// Panoramica del cliente: i numeri del mese, le prossime uscite e il prossimo passo da fare.

const FORMAT_COLOR = { reel: '#B78A0F', post: '#00A76F', carosello: '#00B8D9', storia: '#8E33FF', video: '#637381' };
const STATUS = { bozza: ['Bozza', 'default'], da_approvare: ['Da approvare', 'warning'], approvato: ['Approvato', 'info'] };
const KPI_COLOR = { bene: 'success', male: 'warning', troppo_male: 'error', in_attesa: 'default' };
const PLATFORM_ICON = { instagram: 'socials:instagram', facebook: 'socials:facebook', tiktok: 'socials:tiktok', linkedin: 'socials:linkedin', youtube: 'socials:youtube' };
const CHECKUP_STATE = { pronto: 'Pronto', domande: 'Aspetta le tue risposte', errore: 'Fermato da un errore', interrotto: 'Fermato', ricognizione: 'In lavorazione', ricerca: 'In lavorazione', scrittura: 'In lavorazione', da_avviare: 'Da avviare' };

export function OverviewView({ clientId, options, features, readOnly, steps, upcoming, counters, kpis, channels, checkup, plan }) {
  const base = `/clienti/${clientId}`;
  const todo = steps.filter((s) => !s.done);
  const planTotal = plan ? Object.values(plan.counts).reduce((a, b) => a + b, 0) : 0;

  const tiles = [
    { label: 'Da approvare', value: counters.toApprove, icon: 'solar:check-circle-bold', color: 'warning', href: `${base}/piano` },
    { label: 'Pubblicati questo mese', value: counters.publishedMonth, icon: 'solar:share-bold', color: 'info', href: `${base}/piano` },
    { label: 'Lead questo mese', value: counters.leads, icon: 'solar:users-group-rounded-bold', color: 'success', href: `${base}/lead` },
    { label: 'KPI in linea', value: counters.kpiTotal ? `${counters.kpiOk}/${counters.kpiTotal}` : '—', icon: 'solar:chart-square-outline', color: 'secondary', href: `${base}/kpi` },
  ];

  return (
    <Stack spacing={3}>
      {todo.length > 0 && (
        <Card sx={{ p: 2.5, bgcolor: 'primary.lighter', border: 'none' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ color: 'primary.darker' }}>
                Prossimo passo: {todo[0].label.toLowerCase()}
              </Typography>
              <Typography variant="body2" sx={{ color: 'primary.darker', opacity: 0.8 }}>
                Impostazione del cliente: {steps.length - todo.length} di {steps.length} passi completati
              </Typography>
              <LinearProgress variant="determinate" value={((steps.length - todo.length) / steps.length) * 100} sx={{ mt: 1, height: 6, borderRadius: 1, maxWidth: 360 }} />
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {steps.map((s) => (
                <Button
                  key={s.key}
                  size="small"
                  component={RouterLink}
                  href={s.href}
                  variant={s === todo[0] ? 'contained' : 'outlined'}
                  color={s.done ? 'success' : 'inherit'}
                  startIcon={<Iconify icon={s.done ? 'eva:checkmark-fill' : 'eva:arrow-ios-forward-fill'} />}
                >
                  {s.label}
                </Button>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      <Grid container spacing={2}>
        {tiles.map((t) => (
          <Grid key={t.label} size={{ xs: 6, md: 3 }}>
            <Card component={RouterLink} href={t.href} sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, textDecoration: 'none', color: 'inherit', '&:hover': { boxShadow: (th) => th.vars.customShadows.z8 } }}>
              <Avatar sx={{ bgcolor: `${t.color}.lighter`, color: `${t.color}.dark`, width: 44, height: 44 }}>
                <Iconify icon={t.icon} width={24} />
              </Avatar>
              <Box>
                <Typography variant="h5" sx={{ lineHeight: 1.1 }}>{t.value}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t.label}</Typography>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card>
            <CardHeader
              title="Prossime uscite"
              action={<Button size="small" component={RouterLink} href={`${base}/piano`} endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}>Calendario</Button>}
            />
            {upcoming.length ? (
              <List dense sx={{ px: 1, pb: 1 }}>
                {upcoming.map((i) => (
                  <ListItemButton key={i.id} component={RouterLink} href={`/pubblicazioni/${i.id}`} sx={{ borderRadius: 1, gap: 1.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: FORMAT_COLOR[i.format] ?? 'grey.500', flexShrink: 0 }} />
                    <ListItemText primary={i.title} secondary={`${fmtDateTime(i.scheduledAt ? new Date(i.scheduledAt) : null)} · ${formatName(i.format)}`} slotProps={{ primary: { typography: 'subtitle2', noWrap: true } }} sx={{ minWidth: 0 }} />
                    {i.errors > 0 ? <Label color="error">{i.errors} da completare</Label> : <Label color={STATUS[i.status]?.[1] ?? 'default'}>{STATUS[i.status]?.[0] ?? i.status}</Label>}
                  </ListItemButton>
                ))}
              </List>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', px: 3, pb: 3 }}>
                Nessuna pubblicazione in programma. <RouterLink href={`${base}/piano`}>Apri il piano editoriale</RouterLink>.
              </Typography>
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={3}>
            <Card>
              <CardHeader title="Social" action={<Button size="small" component={RouterLink} href={`${base}/canali`}>Gestisci</Button>} />
              <Stack spacing={1.5} sx={{ p: 3, pt: 2 }}>
                {channels.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nessun profilo collegato.</Typography>}
                {channels.map((c) => (
                  <Stack key={c.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Avatar src={c.pictureUrl ?? undefined} sx={{ width: 32, height: 32 }}><Iconify icon={PLATFORM_ICON[c.platform] ?? 'eva:link-2-fill'} /></Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>{c.name}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Iconify icon={PLATFORM_ICON[c.platform] ?? 'eva:link-2-fill'} width={14} />
                        <Typography variant="caption" sx={{ color: c.connected ? 'text.secondary' : 'warning.main' }}>{c.connected ? 'collegato' : 'solo riferimento'}</Typography>
                      </Stack>
                    </Box>
                    {c.followers != null && (
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="subtitle2">{Math.round(c.followers).toLocaleString('it-IT')}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>follower</Typography>
                      </Box>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Card>

            <Card>
              <CardHeader title="KPI" action={<Button size="small" component={RouterLink} href={`${base}/kpi`}>Tutti</Button>} />
              <Stack spacing={1} sx={{ p: 3, pt: 2 }}>
                {kpis.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nessun KPI ancora: fissali per misurare i risultati.</Typography>}
                {kpis.map((k) => (
                  <Stack key={k.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: `${KPI_COLOR[k.status] === 'default' ? 'grey.400' : `${KPI_COLOR[k.status]}.main`}`, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{k.label}</Typography>
                      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} noWrap>{k.message}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Card>

            <Card sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Iconify icon="solar:notes-bold-duotone" width={24} sx={{ color: 'text.secondary' }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">Check-up</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {checkup ? `${checkup.delivered ? 'Consegnato' : CHECKUP_STATE[checkup.aiState] ?? checkup.aiState} · ${fmtDate(checkup.createdAt)}` : 'Non ancora fatto'}
                    </Typography>
                  </Box>
                  <Button size="small" component={RouterLink} href={`${base}/checkup`}>Apri</Button>
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Iconify icon="solar:calendar-date-bold" width={24} sx={{ color: 'text.secondary' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{plan ? plan.name : 'Piano editoriale'}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {plan ? `${fmtDate(plan.startsOn)} → ${fmtDate(plan.endsOn)} · ${plan.counts.pubblicato ?? 0} pubblicati su ${planTotal}` : 'Nessun piano'}
                    </Typography>
                    {plan && planTotal > 0 && <LinearProgress variant="determinate" value={((plan.counts.pubblicato ?? 0) / planTotal) * 100} sx={{ mt: 0.5, height: 4, borderRadius: 1 }} />}
                  </Box>
                  <Button size="small" component={RouterLink} href={`${base}/piano`}>Apri</Button>
                </Stack>
              </Stack>
            </Card>

            {/* Da qui in giù non sono dati ma impostazioni: un titolo le separa, per non toccarle per sbaglio */}
            <Typography variant="overline" sx={{ color: 'text.secondary', pt: 2 }}>
              Impostazioni del cliente
            </Typography>
            <ClientOptions clientId={clientId} options={options} readOnly={readOnly} />

            <FeatureSwitches
              id="funzioni"
              title="Funzioni per questo cliente"
              subheader="Spegni le sezioni che con questo cliente non usi: spariscono dalle sue schede."
              features={features}
              readOnly={readOnly}
              onSave={(values) => saveClientFeatures(clientId, values)}
            />
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
