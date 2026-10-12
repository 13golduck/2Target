'use client';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';
import CircularProgress from '@mui/material/CircularProgress';

import { RouterLink } from 'src/routes/components';
import { fmtDate, fmtDateTime } from 'src/lib/format';

import { Iconify } from 'src/components/iconify';
import { AutoRefresh } from 'src/components/auto-refresh';
import { Scrollbar } from 'src/components/scrollbar';
import { Chart, useChart } from 'src/components/chart';
import { EmptyContent } from 'src/components/empty-content';

// ----------------------------------------------------------------------

const n = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: d }));
const pct = (v) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`);

export function SeoView({ clientId, searchConsole, analytics, websites, readOnly = false }) {
  if (!searchConsole.length && !analytics.length && !websites.length) {
    return (
      <EmptyContent
        filled
        title="Nessuna fonte SEO collegata"
        description="Collega Google (Search Console e Analytics 4) o aggiungi il sito del cliente dalla scheda Canali."
        action={
          readOnly ? null : (
            <Button component={RouterLink} href={`/clienti/${clientId}/canali`} variant="contained" sx={{ mt: 2 }}>
              Vai ai canali
            </Button>
          )
        }
        sx={{ py: 10 }}
      />
    );
  }
  return (
    <Stack spacing={4}>
      <AutoRefresh active={websites.some((w) => w.pending)} />
      {searchConsole.map((sc) => <SearchConsoleBlock key={sc.id} data={sc} />)}
      {analytics.map((ga) => <AnalyticsBlock key={ga.id} data={ga} />)}
      {websites.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>Velocità e SEO tecnica (PageSpeed, mobile)</Typography>
          <Grid container spacing={3}>
            {websites.map((w) => (
              <Grid key={w.id} size={{ xs: 12, md: 6 }}>
                <PageSpeedCard site={w} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Stack>
  );
}

// ----------------------------------------------------------------------

function window28(series, metric, offset = 0) {
  const vals = series.values[metric] ?? [];
  const end = vals.length - offset;
  return vals.slice(Math.max(0, end - 28), end);
}
const sum = (a) => a.reduce((t, v) => t + v, 0);

function SearchConsoleBlock({ data }) {
  const [tab, setTab] = useState('queries');
  const s = data.series;
  const clicks = sum(window28(s, 'seo_clicks'));
  const impr = sum(window28(s, 'seo_impressions'));
  const prevClicks = sum(window28(s, 'seo_clicks', 28));
  const prevImpr = sum(window28(s, 'seo_impressions', 28));
  const pos = (off) => {
    const p = window28(s, 'seo_position', off);
    const i = window28(s, 'seo_impressions', off);
    const w = sum(i);
    return w ? sum(p.map((v, k) => v * i[k])) / w : null;
  };

  const cards = [
    { label: 'Clic', value: n(clicks), delta: prevClicks ? clicks / prevClicks - 1 : null },
    { label: 'Impressioni', value: n(impr), delta: prevImpr ? impr / prevImpr - 1 : null },
    { label: 'CTR medio', value: pct(impr ? clicks / impr : null), delta: prevImpr && impr ? clicks / impr / (prevClicks / prevImpr) - 1 : null },
    { label: 'Posizione media', value: n(pos(0), 1), delta: pos(28) && pos(0) ? -(pos(0) / pos(28) - 1) : null },
  ];

  const base = useChart({
    colors: ['#CDA434', '#637381'],
    xaxis: { categories: s.days.map((d) => fmtDate(d, { day: 'numeric', month: 'short' })), tickAmount: 8, labels: { rotate: 0 } },
    stroke: { width: [3, 2] },
    fill: { type: ['gradient', 'solid'], opacity: [0.3, 1] },
    legend: { show: true, position: 'top', horizontalAlign: 'right' },
    tooltip: { shared: true, y: { formatter: (v) => n(v) } },
  });
  // Due assi: i clic sono molti meno delle impressioni (impostato dopo l'unione con le opzioni base del kit)
  const options = {
    ...base,
    yaxis: [
      { seriesName: 'Clic', title: { text: 'Clic' }, labels: { formatter: (v) => n(v) } },
      { seriesName: 'Impressioni', opposite: true, title: { text: 'Impressioni' }, labels: { formatter: (v) => n(v) } },
    ],
  };

  const rows = tab === 'queries' ? data.queries : data.pages;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Iconify icon="socials:google" width={24} />
        <Typography variant="h6" sx={{ flex: 1 }}>Search Console · {data.name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Ultimi 28 giorni rispetto ai 28 precedenti{data.lastSyncAt && ` · aggiornato ${fmtDateTime(new Date(data.lastSyncAt))}`}
        </Typography>
      </Stack>
      <Grid container spacing={3}>
        {cards.map((c) => (
          <Grid key={c.label} size={{ xs: 6, md: 3 }}>
            <Card sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>{c.label}</Typography>
              <Typography variant="h4">{c.value}</Typography>
              {c.delta != null && Number.isFinite(c.delta) && (
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: c.delta >= 0 ? 'success.main' : 'error.main' }}>
                  <Iconify icon={c.delta >= 0 ? 'eva:trending-up-fill' : 'eva:trending-down-fill'} width={18} />
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {c.delta >= 0 ? '+' : ''}{(c.delta * 100).toFixed(1)}%
                  </Typography>
                </Stack>
              )}
            </Card>
          </Grid>
        ))}
        <Grid size={12}>
          <Card>
            <CardHeader title="Andamento giornaliero" subheader="Ultimi 90 giorni (i dati di Google arrivano con 2-3 giorni di ritardo)" />
            <Chart
              type="line"
              series={[
                { name: 'Clic', type: 'area', data: s.values.seo_clicks ?? [] },
                { name: 'Impressioni', type: 'line', data: s.values.seo_impressions ?? [] },
              ]}
              options={options}
              sx={{ height: 320, px: 1, pb: 1 }}
            />
          </Card>
        </Grid>
        <Grid size={12}>
          <Card>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Tab value="queries" label={`Ricerche (${data.queries.length})`} />
              <Tab value="pages" label={`Pagine (${data.pages.length})`} />
            </Tabs>
            <Scrollbar sx={{ maxHeight: 520 }}>
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{tab === 'queries' ? 'Ricerca' : 'Pagina'}</TableCell>
                      <TableCell align="right">Clic</TableCell>
                      <TableCell align="right">Impressioni</TableCell>
                      <TableCell align="right">CTR</TableCell>
                      <TableCell align="right">Posizione</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key} hover>
                        <TableCell sx={{ maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tab === 'pages' ? <Link href={r.key} target="_blank" rel="noopener">{r.key.replace(/^https?:\/\/[^/]+/, '') || '/'}</Link> : r.key}
                        </TableCell>
                        <TableCell align="right">{n(r.clicks)}</TableCell>
                        <TableCell align="right">{n(r.impressions)}</TableCell>
                        <TableCell align="right">{pct(r.ctr)}</TableCell>
                        <TableCell align="right" sx={{ color: r.position <= 3 ? 'success.main' : r.position <= 10 ? 'text.primary' : 'text.secondary', fontWeight: r.position <= 10 ? 600 : 400 }}>
                          {n(r.position, 1)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>Nessun dato nel periodo</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Scrollbar>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ----------------------------------------------------------------------

function AnalyticsBlock({ data }) {
  const s = data.series;
  const options = useChart({
    chart: { stacked: true },
    xaxis: { categories: s.days.map((d) => fmtDate(d, { day: 'numeric', month: 'short' })), tickAmount: 8, labels: { rotate: 0 } },
    legend: { show: true, position: 'top', horizontalAlign: 'right' },
    tooltip: { shared: true, y: { formatter: (v) => n(v) } },
    plotOptions: { bar: { columnWidth: '70%' } },
  });
  const tot = (m) => sum((s.values[m] ?? []).slice(-28));
  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="solar:chart-square-outline" width={24} />}
        title={`Analytics 4 · ${data.name}`}
        subheader={`Ultimi 28 giorni: ${n(tot('sessions_total'))} sessioni · ${n(tot('sessions_organic_search'))} da Google · ${n(tot('sessions_organic_social') + tot('sessions_paid_social'))} dai social · ${n(tot('key_events'))} conversioni`}
      />
      <Chart
        type="bar"
        series={[
          { name: 'Ricerca organica', data: s.values.sessions_organic_search ?? [] },
          { name: 'Social organici', data: s.values.sessions_organic_social ?? [] },
          { name: 'Social a pagamento', data: s.values.sessions_paid_social ?? [] },
        ]}
        options={options}
        sx={{ height: 300, px: 1, pb: 1 }}
      />
    </Card>
  );
}

// ----------------------------------------------------------------------

function Score({ label, value }) {
  const color = value == null ? 'inherit' : value >= 90 ? 'success' : value >= 50 ? 'warning' : 'error';
  return (
    <Stack sx={{ alignItems: 'center', gap: 1 }}>
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress variant="determinate" value={100} size={72} thickness={4} sx={{ color: 'divider', position: 'absolute' }} />
        <CircularProgress variant="determinate" value={value ?? 0} size={72} thickness={4} color={color} />
        <Typography variant="h6" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{value ?? '—'}</Typography>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography>
    </Stack>
  );
}

function PageSpeedCard({ site }) {
  const r = site.result;
  return (
    <Card sx={{ p: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
        <Iconify icon="solar:monitor-bold" />
        <Link href={site.url} target="_blank" rel="noopener" variant="subtitle1" sx={{ flex: 1 }} noWrap>{site.url}</Link>
        {site.at && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtDate(site.at)}</Typography>}
      </Stack>
      {r ? (
        <>
          <Stack direction="row" sx={{ justifyContent: 'space-around', mb: 2 }}>
            <Score label="Prestazioni" value={r.performance} />
            <Score label="SEO" value={r.seo} />
            <Score label="Accessibilità" value={r.accessibility} />
            <Score label="Best practice" value={r.bestPractices} />
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            LCP {r.lcp ?? '—'} · CLS {r.cls ?? '—'} · TBT {r.tbt ?? '—'}
          </Typography>
        </>
      ) : site.pending ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Analisi PageSpeed in corso (20-40 secondi): la pagina si aggiorna da sola.</Typography>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: site.error ? 'error.main' : 'text.secondary' }}>
          {site.error ? `Analisi non riuscita: ${site.error}` : 'Analisi non ancora eseguita.'} Puoi ripeterla dalla scheda Canali (icona di aggiornamento).
        </Typography>
      )}
    </Card>
  );
}
