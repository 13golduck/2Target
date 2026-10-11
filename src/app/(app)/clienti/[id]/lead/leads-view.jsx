'use client';

import { useState, useOptimistic, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import ToggleButton from '@mui/material/ToggleButton';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { useRouter } from 'src/routes/hooks';
import { fmtDate, toRomeInput } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { Scrollbar } from 'src/components/scrollbar';
import { Chart, useChart } from 'src/components/chart';

import { addCost, moveLead, saveLead, deleteCost, deleteLead, regenerateLeadToken } from '../../../lead-actions';
import { askConfirm, confirmSubmit } from 'src/components/custom-dialog';

// ----------------------------------------------------------------------

export const SOURCES = {
  meta_ads: 'Inserzioni Meta',
  instagram: 'Instagram organico',
  facebook: 'Facebook organico',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  google_ads: 'Google Ads',
  seo: 'Google organico (SEO)',
  sito: 'Sito web',
  whatsapp: 'WhatsApp',
  telefono: 'Telefono',
  email: 'Email / newsletter',
  passaparola: 'Passaparola',
  evento: 'Evento / fiera',
  altro: 'Altro',
};
const STAGES = [
  { key: 'nuovo', label: 'Nuovi', color: 'default' },
  { key: 'contattato', label: 'Contattati', color: 'info' },
  { key: 'qualificato', label: 'Qualificati', color: 'secondary' },
  { key: 'preventivo', label: 'Preventivo', color: 'warning' },
  { key: 'vinto', label: 'Clienti', color: 'success' },
  { key: 'perso', label: 'Persi', color: 'error' },
];
const COST_KINDS = { inserzioni: 'Inserzioni', produzione: 'Produzione contenuti', consulenza: 'Consulenza / agenzia', strumenti: 'Strumenti', eventi: 'Eventi', altro: 'Altro' };

const eur = (v, d = 0) => (v == null ? '—' : v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: d }));
const pct = (v) => (v == null ? '—' : `${(v * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`);
const num = (v, d = 0) => (v == null ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: d }));

export function LeadsView({ clientId, period, periods, stats, bySource, trend, leads, costs, intake, readOnly = false }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // null | {} (nuovo) | lead
  const [costOpen, setCostOpen] = useState(false);

  const cards = [
    { label: 'Lead', value: num(stats.leads), sub: `${pct(stats.qualifiedRate)} qualificati`, icon: 'solar:users-group-rounded-bold' },
    { label: 'Costo per lead', value: eur(stats.cpl, 2), sub: `costi ${eur(stats.cost)}`, icon: 'solar:wad-of-money-bold' },
    { label: 'Nuovi clienti', value: num(stats.customers), sub: `conversione ${pct(stats.leadToCustomer)} dei lead del periodo`, icon: 'solar:cup-star-bold' },
    { label: 'Costo acquisizione cliente', value: eur(stats.cac), sub: stats.avgDaysToClose != null ? `${num(stats.avgDaysToClose)} giorni per chiudere` : ' ', icon: 'solar:user-plus-bold' },
    { label: 'Ricavi', value: eur(stats.revenue), sub: `valore medio ${eur(stats.avgDeal)}`, icon: 'eva:trending-up-fill' },
    { label: 'ROI marketing', value: pct(stats.roi), sub: `ROAS inserzioni ${stats.roas == null ? '—' : `${num(stats.roas, 1)}×`}`, icon: 'solar:chart-square-outline', color: stats.roi == null ? undefined : stats.roi >= 0 ? 'success.main' : 'error.main' },
  ];

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && router.push(`?periodo=${v}`)}>
          {Object.entries(periods).map(([k, v]) => <ToggleButton key={k} value={k}>{v}</ToggleButton>)}
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <>
            <Button variant="outlined" color="inherit" startIcon={<Iconify icon="solar:wad-of-money-bold" />} onClick={() => setCostOpen(true)}>
              Aggiungi costo
            </Button>
            <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setEditing({})}>
              Nuovo lead
            </Button>
          </>
        )}
      </Stack>

      <Grid container spacing={2}>
        {cards.map((c) => (
          <Grid key={c.label} size={{ xs: 6, md: 4, lg: 2 }}>
            <Card sx={{ p: 2.5, height: 1 }}>
              <Stack direction="row" sx={{ alignItems: 'center', mb: 1, color: 'text.secondary' }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>{c.label}</Typography>
                <Iconify icon={c.icon} width={20} />
              </Stack>
              <Typography variant="h4" sx={{ color: c.color }}>{c.value}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{c.sub}</Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <FunnelCard stats={stats} />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <TrendCard trend={trend} />
        </Grid>
      </Grid>

      <SourceTable rows={bySource} />

      <Pipeline leads={leads} onOpen={setEditing} readOnly={readOnly} />

      {readOnly ? (
        <CostsCard costs={costs} readOnly />
      ) : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <CostsCard costs={costs} onAdd={() => setCostOpen(true)} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <IntakeCard clientId={clientId} intake={intake} lostReasons={stats.lostReasons} />
          </Grid>
        </Grid>
      )}

      {!readOnly && (
        <>
          <LeadDialog clientId={clientId} lead={editing} onClose={() => setEditing(null)} />
          <CostDialog clientId={clientId} open={costOpen} onClose={() => setCostOpen(false)} />
        </>
      )}
    </Stack>
  );
}

// ----------------------------------------------------------------------

function FunnelCard({ stats }) {
  const steps = STAGES.slice(0, 5).map((s) => ({ ...s, value: stats.reached[s.key] }));
  const top = steps[0].value || 1;
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader title="Funnel" subheader="Lead ricevuti nel periodo e fin dove sono arrivati" />
      <Stack spacing={1.25} sx={{ p: 3 }}>
        {steps.map((s, i) => (
          <Box key={s.key}>
            <Stack direction="row" sx={{ mb: 0.5 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>{s.label}</Typography>
              <Typography variant="subtitle2">{s.value}</Typography>
              {i > 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary', width: 64, textAlign: 'right' }}>
                  {steps[i - 1].value ? pct(s.value / steps[i - 1].value) : '—'}
                </Typography>
              )}
              {i === 0 && <Box sx={{ width: 64 }} />}
            </Stack>
            <Box sx={{ height: 14, borderRadius: 1, bgcolor: 'background.neutral', overflow: 'hidden' }}>
              <Box sx={{ height: 1, width: `${(s.value / top) * 100}%`, bgcolor: i === 4 ? 'success.main' : 'primary.main', opacity: 1 - i * 0.12, transition: 'width 300ms' }} />
            </Box>
          </Box>
        ))}
        <Typography variant="caption" sx={{ color: 'text.secondary', pt: 1 }}>
          La percentuale a destra è il passaggio dalla fase precedente. Persi nel periodo: {stats.lost}.
        </Typography>
      </Stack>
    </Card>
  );
}

function TrendCard({ trend }) {
  const options = useChart({
    colors: ['#CDA434', '#22C55E', '#637381'],
    xaxis: { categories: trend.map((t) => fmtDate(`${t.month}-01`, { month: 'short', year: '2-digit' })) },
    stroke: { width: [0, 0, 3] },
    plotOptions: { bar: { columnWidth: '45%' } },
    legend: { show: true, position: 'top', horizontalAlign: 'right' },
    tooltip: { shared: true, intersect: false },
  });
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader title="Ultimi 6 mesi" subheader="Lead, nuovi clienti e costo per lead" />
      <Chart
        type="line"
        series={[
          { name: 'Lead', type: 'column', data: trend.map((t) => t.leads) },
          { name: 'Clienti', type: 'column', data: trend.map((t) => t.customers) },
          { name: 'Costo per lead €', type: 'line', data: trend.map((t) => (t.cpl == null ? null : Math.round(t.cpl))) },
        ]}
        options={{
          ...options,
          yaxis: [
            { seriesName: 'Lead', title: { text: 'Lead e clienti' } },
            { seriesName: 'Lead', show: false },
            { seriesName: 'Costo per lead €', opposite: true, title: { text: '€ per lead' } },
          ],
        }}
        sx={{ height: 300, px: 1, pb: 1 }}
      />
    </Card>
  );
}

function SourceTable({ rows }) {
  return (
    <Card>
      <CardHeader title="Per fonte" subheader="Da dove arrivano i lead, quanto costano e quanti diventano clienti" />
      <Scrollbar>
        <TableContainer sx={{ minWidth: 900 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Fonte</TableCell>
                <TableCell align="right">Costi</TableCell>
                <TableCell align="right">Lead</TableCell>
                <TableCell align="right">Costo per lead</TableCell>
                <TableCell align="right">Qualificati</TableCell>
                <TableCell align="right">Clienti</TableCell>
                <TableCell align="right">Conversione</TableCell>
                <TableCell align="right">Costo acquisizione</TableCell>
                <TableCell align="right">Ricavi</TableCell>
                <TableCell align="right">ROI</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.source} hover>
                  <TableCell><Typography variant="subtitle2">{SOURCES[r.source] ?? r.source}</Typography></TableCell>
                  <TableCell align="right">{eur(r.cost)}</TableCell>
                  <TableCell align="right">{r.leads}</TableCell>
                  <TableCell align="right">{eur(r.cpl, 2)}</TableCell>
                  <TableCell align="right">{r.reached.qualificato}</TableCell>
                  <TableCell align="right">{r.customers}</TableCell>
                  <TableCell align="right">{pct(r.leadToCustomer)}</TableCell>
                  <TableCell align="right">{eur(r.cac)}</TableCell>
                  <TableCell align="right">{eur(r.revenue)}</TableCell>
                  <TableCell align="right" sx={{ color: r.roi == null ? 'text.secondary' : r.roi >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>{pct(r.roi)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={10} sx={{ color: 'text.secondary' }}>Nessun lead o costo nel periodo</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Scrollbar>
    </Card>
  );
}

// ----------------------------------------------------------------------

function Pipeline({ leads, onOpen, readOnly = false }) {
  const [list, moveLocal] = useOptimistic(leads, (state, { id, stage }) => state.map((l) => (l.id === id ? { ...l, stage } : l)));
  const [, start] = useTransition();
  const [over, setOver] = useState(null);

  const drop = (stage, e) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('text/lead'));
    const lead = list.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (stage === 'perso' || stage === 'vinto') {
      // Per "cliente" e "perso" servono valore o motivo: si apre la scheda
      onOpen({ ...lead, stage });
      return;
    }
    start(async () => {
      moveLocal({ id, stage });
      await moveLead(id, stage);
    });
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Pipeline</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Trascina i lead da una fase all&apos;altra oppure tocca una scheda per aprirla e cambiarne la fase. Lead aperti e quelli chiusi nel periodo.
      </Typography>
      <Scrollbar sx={{ pb: 2 }}>
        <Stack direction="row" spacing={{ xs: 1.5, md: 2 }} sx={{ alignItems: 'flex-start', minWidth: { md: 1300 } }}>
          {STAGES.map((col) => {
            const items = list.filter((l) => l.stage === col.key);
            const value = items.reduce((t, l) => t + ((col.key === 'vinto' ? l.wonValue : l.estimatedValue) ?? 0), 0);
            return (
              <Paper
                key={col.key}
                variant="outlined"
                onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
                onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
                onDrop={(e) => !readOnly && drop(col.key, e)}
                sx={{ flex: 1, minWidth: { xs: '78vw', sm: 220, md: 200 }, scrollSnapAlign: 'start', p: 1.25, borderRadius: 2, bgcolor: over === col.key ? 'primary.lighter' : 'background.neutral', borderStyle: over === col.key ? 'dashed' : 'solid' }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.5, py: 0.75 }}>
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>{col.label}</Typography>
                  <Label color={col.color}>{items.length}</Label>
                </Stack>
                {value > 0 && <Typography variant="caption" sx={{ px: 0.5, color: 'text.secondary' }}>{eur(value)}</Typography>}
                <Stack spacing={1} sx={{ mt: 1, minHeight: 80 }}>
                  {items.map((l) => (
                    <Card
                      key={l.id}
                      draggable={!readOnly}
                      onDragStart={(e) => { e.dataTransfer.setData('text/lead', String(l.id)); e.dataTransfer.effectAllowed = 'move'; }}
                      onClick={() => !readOnly && onOpen(l)}
                      sx={{ p: 1.5, cursor: readOnly ? 'default' : 'grab', '&:hover': { boxShadow: (t) => t.vars.customShadows.z8 } }}
                    >
                      <Typography variant="subtitle2" noWrap>{l.name || l.email || l.phone || 'Senza nome'}</Typography>
                      {l.company && <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>{l.company}</Typography>}
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1, alignItems: 'center' }}>
                        <Label variant="outlined" sx={{ maxWidth: 120 }}>{SOURCES[l.source]}</Label>
                        <Box sx={{ flex: 1 }} />
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>{fmtDate(l.receivedAt, { day: 'numeric', month: 'short' })}</Typography>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Scrollbar>
    </Box>
  );
}

// ----------------------------------------------------------------------

function CostsCard({ costs, onAdd, readOnly = false }) {
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader
        title="Costi di marketing"
        subheader="Inserzioni, contenuti, consulenza: servono per costo per lead, costo di acquisizione e ROI"
        action={readOnly ? null : <Button size="small" startIcon={<Iconify icon="mingcute:add-line" />} onClick={onAdd}>Aggiungi</Button>}
      />
      <Scrollbar sx={{ maxHeight: 340 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Mese</TableCell>
              <TableCell>Fonte</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell align="right">Importo</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {costs.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{fmtDate(c.month, { month: 'long', year: 'numeric' })}</TableCell>
                <TableCell>{SOURCES[c.source]}</TableCell>
                <TableCell>{COST_KINDS[c.kind]}{c.notes && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{c.notes}</Typography>}</TableCell>
                <TableCell align="right">{eur(c.amount, 2)}</TableCell>
                <TableCell align="right" padding="checkbox">
                  {!readOnly && (
                    <Box component="form" action={deleteCost}>
                      <input type="hidden" name="id" value={c.id} />
                      <IconButton type="submit" size="small"><Iconify icon="solar:trash-bin-trash-bold" width={16} /></IconButton>
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {costs.length === 0 && <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>Nessun costo inserito</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Scrollbar>
    </Card>
  );
}

function IntakeCard({ clientId, intake, lostReasons }) {
  const snippet = intake
    ? `<form action="${intake}" method="POST">
  <input name="name" placeholder="Nome">
  <input name="email" type="email" placeholder="Email">
  <input name="phone" placeholder="Telefono">
  <textarea name="message"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="redirect" value="https://SITO/grazie">
  <button>Invia</button>
</form>`
    : '';
  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copiato'));
  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Raccolta automatica" subheader="I moduli del sito del cliente inviano i lead direttamente qui" />
        <Stack spacing={2} sx={{ p: 3, pt: 1 }}>
          {intake ? (
            <>
              <TextField label="Indirizzo di raccolta" value={intake} size="small" slotProps={{ input: { readOnly: true, endAdornment: <IconButton size="small" onClick={() => copy(intake)}><Iconify icon="solar:copy-bold" width={18} /></IconButton> } }} />
              <Alert severity="info" icon={false} sx={{ fontSize: 13 }}>
                Gli UTM della pagina (utm_source, utm_medium, utm_campaign) vanno inviati come campi: la fonte si riconosce da sola
                (es. facebook + cpc → Inserzioni Meta). Il campo nascosto <code>website</code> blocca lo spam.
              </Alert>
              <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: 'background.neutral', fontSize: 12, overflow: 'auto', maxHeight: 180 }}>{snippet}</Box>
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<Iconify icon="solar:copy-bold" />} onClick={() => copy(snippet)}>Copia esempio modulo</Button>
                <Box component="form" action={regenerateLeadToken} onSubmit={(e) => confirmSubmit(e, { tone: 'warning', title: 'Rigenerare l’indirizzo?', content: 'Il vecchio indirizzo smetterà di funzionare: i moduli del sito andranno aggiornati con quello nuovo.', confirmText: 'Rigenera' })}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <Button type="submit" size="small" color="inherit">Rigenera indirizzo</Button>
                </Box>
              </Stack>
            </>
          ) : (
            <Box component="form" action={regenerateLeadToken}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button type="submit" variant="outlined" startIcon={<Iconify icon="eva:link-2-fill" />}>Crea indirizzo di raccolta</Button>
            </Box>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            In arrivo: lead delle inserzioni Meta (moduli istantanei) importati in automatico.
          </Typography>
        </Stack>
      </Card>
      {lostReasons.length > 0 && (
        <Card>
          <CardHeader title="Perché li perdiamo" subheader="Lead persi nel periodo" />
          <Stack spacing={1} sx={{ p: 3, pt: 1 }}>
            {lostReasons.map((r) => (
              <Stack key={r.reason} direction="row"><Typography variant="body2" sx={{ flex: 1 }}>{r.reason}</Typography><Label color="error">{r.count}</Label></Stack>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

// ----------------------------------------------------------------------

function LeadDialog({ clientId, lead, onClose }) {
  const open = lead !== null;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      {open && <LeadForm key={`${lead.id ?? 'nuovo'}-${lead.stage ?? ''}`} clientId={clientId} lead={lead} onClose={onClose} />}
    </Dialog>
  );
}

function LeadForm({ clientId, lead, onClose }) {
  const [pending, start] = useTransition();
  const isNew = !lead.id;
  const [stage, setStage] = useState(lead.stage ?? 'nuovo');

  return (
    <Box
      component="form"
      action={(fd) =>
        start(async () => {
          const r = await saveLead(fd);
          if (r?.error) toast.error(r.error);
          else {
            toast.success(isNew ? 'Lead aggiunto' : 'Lead aggiornato');
            onClose();
          }
        })
      }
    >
      <DialogTitle>{isNew ? 'Nuovo lead' : lead.name || lead.email || 'Lead'}</DialogTitle>
      <DialogContent>
        <input type="hidden" name="id" value={lead.id ?? ''} />
        <input type="hidden" name="clientId" value={clientId} />
        <Grid container spacing={2} sx={{ pt: 1 }}>
          <Grid size={{ xs: 12, sm: 6 }}><TextField name="name" label="Nome e cognome" defaultValue={lead.name ?? ''} fullWidth autoFocus={isNew} /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField name="company" label="Azienda" defaultValue={lead.company ?? ''} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField name="email" label="Email" type="email" defaultValue={lead.email ?? ''} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 6 }}><TextField name="phone" label="Telefono" defaultValue={lead.phone ?? ''} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField select name="source" label="Fonte" defaultValue={lead.source ?? 'meta_ads'} fullWidth>
              {Object.entries(SOURCES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField name="utmCampaign" label="Campagna" defaultValue={lead.utmCampaign ?? ''} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField name="receivedAt" type="datetime-local" label="Ricevuto il" defaultValue={toRomeInput(lead.receivedAt ? new Date(lead.receivedAt) : new Date())} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField select name="stage" label="Fase" value={stage} onChange={(e) => setStage(e.target.value)} fullWidth>
              {STAGES.map((s) => <MenuItem key={s.key} value={s.key}>{s.key === 'vinto' ? 'Cliente (vinto)' : s.label.replace(/i$/, 'o')}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}><TextField name="estimatedValue" label="Valore stimato €" defaultValue={lead.estimatedValue ?? ''} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField name="wonValue" label="Valore vinto €" defaultValue={lead.wonValue ?? ''} disabled={stage !== 'vinto'} required={stage === 'vinto'} helperText={stage === 'vinto' ? 'Ricavo del primo ordine o contratto' : ' '} fullWidth />
          </Grid>
          {stage === 'perso' && (
            <Grid size={12}><TextField name="lostReason" label="Motivo della perdita" defaultValue={lead.lostReason ?? ''} placeholder="Prezzo, tempistiche, non risponde, fuori zona…" required fullWidth /></Grid>
          )}
          <Grid size={12}><TextField name="message" label="Richiesta" defaultValue={lead.message ?? ''} multiline minRows={2} fullWidth /></Grid>
          <Grid size={12}><TextField name="notes" label="Note interne" defaultValue={lead.notes ?? ''} multiline minRows={2} fullWidth /></Grid>
          {lead.landingUrl && <Grid size={12}><Typography variant="caption" sx={{ color: 'text.secondary' }}>Pagina di provenienza: {lead.landingUrl}</Typography></Grid>}
        </Grid>
      </DialogContent>
      <DialogActions>
        {!isNew && (
          <Button
            color="error"
            sx={{ mr: 'auto' }}
            onClick={async () => {
              if (!(await askConfirm({ tone: 'error', title: 'Eliminare il lead?', content: 'Il lead e la sua storia verranno cancellati definitivamente.', confirmText: 'Elimina' }))) return;
              const fd = new FormData();
              fd.set('id', lead.id);
              start(async () => { await deleteLead(fd); onClose(); });
            }}
          >
            Elimina
          </Button>
        )}
        <Button onClick={onClose}>Annulla</Button>
        <Tooltip title={stage === 'vinto' ? 'Il lead conta come cliente acquisito oggi' : ''}>
          <Button type="submit" variant="contained" loading={pending}>Salva</Button>
        </Tooltip>
      </DialogActions>
    </Box>
  );
}

function CostDialog({ clientId, open, onClose }) {
  const [pending, start] = useTransition();
  const month = new Date().toISOString().slice(0, 7);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            const r = await addCost(fd);
            if (r?.error) toast.error(r.error);
            else {
              toast.success('Costo aggiunto');
              onClose();
            }
          })
        }
      >
        <DialogTitle>Costo di marketing</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <input type="hidden" name="clientId" value={clientId} />
            <TextField name="month" type="month" label="Mese" defaultValue={month} slotProps={{ inputLabel: { shrink: true } }} required />
            <TextField select name="source" label="Fonte" defaultValue="meta_ads">
              {Object.entries(SOURCES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField select name="kind" label="Tipo" defaultValue="inserzioni">
              {Object.entries(COST_KINDS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField name="amount" label="Importo €" required placeholder="es. 350" />
            <TextField name="notes" label="Note" placeholder="es. Campagna chiamate settembre" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="contained" loading={pending}>Aggiungi</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
