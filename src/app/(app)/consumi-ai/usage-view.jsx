'use client';

import { useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import FormControlLabel from '@mui/material/FormControlLabel';

import { fmtDate } from 'src/lib/format';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { Scrollbar } from 'src/components/scrollbar';
import { Chart, useChart } from 'src/components/chart';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { updateLimits } from './actions';

// ----------------------------------------------------------------------

const usd = (v, d = 2) => `${(v ?? 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d })} $`;
const k = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}M` : n >= 1000 ? `${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k` : String(n));
const MODEL = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5' };

export function UsageView({ isAdmin, configured, running, status, tokens, monthly, byClient, recent }) {
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
        {!limits.enabled && <Alert severity="error">L&apos;AI è disattivata dall&apos;interruttore generale qui sotto.</Alert>}
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
            <LimitsCard limits={limits} isAdmin={isAdmin} />
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

function LimitsCard({ limits, isAdmin }) {
  const [pending, start] = useTransition();
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader
        avatar={<Iconify icon="solar:shield-check-bold" width={24} sx={{ color: 'primary.main' }} />}
        title="Limiti e blocchi automatici"
        subheader={isAdmin ? 'L’app ferma l’AI prima di superarli' : 'Solo un amministratore può modificarli'}
        action={!isAdmin && <Label>Sola lettura</Label>}
      />
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            const r = await updateLimits(fd);
            if (r?.error) toast.error(r.error);
            else toast.success('Limiti salvati');
          })
        }
        sx={{ p: 3, pt: 1 }}
      >
        <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
          <FormControlLabel control={<Switch name="enabled" defaultChecked={limits.enabled} />} label="AI attiva" sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {[
              ['monthlyUsd', 'Budget mensile dell’app', limits.monthlyUsd, '$', 'Oltre si blocca tutto fino al mese dopo'],
              ['warnPct', 'Avviso al', Math.round(limits.warnPct * 100), '%', 'Banner di avviso in Consumi AI'],
              ['checkupUsd', 'Tetto per check-up', limits.checkupUsd, '$', 'Comprese ricerche e revisioni'],
              ['clientMonthlyUsd', 'Tetto mensile per cliente', limits.clientMonthlyUsd, '$', '0 = nessun tetto'],
              ['maxConcurrent', 'Lavori AI contemporanei', limits.maxConcurrent, '', 'Evita picchi di spesa'],
              ['maxCheckupsPerDay', 'Check-up AI al giorno', limits.maxCheckupsPerDay, '', 'Su tutti i clienti'],
            ].map(([name, label, value, unit, help]) => (
              <Grid key={name} size={{ xs: 12, sm: 6 }}>
                <TextField
                  name={name}
                  label={label}
                  defaultValue={value}
                  helperText={help}
                  size="small"
                  fullWidth
                  slotProps={{ input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined }}
                />
              </Grid>
            ))}
          </Grid>
          {isAdmin && (
            <Button type="submit" variant="contained" loading={pending} sx={{ mt: 2 }}>
              Salva limiti
            </Button>
          )}
        </fieldset>
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
          Imposta anche il limite di spesa su platform.claude.com (organizzazione e workspace 2Target): è il blocco definitivo se
          qualcosa sfugge a questi controlli.
        </Typography>
      </Box>
    </Card>
  );
}
