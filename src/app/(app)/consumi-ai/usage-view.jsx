'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { fmtDate } from 'src/lib/format';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { RouterLink } from 'src/routes/components';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { Chart, useChart } from 'src/components/chart';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';


// ----------------------------------------------------------------------

const usd = (v, d = 2) => `${(v ?? 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d })} $`;
const k = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}M` : n >= 1000 ? `${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k` : String(n));
const MODEL = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5' };

export function UsageView({ isAdmin, configured, running, status, tokens, monthly, byClient, recent, insights }) {
  const { limits, month, ratio, warning } = status;
  const totalIn = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  const cacheShare = totalIn ? tokens.cacheRead / totalIn : 0;
  const barColor = ratio >= 1 ? 'error' : warning ? 'warning' : 'primary';

  const chart = useChart({
    colors: ['#CDA434'],
    xaxis: { categories: monthly.map((m) => fmtDate(`${m.month}-01`, { month: 'short', year: '2-digit' })) },
    yaxis: { labels: { formatter: (v) => `${v.toFixed(0)} $` } },
    tooltip: { y: { formatter: (v) => usd(v) } },
    plotOptions: { bar: { columnWidth: '40%' } },
    annotations: { yaxis: [{ y: limits.monthlyUsd, borderColor: '#FF5630', label: { text: 'Budget mensile', style: { color: '#fff', background: '#FF5630' } } }] },
  });

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs heading="Consumi AI" links={[{ name: 'Panoramica' }, { name: 'Consumi AI' }]} sx={{ mb: 3 }} />

      <Stack spacing={3}>
        {!configured && <Alert severity="warning">Chiave API Anthropic non impostata: l&apos;AI è spenta. Guida in docs/AI-ANTHROPIC.md.</Alert>}
        {!limits.enabled && <Alert severity="error">L&apos;AI è disattivata dall&apos;interruttore generale in Impostazioni.</Alert>}
        {ratio >= 1 && <Alert severity="error">Budget del mese esaurito: i nuovi lavori AI sono bloccati.</Alert>}
        {ratio < 1 && warning && <Alert severity="warning">Superato il {Math.round(limits.warnPct * 100)}% del budget mensile.</Alert>}

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ p: 3, height: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>Spesa del mese (stima a listino)</Typography>
              <Typography variant="h3">
                {usd(month)} <Box component="span" sx={{ typography: 'h6', color: 'text.disabled' }}>/ {usd(limits.monthlyUsd, 0)}</Box>
              </Typography>
              <LinearProgress variant="determinate" value={Math.min(100, ratio * 100)} color={barColor} sx={{ height: 10, borderRadius: 1, my: 1.5 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Il dato ufficiale è su platform.claude.com → Usage e Cost. Lavori AI in corso adesso: {running}.
              </Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ p: 3, height: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>Letti dalla cache</Typography>
              <Typography variant="h3" sx={{ color: cacheShare >= 0.3 ? 'success.main' : 'text.primary' }}>{Math.round(cacheShare * 100)}%</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                dei token in ingresso: costano un ventesimo. {k(tokens.cacheRead)} su {k(totalIn)}
              </Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ p: 3, height: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>Uscita e ricerche</Typography>
              <Typography variant="h3">{k(tokens.output)}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>token in uscita · {tokens.searches} ricerche web</Typography>
            </Card>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card sx={{ height: 1 }}>
              <CardHeader title="Ultimi 6 mesi" />
              <Chart type="bar" series={[{ name: 'Spesa', data: monthly.map((m) => Number(m.cost.toFixed(2))) }]} options={chart} sx={{ height: 280, px: 1, pb: 1 }} />
            </Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 5 }}>
            <InsightsCard insights={insights} limits={limits} isAdmin={isAdmin} />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Card sx={{ height: 1 }}>
              <CardHeader title="Per cliente (questo mese)" subheader={`Tetto per cliente: ${limits.clientMonthlyUsd ? usd(limits.clientMonthlyUsd, 0) : 'nessuno'}`} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cliente</TableCell>
                    <TableCell align="right">Check-up</TableCell>
                    <TableCell align="right">Chiamate</TableCell>
                    <TableCell align="right">Spesa</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {byClient.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell align="right">{c.checkups}</TableCell>
                      <TableCell align="right">{c.runs}</TableCell>
                      <TableCell align="right" sx={{ color: limits.clientMonthlyUsd && c.cost >= limits.clientMonthlyUsd * limits.warnPct ? 'warning.dark' : undefined }}>{usd(c.cost)}</TableCell>
                    </TableRow>
                  ))}
                  {!byClient.length && <TableRow><TableCell colSpan={4} sx={{ color: 'text.secondary' }}>Nessun consumo questo mese</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card sx={{ height: 1 }}>
              <CardHeader title="Ultime chiamate" />
              <Scrollbar sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Quando</TableCell>
                      <TableCell>Cliente · fase</TableCell>
                      <TableCell>Modello</TableCell>
                      <TableCell align="right">Ingresso</TableCell>
                      <TableCell align="right">Cache</TableCell>
                      <TableCell align="right">Uscita</TableCell>
                      <TableCell align="right">Costo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                        <TableCell>{r.client} · {r.step}</TableCell>
                        <TableCell>{MODEL[r.model] ?? r.model}</TableCell>
                        <TableCell align="right">{k(r.input)}</TableCell>
                        <TableCell align="right">{r.input ? `${Math.round((r.cacheRead / r.input) * 100)}%` : '—'}</TableCell>
                        <TableCell align="right">{k(r.output)}</TableCell>
                        <TableCell align="right">{usd(r.cost, 3)}</TableCell>
                      </TableRow>
                    ))}
                    {!recent.length && <TableRow><TableCell colSpan={7} sx={{ color: 'text.secondary' }}>Nessuna chiamata registrata</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Scrollbar>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------
// Analisi dei consumi: previsione, efficienza e dove si spende. I limiti si cambiano in Impostazioni.

function InsightsCard({ insights, limits, isAdmin }) {
  const { forecast, avgCheckup, checkups, topStep, topModel, topClient, cacheShare, trendPct } = insights;
  const over = limits.monthlyUsd > 0 && forecast > limits.monthlyUsd;
  const rows = [
    {
      icon: 'solar:graph-up-bold',
      label: 'Previsione a fine mese',
      value: usd(forecast),
      note: limits.monthlyUsd > 0 ? (over ? `oltre il budget di ${usd(limits.monthlyUsd, 0)}` : `entro il budget di ${usd(limits.monthlyUsd, 0)}`) : 'nessun budget impostato',
      color: over ? 'error.main' : 'success.main',
    },
    {
      icon: 'solar:transfer-vertical-bold',
      label: 'Rispetto al mese scorso',
      value: trendPct == null ? '—' : `${trendPct >= 0 ? '+' : ''}${Math.round(trendPct * 100)}%`,
      note: 'a parità di giorni trascorsi',
      color: trendPct != null && trendPct > 0.25 ? 'warning.main' : undefined,
    },
    { icon: 'solar:notes-bold-duotone', label: 'Costo medio per check-up', value: checkups ? usd(avgCheckup) : '—', note: `${checkups} check-up questo mese` },
    { icon: 'solar:bolt-bold', label: 'Fase che costa di più', value: topStep ? topStep.name : '—', note: topStep ? `${usd(topStep.cost)} · ${Math.round(topStep.share * 100)}% della spesa` : 'nessun dato' },
    { icon: 'solar:cpu-bolt-bold', label: 'Modello più usato', value: topModel ? MODEL[topModel.name] ?? topModel.name : '—', note: topModel ? `${usd(topModel.cost)} · ${Math.round(topModel.share * 100)}% della spesa` : 'nessun dato' },
    { icon: 'solar:users-group-rounded-bold', label: 'Cliente con più spesa', value: topClient ? topClient.name : '—', note: topClient ? usd(topClient.cost) : 'nessun dato' },
    {
      icon: 'solar:database-bold',
      label: 'Efficienza della cache',
      value: `${Math.round(cacheShare * 100)}%`,
      note: cacheShare >= 0.3 ? 'buona: le richieste ripetute costano poco' : 'bassa: ogni richiesta rilegge tutto a prezzo pieno',
      color: cacheShare >= 0.3 ? 'success.main' : 'warning.main',
    },
  ];
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader
        avatar={<Iconify icon="solar:chart-square-outline" width={24} sx={{ color: 'primary.main' }} />}
        title="Analisi dei consumi"
        subheader="Dove va la spesa e come si sta comportando questo mese"
        action={
          isAdmin ? (
            <Label component={RouterLink} href="/impostazioni" sx={{ cursor: 'pointer' }}>
              Limiti in Impostazioni
            </Label>
          ) : null
        }
      />
      <Stack spacing={1.5} sx={{ p: 3, pt: 1 }}>
        {rows.map((r) => (
          <Stack key={r.label} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Iconify icon={r.icon} width={22} sx={{ color: 'text.disabled', flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {r.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }} noWrap>
                {r.note}
              </Typography>
            </Box>
            <Typography variant="subtitle1" sx={{ color: r.color, textAlign: 'right' }}>
              {r.value}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}
