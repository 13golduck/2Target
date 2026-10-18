'use client';

import { useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Step from '@mui/material/Step';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Stepper from '@mui/material/Stepper';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import StepLabel from '@mui/material/StepLabel';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import ToggleButton from '@mui/material/ToggleButton';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { findCities, startCampaign, loadCampaignSources, createLeadFormAction } from '../ads-actions';

// ----------------------------------------------------------------------
// Campagna nuova dalla scheda del piano: contenuto → obiettivo e testi → pubblico e budget → conferma della spesa.

export const NEW_OBJECTIVE = {
  contatti: { label: 'Contatti', hint: 'Modulo di Meta precompilato: nome, email, telefono finiscono nei Lead', icon: 'solar:user-plus-bold' },
  traffico: { label: 'Traffico', hint: 'Visite al sito o alla pagina indicata', icon: 'solar:cursor-bold' },
  notorieta: { label: 'Notorietà', hint: 'Far conoscere l’attività al maggior numero di persone in zona', icon: 'solar:eye-bold' },
  interazione: { label: 'Interazione', hint: 'Mi piace, commenti e condivisioni', icon: 'solar:heart-bold' },
};

const BUTTONS = {
  LEARN_MORE: 'Scopri di più',
  CONTACT_US: 'Contattaci',
  BOOK_TRAVEL: 'Prenota',
  SHOP_NOW: 'Acquista ora',
  SIGN_UP: 'Iscriviti',
  GET_QUOTE: 'Richiedi preventivo',
  APPLY_NOW: 'Candidati ora',
};

const FIELD_LABEL = { FULL_NAME: 'Nome e cognome', EMAIL: 'Email', PHONE: 'Telefono', CITY: 'Città' };
const STEPS = ['Contenuto', 'Obiettivo e testi', 'Pubblico e budget', 'Conferma'];
const money = (n, c = 'EUR') => (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: c });

export function NewCampaignDialog({ clients, clientId: initialClient, itemId: initialItem, onClose, onDone }) {
  const [clientId, setClientId] = useState(initialClient ?? (clients?.length === 1 ? clients[0].id : ''));
  const [src, setSrc] = useState(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [step, setStep] = useState(0);

  // Scelte
  const [itemId, setItemId] = useState(initialItem ?? null);
  const [mediaIds, setMediaIds] = useState([]);
  const [objective, setObjective] = useState('contatti');
  const [placement, setPlacement] = useState('entrambi');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [button, setButton] = useState('GET_QUOTE');
  const [formId, setFormId] = useState(null);
  const [newForm, setNewForm] = useState(null);
  const [budget, setBudget] = useState(50);
  const [days, setDays] = useState(7);
  const [city, setCity] = useState(null);
  const [radius, setRadius] = useState(15);
  const [cities, setCities] = useState([]);
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState('tutti');

  // Scegliendo la scheda si precompilano testi, media e budget (se la scheda li ha già)
  const pickItem = (it, source = src) => {
    setItemId(it.id);
    const firstVideo = it.media.find((m) => m.kind === 'video');
    setMediaIds(firstVideo ? [firstVideo.id] : it.media.filter((m) => m.kind === 'image').slice(0, 10).map((m) => m.id));
    setName(it.title.slice(0, 120));
    setMessage(it.caption ?? '');
    setLink(it.ctaUrl ?? source?.client.website ?? '');
    if (it.adBudget) setBudget(it.adBudget);
    if (it.adDays) setDays(it.adDays);
    if (it.adObjective && NEW_OBJECTIVE[it.adObjective]) setObjective(it.adObjective);
  };

  const load = (id) =>
    startLoad(async () => {
      const r = await loadCampaignSources(Number(id));
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setSrc(r);
      setFormId(r.forms[0]?.id ?? null);
      if (!r.hasInstagram) setPlacement('facebook');
      // Aperta da una scheda: la si preseleziona con testi e media
      const start = initialItem && r.items.find((i) => i.id === initialItem);
      if (start) pickItem(start, r);
    });

  // Si ricarica solo quando cambia il cliente (load è ricreata a ogni render)
  useEffect(() => {
    if (clientId) load(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const item = src?.items.find((i) => i.id === itemId) ?? null;
  const currency = src?.client.currency ?? 'EUR';

  const toggleMedia = (m) => {
    if (m.kind === 'video') return setMediaIds([m.id]);
    setMediaIds((cur) => {
      const onlyImages = cur.filter((id) => item.media.find((x) => x.id === id)?.kind === 'image');
      return onlyImages.includes(m.id) ? onlyImages.filter((id) => id !== m.id) : [...onlyImages, m.id].slice(0, 10);
    });
  };

  const search = async (q) => {
    if (q.length < 2 || !clientId) return;
    const r = await findCities(Number(clientId), q);
    if (r.error) toast.error(r.error);
    setCities(r.cities ?? []);
  };

  const saveForm = () =>
    startSend(async () => {
      const r = await createLeadFormAction({
        clientId: Number(clientId),
        name: newForm.name,
        fields: newForm.fields,
        customQuestion: newForm.customQuestion || null,
        intro: newForm.intro || null,
        privacyUrl: newForm.privacyUrl,
        thankYou: newForm.thankYou || null,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.simulated ? 'Modulo registrato (simulazione)' : 'Modulo creato sulla Pagina Facebook');
      setNewForm(null);
      load(clientId);
      setFormId(r.id);
    });

  const launch = () =>
    startSend(async () => {
      const r = await startCampaign({
        clientId: Number(clientId),
        itemId,
        name,
        objective,
        placement,
        creative: { mediaIds, message, headline: headline || undefined, description: description || undefined, link, button: objective === 'contatti' && !BUTTONS[button] ? 'SIGN_UP' : button },
        leadFormId: objective === 'contatti' ? formId : null,
        budget: Number(budget),
        days: Number(days),
        city: city ? { key: city.key, name: city.name, radiusKm: Number(radius) } : null,
        ageMin: Number(ageMin),
        ageMax: Number(ageMax),
        gender,
      });
      if (r.error) {
        toast.error(r.error);
        setStep(2);
        return;
      }
      toast.success(r.simulated ? 'Campagna registrata (simulazione)' : 'Campagna avviata: Meta la revisiona e parte entro poco');
      onDone?.();
      onClose();
    });

  const capLeft = src?.client.monthlyCap != null ? Math.max(0, src.client.monthlyCap - src.client.spentMonth - src.client.committed) : null;
  const canNext = [
    !!src?.client.adAccountId && !!item && mediaIds.length > 0,
    name.trim().length >= 2 && message.trim().length > 0 && (objective !== 'traffico' || /^https?:\/\//.test(link)) && (objective !== 'contatti' || !!formId),
    Number(budget) >= 1 && Number(days) >= 1 && Number(ageMax) >= Number(ageMin) && (capLeft == null || capLeft >= Number(budget)),
    true,
  ][step];

  return (
    <Dialog open fullWidth maxWidth="md" onClose={sending ? undefined : onClose}>
      <DialogTitle>Nuova campagna</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3, mt: 1 }}>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {clients?.length > 1 && step === 0 && (
          <TextField select fullWidth size="small" label="Cliente" value={clientId} onChange={(e) => { setClientId(e.target.value); setSrc(null); setItemId(null); setMediaIds([]); }} sx={{ mb: 2 }}>
            {clients.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
        )}

        {loading && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Carico le schede del cliente…</Typography>}

        {src && !src.client.adAccountId && (
          <Alert severity="warning">Questo cliente non ha un account pubblicitario: impostalo in Canali → Sponsorizzate.</Alert>
        )}
        {src && src.client.adAccountId && !src.hasPage && (
          <Alert severity="warning" sx={{ mb: 2 }}>Meta richiede la Pagina Facebook del cliente per ogni inserzione: collegala in Canali (in simulazione si può provare lo stesso).</Alert>
        )}

        {/* 1 · Contenuto */}
        {src && step === 0 && src.client.adAccountId && (
          <Stack spacing={2}>
            {!src.items.length && <Alert severity="info">Nessuna scheda con foto o video: carica i media nella scheda del piano e torna qui.</Alert>}
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, maxHeight: 300, overflow: 'auto' }}>
              {src.items.map((it) => (
                <ButtonBase
                  key={it.id}
                  onClick={() => pickItem(it)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, p: 1, borderRadius: 1.5, border: 2, borderColor: it.id === itemId ? 'primary.main' : 'divider' }}
                >
                  <Box component={it.media[0]?.kind === 'video' ? 'video' : 'img'} src={it.media[0]?.url} muted sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0, bgcolor: 'background.neutral' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{it.title}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {it.format} · {it.media.length} media{it.isPaid ? ' · da sponsorizzare' : ''}
                    </Typography>
                  </Box>
                </ButtonBase>
              ))}
            </Box>
            {item && (
              <>
                <Typography variant="subtitle2">Media dell&apos;inserzione {mediaIds.length > 1 ? `(carosello di ${mediaIds.length})` : ''}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {item.media.map((m) => {
                    const n = mediaIds.indexOf(m.id);
                    return (
                      <ButtonBase key={m.id} onClick={() => toggleMedia(m)} sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', border: 2, borderColor: n >= 0 ? 'primary.main' : 'transparent' }}>
                        <Box component={m.kind === 'video' ? 'video' : 'img'} src={m.url} muted sx={{ width: 88, height: 88, objectFit: 'cover', display: 'block' }} />
                        {n >= 0 && <Label color="primary" sx={{ position: 'absolute', top: 4, left: 4 }}>{n + 1}</Label>}
                        {m.kind === 'video' && <Iconify icon="solar:play-circle-bold" sx={{ position: 'absolute', bottom: 4, right: 4, color: 'common.white' }} />}
                      </ButtonBase>
                    );
                  })}
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Una foto, un video, oppure da 2 a 10 foto per un carosello (l&apos;ordine è quello dei clic).</Typography>
              </>
            )}
          </Stack>
        )}

        {/* 2 · Obiettivo e testi */}
        {src && step === 1 && (
          <Grid container spacing={2}>
            <Grid size={12}>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
                {Object.entries(NEW_OBJECTIVE).map(([k, o]) => (
                  <ButtonBase
                    key={k}
                    onClick={() => { setObjective(k); if (k === 'contatti') setButton('GET_QUOTE'); else if (k === 'traffico') setButton('LEARN_MORE'); }}
                    sx={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', p: 1.5, borderRadius: 1.5, border: 2, borderColor: objective === k ? 'primary.main' : 'divider' }}
                  >
                    <Iconify icon={o.icon} sx={{ mb: 0.5 }} />
                    <Typography variant="subtitle2">{o.label}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{o.hint}</Typography>
                  </ButtonBase>
                ))}
              </Box>
            </Grid>
            <Grid size={12}>
              <ToggleButtonGroup exclusive size="small" value={placement} onChange={(_, v) => v && setPlacement(v)}>
                <ToggleButton value="facebook"><Iconify icon="socials:facebook" sx={{ mr: 1 }} />Facebook</ToggleButton>
                <ToggleButton value="instagram" disabled={!src.hasInstagram}><Iconify icon="socials:instagram" sx={{ mr: 1 }} />Instagram</ToggleButton>
                <ToggleButton value="entrambi" disabled={!src.hasInstagram}>Entrambi</ToggleButton>
              </ToggleButtonGroup>
              {!src.hasInstagram && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>Instagram non è collegato per questo cliente: solo Facebook.</Typography>}
            </Grid>
            <Grid size={12}>
              <TextField fullWidth size="small" label="Nome della campagna (interno)" value={name} onChange={(e) => setName(e.target.value)} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth multiline minRows={3} label="Testo dell'inserzione" value={message} onChange={(e) => setMessage(e.target.value)} helperText={`${message.length} caratteri · i primi 125 caratteri si vedono senza «Altro»`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Titolo (facoltativo)" value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, 60))} helperText={`${headline.length}/60`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Descrizione (facoltativa)" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 90))} helperText={`${description.length}/90`} />
            </Grid>
            {objective !== 'contatti' && (
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField fullWidth size="small" label={objective === 'traffico' ? 'Link di destinazione' : 'Link (facoltativo)'} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" error={objective === 'traffico' && !!link && !/^https?:\/\//.test(link)} />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: objective === 'contatti' ? 12 : 4 }}>
              <TextField select fullWidth size="small" label="Pulsante" value={button} onChange={(e) => setButton(e.target.value)}>
                {Object.entries(BUTTONS).map(([k, l]) => (
                  <MenuItem key={k} value={k}>{l}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {objective === 'contatti' && (
              <Grid size={12}>
                <LeadFormPicker src={src} formId={formId} setFormId={setFormId} newForm={newForm} setNewForm={setNewForm} saveForm={saveForm} sending={sending} />
              </Grid>
            )}
          </Grid>
        )}

        {/* 3 · Pubblico e budget */}
        {src && step === 2 && (
          <Grid container spacing={2}>
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
            <Grid size={{ xs: 4 }}>
              <TextField fullWidth type="number" label="Età da" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} slotProps={{ htmlInput: { min: 18, max: 65 } }} />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField fullWidth type="number" label="Età fino a" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} slotProps={{ htmlInput: { min: 18, max: 65 } }} helperText="65 = anche oltre" />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField select fullWidth label="Sesso" value={gender} onChange={(e) => setGender(e.target.value)}>
                <MenuItem value="tutti">Tutti</MenuItem>
                <MenuItem value="donne">Donne</MenuItem>
                <MenuItem value="uomini">Uomini</MenuItem>
              </TextField>
            </Grid>
            {capLeft != null && (
              <Grid size={12}>
                <Alert severity={capLeft < Number(budget) ? 'error' : 'info'}>
                  Tetto mensile del cliente: restano {money(capLeft)} su {money(src.client.monthlyCap)}.
                </Alert>
              </Grid>
            )}
          </Grid>
        )}

        {/* 4 · Conferma */}
        {src && step === 3 && (
          <Stack spacing={2}>
            <Alert severity={src.client.payer === 'golduck' ? 'warning' : 'info'} icon={<Iconify icon="solar:wad-of-money-bold" />}>
              {src.client.payer === 'golduck' ? (
                <>
                  <strong>Paga Golduck</strong> con l&apos;account «{src.client.adAccountName}». La spesa (fino a {money(budget, currency)}) verrà rifatturata al cliente con ricarico ×
                  {src.client.markup}: fino a <strong>{money(Number(budget) * src.client.markup, currency)}</strong>.
                </>
              ) : (
                <>
                  <strong>Paga il cliente</strong> con il suo account «{src.client.adAccountName}»: Meta addebita fino a <strong>{money(budget, currency)}</strong> sul suo metodo di pagamento.
                </>
              )}
            </Alert>
            <Typography variant="body2">
              <strong>{name}</strong> · {NEW_OBJECTIVE[objective].label} su {placement === 'entrambi' ? 'Facebook e Instagram' : placement === 'facebook' ? 'Facebook' : 'Instagram'} per {days} giorni ·{' '}
              {city ? `${city.name} +${radius} km` : 'tutta Italia'} · {ageMin}-{ageMax} anni{gender !== 'tutti' ? ` · ${gender}` : ''} · {mediaIds.length > 1 ? `carosello di ${mediaIds.length} foto` : item?.media.find((m) => m.id === mediaIds[0])?.kind === 'video' ? 'video' : 'una foto'}.
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Meta controlla l&apos;inserzione prima di avviarla (di solito pochi minuti). Si può mettere in pausa o terminare quando vuoi: si paga solo quanto speso.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={step ? () => setStep(step - 1) : onClose} disabled={sending}>{step ? 'Indietro' : 'Annulla'}</Button>
        {step < 3 ? (
          <Button variant="contained" onClick={() => setStep(step + 1)} disabled={!canNext || !!newForm}>Continua</Button>
        ) : (
          <Button variant="contained" color={src?.client.payer === 'golduck' ? 'warning' : 'primary'} onClick={launch} loading={sending} startIcon={<Iconify icon="carbon:rocket" />}>
            Avvia la campagna
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Modulo contatti: si sceglie uno esistente o se ne crea uno nuovo sulla Pagina del cliente.

function LeadFormPicker({ src, formId, setFormId, newForm, setNewForm, saveForm, sending }) {
  const site = (src.client.website ?? '').replace(/\/+$/, '');
  const empty = { name: '', fields: ['FULL_NAME', 'EMAIL', 'PHONE'], customQuestion: '', intro: '', privacyUrl: site ? `${site}/privacy` : '', thankYou: '' };

  if (newForm) {
    const set = (k, v) => setNewForm({ ...newForm, [k]: v });
    const valid = newForm.name.trim().length >= 2 && /^https?:\/\/.+/.test(newForm.privacyUrl) && (newForm.fields.length || newForm.customQuestion.trim());
    return (
      <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Nuovo modulo contatti</Typography>
        <Grid container spacing={1.5}>
          <Grid size={12}>
            <TextField fullWidth size="small" label="Nome del modulo" value={newForm.name} onChange={(e) => set('name', e.target.value)} placeholder="es. Preventivo giardino" />
          </Grid>
          <Grid size={12}>
            {Object.entries(FIELD_LABEL).map(([k, l]) => (
              <FormControlLabel
                key={k}
                label={l}
                control={<Checkbox size="small" checked={newForm.fields.includes(k)} onChange={(e) => set('fields', e.target.checked ? [...newForm.fields, k] : newForm.fields.filter((f) => f !== k))} />}
              />
            ))}
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>Meta precompila questi campi con i dati del profilo: meno fatica, più contatti.</Typography>
          </Grid>
          <Grid size={12}>
            <TextField fullWidth size="small" label="Domanda libera (facoltativa)" value={newForm.customQuestion} onChange={(e) => set('customQuestion', e.target.value)} placeholder="es. Che lavoro ti serve?" />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth size="small" multiline minRows={2} label="Introduzione (facoltativa)" value={newForm.intro} onChange={(e) => set('intro', e.target.value)} placeholder="es. Compila in 10 secondi: ti richiamiamo entro un giorno lavorativo" />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              size="small"
              label="Informativa privacy del cliente"
              value={newForm.privacyUrl}
              onChange={(e) => set('privacyUrl', e.target.value)}
              helperText="Obbligatoria per Meta: deve essere la privacy del cliente (chi riceve i dati), non quella di Golduck"
              error={!!newForm.privacyUrl && !/^https?:\/\/.+/.test(newForm.privacyUrl)}
            />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth size="small" label="Messaggio di ringraziamento (facoltativo)" value={newForm.thankYou} onChange={(e) => set('thankYou', e.target.value)} />
          </Grid>
        </Grid>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
          <Button size="small" onClick={() => setNewForm(null)} disabled={sending}>Annulla</Button>
          <Button size="small" variant="contained" onClick={saveForm} disabled={!valid} loading={sending}>Crea il modulo</Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <TextField
        select
        fullWidth
        size="small"
        label="Modulo contatti"
        value={formId ?? ''}
        onChange={(e) => setFormId(Number(e.target.value))}
        helperText={src.forms.length ? 'I contatti arrivano nei Lead del cliente con fonte Meta Ads' : 'Nessun modulo: creane uno'}
      >
        {src.forms.map((f) => (
          <MenuItem key={f.id} value={f.id}>
            {f.name} · {f.fields.map((x) => FIELD_LABEL[x]).join(', ')}{f.customQuestion ? ' + domanda' : ''}{f.simulated ? ' (simulazione)' : ''} · {f.leadsCount} contatti
          </MenuItem>
        ))}
      </TextField>
      <Button variant="outlined" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setNewForm(empty)} sx={{ flexShrink: 0 }}>
        Nuovo modulo
      </Button>
    </Stack>
  );
}
