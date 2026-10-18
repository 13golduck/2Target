'use client';

import { useRef, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Tabs from '@mui/material/Tabs';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import ToggleButton from '@mui/material/ToggleButton';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { BriefPanel } from './brief-panel';
import { PublishPanel } from './publish-panel';
import { SponsorPanel } from './sponsor-panel';
import { PostPreview } from './post-preview';
import { DesignReviewPanel } from '../../design-review-panel';
import { saveItem, deleteItem } from '../../actions';
import { PLATFORM_INFO } from 'src/lib/platforms';

// ----------------------------------------------------------------------
// Editor della pubblicazione: a sinistra il contenuto diviso in schede, a destra l'anteprima dal vivo,
// la pianificazione e i controlli (sempre visibili). Un solo modulo: le schede nascoste restano nel modulo e si salvano.

const L = {
  status: { bozza: 'Bozza', da_approvare: 'Da approvare', approvato: 'Approvato', pubblicato: 'Pubblicato', annullato: 'Annullato' },
  production: { da_fare: 'Da fare', materiale_richiesto: 'Materiale richiesto al cliente', in_montaggio: 'In montaggio', pronto: 'Pronto' },
  destination: { sito: 'Sito web', telefono: 'Telefono', whatsapp: 'WhatsApp', direct: 'Messaggio diretto', modulo: 'Modulo contatti', nessuna: 'Nessuna' },
  objective: { notorieta: 'Notorietà', traffico: 'Traffico', interazione: 'Interazione', contatti: 'Contatti (lead)', messaggi: 'Messaggi', chiamate: 'Chiamate', vendite: 'Vendite' },
  source: { cliente: 'Gira il cliente', golduck: 'Giriamo noi', ai: 'Immagine AI', stock: 'Stock' },
};
const FLOW = ['bozza', 'da_approvare', 'approvato', 'pubblicato'];
/** Piattaforme su cui la scheda può uscire anche, oltre al social principale. */
const CROSS_POST_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'threads', 'pinterest', 'youtube', 'business_profile'];

// In quale scheda sta il campo citato da un controllo (per portarci con un clic)
const ISSUE_TAB = [
  [/caption|hashtag|cta|destinazione|link|hook/i, 'testo'],
  [/sponsorizzat|pulsante|budget|durata|pubblico/i, 'sponsor'],
  [/clip|scena|script|layout/i, 'script'],
  [/materiale|produzione/i, 'produzione'],
];
const tabOf = (message) => ISSUE_TAB.find(([re]) => re.test(message))?.[1] ?? null;

export function ItemView({ saved, client, item, issues, series, personas, options, design, publishing, sponsoring, bestTimes, feedback }) {
  const [tab, setTab] = useState('testo');
  const [status, setStatus] = useState(item.status);
  const [isPaid, setIsPaid] = useState(item.isPaid);
  const [destination, setDestination] = useState(item.ctaDestination ?? '');
  const [caption, setCaption] = useState(item.caption ?? '');
  const [hashtags, setHashtags] = useState(item.hashtags ?? '');
  const [format, setFormat] = useState(item.format);
  const [platform, setPlatform] = useState(item.platform);
  const [scheduledAt, setScheduledAt] = useState(item.scheduledAt ?? '');
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
  const countFor = (t) => errors.filter((i) => tabOf(i.message) === t).length;

  // Propone il prossimo giorno con quell'orario a partire dalla data scelta (o da oggi)
  const pickTime = (slot) => {
    const from = scheduledAt ? new Date(scheduledAt) : new Date();
    const d = new Date(from);
    d.setHours(slot.hour, 0, 0, 0);
    while (d.getDay() !== slot.day || d < new Date()) d.setDate(d.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
  };

  const TABS = [
    { value: 'testo', label: 'Testo', icon: 'solar:pen-bold' },
    { value: 'script', label: 'Script e riprese', icon: 'solar:videocamera-record-bold' },
    { value: 'produzione', label: 'Produzione', icon: 'solar:box-minimalistic-bold' },
    { value: 'sponsor', label: 'Sponsorizzata', icon: 'solar:wad-of-money-bold' },
    { value: 'note', label: 'Note', icon: 'solar:notes-bold-duotone' },
  ];
  const panel = (value) => ({ sx: { display: tab === value ? 'block' : 'none', p: 3 } });

  return (
    <DashboardContent maxWidth="xl">
      <Box component="form" action={saveItem}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="status" value={status} />

        <CustomBreadcrumbs
          heading={item.title}
          links={[
            { name: client.name, href: `/clienti/${client.id}` },
            { name: 'Piano editoriale', href: `/clienti/${client.id}/piano${item.planId ? `?piano=${item.planId}` : ''}` },
            { name: 'Pubblicazione' },
          ]}
          action={
            <Stack direction="row" spacing={1}>
              <Button type="submit" formAction={deleteItem} formNoValidate color="error" startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}>
                Elimina
              </Button>
              <Button type="submit" variant="contained" startIcon={<Iconify icon="eva:checkmark-fill" />}>
                Salva
              </Button>
            </Stack>
          }
          sx={{ mb: 2 }}
        />

        {/* Stato: un passo alla volta, come nei flussi di approvazione di Planable e Sprout */}
        <Card sx={{ mb: 3, px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary', mr: 1 }}>Stato</Typography>
            {FLOW.map((s, n) => {
              const reached = FLOW.indexOf(status) >= n && status !== 'annullato';
              return (
                <Stack key={s} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {n > 0 && <Box sx={{ width: 24, height: 2, bgcolor: reached ? 'primary.main' : 'divider' }} />}
                  <Chip
                    label={L.status[s]}
                    onClick={() => setStatus(s)}
                    color={status === s ? 'primary' : 'default'}
                    variant={reached ? 'filled' : 'outlined'}
                    icon={reached && status !== s ? <Iconify icon="eva:checkmark-fill" width={16} /> : undefined}
                    sx={{ fontWeight: 600 }}
                  />
                </Stack>
              );
            })}
            <Box sx={{ flex: 1 }} />
            <Chip
              size="small"
              label="Annullato"
              onClick={() => setStatus(status === 'annullato' ? 'bozza' : 'annullato')}
              color={status === 'annullato' ? 'error' : 'default'}
              variant={status === 'annullato' ? 'filled' : 'outlined'}
            />
            {status !== item.status && <Label color="warning">Da salvare</Label>}
          </Stack>
        </Card>

        <Grid container spacing={3}>
          {/* Contenuto */}
          <Grid size={{ xs: 12, md: 7, lg: 8 }}>
            <Card>
              <Box sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
                  {TABS.filter((t) => t.value !== 'script' || ['reel', 'video', 'storia', 'carosello'].includes(format) || item.script || item.shotList.length).map((t) => (
                    <Tab
                      key={t.value}
                      value={t.value}
                      iconPosition="start"
                      icon={
                        <Badge color="error" badgeContent={countFor(t.value)} invisible={!countFor(t.value)}>
                          <Iconify icon={t.icon} />
                        </Badge>
                      }
                      label={t.value === 'sponsor' && isPaid ? 'Sponsorizzata · attiva' : t.label}
                    />
                  ))}
                </Tabs>
              </Box>

              <Box {...panel('testo')}>
                <Stack spacing={2.5}>
                  <TextField name="title" label="Titolo (interno)" defaultValue={item.title} required fullWidth />
                  <TextField name="hook" label="Hook · prima frase o primi 3 secondi" defaultValue={item.hook ?? ''} multiline minRows={2} fullWidth />
                  <TextField
                    name="caption"
                    label="Caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    multiline
                    minRows={7}
                    fullWidth
                    helperText={`${caption.length} / 2.200 caratteri${caption.length > 125 ? ' · su Instagram dopo 125 caratteri compare «altro»' : ''}`}
                    error={caption.length > 2200}
                  />
                  <TextField name="hashtags" label="Hashtag · separati da spazio" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#architetto #ristrutturazione" fullWidth helperText={`${hashtags.split(/\s+/).filter((h) => h.startsWith('#')).length} hashtag`} />
                  <TextField
                    name="firstComment"
                    label="Primo commento · facoltativo"
                    defaultValue={item.firstComment ?? ''}
                    multiline
                    minRows={2}
                    fullWidth
                    helperText="Esce come primo commento subito dopo il post, su Instagram e Facebook (non nelle storie): utile per hashtag o link."
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
                    <TextField
                      name="collaborators"
                      label="Coautori Instagram · facoltativo"
                      defaultValue={(item.collaborators ?? []).map((c) => `@${c}`).join(', ')}
                      placeholder="@studio.rossi, @mario_bianchi"
                      fullWidth
                      helperText="Fino a 3 profili: il post compare anche sul loro profilo se accettano l'invito."
                    />
                    <FormControlLabel
                      control={<Switch name="evergreen" defaultChecked={item.evergreen} />}
                      label="Sempre valido"
                      title="Dopo 3 mesi dall'uscita 2Target lo propone da riproporre nel piano"
                      sx={{ flexShrink: 0 }}
                    />
                    <FormControlLabel
                      control={<Switch name="tagLocation" defaultChecked={item.tagLocation} />}
                      label="Tagga la sede"
                      title="Su Instagram il post riporta il luogo della Pagina Facebook collegata (serve un indirizzo sulla Pagina)"
                      sx={{ flexShrink: 0 }}
                    />
                  </Stack>
                  <TextField name="cta" label="CTA · invito all'azione nel testo" defaultValue={item.cta ?? ''} placeholder="es. Chiamami per una prima consulenza" fullWidth />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField select name="ctaDestination" label="Dove porta la CTA" value={destination} onChange={(e) => setDestination(e.target.value)} fullWidth>
                      <MenuItem value="">—</MenuItem>
                      {Object.entries(L.destination).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                    </TextField>
                    <TextField name="ctaUrl" label="Link o numero" defaultValue={item.ctaUrl ?? ''} placeholder="https://… oppure +39…" fullWidth />
                  </Stack>
                </Stack>
              </Box>

              <Box {...panel('script')}>
                <Stack spacing={2.5}>
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
                  <Divider />
                  <Typography variant="subtitle2">Clip da girare / immagini</Typography>
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
              </Box>

              <Box {...panel('produzione')}>
                <Stack spacing={2.5}>
                  <TextField select name="productionStatus" label="Stato produzione" defaultValue={item.productionStatus} fullWidth>
                    {Object.entries(L.production).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </TextField>
                  <FormControlLabel control={<Checkbox name="needsClientMaterial" defaultChecked={item.needsClientMaterial} />} label="Serve materiale dal cliente (compare in «Oggi» finché non è pronto)" />
                  <TextField name="productionNotes" label="Note di produzione" defaultValue={item.productionNotes ?? ''} placeholder="Cosa chiedere, immagini AI, render…" multiline minRows={3} fullWidth />
                  <TextField name="referencesUrls" label="Riferimenti · competitor, ispirazioni (un link per riga)" defaultValue={item.referencesUrls ?? ''} multiline minRows={2} fullWidth />
                </Stack>
              </Box>

              <Box {...panel('sponsor')}>
                <FormControlLabel
                  control={<Switch name="isPaid" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />}
                  label={isPaid ? 'Contenuto da sponsorizzare' : 'Non sponsorizzato · attiva per pianificare budget e pubblico'}
                />
                <Stack spacing={2.5} sx={{ mt: 2, display: isPaid ? 'flex' : 'none' }}>
                  <TextField select name="adObjective" label="Obiettivo" defaultValue={item.adObjective ?? ''} fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {Object.entries(L.objective).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </TextField>
                  <Autocomplete
                    freeSolo
                    options={suggested}
                    defaultValue={item.adButton ?? ''}
                    renderInput={(params) => (
                      <TextField {...params} name="adButton" label="Pulsante dell'inserzione" helperText={destination ? `Consigliati per «${L.destination[destination]}»` : 'Scegli prima dove porta la CTA (scheda Testo)'} />
                    )}
                  />
                  <Stack direction="row" spacing={2}>
                    <TextField name="adBudget" label="Budget €" defaultValue={item.adBudget ?? ''} fullWidth />
                    <TextField name="adDays" label="Giorni" defaultValue={item.adDays ?? ''} fullWidth />
                  </Stack>
                  <TextField name="adAudience" label="Pubblico · zona, età, interessi" defaultValue={item.adAudience ?? ''} multiline minRows={2} fullWidth />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Qui si pianifica. La sponsorizzata vera si avvia dopo la pubblicazione, dal riquadro «Sponsorizzate» più in basso.
                  </Typography>
                </Stack>
              </Box>

              <Box {...panel('note')}>
                <Stack spacing={2.5}>
                  <TextField name="internalNotes" label="Note interne" defaultValue={item.internalNotes ?? ''} multiline minRows={3} fullWidth />
                  <TextField name="publishedUrl" label="Link al post pubblicato" defaultValue={item.publishedUrl ?? ''} fullWidth />
                </Stack>
              </Box>
            </Card>
          </Grid>

          {/* Anteprima, pianificazione e controlli: restano visibili mentre si scrive */}
          <Grid size={{ xs: 12, md: 5, lg: 4 }}>
            <Stack spacing={3} sx={{ position: { md: 'sticky' }, top: { md: 88 } }}>
              <PostPreview
                clientName={client.name}
                logo={client.logo}
                format={format}
                platform={platform}
                caption={caption}
                hashtags={hashtags}
                media={publishing.media}
                channels={publishing.channels}
              />

              {feedback?.length > 0 && (
                <Card sx={{ p: 2.5, border: 2, borderColor: feedback[0].decision === 'modifiche' ? 'warning.main' : 'success.main' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Risposte del cliente</Typography>
                  <Stack spacing={1}>
                    {feedback.map((f) => (
                      <Box key={f.id}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Label color={f.decision === 'approvato' ? 'success' : f.decision === 'modifiche' ? 'warning' : 'info'}>
                            {f.decision === 'approvato' ? 'Approvato' : f.decision === 'modifiche' ? 'Modifiche' : 'Commento'}
                          </Label>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {f.author} · {new Date(f.createdAt).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Stack>
                        {f.message && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{f.message}</Typography>}
                      </Box>
                    ))}
                  </Stack>
                </Card>
              )}

              <Card>
                <CardHeader title="Pianificazione" sx={{ pb: 0 }} />
                <Stack spacing={2} sx={{ p: 3 }}>
                  <TextField
                    name="scheduledAt"
                    type="datetime-local"
                    label="Data e ora (ora italiana)"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                  />
                  {bestTimes?.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                      <Tooltip title="Calcolati sulle interazioni medie dei post del cliente negli ultimi 6 mesi">
                        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>Orari migliori:</Typography>
                      </Tooltip>
                      {bestTimes.map((b) => (
                        <Chip key={b.label} size="small" variant="outlined" label={b.label} onClick={() => pickTime(b)} icon={<Iconify icon="solar:clock-circle-bold" width={14} />} />
                      ))}
                    </Stack>
                  )}
                  <Stack direction="row" spacing={2}>
                    <TextField select name="format" label="Formato" value={format} onChange={(e) => setFormat(e.target.value)} fullWidth>
                      {options.formats.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </TextField>
                    <TextField select name="platform" label="Social principale" value={platform} onChange={(e) => setPlatform(e.target.value)} fullWidth>
                      {options.platforms.map((p) => <MenuItem key={p} value={p}>{PLATFORM_INFO[p]?.label ?? p}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Pubblica anche su</Typography>
                    <ToggleButtonGroup size="small" sx={{ display: 'flex', flexWrap: 'wrap', mt: 0.5 }}>
                      {CROSS_POST_PLATFORMS.map((p) => (
                        <CrossPost key={p} platform={p} defaultChecked={item.crossPost.includes(p)} disabled={p === platform} />
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                  <TextField select name="stage" label="Fase del funnel" defaultValue={item.stage ?? ''} size="small" fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {options.stages.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
                  </TextField>
                  <Stack direction="row" spacing={2}>
                    <TextField select name="seriesId" label="Rubrica" defaultValue={item.seriesId ?? ''} size="small" fullWidth>
                      <MenuItem value="">—</MenuItem>
                      {series.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
                    </TextField>
                    <TextField select name="personaId" label="Buyer persona" defaultValue={item.personaId ?? ''} size="small" fullWidth>
                      <MenuItem value="">—</MenuItem>
                      {personas.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
                    </TextField>
                  </Stack>
                </Stack>
              </Card>

              <Card sx={{ p: 2.5 }}>
                <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>Controlli</Typography>
                  {issues.length === 0 ? <Label color="success">Completa</Label> : <Label color={errors.length ? 'error' : 'warning'}>{errors.length ? `${errors.length} da completare` : `${warnings.length} ${warnings.length === 1 ? 'avviso' : 'avvisi'}`}</Label>}
                </Stack>
                <Stack spacing={0.5}>
                  {[...errors, ...warnings].map((i) => {
                    const target = tabOf(i.message);
                    return (
                      <Alert
                        key={i.message}
                        severity={i.level === 'errore' ? 'error' : 'warning'}
                        sx={{ py: 0, cursor: target ? 'pointer' : 'default', '& .MuiAlert-message': { py: 0.75 } }}
                        onClick={() => target && setTab(target)}
                      >
                        {i.message}
                      </Alert>
                    );
                  })}
                </Stack>
              </Card>
            </Stack>
          </Grid>
        </Grid>

        {/* Su smartphone e tablet il salvataggio resta sempre a portata di dito */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1100,
            gap: 1,
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            boxShadow: (t) => t.vars.customShadows.z16,
          }}
        >
          <Button type="submit" variant="contained" size="large" fullWidth startIcon={<Iconify icon="eva:checkmark-fill" />}>
            Salva
          </Button>
        </Box>
      </Box>

      {/* Pubblicazione sui profili del cliente: fuori dal modulo della scheda (ha i suoi pulsanti) */}
      <Box sx={{ mt: 3 }}>
        <PublishPanel item={item} client={client} {...publishing} />
      </Box>

      {/* Sponsorizzate: post già pubblicati e campagne nuove dalla scheda */}
      <Box sx={{ mt: 3, '&:empty': { display: 'none' } }}>
        <SponsorPanel {...sponsoring} />
      </Box>

      {/* Studio grafico: fuori dal modulo della scheda (ha i suoi pulsanti) */}
      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <BriefPanel itemId={item.id} clientId={client.id} brief={item.creativeBrief ?? null} aiConfigured={design.aiConfigured} hasBrandKit={design.hasBrandKit} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <DesignReviewPanel clientId={client.id} itemId={item.id} reviews={design.reviews} aiConfigured={design.aiConfigured} />
        </Grid>
      </Grid>
      {/* spazio per la barra di salvataggio fissa su smartphone */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, height: 88 }} />
    </DashboardContent>
  );
}

// Interruttore «pubblica anche su»: invia crossPost=<social> solo se attivo (come la vecchia casella)
function CrossPost({ platform, defaultChecked, disabled }) {
  const [on, setOn] = useState(defaultChecked);
  const info = PLATFORM_INFO[platform];
  return (
    <ToggleButton value={platform} selected={on && !disabled} disabled={disabled} onChange={() => setOn(!on)} sx={{ gap: 0.75, textTransform: 'none', flex: 1 }}>
      <Iconify icon={info?.icon} width={18} />
      {info?.label ?? platform}
      {on && !disabled && <input type="hidden" name="crossPost" value={platform} />}
    </ToggleButton>
  );
}
