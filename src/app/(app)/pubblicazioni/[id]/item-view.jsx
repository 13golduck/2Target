'use client';

import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import FormControlLabel from '@mui/material/FormControlLabel';

import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { saveItem, deleteItem } from '../../actions';

// ----------------------------------------------------------------------

const L = {
  status: { bozza: 'Bozza', da_approvare: 'Da approvare', approvato: 'Approvato', pubblicato: 'Pubblicato', annullato: 'Annullato' },
  production: { da_fare: 'Da fare', materiale_richiesto: 'Materiale richiesto al cliente', in_montaggio: 'In montaggio', pronto: 'Pronto' },
  destination: { sito: 'Sito web', telefono: 'Telefono', whatsapp: 'WhatsApp', direct: 'Messaggio diretto', modulo: 'Modulo contatti', nessuna: 'Nessuna' },
  objective: { notorieta: 'Notorietà', traffico: 'Traffico', interazione: 'Interazione', contatti: 'Contatti (lead)', messaggi: 'Messaggi', chiamate: 'Chiamate', vendite: 'Vendite' },
  source: { cliente: 'Gira il cliente', golduck: 'Giriamo noi', ai: 'Immagine AI', stock: 'Stock' },
};
const STATUS_COLOR = { bozza: 'default', da_approvare: 'warning', approvato: 'info', pubblicato: 'success', annullato: 'error' };

export function ItemView({ saved, client, item, issues, series, personas, options }) {
  const [isPaid, setIsPaid] = useState(item.isPaid);
  const [destination, setDestination] = useState(item.ctaDestination ?? '');
  const [caption, setCaption] = useState(item.caption ?? '');
  const [hashtags, setHashtags] = useState(item.hashtags ?? '');
  const [shots, setShots] = useState(item.shotList.length ? item.shotList : [{ scena: '', fonte: 'cliente' }]);

  const notified = useRef(false);
  useEffect(() => {
    if (saved && !notified.current) {
      notified.current = true;
      toast.success('Scheda salvata');
    }
  }, [saved]);

  const errors = issues.filter((i) => i.level === 'errore');
  const warnings = issues.filter((i) => i.level === 'avviso');
  const suggested = destination ? options.buttonsByDestination[destination] ?? [] : options.buttons;

  return (
    <DashboardContent maxWidth="xl">
      <Box component="form" action={saveItem}>
        <input type="hidden" name="id" value={item.id} />

        <CustomBreadcrumbs
          heading={item.title}
          links={[
            { name: 'Clienti', href: '/' },
            { name: client.name, href: `/clienti/${client.id}` },
            { name: 'Piano editoriale', href: `/clienti/${client.id}/piano${item.planId ? `?piano=${item.planId}` : ''}` },
            { name: 'Scheda' },
          ]}
          action={
            <Stack direction="row" spacing={1}>
              <Button type="submit" formAction={deleteItem} formNoValidate color="error" startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}>
                Elimina
              </Button>
              <Button type="submit" variant="contained" startIcon={<Iconify icon="eva:checkmark-fill" />}>
                Salva scheda
              </Button>
            </Stack>
          }
          sx={{ mb: 3 }}
        />

        <Grid container spacing={3}>
          {/* Colonna principale */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={3}>
              <Card>
                <CardHeader title="Contenuto" subheader="Cosa si vede e cosa si dice" />
                <Stack spacing={2.5} sx={{ p: 3 }}>
                  <TextField name="title" label="Titolo" defaultValue={item.title} required fullWidth />
                  <TextField name="hook" label="Hook · prima frase o primi 3 secondi" defaultValue={item.hook ?? ''} multiline minRows={2} fullWidth />
                  <TextField name="layoutNotes" label="Idea di layout · grafica, slide, inquadrature" defaultValue={item.layoutNotes ?? ''} multiline minRows={3} fullWidth />
                  <TextField
                    name="script"
                    label="Script / voiceover · cosa deve dire"
                    defaultValue={item.script ?? ''}
                    multiline
                    minRows={6}
                    fullWidth
                    slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 14 } } }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField name="onScreenText" label="Testo a schermo" defaultValue={item.onScreenText ?? ''} multiline minRows={2} fullWidth />
                    <TextField name="audioNotes" label="Audio / musica" defaultValue={item.audioNotes ?? ''} multiline minRows={2} fullWidth />
                  </Stack>
                </Stack>
              </Card>

              <Card>
                <CardHeader title="Clip da girare / immagini" subheader="Una riga per scena, con chi la produce" />
                <Stack spacing={1.5} sx={{ p: 3 }}>
                  {shots.map((r, i) => (
                    <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                      <Label color="default" sx={{ minWidth: 28 }}>{i + 1}</Label>
                      <TextField name="shot_scena" label="Scena" defaultValue={r.scena} size="small" sx={{ flex: 1.2 }} />
                      <TextField name="shot_descrizione" label="Cosa si vede" defaultValue={r.descrizione ?? ''} size="small" sx={{ flex: 2 }} />
                      <TextField name="shot_durata" label="Sec." defaultValue={r.durata_s ?? ''} size="small" sx={{ width: 80 }} />
                      <TextField select name="shot_fonte" label="Chi" defaultValue={r.fonte} size="small" sx={{ width: 170 }}>
                        {Object.entries(L.source).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                      </TextField>
                      <IconButton onClick={() => setShots(shots.filter((_, n) => n !== i))} aria-label="Togli scena">
                        <Iconify icon="mingcute:close-line" />
                      </IconButton>
                    </Stack>
                  ))}
                  <Box>
                    <Button size="small" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setShots([...shots, { scena: '', fonte: 'cliente' }])}>
                      Aggiungi scena
                    </Button>
                  </Box>
                </Stack>
              </Card>

              <Card>
                <CardHeader title="Testo e invito all'azione" />
                <Grid container spacing={3} sx={{ p: 3 }}>
                  <Grid size={{ xs: 12, lg: 7 }}>
                    <Stack spacing={2.5}>
                      <TextField name="caption" label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} multiline minRows={6} fullWidth helperText={`${caption.length} / 2.200 caratteri`} />
                      <TextField name="hashtags" label="Hashtag · separati da spazio" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#architetto #ristrutturazione" fullWidth />
                      <TextField name="cta" label="CTA · invito all'azione nel testo" defaultValue={item.cta ?? ''} placeholder="es. Chiamami per una prima consulenza" fullWidth />
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField select name="ctaDestination" label="Dove porta la CTA" value={destination} onChange={(e) => setDestination(e.target.value)} fullWidth>
                          <MenuItem value="">—</MenuItem>
                          {Object.entries(L.destination).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                        </TextField>
                        <TextField name="ctaUrl" label="Link o numero" defaultValue={item.ctaUrl ?? ''} placeholder="https://… oppure +39…" fullWidth />
                      </Stack>
                      <TextField name="referencesUrls" label="Riferimenti · competitor, ispirazioni (un link per riga)" defaultValue={item.referencesUrls ?? ''} multiline minRows={2} fullWidth />
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, lg: 5 }}>
                    <Preview clientName={client.name} format={item.format} caption={caption} hashtags={hashtags} />
                  </Grid>
                </Grid>
              </Card>
            </Stack>
          </Grid>

          {/* Colonna laterale */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={3}>
              <Card sx={{ p: 3 }}>
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Controlli</Typography>
                  {issues.length === 0 ? (
                    <Alert severity="success">Scheda completa</Alert>
                  ) : (
                    <>
                      {errors.map((i) => <Alert key={i.message} severity="error" sx={{ py: 0 }}>{i.message}</Alert>)}
                      {warnings.map((i) => <Alert key={i.message} severity="warning" sx={{ py: 0 }}>{i.message}</Alert>)}
                    </>
                  )}
                </Stack>
              </Card>

              <Card>
                <CardHeader title="Pubblicazione" action={<Label color={STATUS_COLOR[item.status]}>{L.status[item.status]}</Label>} />
                <Stack spacing={2.5} sx={{ p: 3 }}>
                  <TextField select name="status" label="Stato" defaultValue={item.status} fullWidth>
                    {Object.entries(L.status).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </TextField>
                  <TextField name="scheduledAt" type="datetime-local" label="Data e ora (ora italiana)" defaultValue={item.scheduledAt} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                  <Stack direction="row" spacing={2}>
                    <TextField select name="format" label="Formato" defaultValue={item.format} fullWidth>
                      {options.formats.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </TextField>
                    <TextField select name="platform" label="Piattaforma" defaultValue={item.platform} fullWidth>
                      {options.platforms.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Ripubblica anche su</Typography>
                    <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
                      {['instagram', 'facebook', 'tiktok', 'linkedin'].map((p) => (
                        <FormControlLabel key={p} control={<Checkbox name="crossPost" value={p} defaultChecked={item.crossPost.includes(p)} size="small" />} label={p} />
                      ))}
                    </Stack>
                  </Box>
                  <TextField select name="stage" label="Fase del funnel" defaultValue={item.stage ?? ''} fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {options.stages.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
                  </TextField>
                  <TextField select name="seriesId" label="Rubrica" defaultValue={item.seriesId ?? ''} fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {series.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
                  </TextField>
                  <TextField select name="personaId" label="Buyer persona" defaultValue={item.personaId ?? ''} fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {personas.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
                  </TextField>
                </Stack>
              </Card>

              <Card>
                <CardHeader title="Produzione" />
                <Stack spacing={2} sx={{ p: 3 }}>
                  <TextField select name="productionStatus" label="Stato produzione" defaultValue={item.productionStatus} fullWidth>
                    {Object.entries(L.production).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </TextField>
                  <FormControlLabel control={<Checkbox name="needsClientMaterial" defaultChecked={item.needsClientMaterial} />} label="Serve materiale dal cliente" />
                  <TextField name="productionNotes" label="Note di produzione" defaultValue={item.productionNotes ?? ''} placeholder="Cosa chiedere, immagini AI, render…" multiline minRows={3} fullWidth />
                </Stack>
              </Card>

              <Card sx={{ border: isPaid ? 2 : 0, borderColor: 'primary.main' }}>
                <CardHeader
                  title="Sponsorizzata"
                  avatar={<Iconify icon="solar:wad-of-money-bold" sx={{ color: isPaid ? 'primary.main' : 'text.disabled' }} />}
                  action={<Switch name="isPaid" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />}
                />
                <Stack spacing={2.5} sx={{ p: 3, display: isPaid ? 'flex' : 'none' }}>
                  <TextField select name="adObjective" label="Obiettivo" defaultValue={item.adObjective ?? ''} fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {Object.entries(L.objective).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </TextField>
                  <Autocomplete
                    freeSolo
                    options={suggested}
                    defaultValue={item.adButton ?? ''}
                    renderInput={(params) => (
                      <TextField {...params} name="adButton" label="Pulsante dell'inserzione" helperText={destination ? `Consigliati per «${L.destination[destination]}»` : 'Scegli prima dove porta la CTA'} />
                    )}
                  />
                  <Stack direction="row" spacing={2}>
                    <TextField name="adBudget" label="Budget €" defaultValue={item.adBudget ?? ''} fullWidth />
                    <TextField name="adDays" label="Giorni" defaultValue={item.adDays ?? ''} fullWidth />
                  </Stack>
                  <TextField name="adAudience" label="Pubblico · zona, età, interessi" defaultValue={item.adAudience ?? ''} multiline minRows={2} fullWidth />
                </Stack>
              </Card>

              <Card>
                <CardHeader title="Note" />
                <Stack spacing={2} sx={{ p: 3 }}>
                  <TextField name="internalNotes" label="Note interne" defaultValue={item.internalNotes ?? ''} multiline minRows={2} fullWidth />
                  <TextField name="publishedUrl" label="Link al post pubblicato" defaultValue={item.publishedUrl ?? ''} fullWidth />
                </Stack>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------
// Anteprima indicativa di come appare il post nel feed

function Preview({ clientName, format, caption, hashtags }) {
  const handle = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>
      <Stack direction="row" spacing={1} sx={{ p: 1.5, alignItems: 'center' }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)' }} />
        <Typography variant="subtitle2">{handle}</Typography>
        <Box sx={{ flex: 1 }} />
        <Label variant="outlined">{format}</Label>
      </Stack>
      <Box sx={{ aspectRatio: format === 'reel' || format === 'storia' ? '9 / 12' : '1 / 1', bgcolor: 'background.neutral', display: 'grid', placeItems: 'center' }}>
        <Iconify icon={format === 'reel' || format === 'video' ? 'solar:play-circle-bold' : 'solar:gallery-wide-bold'} width={48} sx={{ color: 'text.disabled' }} />
      </Box>
      <Divider />
      <Box sx={{ p: 1.5, maxHeight: 220, overflow: 'auto' }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          <b>{handle}</b> {caption || <Box component="span" sx={{ color: 'text.disabled' }}>La caption apparirà qui…</Box>}
        </Typography>
        {hashtags && (
          <Typography variant="body2" sx={{ color: 'info.dark', mt: 0.5 }}>
            {hashtags}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
