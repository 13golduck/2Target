'use client';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';

import { fmtDate, fmtMetric } from 'src/lib/format';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';
import { EmptyContent } from 'src/components/empty-content';
import { StatusBadge, STATUS_COLOR } from 'src/components/status-badge';

import { addKpi, deleteKpi, addMeasurement } from '../../../actions';

// ----------------------------------------------------------------------

const SCOPES = [
  { key: 'organico', label: 'Organico', icon: 'socials:instagram' },
  { key: 'sponsorizzato', label: 'Sponsorizzato', icon: 'solar:wad-of-money-bold' },
  { key: 'seo', label: 'SEO', icon: 'socials:google' },
  { key: 'business', label: 'Business', icon: 'solar:users-group-rounded-bold' },
];

export function KpiView({ clientId, kpis, metrics, readOnly = false }) {
  const [measureFor, setMeasureFor] = useState(null);
  const [newKpi, setNewKpi] = useState(false);

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Alert severity="info" variant="outlined" sx={{ flex: 1 }}>
          Semaforo rispetto al target: <b>Bene</b> ≥ 90%, <b>Male</b> 60–90%, <b>Troppo male</b> sotto il 60%. Per i costi
          (CPM, CPC, costo per contatto) più basso è meglio.
        </Alert>
        {!readOnly && (
          <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setNewKpi(true)}>
            Nuovo KPI
          </Button>
        )}
      </Stack>

      {kpis.length === 0 && <EmptyContent filled title="Nessun KPI" description="Definisci il primo KPI con target e punto di partenza." sx={{ py: 10 }} />}

      {SCOPES.map((scope) => {
        const list = kpis.filter((k) => k.scope === scope.key);
        if (!list.length) return null;
        return (
          <Box key={scope.key} sx={{ mb: 4 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
              <Iconify icon={scope.icon} />
              <Typography variant="h6">{scope.label}</Typography>
            </Stack>
            <Grid container spacing={3}>
              {list.map((k) => (
                <Grid key={k.id} size={{ xs: 12, md: 6, lg: 4 }}>
                  <KpiCard kpi={k} onMeasure={readOnly ? null : () => setMeasureFor(k)} />
                </Grid>
              ))}
            </Grid>
          </Box>
        );
      })}

      <MeasureDialog kpi={measureFor} onClose={() => setMeasureFor(null)} />
      <NewKpiDialog open={newKpi} onClose={() => setNewKpi(false)} clientId={clientId} metrics={metrics} />
    </>
  );
}

// ----------------------------------------------------------------------

function KpiCard({ kpi, onMeasure }) {
  const color = STATUS_COLOR[kpi.status] === 'default' ? 'grey' : STATUS_COLOR[kpi.status];
  const progress = kpi.score == null ? 0 : Math.min(100, Math.round(kpi.score * 100));

  const chartOptions = useChart({
    chart: { sparkline: { enabled: true } },
    colors: [color === 'grey' ? '#919EAB' : undefined].filter(Boolean),
    stroke: { width: 2 },
    tooltip: {
      x: { show: true },
      y: { formatter: (v) => fmtMetric(v, kpi.unit), title: { formatter: () => '' } },
    },
    xaxis: { categories: kpi.history.map((h) => fmtDate(h.x, { day: 'numeric', month: 'short' })) },
  });

  return (
    <Card sx={{ p: 3, height: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1">{kpi.label}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {kpi.platform ?? 'tutti i canali'} · partenza {fmtMetric(kpi.baseline, kpi.unit)}
          </Typography>
        </Box>
        <StatusBadge status={kpi.status} />
      </Stack>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-end' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h3">{fmtMetric(kpi.latest?.value, kpi.unit)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            target {kpi.direction === 'lower' ? '≤' : '≥'} {fmtMetric(kpi.target, kpi.unit)}
          </Typography>
        </Box>
        {kpi.history.length > 1 && (
          <Chart
            type="area"
            series={[{ name: kpi.label, data: kpi.history.map((h) => h.y) }]}
            options={chartOptions}
            sx={{ width: 120, height: 56 }}
          />
        )}
      </Stack>

      <Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          color={color === 'grey' ? 'inherit' : color}
          sx={{ height: 8, borderRadius: 1, mb: 1 }}
        />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {kpi.message}
          {kpi.latest && ` · ${fmtDate(kpi.latest.periodStart, { day: 'numeric', month: 'short' })} – ${fmtDate(kpi.latest.periodEnd)}`}
        </Typography>
      </Box>

      {onMeasure && (
      <Stack direction="row" sx={{ mt: 'auto', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button size="small" variant="soft" startIcon={<Iconify icon="mingcute:add-line" />} onClick={onMeasure}>
          Aggiungi misura
        </Button>
        <Box component="form" action={deleteKpi}>
          <input type="hidden" name="kpiId" value={kpi.id} />
          <IconButton type="submit" size="small" title="Disattiva KPI">
            <Iconify icon="solar:trash-bin-trash-bold" width={18} />
          </IconButton>
        </Box>
      </Stack>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

function MeasureDialog({ kpi, onClose }) {
  return (
    <Dialog open={!!kpi} onClose={onClose} fullWidth maxWidth="xs">
      {kpi && (
        <Box component="form" action={async (fd) => { await addMeasurement(fd); onClose(); }}>
          <DialogTitle>Nuova misura · {kpi.label}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <input type="hidden" name="kpiId" value={kpi.id} />
              <TextField name="value" label="Valore" required autoFocus placeholder={kpi.unit === '%' ? 'es. 2,8%' : ''} helperText={kpi.unit === '%' ? 'Puoi scrivere 2,8% oppure 0,028' : ' '} />
              <Stack direction="row" spacing={2}>
                <TextField name="periodStart" type="date" label="Dal" defaultValue={`${today().slice(0, 8)}01`} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                <TextField name="periodEnd" type="date" label="Al" defaultValue={today()} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
              </Stack>
              {kpi.minSample != null && <TextField name="sample" label="Spesa nel periodo (€)" helperText={`Si giudica dopo ${kpi.minSample} €`} />}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Annulla</Button>
            <Button type="submit" variant="contained">Salva</Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

function NewKpiDialog({ open, onClose, clientId, metrics }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box component="form" action={async (fd) => { await addKpi(fd); onClose(); }}>
        <DialogTitle>Nuovo KPI</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <input type="hidden" name="clientId" value={clientId} />
            <Grid size={12}>
              <TextField select name="metricKey" label="Metrica" defaultValue="er_reach" fullWidth>
                {SCOPES.flatMap((s) => [
                  <ListSubheader key={s.key}>{s.label}</ListSubheader>,
                  ...metrics.filter((m) => m.scope === s.key).map((m) => (
                    <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
                  )),
                ])}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField name="label" label="Nome (facoltativo)" placeholder="es. Contatti qualificati da chef" fullWidth />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select name="platform" label="Canale" defaultValue="" fullWidth>
                <MenuItem value="">Tutti</MenuItem>
                {[
                  ['instagram', 'Instagram'],
                  ['facebook', 'Facebook'],
                  ['tiktok', 'TikTok'],
                  ['linkedin', 'LinkedIn'],
                  ['search_console', 'Search Console'],
                  ['ga4', 'Analytics 4'],
                ].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={12}>
              <Alert severity="success" variant="outlined" icon={<Iconify icon="solar:restart-bold" />}>
                Reach, engagement, salvataggi, condivisioni, crescita follower e tutte le metriche SEO si aggiornano da sole se il canale
                indicato è collegato. Le altre si inseriscono a mano.
              </Alert>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField name="target" label="Target" required placeholder="es. 3% o 10" fullWidth />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField name="baseline" label="Punto di partenza" helperText="dal check-up" fullWidth />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField name="minSample" label="Spesa minima €" helperText="solo sponsorizzate" fullWidth />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="contained">Aggiungi</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
