'use client';

import { SPONSOR_ACTION_TEXT } from '../../sponsorizzate/sponsor-texts';
import { ErrorText } from 'src/components/error-text';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';

import { fmtDate, fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { askConfirm } from 'src/components/custom-dialog';

import { findCities, startSponsorship, changeSponsorship, refreshSponsorships } from '../../ads-actions';
import { NewCampaignDialog } from '../../sponsorizzate/new-campaign-dialog';

// ----------------------------------------------------------------------
// Sponsorizzazione di un post già pubblicato da 2Target, con budget totale, durata, zona ed età.
// Chi paga è quello impostato in Canali → Sponsorizzate e viene ripetuto nella conferma.

export const AD_STATUS = {
  in_avvio: { label: 'In avvio', color: 'warning' },
  attiva: { label: 'Attiva', color: 'success' },
  in_pausa: { label: 'In pausa', color: 'info' },
  terminata: { label: 'Terminata', color: 'default' },
  errore: { label: 'Errore', color: 'error' },
};

export const AD_OBJECTIVE = {
  interazione: { label: 'Interazione', hint: 'Mi piace, commenti e condivisioni sul post' },
  notorieta: { label: 'Notorietà', hint: 'Mostrare il post al maggior numero di persone' },
  traffico: { label: 'Traffico', hint: 'Clic verso il link del post (serve un link)' },
};

// Etichette anche per gli obiettivi delle campagne nuove (la sponsorizzazione di un post ha solo i tre sopra)
const OBJECTIVE_LABEL = { ...Object.fromEntries(Object.entries(AD_OBJECTIVE).map(([k, o]) => [k, o.label])), contatti: 'Contatti' };
const KIND_LABEL = { boost: 'Post sponsorizzato', campagna: 'Campagna', contatti: 'Modulo contatti' };

export const RESULT_LABEL = { impressioni: 'Impressioni', copertura: 'Copertura', clic: 'Clic', interazioni: 'Interazioni', clic_link: 'Clic sul link', contatti: 'Contatti' };

const placementIcons = (p) => (p === 'entrambi' ? ['socials:facebook', 'socials:instagram'] : [p === 'instagram' ? 'socials:instagram' : 'socials:facebook']);

const money = (n, c = 'EUR') => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: c });

export function SponsorPanel({ clientId, itemId, hasMedia, canPublish, dryRun, ads, publications, campaigns }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, startBusy] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const published = publications.filter((p) => p.status === 'pubblicata' && ['facebook', 'instagram'].includes(p.platform));

  if (!published.length && !campaigns.length && !(hasMedia && canPublish)) return null;

  const act = async (c, action) => {
    const text = SPONSOR_ACTION_TEXT[action];
    if (!(await askConfirm(text))) return;
    startBusy(async () => {
      const r = await changeSponsorship(c.id, action);
      if (r.error) toast.error(r.error);
      else {
        toast.success(text.done);
        router.refresh();
      }
    });
  };

  const refresh = () =>
    startRefresh(async () => {
      const r = await refreshSponsorships(clientId);
      if (r.error) toast.error(r.error);
      else toast.success('Spesa e risultati aggiornati');
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title="Sponsorizzate"
        subheader={
          ads.adAccountId
            ? `Account ${ads.adAccountName ?? ads.adAccountId} · ${ads.payer === 'golduck' ? 'paga Golduck e rifattura al cliente' : 'paga il cliente'}`
            : 'Scegli prima l\'account pubblicitario: Canali → riquadro «Sponsorizzate Meta»'
        }
        action={
          <Stack direction="row" spacing={1}>
            {campaigns.some((c) => !c.simulated) && (
              <Button size="small" startIcon={<Iconify icon="solar:restart-bold" />} onClick={refresh} loading={refreshing}>
                Aggiorna
              </Button>
            )}
            {canPublish && hasMedia && (
              <Button size="small" variant="outlined" startIcon={<Iconify icon="mingcute:add-line" />} disabled={!ads.adAccountId} onClick={() => setCreating(true)}>
                Nuova sponsorizzata
              </Button>
            )}
          </Stack>
        }
      />
      <Stack spacing={2} sx={{ p: 3, pt: 2 }}>
        {dryRun && <Alert severity="info">Modalità simulazione: le sponsorizzate vengono registrate ma non si contatta Meta e non si spende nulla.</Alert>}
        {!ads.adAccountId && (
          <Alert severity="warning">
            Nessun account pubblicitario per questo cliente. <Link href={`/clienti/${clientId}/canali`}>Impostalo in Canali</Link>.
          </Alert>
        )}

        {published.map((p) => (
          <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', bgcolor: 'background.neutral', borderRadius: 1, px: 2, py: 1.25 }}>
            <Iconify icon={p.platform === 'instagram' ? 'socials:instagram' : 'socials:facebook'} width={22} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                Post su {p.channelName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                pubblicato il {fmtDateTime(p.publishedAt)}
                {p.permalink && (
                  <>
                    {' · '}
                    <Link href={p.permalink} target="_blank" rel="noopener">apri</Link>
                  </>
                )}
              </Typography>
            </Box>
            {canPublish && (
              <Button variant="outlined" size="small" startIcon={<Iconify icon="carbon:rocket" />} disabled={!ads.adAccountId} onClick={() => setOpen(p)}>
                Sponsorizza
              </Button>
            )}
          </Stack>
        ))}

        {campaigns.length > 0 && <Divider />}
        {campaigns.map((c) => (
          <CampaignRow key={c.id} c={c} canPublish={canPublish} busy={busy} onAction={act} />
        ))}
      </Stack>

      {open && <LaunchDialog clientId={clientId} ads={ads} publication={open} onClose={() => setOpen(null)} onDone={() => router.refresh()} />}
      {creating && <NewCampaignDialog clientId={clientId} itemId={itemId} onClose={() => setCreating(false)} onDone={() => router.refresh()} />}
    </Card>
  );
}

// ----------------------------------------------------------------------

export function CampaignRow({ c, canPublish, busy, onAction, showClient }) {
  const st = AD_STATUS[c.status];
  const pct = c.budget ? Math.min(100, (c.spend / c.budget) * 100) : 0;
  // La frequenza non è un risultato: si mostra a parte
  const results = Object.entries(c.results ?? {}).filter(([k, v]) => v > 0 && k !== 'frequenza');
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {placementIcons(c.platform).map((icon) => (
          <Iconify key={icon} icon={icon} width={20} />
        ))}
        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 160 }}>
          {showClient ? `${c.clientName} · ` : ''}
          {c.name ? `${c.name} · ` : ''}
          {OBJECTIVE_LABEL[c.objective] ?? c.objective} · {money(c.budget, c.currency)} · {fmtDate(c.startAt)} → {fmtDate(c.endAt)}
        </Typography>
        {c.kind && c.kind !== 'boost' && <Label variant="outlined">{KIND_LABEL[c.kind]}</Label>}
        {c.simulated && <Label variant="soft">Simulazione</Label>}
        <Label variant="soft" color={c.payer === 'golduck' ? 'warning' : 'default'}>{c.payer === 'golduck' ? 'Paga Golduck' : 'Paga cliente'}</Label>
        <Label variant="soft" color={st?.color}>{st?.label ?? c.status}</Label>
        {canPublish && c.status === 'attiva' && (
          <Tooltip title="Metti in pausa">
            <IconButton size="small" disabled={busy} onClick={() => onAction(c, 'pausa')}><Iconify icon="carbon:pause" /></IconButton>
          </Tooltip>
        )}
        {canPublish && c.status === 'in_pausa' && (
          <Tooltip title="Riattiva">
            <IconButton size="small" disabled={busy} onClick={() => onAction(c, 'riprendi')}><Iconify icon="carbon:play" /></IconButton>
          </Tooltip>
        )}
        {canPublish && ['attiva', 'in_pausa'].includes(c.status) && (
          <Tooltip title="Termina">
            <IconButton size="small" color="error" disabled={busy} onClick={() => onAction(c, 'termina')}><Iconify icon="solar:stop-circle-bold" /></IconButton>
          </Tooltip>
        )}
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1 }}>
        <LinearProgress variant="determinate" value={pct} sx={{ flex: 1, height: 6, borderRadius: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
          spesi {money(c.spend, c.currency)} su {money(c.budget, c.currency)}
        </Typography>
      </Stack>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {c.targeting?.city ? `${c.targeting.city.name} +${c.targeting.city.radiusKm} km` : 'Tutta Italia'} · {c.targeting?.ageMin}-{c.targeting?.ageMax} anni
        {c.targeting?.gender && c.targeting.gender !== 'tutti' ? ` · ${c.targeting.gender}` : ''}
        {results.length > 0 && ` · ${results.map(([k, v]) => `${RESULT_LABEL[k] ?? k}: ${v.toLocaleString('it-IT')}`).join(' · ')}`}
        {c.results?.frequenza > 0 && ` · vista in media ${c.results.frequenza.toLocaleString('it-IT', { maximumFractionDigits: 1 })} volte da ogni persona`}
        {c.lastSyncAt && ` · aggiornato ${fmtDateTime(c.lastSyncAt)}`}
      </Typography>
      {c.roi && (c.roi.leads > 0 || c.roi.customers > 0) && <RoiLine roi={c.roi} currency="EUR" />}
      {c.error && <Alert severity="error" sx={{ mt: 1 }}><ErrorText error={c.error} /></Alert>}
    </Box>
  );
}

// Ritorno della campagna dai lead attribuiti: contatti, clienti, ricavi e ROAS
function RoiLine({ roi, currency }) {
  const color = roi.roas == null ? 'text.secondary' : roi.roas >= 1 ? 'success.main' : 'warning.main';
  const parts = [
    `${roi.leads} ${roi.leads === 1 ? 'contatto' : 'contatti'}${roi.cpl != null ? ` (${money(roi.cpl, currency)} l'uno)` : ''}`,
    `${roi.customers} ${roi.customers === 1 ? 'cliente' : 'clienti'}`,
    roi.revenue > 0 && `ricavi ${money(roi.revenue, currency)}`,
    roi.open > 0 && `${roi.open} ancora aperti${roi.pipeline > 0 ? ` (${money(roi.pipeline, currency)} stimati)` : ''}`,
  ].filter(Boolean);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
      <Iconify icon="solar:graph-up-bold" width={16} sx={{ color }} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{parts.join(' · ')}</Typography>
      {roi.roas != null && roi.revenue > 0 && (
        <Label variant="soft" color={roi.roas >= 1 ? 'success' : 'warning'}>ROAS ×{roi.roas.toLocaleString('it-IT')}</Label>
      )}
    </Stack>
  );
}

// ----------------------------------------------------------------------

function LaunchDialog({ clientId, ads, publication, onClose, onDone }) {
  const [objective, setObjective] = useState('interazione');
  const [budget, setBudget] = useState(50);
  const [days, setDays] = useState(7);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [city, setCity] = useState(null);
  const [radius, setRadius] = useState(15);
  const [cities, setCities] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, startSend] = useTransition();
  const currency = ads.currency ?? 'EUR';
  const golduck = ads.payer === 'golduck';
  const capLeft = ads.monthlyCap != null ? Math.max(0, ads.monthlyCap - ads.spentMonth - ads.committed) : null;
  const valid = Number(budget) >= 1 && Number(days) >= 1 && Number(ageMax) >= Number(ageMin);

  const search = async (q) => {
    if (q.length < 2) return;
    const r = await findCities(clientId, q);
    if (r.error) toast.error(r.error);
    setCities(r.cities ?? []);
  };

  const launch = () =>
    startSend(async () => {
      const r = await startSponsorship({
        clientId,
        publicationId: publication.id,
        objective,
        budget: Number(budget),
        days: Number(days),
        city: city ? { key: city.key, name: city.name, radiusKm: Number(radius) } : null,
        ageMin: Number(ageMin),
        ageMax: Number(ageMax),
      });
      if (r.error) {
        toast.error(r.error);
        setConfirming(false);
        return;
      }
      toast.success(r.simulated ? 'Sponsorizzata registrata (simulazione)' : 'Sponsorizzata avviata: Meta la revisiona e parte entro pochi minuti');
      onDone();
      onClose();
    });

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={sending ? undefined : onClose}>
      <DialogTitle>{confirming ? 'Conferma la spesa' : `Sponsorizza il post su ${publication.channelName}`}</DialogTitle>
      <DialogContent>
        {!confirming ? (
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}>
              <TextField select fullWidth label="Obiettivo" value={objective} onChange={(e) => setObjective(e.target.value)} helperText={AD_OBJECTIVE[objective].hint}>
                {Object.entries(AD_OBJECTIVE).map(([k, o]) => (
                  <MenuItem key={k} value={k}>{o.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Budget totale"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                slotProps={{ htmlInput: { min: 1, step: 5 }, input: { endAdornment: <InputAdornment position="end">{currency === 'EUR' ? '€' : currency}</InputAdornment> } }}
                helperText={Number(days) > 0 ? `≈ ${money(Number(budget) / Number(days), currency)} al giorno` : ' '}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth type="number" label="Durata" value={days} onChange={(e) => setDays(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 90 }, input: { endAdornment: <InputAdornment position="end">giorni</InputAdornment> } }} />
            </Grid>
            <Grid size={{ xs: 8 }}>
              <Autocomplete
                options={cities}
                value={city}
                onChange={(_, v) => setCity(v)}
                onInputChange={(_, q, reason) => reason === 'input' && search(q)}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.key === b.key}
                filterOptions={(x) => x}
                noOptionsText="Scrivi il nome di una città"
                renderInput={(params) => <TextField {...params} label="Zona (vuoto = tutta Italia)" />}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField fullWidth type="number" label="Raggio" value={radius} disabled={!city} onChange={(e) => setRadius(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 80 }, input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth type="number" label="Età da" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} slotProps={{ htmlInput: { min: 18, max: 65 } }} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth type="number" label="Età fino a" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} slotProps={{ htmlInput: { min: 18, max: 65 } }} helperText="65 = 65 anni e oltre" />
            </Grid>
            {capLeft != null && (
              <Grid size={12}>
                <Alert severity={capLeft < Number(budget) ? 'error' : 'info'}>
                  Tetto mensile del cliente: restano {money(capLeft)} su {money(ads.monthlyCap)}.
                </Alert>
              </Grid>
            )}
          </Grid>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity={golduck ? 'warning' : 'info'} icon={<Iconify icon="solar:wad-of-money-bold" />}>
              {golduck ? (
                <>
                  <strong>Paga Golduck</strong> con l&apos;account «{ads.adAccountName}». La spesa (fino a {money(Number(budget), currency)}) verrà rifatturata al cliente
                  con ricarico ×{ads.markup}: fino a <strong>{money(Number(budget) * ads.markup, currency)}</strong>.
                </>
              ) : (
                <>
                  <strong>Paga il cliente</strong> con il suo account «{ads.adAccountName}»: Meta addebita fino a <strong>{money(Number(budget), currency)}</strong> sul suo metodo di pagamento.
                </>
              )}
            </Alert>
            <Typography variant="body2">
              {AD_OBJECTIVE[objective].label} per {days} giorni · {city ? `${city.name} +${radius} km` : 'tutta Italia'} · {ageMin}-{ageMax} anni.
              Si può mettere in pausa o terminare in qualsiasi momento: si paga solo quanto speso fino a quel momento.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={confirming ? () => setConfirming(false) : onClose} disabled={sending}>
          {confirming ? 'Indietro' : 'Annulla'}
        </Button>
        {confirming ? (
          <Button variant="contained" color={golduck ? 'warning' : 'primary'} onClick={launch} loading={sending} startIcon={<Iconify icon="carbon:rocket" />}>
            Avvia la sponsorizzata
          </Button>
        ) : (
          <Button variant="contained" onClick={() => setConfirming(true)} disabled={!valid}>
            Continua
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
