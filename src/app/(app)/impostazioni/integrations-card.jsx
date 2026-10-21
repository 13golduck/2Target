'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { askConfirm } from 'src/components/custom-dialog';

import { saveIntegrations, setPublishingLive } from './actions';

// ----------------------------------------------------------------------
// Chiavi delle app di Golduck su Meta e Google: si inseriscono qui (cifrate nel database), non su Plesk.
// Una volta inserite, collegamento dei clienti, lettura dei dati e pubblicazione avvengono tutti dentro 2Target.

const SOURCE = {
  app: { label: 'Impostata in 2Target', color: 'success' },
  plesk: { label: 'Da Plesk (riserva)', color: 'info' },
  mancante: { label: 'Mancante', color: 'warning' },
};

const GROUPS = [
  {
    key: 'meta',
    category: 'social',
    title: 'Meta (Facebook e Instagram)',
    icon: 'socials:facebook',
    where: 'Meta for Developers → app 2Target → Impostazioni app → Di base; la configurazione in Facebook Login for Business → Configurazioni.',
    callback: '/api/connect/meta/callback',
    fields: [
      { name: 'metaAppId', label: 'ID app' },
      { name: 'metaAppSecret', label: 'Chiave segreta', secret: true },
      {
        name: 'metaConfigId',
        label: 'ID configurazione (Facebook Login for Business)',
      },
      {
        name: 'metaSystemUserToken',
        label: 'Token utente di sistema (portfolio Golduck, facoltativo: accesso permanente)',
        secret: true,
      },
    ],
  },
  {
    key: 'linkedin',
    category: 'social',
    title: 'LinkedIn (pagine aziendali dei clienti)',
    icon: 'socials:linkedin',
    where:
      'linkedin.com/developers → app 2Target (legata alla Pagina LinkedIn di Golduck) → Auth: Client ID e Primary Client Secret; aggiungi l’indirizzo di reindirizzamento qui sotto. Prodotto: Community Management API (va richiesto e approvato da LinkedIn).',
    callback: '/api/connect/linkedin/callback',
    fields: [
      { name: 'linkedinClientId', label: 'Client ID' },
      { name: 'linkedinClientSecret', label: 'Client secret', secret: true },
      { name: 'linkedinScopes', label: 'Permessi richiesti (vuoto = predefiniti)' },
    ],
  },
  {
    key: 'tiktok',
    category: 'social',
    title: 'TikTok (profilo, video, statistiche e pubblicazione)',
    icon: 'socials:tiktok',
    where:
      'developers.tiktok.com → Manage apps → app 2Target → App details: Client key e Client secret. In Login Kit aggiungi l’indirizzo di reindirizzamento qui sotto; prodotti: Login Kit, Display API e Content Posting API. Per pubblicare scrivi nei permessi «user.info.basic,user.info.stats,video.list,video.publish» e ricollega gli account TikTok dei clienti.',
    callback: '/api/connect/tiktok/callback',
    fields: [
      { name: 'tiktokClientKey', label: 'Client key' },
      { name: 'tiktokClientSecret', label: 'Client secret', secret: true },
      { name: 'tiktokScopes', label: 'Permessi richiesti (vuoto = senza pubblicazione)' },
    ],
  },
  {
    key: 'instagram',
    category: 'social',
    title: 'Instagram senza Facebook (login Instagram)',
    icon: 'socials:instagram',
    where:
      'Meta for Developers → app 2Target → Instagram → Configurazione dell’API con login Instagram: ID app di Instagram e chiave segreta dell’app Instagram (diversi da quelli di Meta qui sopra). Aggiungi l’indirizzo di reindirizzamento qui sotto in «Configura il login aziendale di Instagram».',
    callback: '/api/connect/instagram/callback',
    fields: [
      { name: 'instagramAppId', label: 'ID app di Instagram' },
      { name: 'instagramAppSecret', label: 'Chiave segreta dell’app Instagram', secret: true },
    ],
  },
  {
    key: 'threads',
    category: 'social',
    title: 'Threads (profilo, statistiche e pubblicazione)',
    icon: 'socials:threads',
    where:
      'Meta for Developers → app 2Target → caso d’uso «Accedi all’API Threads» → Impostazioni: ID app di Threads e chiave segreta di Threads (diversi da quelli di Meta qui sopra). Aggiungi l’indirizzo di reindirizzamento qui sotto negli URL di callback.',
    callback: '/api/connect/threads/callback',
    fields: [
      { name: 'threadsAppId', label: 'ID app di Threads' },
      { name: 'threadsAppSecret', label: 'Chiave segreta di Threads', secret: true },
    ],
  },
  {
    key: 'pinterest',
    category: 'social',
    title: 'Pinterest (bacheche, statistiche e pin)',
    icon: 'socials:pinterest',
    where:
      'developers.pinterest.com → My apps → app 2Target: App ID e App secret key. Aggiungi l’indirizzo di reindirizzamento qui sotto in «Redirect URIs». Per pubblicare serve l’accesso «Standard» (va richiesto a Pinterest).',
    callback: '/api/connect/pinterest/callback',
    fields: [
      { name: 'pinterestAppId', label: 'App ID' },
      { name: 'pinterestAppSecret', label: 'App secret key', secret: true },
    ],
  },
  {
    key: 'microsoft',
    category: 'accesso',
    title: 'Microsoft 365 (accesso con l’account Golduck)',
    icon: 'socials:microsoft',
    where:
      'Microsoft Entra → Registrazioni app → «2Target accesso»: ID directory (tenant), ID applicazione (client) e un segreto client. L’indirizzo di reindirizzamento qui sotto va aggiunto come piattaforma Web.',
    callback: '/api/sso/microsoft/callback',
    fields: [
      { name: 'msTenantId', label: 'ID directory (tenant)' },
      { name: 'msClientId', label: 'ID applicazione (client)' },
      { name: 'msClientSecret', label: 'Valore del segreto client', secret: true },
    ],
  },
  {
    key: 'anthropic',
    category: 'ai',
    title: 'Anthropic (AI dei check-up e dello studio grafico)',
    icon: 'solar:atom-bold-duotone',
    where: 'console.anthropic.com → organizzazione Golduck → API Keys.',
    callback: null,
    fields: [{ name: 'anthropicApiKey', label: 'Chiave API Anthropic', secret: true }],
  },
  {
    key: 'gemini',
    category: 'ai',
    title: 'Google AI (immagini create e modificate nello Studio)',
    icon: 'solar:gallery-wide-bold-duotone',
    where:
      'aistudio.google.com → Get API key, su un progetto Google Cloud dedicato (non «4Target Calendario») con la fatturazione attiva. Il modello vuoto usa gemini-nano-banana-2.1. La spesa rientra nel tetto «Immagini AI» di Consumi AI.',
    callback: null,
    fields: [
      { name: 'geminiApiKey', label: 'Chiave API Gemini', secret: true },
      { name: 'geminiImageModel', label: 'Modello immagini (facoltativo)' },
    ],
  },
  {
    key: 'google',
    category: 'google',
    title: 'Google (Search Console, Analytics, scheda Google, Google Ads, YouTube, PageSpeed)',
    icon: 'socials:google',
    where:
      'Google Cloud → progetto 2Target → API e servizi → Credenziali. Google Ads: centro clienti (MCC) di Golduck → Amministrazione → Centro API → developer token; l’ID del centro clienti serve se gli account dei clienti sono collegati all’MCC. Dopo aver aggiunto il developer token ricollega gli account Google dei clienti.',
    callback: '/api/connect/google/callback',
    fields: [
      { name: 'googleClientId', label: 'ID client OAuth' },
      {
        name: 'googleClientSecret',
        label: 'Segreto client OAuth',
        secret: true,
      },
      {
        name: 'googlePageSpeedKey',
        label: 'Chiave API PageSpeed',
        secret: true,
      },
      { name: 'googleAdsDeveloperToken', label: 'Google Ads: developer token (facoltativo, ritirato da Google il 9/9/2026)', secret: true },
      { name: 'googleAdsLoginCustomerId', label: 'Google Ads: ID del centro clienti (MCC)' },
      { name: 'googleYoutubeUpload', label: 'YouTube Shorts: scrivi «true» per pubblicare video (solo dopo la verifica Google dell’app)' },
    ],
  },
];

const CATEGORIES = [
  { key: 'social', title: 'Social', hint: 'App di Golduck su Meta, TikTok, LinkedIn, Threads, Pinterest' },
  { key: 'google', title: 'Google', hint: 'Search Console, Analytics, scheda Google, Ads, YouTube' },
  { key: 'ai', title: 'Intelligenza artificiale', hint: 'Testi, check-up e immagini' },
  { key: 'accesso', title: 'Accesso del team', hint: 'Entrare con l’account Golduck' },
];

// Campi che possono restare vuoti senza che il servizio risulti incompleto
const isOptional = (f) => /facoltativ/i.test(f.label);

/** Stato di un servizio: configurato se tutti i campi obbligatori hanno un valore (in 2Target o da Plesk). */
function groupState(gr, status) {
  const required = gr.fields.filter((f) => !isOptional(f));
  const set = required.filter((f) => status[f.name] && status[f.name].source !== 'mancante').length;
  if (set === required.length) return { label: 'Configurata', color: 'success' };
  if (set > 0) return { label: 'Incompleta', color: 'warning' };
  return { label: 'Da configurare', color: 'default' };
}

/** Riepilogo per il menu delle Impostazioni: quante integrazioni sono configurate. */
export function integrationsSummary(status) {
  const done = GROUPS.filter((gr) => groupState(gr, status).label === 'Configurata').length;
  return { done, total: GROUPS.length };
}

function Field({ f, st, clear, onClear }) {
  const source = SOURCE[st.source];
  return (
    <Box>
      <TextField
        name={f.name}
        label={f.label}
        fullWidth
        size="small"
        type={f.secret ? 'password' : 'text'}
        autoComplete="off"
        defaultValue={f.secret ? '' : st.source === 'app' ? (st.value ?? '') : ''}
        placeholder={
          f.secret
            ? st.source === 'mancante'
              ? 'Incolla qui'
              : 'Già impostata: lascia vuoto per non cambiarla'
            : st.source === 'plesk'
              ? `Da Plesk: ${st.value}`
              : ''
        }
        slotProps={{ inputLabel: { shrink: true } }}
        disabled={clear}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
        <Label color={clear ? 'default' : source.color}>{clear ? 'Verrà rimossa' : source.label}</Label>
        {st.source === 'app' && (
          <Button size="small" color="inherit" onClick={onClear} sx={{ fontSize: 12, py: 0 }}>
            {clear ? 'Annulla' : 'Rimuovi'}
          </Button>
        )}
        {clear && <input type="hidden" name={`clear:${f.name}`} value="1" />}
      </Stack>
    </Box>
  );
}

export function IntegrationsCard({ status, appUrl }) {
  const [pending, start] = useTransition();
  const [cleared, setCleared] = useState([]);
  const host = (() => {
    try {
      return new URL(appUrl).host;
    } catch {
      return '';
    }
  })();
  const live = status.publishLiveHost?.source !== 'mancante' && status.publishLiveHost?.value === host;

  const toggleLive = async (on) => {
    const ok = await askConfirm(
      on
        ? {
            tone: 'warning',
            title: 'Attivare la pubblicazione reale?',
            content: `Da ora i post programmati e «Pubblica ora» usciranno davvero sui profili dei clienti, solo da ${host}. Le copie di prova restano in simulazione.`,
            confirmText: 'Attiva',
          }
        : { tone: 'primary', title: 'Spegnere la pubblicazione reale?', content: 'Da ora 2Target simula soltanto: nulla verrà inviato a Meta finché non la riattivi.', confirmText: 'Spegni' }
    );
    if (!ok) return;
    start(async () => {
      const r = await setPublishingLive(on);
      if (r?.error) toast.error(r.error);
      else toast.success(on ? 'Pubblicazione reale attiva' : 'Pubblicazione reale spenta');
    });
  };

  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copiato'));

  return (
    <Card>
      <CardHeader
        avatar={<Iconify icon="eva:link-2-fill" width={24} sx={{ color: 'primary.main' }} />}
        title="Integrazioni"
        subheader="Chiavi delle app di Golduck su Meta e Google. Si inseriscono una volta: poi collegamento dei clienti, dati e pubblicazione avvengono dentro 2Target."
      />
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            const r = await saveIntegrations(fd);
            if (r?.error) toast.error(r.error);
            else {
              toast.success(r.changed ? 'Integrazioni salvate' : 'Nessuna modifica');
              setCleared([]);
            }
          })
        }
        sx={{ p: 3, pt: 1 }}
      >
        <Alert
          severity={live ? 'success' : 'info'}
          sx={{ mb: 3, alignItems: 'center' }}
          action={<Switch checked={live} disabled={pending} onChange={(e) => toggleLive(e.target.checked)} inputProps={{ 'aria-label': 'Pubblicazione reale' }} />}
        >
          <b>Pubblicazione reale sui social: {live ? `attiva su ${host}` : 'spenta (simulazione)'}</b>
          <Box component="span" sx={{ display: 'block', typography: 'caption' }}>
            Vale solo per questo indirizzo: una copia di 2Target su un altro indirizzo resta sempre in simulazione.
          </Box>
        </Alert>
        {/* Un gruppo per categoria; ogni servizio è una riga chiusa con il suo stato. I campi restano nel modulo anche chiusi */}
        <Stack spacing={3}>
          {CATEGORIES.map((cat) => (
            <Box key={cat.key}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                {cat.title}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mb: 1 }}>
                {cat.hint}
              </Typography>
              {GROUPS.filter((gr) => gr.category === cat.key).map((gr) => {
                const state = groupState(gr, status);
                return (
                  <Accordion key={gr.key} id={`integrazione-${gr.key}`} disableGutters variant="outlined" sx={{ '&:not(:last-of-type)': { borderBottom: 0 }, '&::before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<Iconify icon="eva:arrow-ios-downward-fill" />} sx={{ '& .MuiAccordionSummary-content': { minWidth: 0 } }}>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0, pr: 1 }}>
                        <Iconify icon={gr.icon} width={22} />
                        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {gr.title}
                        </Typography>
                        <Label color={state.color}>{state.label}</Label>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 2 }}>
                    Dove si trovano: {gr.where}
                  </Typography>
                  <Grid container spacing={2}>
                    {gr.fields.map((f) => (
                      <Grid key={f.name} size={{ xs: 12, md: 4 }}>
                        <Field
                          f={f}
                          st={status[f.name]}
                          clear={cleared.includes(f.name)}
                          onClear={() => setCleared((c) => (c.includes(f.name) ? c.filter((x) => x !== f.name) : [...c, f.name]))}
                        />
                      </Grid>
                    ))}
                  </Grid>
                  {gr.callback && (
                    <TextField
                      label="Indirizzo di ritorno da registrare nell'app"
                      value={`${appUrl}${gr.callback}`}
                      size="small"
                      fullWidth
                      sx={{ mt: 2 }}
                      slotProps={{
                        input: {
                          readOnly: true,
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title="Copia">
                                <IconButton size="small" onClick={() => copy(`${appUrl}${gr.callback}`)}>
                                  <Iconify icon="solar:copy-bold" width={18} />
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  )}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          ))}
        </Stack>
        {/* Salvataggio sempre a portata di mano, anche con un servizio aperto in fondo */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3, alignItems: { sm: 'center' }, position: 'sticky', bottom: 0, py: 1.5, bgcolor: 'background.paper', zIndex: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
            Le chiavi segrete sono cifrate e non vengono più mostrate. Ogni modifica finisce nell&apos;audit trail (solo i nomi dei campi). Le variabili su
            Plesk restano valide come riserva.
          </Typography>
          <Button type="submit" variant="contained" loading={pending} startIcon={<Iconify icon="eva:checkmark-fill" />}>
            Salva integrazioni
          </Button>
        </Stack>
      </Box>
    </Card>
  );
}
