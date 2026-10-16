'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
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
import { toast } from 'src/components/snackbar';
import { Label } from 'src/components/label';

import { saveBrandTerms } from '../../../client-settings-actions';
import { startSeoAnalysis } from '../../../seo-actions';

// ----------------------------------------------------------------------

const n = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: d }));
const pct = (v) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`);

export function SeoView({ clientId, ai, searchConsole, analytics, businessProfiles, googleAds, websites, readOnly = false }) {
  if (!searchConsole.length && !analytics.length && !websites.length && !businessProfiles.length && !googleAds.length) {
    return (
      <EmptyContent
        filled
        title="Nessuna fonte SEO collegata"
        description="Collega Google (Search Console, Analytics 4, scheda Google, Google Ads) o aggiungi il sito del cliente dalla scheda Canali."
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
      <SeoAnalysisCard clientId={clientId} ai={ai} readOnly={readOnly} />
      {searchConsole.map((sc) => <SearchConsoleBlock key={sc.id} data={sc} clientId={clientId} readOnly={readOnly} />)}
      {analytics.map((ga) => <AnalyticsBlock key={ga.id} data={ga} />)}
      {businessProfiles.map((b) => <BusinessProfileBlock key={b.id} data={b} />)}
      {googleAds.map((a) => <GoogleAdsBlock key={a.id} data={a} />)}
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

function SearchConsoleBlock({ data, clientId, readOnly }) {
  const [tab, setTab] = useState(data.opportunities.length ? 'opportunities' : 'queries');
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

  // Stesso periodo dell'anno prima (totali da Search Console)
  const now = data.summary.find((x) => x.key === 'attuale');
  const year = data.summary.find((x) => x.key === 'anno_prima');
  const yoy = (a, b) => (a != null && b ? a / b - 1 : null);
  const cards = [
    { label: 'Clic', value: n(clicks), delta: prevClicks ? clicks / prevClicks - 1 : null, yoy: yoy(now?.clicks, year?.clicks) },
    { label: 'Impressioni', value: n(impr), delta: prevImpr ? impr / prevImpr - 1 : null, yoy: yoy(now?.impressions, year?.impressions) },
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
              {c.yoy != null && Number.isFinite(c.yoy) && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  {c.yoy >= 0 ? '+' : ''}{(c.yoy * 100).toFixed(1)}% sull&apos;anno prima
                </Typography>
              )}
            </Card>
          </Grid>
        ))}
        <Grid size={{ xs: 12, md: 7 }}>
          <BrandCard brand={data.brand} clientId={clientId} readOnly={readOnly} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <DevicesCard devices={data.devices} />
        </Grid>
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
              <Tab value="opportunities" label={`Opportunità (${data.opportunities.length})`} />
              <Tab value="changes" label="Variazioni" disabled={!data.pageChanges} />
              <Tab value="queries" label={`Ricerche (${data.queries.length})`} />
              <Tab value="pages" label={`Pagine (${data.pages.length})`} />
            </Tabs>
            {tab === 'opportunities' && <OpportunitiesTable rows={data.opportunities} />}
            {tab === 'changes' && data.pageChanges && <ChangesView pages={data.pageChanges} queries={data.queryChanges} />}
            {(tab === 'queries' || tab === 'pages') && (
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
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ----------------------------------------------------------------------

const AREA = {
  seo_contenuti: 'Contenuti SEO',
  seo_tecnica: 'SEO tecnica',
  scheda_google: 'Scheda Google',
  google_ads: 'Google Ads',
  analytics: 'Misurazione',
  sito: 'Sito',
};
const LEVEL = { alto: 'error', medio: 'warning', basso: 'default' };

function SeoAnalysisCard({ clientId, ai, readOnly }) {
  const [pending, start] = useTransition();
  const [withIdeas, setWithIdeas] = useState(true);
  const [open, setOpen] = useState(false);
  const a = ai.analysis;
  const run = () =>
    start(async () => {
      const r = await startSeoAnalysis(clientId, withIdeas);
      if (r?.error) toast.error(r.error);
      else toast.success(r.ideas ? `Analisi pronta: ${r.ideas} idee aggiunte nella bacheca` : 'Analisi pronta');
    });
  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="solar:atom-bold-duotone" width={28} sx={{ color: 'primary.main' }} />}
        title="Analisi del mese con l'AI"
        subheader={
          a
            ? `${a.trigger === 'mensile' ? 'Automatica' : 'Fatta'} il ${fmtDateTime(new Date(a.createdAt))} · fonti: ${a.sources.join(', ')}${a.ideasCreated ? ` · ${a.ideasCreated} idee in bacheca` : ''}`
            : 'Legge i dati Google del cliente, indica le priorità con i numeri e propone idee per il piano. Parte da sola ogni mese.'
        }
        action={
          !readOnly && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <FormControlLabel control={<Checkbox size="small" checked={withIdeas} onChange={(e) => setWithIdeas(e.target.checked)} />} label="Crea le idee" />
              <Button variant="contained" onClick={run} loading={pending} disabled={!ai.configured} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
                {a ? 'Rifai l’analisi' : 'Analizza'}
              </Button>
            </Stack>
          )
        }
        sx={{ flexWrap: 'wrap', gap: 1, '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
      />
      {pending && (
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Leggo i dati e scrivo l&apos;analisi: circa un minuto…</Typography>
          <LinearProgress sx={{ mt: 0.5 }} />
        </Box>
      )}
      {!ai.configured && <Typography variant="body2" sx={{ px: 3, pb: 2, color: 'warning.dark' }}>Manca la chiave API di Anthropic (Impostazioni → Integrazioni).</Typography>}
      {a && (
        <Box sx={{ px: 3, pb: 3 }}>
          <Typography variant="subtitle1">{a.headline}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, whiteSpace: 'pre-line' }}>{a.summary}</Typography>
          <Stack spacing={1.25} sx={{ mt: 2 }}>
            {(open ? a.priorities : a.priorities.slice(0, 3)).map((p, i) => (
              <Box key={p.title} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 200 }}>{i + 1}. {p.title}</Typography>
                  <Label>{AREA[p.area] ?? p.area}</Label>
                  <Label color={LEVEL[p.impact]}>Impatto {p.impact}</Label>
                  <Label variant="outlined">Sforzo {p.effort}</Label>
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.75 }}><b>Perché:</b> {p.why}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}><b>Cosa fare:</b> {p.action}</Typography>
                {p.data && <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>Dato: {p.data}</Typography>}
              </Box>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {a.priorities.length > 3 && (
              <Button size="small" color="inherit" onClick={() => setOpen((v) => !v)}>
                {open ? 'Mostra meno' : `Tutte le priorità (${a.priorities.length})`}
              </Button>
            )}
            {a.ideas.length > 0 && (
              <Button size="small" component={RouterLink} href={`/clienti/${clientId}/idee`} endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}>
                {a.ideasCreated ? `${a.ideasCreated} idee nella bacheca` : `${a.ideas.length} idee proposte (non create)`}
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Card>
  );
}

const short = (url) => url.replace(/^https?:\/\/[^/]+/, '') || '/';

function BrandCard({ brand, clientId, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const total = brand.brand.clicks + brand.generic.clicks;
  const share = total ? brand.generic.clicks / total : null;
  return (
    <Card sx={{ p: 2.5, height: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>Ricerche con il nome del brand e senza</Typography>
        {!readOnly && (
          <Button size="small" color="inherit" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Chiudi' : 'Parole del brand'}
          </Button>
        )}
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Chi cerca il nome conosce già il cliente; le ricerche senza il nome sono clienti nuovi trovati grazie alla SEO.
      </Typography>
      <Grid container spacing={2}>
        {[
          { label: 'Senza il nome (clienti nuovi)', v: brand.generic },
          { label: 'Con il nome del brand', v: brand.brand },
        ].map((x) => (
          <Grid key={x.label} size={6}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{x.label}</Typography>
            <Typography variant="h5">{n(x.v.clicks)} clic</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{n(x.v.impressions)} impressioni · {n(x.v.queries)} ricerche</Typography>
          </Grid>
        ))}
      </Grid>
      {share != null && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={share * 100} sx={{ height: 8, borderRadius: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{pct(share)} dei clic arriva da ricerche senza il nome</Typography>
        </Box>
      )}
      {editing && (
        <Stack
          component="form"
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ mt: 2 }}
          action={(fd) =>
            start(async () => {
              const r = await saveBrandTerms(clientId, String(fd.get('terms') ?? ''));
              if (r?.error) toast.error(r.error);
              else {
                toast.success('Parole del brand salvate');
                setEditing(false);
              }
            })
          }
        >
          <TextField
            name="terms"
            size="small"
            fullWidth
            label="Altre parole del brand, separate da virgola"
            helperText={`Già incluse: ${brand.terms.join(', ') || 'nessuna'}. Aggiungi nomi di prodotti, abbreviazioni, errori di battitura frequenti.`}
          />
          <Button type="submit" variant="contained" loading={pending} sx={{ flexShrink: 0, alignSelf: { sm: 'flex-start' } }}>
            Salva
          </Button>
        </Stack>
      )}
    </Card>
  );
}

const DEVICE = { MOBILE: 'Smartphone', DESKTOP: 'Computer', TABLET: 'Tablet' };

function DevicesCard({ devices }) {
  const total = sum(devices.map((d) => d.clicks));
  return (
    <Card sx={{ p: 2.5, height: 1 }}>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>Dispositivi</Typography>
      {devices.length ? (
        <Stack spacing={1.5}>
          {devices.map((d) => {
            const delta = d.prevClicks ? d.clicks / d.prevClicks - 1 : null;
            return (
              <Box key={d.key}>
                <Stack direction="row" sx={{ alignItems: 'baseline' }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{DEVICE[d.key] ?? d.key}</Typography>
                  <Typography variant="subtitle2">{n(d.clicks)} clic</Typography>
                  {delta != null && (
                    <Typography variant="caption" sx={{ ml: 1, width: 56, textAlign: 'right', color: delta >= 0 ? 'success.main' : 'error.main' }}>
                      {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(0)}%
                    </Typography>
                  )}
                </Stack>
                <LinearProgress variant="determinate" value={total ? (d.clicks / total) * 100 : 0} sx={{ height: 6, borderRadius: 1 }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Posizione media {n(d.position, 1)} · CTR {pct(d.ctr)}</Typography>
              </Box>
            );
          })}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Disponibile dalla prossima sincronizzazione.</Typography>
      )}
    </Card>
  );
}

function OpportunitiesTable({ rows }) {
  return (
    <>
      <Typography variant="body2" sx={{ px: 2, pt: 2, color: 'text.secondary' }}>
        Ricerche da spingere: già visibili su Google ma con pochi clic. «Quasi in prima pagina» = posizione 4-20: un contenuto migliore o
        link interni possono farle salire. «CTR basso» = già in alto ma poco cliccate: rivedere titolo e descrizione della pagina.
      </Typography>
      <Scrollbar sx={{ maxHeight: 520 }}>
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Ricerca</TableCell>
                <TableCell>Cosa fare</TableCell>
                <TableCell align="right">Impressioni</TableCell>
                <TableCell align="right">Clic</TableCell>
                <TableCell align="right">Posizione</TableCell>
                <TableCell align="right">Clic in più al mese (stima)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key} hover>
                  <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.key}</TableCell>
                  <TableCell>
                    <Label color={r.reason === 'ctr_basso' ? 'warning' : 'info'}>{r.reason === 'ctr_basso' ? 'CTR basso: rivedi titolo' : 'Quasi in prima pagina'}</Label>
                  </TableCell>
                  <TableCell align="right">{n(r.impressions)}</TableCell>
                  <TableCell align="right">{n(r.clicks)}</TableCell>
                  <TableCell align="right">{n(r.position, 1)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>+{n(r.extraClicks)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} sx={{ color: 'text.secondary' }}>Nessuna opportunità evidente nel periodo</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Scrollbar>
    </>
  );
}

function ChangesList({ title, list, pages, positive }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, color: positive ? 'success.main' : 'error.main' }}>{title}</Typography>
      {list.length ? (
        <Stack spacing={0.75}>
          {list.map((c) => (
            <Stack key={c.key} direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={c.key}>
                {pages ? <Link href={c.key} target="_blank" rel="noopener">{short(c.key)}</Link> : c.key}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{n(c.prevClicks)} → {n(c.clicks)}</Typography>
              <Typography variant="subtitle2" sx={{ width: 56, textAlign: 'right', flexShrink: 0, color: positive ? 'success.main' : 'error.main' }}>
                {c.delta > 0 ? '+' : ''}{n(c.delta)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nessuna variazione</Typography>
      )}
    </Box>
  );
}

function ChangesView({ pages, queries }) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>Clic degli ultimi 28 giorni rispetto ai 28 precedenti.</Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}><ChangesList title="Pagine in calo" list={pages.losers} pages /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><ChangesList title="Pagine in crescita" list={pages.winners} pages positive /></Grid>
        {queries && (
          <>
            <Grid size={{ xs: 12, md: 6 }}><ChangesList title="Ricerche in calo" list={queries.losers} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><ChangesList title="Ricerche in crescita" list={queries.winners} positive /></Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}

/** Somma degli ultimi 28 giorni e dei 28 precedenti di una o più metriche giornaliere. */
function last28(series, metrics) {
  const pick = (off) => sum(metrics.map((m) => sum(window28(series, m, off))));
  const now = pick(0);
  const before = pick(28);
  return { now, delta: before ? now / before - 1 : null };
}

function StatCard({ label, value, delta, invert }) {
  const good = delta != null && (invert ? delta <= 0 : delta >= 0);
  return (
    <Card sx={{ p: 2.5, height: 1 }}>
      <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="h4">{value}</Typography>
      {delta != null && Number.isFinite(delta) && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: good ? 'success.main' : 'error.main' }}>
          <Iconify icon={delta >= 0 ? 'eva:trending-up-fill' : 'eva:trending-down-fill'} width={18} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1)}%</Typography>
        </Stack>
      )}
    </Card>
  );
}

function SyncNote({ data }) {
  return (
    <Typography variant="caption" sx={{ color: data.error ? 'error.main' : 'text.secondary' }}>
      {data.error ? `Ultima lettura non riuscita: ${data.error}` : `Ultimi 28 giorni rispetto ai 28 precedenti${data.lastSyncAt ? ` · aggiornato ${fmtDateTime(new Date(data.lastSyncAt))}` : ''}`}
    </Typography>
  );
}

const stars = (v) => (v == null ? '' : '★★★★★'.slice(0, Math.round(v)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(v)));

function BusinessProfileBlock({ data }) {
  const s = data.series;
  const views = last28(s, ['gbp_views_search', 'gbp_views_maps']);
  const calls = last28(s, ['gbp_calls']);
  const dirs = last28(s, ['gbp_directions']);
  const site = last28(s, ['gbp_website_clicks']);
  const ratingVals = data.rating.values.gbp_rating ?? [];
  const totalVals = data.rating.values.gbp_reviews_total ?? [];
  const rating = ratingVals.filter(Boolean).at(-1) ?? null;
  const total = totalVals.filter(Boolean).at(-1) ?? null;
  const unanswered = data.reviews.filter((r) => !r.replied).length;
  const options = useChart({
    chart: { stacked: true },
    xaxis: { categories: s.days.map((d) => fmtDate(d, { day: 'numeric', month: 'short' })), tickAmount: 8, labels: { rotate: 0 } },
    legend: { show: true, position: 'top', horizontalAlign: 'right' },
    tooltip: { shared: true, y: { formatter: (v) => n(v) } },
    plotOptions: { bar: { columnWidth: '70%' } },
  });
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Iconify icon="custom:location-fill" width={24} />
        <Typography variant="h6" sx={{ flex: 1 }}>Scheda Google · {data.name}</Typography>
        <SyncNote data={data} />
      </Stack>
      <Grid container spacing={3}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Visualizzazioni (Ricerca e Maps)" value={n(views.now)} delta={views.delta} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Chiamate" value={n(calls.now)} delta={calls.delta} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Richieste di indicazioni" value={n(dirs.now)} delta={dirs.delta} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Clic al sito" value={n(site.now)} delta={site.delta} /></Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardHeader title="Azioni dalla scheda" subheader="Ultimi 90 giorni (Google li rende disponibili con qualche giorno di ritardo)" />
            <Chart
              type="bar"
              series={[
                { name: 'Chiamate', data: s.values.gbp_calls ?? [] },
                { name: 'Indicazioni', data: s.values.gbp_directions ?? [] },
                { name: 'Clic al sito', data: s.values.gbp_website_clicks ?? [] },
              ]}
              options={options}
              sx={{ height: 280, px: 1, pb: 1 }}
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              title="Recensioni"
              subheader={rating != null ? `${n(rating, 1)} su 5 · ${n(total)} recensioni${unanswered ? ` · ${unanswered} senza risposta tra le ultime` : ''}` : 'Disponibili dalla prossima sincronizzazione'}
            />
            <Scrollbar sx={{ maxHeight: 300, px: 3, pb: 2 }}>
              <Stack spacing={1.5}>
                {data.reviews.slice(0, 20).map((r, i) => (
                  <Box key={`${r.at}-${i}`}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                      <Typography variant="subtitle2" sx={{ color: 'warning.main', letterSpacing: 1 }}>{stars(r.stars)}</Typography>
                      <Typography variant="caption" sx={{ flex: 1, color: 'text.secondary' }}>{r.author} · {fmtDate(r.at)}</Typography>
                      {!r.replied && <Label color="warning">Senza risposta</Label>}
                    </Stack>
                    {r.comment && <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.comment}</Typography>}
                  </Box>
                ))}
              </Stack>
            </Scrollbar>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function GoogleAdsBlock({ data }) {
  const s = data.series;
  const spend = last28(s, ['ads_spend']);
  const clicks = last28(s, ['ads_clicks']);
  const conv = last28(s, ['ads_conversions']);
  const value = last28(s, ['ads_conversion_value']);
  const cpa = conv.now ? spend.now / conv.now : null;
  const options = useChart({
    xaxis: { categories: s.days.map((d) => fmtDate(d, { day: 'numeric', month: 'short' })), tickAmount: 8, labels: { rotate: 0 } },
    stroke: { width: [0, 3] },
    legend: { show: true, position: 'top', horizontalAlign: 'right' },
    // Colonne e linea insieme: il tooltip condiviso richiede intersect spento
    tooltip: { shared: true, intersect: false },
  });
  const chartOptions = {
    ...options,
    yaxis: [
      { seriesName: 'Spesa', title: { text: 'Spesa €' }, labels: { formatter: (v) => n(v) } },
      { seriesName: 'Conversioni', opposite: true, title: { text: 'Conversioni' }, labels: { formatter: (v) => n(v, 1) } },
    ],
  };
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Iconify icon="socials:google" width={24} />
        <Typography variant="h6" sx={{ flex: 1 }}>Google Ads · {data.name}</Typography>
        <SyncNote data={data} />
      </Stack>
      <Grid container spacing={3}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Spesa" value={euro(spend.now)} delta={spend.delta} invert /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Clic" value={n(clicks.now)} delta={clicks.delta} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Conversioni" value={n(conv.now, 1)} delta={conv.delta} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label={value.now ? `Costo per conversione · ROAS ${n(value.now / (spend.now || 1), 1)}x` : 'Costo per conversione'} value={cpa == null ? '—' : euro(cpa)} delta={null} />
        </Grid>
        <Grid size={12}>
          <Card>
            <CardHeader title="Spesa e conversioni" subheader="Ultimi 90 giorni · la spesa mensile entra da sola nei costi di marketing dei Lead (costo per lead, CAC, ROI)" />
            <Chart
              type="line"
              series={[
                { name: 'Spesa', type: 'column', data: (s.values.ads_spend ?? []).map((v) => Math.round(v * 100) / 100) },
                { name: 'Conversioni', type: 'line', data: s.values.ads_conversions ?? [] },
              ]}
              options={chartOptions}
              sx={{ height: 300, px: 1, pb: 1 }}
            />
          </Card>
        </Grid>
        <Grid size={12}>
          <Card>
            <CardHeader title="Campagne" subheader="Ultimi 28 giorni" />
            <Scrollbar sx={{ maxHeight: 420 }}>
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Campagna</TableCell>
                      <TableCell align="right">Spesa</TableCell>
                      <TableCell align="right">Impression</TableCell>
                      <TableCell align="right">Clic</TableCell>
                      <TableCell align="right">CTR</TableCell>
                      <TableCell align="right">CPC</TableCell>
                      <TableCell align="right">Conversioni</TableCell>
                      <TableCell align="right">Costo / conversione</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.campaigns.map((c) => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name} {c.status === 'PAUSED' && <Label>In pausa</Label>}
                        </TableCell>
                        <TableCell align="right">{euro(c.cost)}</TableCell>
                        <TableCell align="right">{n(c.impressions)}</TableCell>
                        <TableCell align="right">{n(c.clicks)}</TableCell>
                        <TableCell align="right">{pct(c.impressions ? c.clicks / c.impressions : null)}</TableCell>
                        <TableCell align="right">{c.clicks ? euro(c.cost / c.clicks) : '—'}</TableCell>
                        <TableCell align="right">{n(c.conversions, 1)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{c.conversions ? euro(c.cost / c.conversions) : '—'}</TableCell>
                      </TableRow>
                    ))}
                    {data.campaigns.length === 0 && (
                      <TableRow><TableCell colSpan={8} sx={{ color: 'text.secondary' }}>Nessuna campagna con dati nel periodo</TableCell></TableRow>
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
      <AnalyticsDetails data={data} />
    </Card>
  );
}

const CHANNEL_IT = {
  'Organic Search': 'Ricerca organica',
  'Paid Search': 'Ricerca a pagamento',
  'Organic Social': 'Social organici',
  'Paid Social': 'Social a pagamento',
  Direct: 'Diretto',
  Referral: 'Altri siti',
  Email: 'Email',
  Unassigned: 'Non assegnato',
};
const euro = (v) => (v ? v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—');

function AnalyticsDetails({ data }) {
  const [tab, setTab] = useState('landing');
  if (!data.landing && !data.campaigns && !data.conversions) {
    return (
      <Typography variant="body2" sx={{ px: 3, pb: 3, color: 'text.secondary' }}>
        Pagine di atterraggio, campagne e conversioni compaiono dalla prossima sincronizzazione.
      </Typography>
    );
  }
  const cell = { maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="landing" label="Pagine di atterraggio" />
        <Tab value="campaigns" label="Campagne e fonti" />
        <Tab value="conversions" label="Conversioni" />
      </Tabs>
      <Typography variant="caption" sx={{ display: 'block', px: 2, pt: 1.5, color: 'text.secondary' }}>
        Ultimi 28 giorni. Contatti e clienti vengono dal raccoglitore Lead di 2Target ({n(data.leadsTotal)} lead nel periodo), abbinati per pagina di arrivo e UTM.
      </Typography>
      <Scrollbar sx={{ maxHeight: 460 }}>
        <TableContainer>
          {tab === 'landing' && (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Pagina</TableCell>
                  <TableCell align="right">Sessioni</TableCell>
                  <TableCell align="right">Coinvolgimento</TableCell>
                  <TableCell align="right">Conversioni</TableCell>
                  <TableCell align="right">Lead</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.landing ?? []).map((r) => (
                  <TableRow key={r.landingPage} hover>
                    <TableCell sx={cell}>{r.landingPage || '/'}</TableCell>
                    <TableCell align="right">{n(r.sessions)}</TableCell>
                    <TableCell align="right">{pct(r.engagementRate)}</TableCell>
                    <TableCell align="right">{n(r.keyEvents)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: r.leads ? 600 : 400 }}>{n(r.leads)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {tab === 'campaigns' && (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Sorgente / mezzo</TableCell>
                  <TableCell>Campagna</TableCell>
                  <TableCell align="right">Sessioni</TableCell>
                  <TableCell align="right">Conversioni</TableCell>
                  <TableCell align="right">Lead</TableCell>
                  <TableCell align="right">Clienti</TableCell>
                  <TableCell align="right">Valore</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.campaigns?.rows ?? []).map((r) => (
                  <TableRow key={`${r.sessionSource}|${r.sessionMedium}|${r.sessionCampaignName}`} hover>
                    <TableCell sx={cell}>{r.sessionSource} / {r.sessionMedium}</TableCell>
                    <TableCell sx={cell}>{r.sessionCampaignName === '(not set)' ? '—' : r.sessionCampaignName}</TableCell>
                    <TableCell align="right">{n(r.sessions)}</TableCell>
                    <TableCell align="right">{n(r.keyEvents)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: r.leads ? 600 : 400 }}>{n(r.leads)}</TableCell>
                    <TableCell align="right">{n(r.customers)}</TableCell>
                    <TableCell align="right">{euro(r.revenue || r.totalRevenue)}</TableCell>
                  </TableRow>
                ))}
                {(data.campaigns?.missing ?? []).map((m) => (
                  <TableRow key={`m-${m.source}|${m.medium}|${m.campaign}`}>
                    <TableCell sx={cell}>{m.source || '—'} / {m.medium || '—'}</TableCell>
                    <TableCell sx={cell}>
                      {m.campaign || '—'} <Label color="warning">solo nei Lead</Label>
                    </TableCell>
                    <TableCell align="right">—</TableCell>
                    <TableCell align="right">—</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{n(m.leads)}</TableCell>
                    <TableCell align="right">{n(m.customers)}</TableCell>
                    <TableCell align="right">{euro(m.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {tab === 'conversions' && (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Evento chiave</TableCell>
                  <TableCell align="right">Totale</TableCell>
                  <TableCell>Da dove arrivano</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.conversions ?? []).map((e) => (
                  <TableRow key={e.eventName} hover>
                    <TableCell>{e.eventName}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{n(e.total)}</TableCell>
                    <TableCell>{e.channels.slice(0, 4).map((c) => `${CHANNEL_IT[c.channel] ?? c.channel} ${n(c.count)}`).join(' · ')}</TableCell>
                  </TableRow>
                ))}
                {!(data.conversions ?? []).length && (
                  <TableRow><TableCell colSpan={3} sx={{ color: 'text.secondary' }}>Nessun evento chiave: vanno impostati in Analytics 4 (Amministrazione → Eventi chiave)</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Scrollbar>
    </Box>
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
