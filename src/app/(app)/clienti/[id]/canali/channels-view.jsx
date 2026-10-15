'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';

import { useRouter } from 'src/routes/hooks';
import { fmtDate, fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { EmptyContent } from 'src/components/empty-content';
import { confirmSubmit } from 'src/components/custom-dialog';
import { AutoRefresh } from 'src/components/auto-refresh';

import { AdsSettings } from './ads-settings';

import {
  removeChannel,
  syncClientNow,
  attachChannels,
  syncChannelNow,
  addManualChannel,
  removeConnection,
} from '../../../channel-actions';

// ----------------------------------------------------------------------

export const CHANNEL = {
  instagram: { label: 'Instagram', icon: 'socials:instagram' },
  facebook: { label: 'Facebook', icon: 'socials:facebook' },
  tiktok: { label: 'TikTok', icon: 'socials:tiktok' },
  linkedin: { label: 'LinkedIn', icon: 'socials:linkedin' },
  youtube: { label: 'YouTube', icon: 'solar:play-circle-bold' },
  search_console: { label: 'Search Console', icon: 'socials:google' },
  ga4: { label: 'Analytics 4', icon: 'solar:chart-square-outline' },
  business_profile: { label: 'Business Profile', icon: 'custom:location-fill' },
  website: { label: 'Sito web', icon: 'solar:monitor-bold' },
};

const PROVIDERS = [
  { key: 'meta', name: 'Meta', what: 'Instagram e pagine Facebook: profilo, follower, post e statistiche', icons: ['socials:instagram', 'socials:facebook'] },
  { key: 'google', name: 'Google', what: 'Search Console (SEO) e Analytics 4 (traffico e conversioni)', icons: ['socials:google'] },
  { key: 'tiktok', name: 'TikTok', what: 'Profilo, video e statistiche · pubblicazione dopo il controllo di TikTok', icons: ['socials:tiktok'] },
  { key: 'linkedin', name: 'LinkedIn', what: 'Pagina aziendale · richiede l\'approvazione di LinkedIn', icons: ['socials:linkedin'], soon: true },
];

export function ChannelsView({ clientId, error, configured, connections, channels, picker, canConnect, ads }) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [manual, setManual] = useState(false);
  const anyPending = channels.some((c) => c.pending);

  const syncAll = () =>
    startSync(async () => {
      const fd = new FormData();
      fd.set('clientId', clientId);
      const r = await syncClientNow(fd);
      if (r?.errors?.length) r.errors.forEach((e) => toast.error(e));
      else toast.success('Dati aggiornati');
    });

  return (
    <Stack spacing={3}>
      <AutoRefresh active={anyPending} />
      {error && <Alert severity="error" onClose={() => router.replace(`/clienti/${clientId}/canali`)}>{error}</Alert>}

      {/* Collegamenti */}
      <Box>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Collega gli account</Typography>
          <Button size="small" startIcon={<Iconify icon="solar:restart-bold" />} onClick={syncAll} loading={syncing} disabled={!channels.length}>
            Aggiorna tutti i dati
          </Button>
        </Stack>
        <Grid container spacing={2}>
          {PROVIDERS.map((p) => {
            const mine = connections.filter((c) => c.provider === p.key);
            const ready = configured[p.key];
            return (
              <Grid key={p.key} size={{ xs: 12, sm: 6, lg: 3 }}>
                <Card sx={{ p: 2.5, height: 1, display: 'flex', flexDirection: 'column', gap: 1.5, opacity: p.soon ? 0.7 : 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    {p.icons.map((i) => <Iconify key={i} icon={i} width={26} />)}
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>{p.name}</Typography>
                    {p.soon && <Label>In arrivo</Label>}
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>{p.what}</Typography>
                  {mine.map((c) => (
                    <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: 'center', bgcolor: 'background.neutral', borderRadius: 1, px: 1.5, py: 0.75 }}>
                      <Iconify icon={c.status === 'attivo' ? 'eva:checkmark-circle-2-outline' : 'solar:danger-triangle-bold'} sx={{ color: c.status === 'attivo' ? 'success.main' : 'error.main' }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>{c.accountName}</Typography>
                        <Typography variant="caption" sx={{ color: c.status === 'attivo' ? 'text.secondary' : 'error.main' }}>
                          {/* Meta: i token delle pagine collegate non scadono; serve ricollegare solo se Meta revoca l'accesso */}
                          {c.status === 'attivo' ? (p.key === 'meta' ? 'collegato · pagine attive senza scadenza' : p.key === 'tiktok' ? 'collegato · accesso rinnovato in automatico' : 'collegato') : 'da ricollegare'}
                        </Typography>
                      </Box>
                      <Tooltip title="Scegli i canali">
                        <IconButton size="small" onClick={() => router.push(`/clienti/${clientId}/canali?scegli=${c.id}`)}>
                          <Iconify icon="solar:list-bold" width={18} />
                        </IconButton>
                      </Tooltip>
                      <Box component="form" action={removeConnection} onSubmit={(e) => confirmSubmit(e, { tone: 'warning', title: 'Scollegare questo account?', content: 'I canali restano, con i dati già scaricati, ma non si aggiornano più.', confirmText: 'Scollega' })}>
                        <input type="hidden" name="connectionId" value={c.id} />
                        <Tooltip title="Scollega account">
                          <IconButton type="submit" size="small"><Iconify icon="mingcute:close-line" width={18} /></IconButton>
                        </Tooltip>
                      </Box>
                    </Stack>
                  ))}
                  {p.soon ? null : !canConnect ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Collegano gli account solo gli amministratori e chi è abilitato a pubblicare.
                    </Typography>
                  ) : ready ? (
                    <Button component="a" href={`/api/connect/${p.key}/start?clientId=${clientId}`} variant={mine.length ? 'outlined' : 'contained'} startIcon={<Iconify icon="eva:link-2-fill" />}>
                      {mine.length ? 'Collega un altro account' : `Collega ${p.name}`}
                    </Button>
                  ) : (
                    <Tooltip title="Mancano le chiavi dell'app: un amministratore le inserisce in Impostazioni → Integrazioni">
                      <span>
                        <Button fullWidth disabled variant="outlined">Da configurare</Button>
                      </span>
                    </Tooltip>
                  )}
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      {/* Sponsorizzate: solo con Meta collegato o in simulazione */}
      {ads && <AdsSettings clientId={clientId} ads={ads} canEdit={canConnect} />}

      {/* Canali */}
      <Box>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Canali del cliente</Typography>
          <Button size="small" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setManual(true)}>
            Aggiungi sito o profilo
          </Button>
        </Stack>
        {channels.length === 0 ? (
          <EmptyContent filled title="Nessun canale" description="Collega Meta o Google qui sopra, oppure aggiungi il sito del cliente per l'analisi PageSpeed." sx={{ py: 6 }} />
        ) : (
          <Grid container spacing={3}>
            {channels.map((c) => (
              <Grid key={c.id} size={{ xs: 12, lg: c.recentPosts.length ? 12 : 6 }}>
                <ChannelCard channel={c} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      <PickerDialog picker={picker} onClose={() => router.replace(`/clienti/${clientId}/canali`)} />
      <ManualDialog clientId={clientId} open={manual} onClose={() => setManual(false)} />
    </Stack>
  );
}

// ----------------------------------------------------------------------

function ChannelCard({ channel: c }) {
  const [pending, start] = useTransition();
  const meta = CHANNEL[c.platform] ?? { label: c.platform, icon: 'solar:link-bold' };

  const sync = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('channelId', c.id);
      const r = await syncChannelNow(fd);
      if (r?.error) toast.error(r.error);
      else toast.success(`${c.name ?? c.handle}: dati aggiornati`);
    });

  const stats =
    c.platform === 'instagram' || c.platform === 'facebook'
      ? [
          { label: 'Follower', value: c.stats.followers },
          { label: 'Reach 30 gg', value: c.platform === 'instagram' ? c.stats.reach30 : null },
          { label: 'Post letti', value: c.stats.posts },
        ]
      : c.platform === 'tiktok'
        ? [
            { label: 'Follower', value: c.stats.followers },
            { label: 'Like totali', value: c.stats.likesTotal },
            { label: 'Video', value: c.stats.videosTotal },
          ]
      : c.platform === 'search_console'
        ? [
            { label: 'Clic 30 gg', value: c.stats.clicks30 },
            { label: 'Impressioni 30 gg', value: c.stats.impressions30 },
            { label: 'CTR', value: c.stats.impressions30 ? `${((c.stats.clicks30 / c.stats.impressions30) * 100).toFixed(1)}%` : null },
          ]
        : c.platform === 'ga4'
          ? [
              { label: 'Sessioni 30 gg', value: c.stats.sessions30 },
              { label: 'Da Google', value: c.stats.organic30 },
            ]
          : c.platform === 'website' && c.pagespeed
            ? [
                { label: 'Prestazioni', value: c.pagespeed.performance, score: true },
                { label: 'SEO', value: c.pagespeed.seo, score: true },
                { label: 'Accessibilità', value: c.pagespeed.accessibility, score: true },
                { label: 'LCP', value: c.pagespeed.lcp },
              ]
            : [];

  const syncable = c.connected || c.platform === 'website';

  return (
    <Card>
      <CardHeader
        avatar={
          c.pictureUrl ? (
            <Avatar src={c.pictureUrl} alt={c.name ?? c.handle} />
          ) : (
            <Avatar sx={{ bgcolor: 'background.neutral' }}><Iconify icon={meta.icon} /></Avatar>
          )
        }
        title={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <span>{c.name ?? c.handle}</span>
            <Label variant="outlined" startIcon={<Iconify icon={meta.icon} />}>{meta.label}</Label>
            {!syncable && <Label color="default">Solo riferimento</Label>}
          </Stack>
        }
        subheader={
          c.pending ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Analisi PageSpeed in corso: la pagina si aggiorna da sola…</Typography>
          ) : c.lastSyncError ? (
            <Typography variant="caption" sx={{ color: 'error.main' }}>{c.lastSyncError}</Typography>
          ) : c.lastSyncAt ? (
            `Aggiornato ${fmtDateTime(new Date(c.lastSyncAt))}`
          ) : syncable ? (
            'Mai sincronizzato'
          ) : (
            c.platform === 'website' ? c.handle : `@${c.handle} · collega l'account per leggere i dati`
          )
        }
        action={
          <Stack direction="row">
            {syncable && (
              <Tooltip title={c.platform === 'website' ? 'Analizza di nuovo con PageSpeed' : 'Aggiorna ora'}>
                <IconButton onClick={sync} loading={pending}><Iconify icon="solar:restart-bold" /></IconButton>
              </Tooltip>
            )}
            <Box component="form" action={removeChannel} onSubmit={(e) => confirmSubmit(e, { tone: 'error', title: 'Togliere il canale?', content: 'Il canale e i dati scaricati verranno cancellati.', confirmText: 'Togli canale' })}>
              <input type="hidden" name="channelId" value={c.id} />
              <Tooltip title="Togli canale">
                <IconButton type="submit"><Iconify icon="solar:trash-bin-trash-bold" /></IconButton>
              </Tooltip>
            </Box>
          </Stack>
        }
      />
      {stats.length > 0 && (syncable || stats.some((x) => x.value != null && x.value !== 0)) && (
        <Stack direction="row" divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />} sx={{ px: 3, pb: 2.5, pt: 1 }}>
          {stats.map((s) => (
            <Box key={s.label} sx={{ flex: 1, textAlign: 'center' }}>
              <Typography variant="h5" sx={s.score && s.value != null ? { color: s.value >= 90 ? 'success.main' : s.value >= 50 ? 'warning.main' : 'error.main' } : undefined}>
                {s.value == null ? '—' : typeof s.value === 'number' ? s.value.toLocaleString('it-IT', { maximumFractionDigits: 0 }) : s.value}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.label}</Typography>
            </Box>
          ))}
        </Stack>
      )}
      {c.recentPosts.length > 0 && (
        <>
          <Divider sx={{ borderStyle: 'dashed' }} />
          <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' } }}>
            {c.recentPosts.map((p) => (
              <Link key={p.id} href={p.permalink ?? undefined} target="_blank" rel="noopener" underline="none" color="inherit">
                <Box sx={{ aspectRatio: '1', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.neutral', mb: 1, display: 'grid', placeItems: 'center' }}>
                  {p.thumbnailUrl ? (
                    <Box component="img" src={p.thumbnailUrl} alt="" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
                  ) : (
                    <Iconify icon="solar:gallery-wide-bold" width={32} sx={{ color: 'text.disabled' }} />
                  )}
                </Box>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  {p.publishedAt ? fmtDate(p.publishedAt, { day: 'numeric', month: 'short' }) : ''} · {p.mediaType?.toLowerCase()}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {p.metrics.reach != null && <>reach {p.metrics.reach.toLocaleString('it-IT')} · </>}
                  {p.metrics.views != null && <>{p.metrics.views.toLocaleString('it-IT')} visual. · </>}
                  {(p.metrics.total_interactions ?? (p.metrics.likes ?? 0) + (p.metrics.comments ?? 0) + (p.metrics.shares ?? 0)).toLocaleString('it-IT')} interazioni
                  {p.metrics.saved != null && <> · {p.metrics.saved} salv.</>}
                </Typography>
              </Link>
            ))}
          </Box>
        </>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------

function PickerDialog({ picker, onClose }) {
  if (!picker) return null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      {'error' in picker ? (
        <>
          <DialogTitle>Impossibile leggere gli account</DialogTitle>
          <DialogContent><Alert severity="error">{picker.error}</Alert></DialogContent>
          <DialogActions><Button onClick={onClose}>Chiudi</Button></DialogActions>
        </>
      ) : (
        <Box
          component="form"
          action={attachChannels}
          onSubmit={(e) => {
            // Profili il cui nome non somiglia al cliente: si chiede conferma (è qui che si può sbagliare cliente)
            const checked = new Set(new FormData(e.currentTarget).getAll('asset').map(String));
            const odd = picker.assets.filter((a) => checked.has(a.key) && !a.matches);
            if (!odd.length) return;
            confirmSubmit(e, {
              tone: 'warning',
              title: `Sono davvero profili di ${picker.clientName}?`,
              content: `Il nome di ${odd.map((a) => `«${a.name}»`).join(', ')} non somiglia a «${picker.clientName}». Collegali solo se appartengono a questo cliente: da qui in poi si pubblicherà su di loro per suo conto.`,
              confirmText: 'Sì, sono suoi',
            });
          }}
        >
          <input type="hidden" name="connectionId" value={picker.connectionId} />
          <DialogTitle>Quali canali sono di questo cliente?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Account {picker.provider === 'meta' ? 'Meta' : picker.provider === 'tiktok' ? 'TikTok' : 'Google'}: <b>{picker.accountName}</b>. Seleziona solo pagine, profili e
              proprietà di questo cliente: lo stesso account può gestirne anche altri.
            </Typography>
            {picker.assets.length === 0 ? (
              <Alert severity="warning">
                Nessun canale trovato. Per Meta servono una pagina Facebook e un profilo Instagram professionale collegato alla pagina; per Google
                l&apos;account deve avere accesso a Search Console o Analytics.
              </Alert>
            ) : (
              <Stack>
                {picker.assets.map((a) => (
                  <FormControlLabel
                    key={a.key}
                    disabled={!!a.owner}
                    control={<Checkbox name="asset" value={a.key} defaultChecked={a.selected && !a.owner} />}
                    label={
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.5 }}>
                        <Avatar src={a.pictureUrl} sx={{ width: 32, height: 32 }}><Iconify icon={CHANNEL[a.kind]?.icon} width={18} /></Avatar>
                        <Box>
                          <Typography variant="subtitle2">{a.name}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {CHANNEL[a.kind]?.label}{a.kind === 'instagram' ? ` · @${a.handle}` : ''}
                          </Typography>
                          {a.owner ? (
                            <Typography variant="caption" sx={{ display: 'block', color: 'error.main' }}>Già collegato al cliente {a.owner}</Typography>
                          ) : !a.matches ? (
                            <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>Il nome non somiglia a {picker.clientName}: verifica che sia suo</Typography>
                          ) : null}
                        </Box>
                      </Stack>
                    }
                  />
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Annulla</Button>
            <Button type="submit" variant="contained" disabled={!picker.assets.length}>Collega e scarica i dati</Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

function ManualDialog({ clientId, open, onClose }) {
  const [pending, start] = useTransition();
  const [platform, setPlatform] = useState('website');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            const r = await addManualChannel(fd);
            if (r?.error) {
              toast.error(r.error);
              if (r.error.startsWith('Sito aggiunto')) onClose();
            } else {
              toast.success('Canale aggiunto');
              onClose();
            }
          })
        }
      >
        <DialogTitle>Aggiungi sito o profilo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <input type="hidden" name="clientId" value={clientId} />
            <TextField select name="platform" label="Tipo" value={platform} onChange={(e) => setPlatform(e.target.value)} fullWidth>
              {['website', 'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'].map((k) => (
                <MenuItem key={k} value={k}>{CHANNEL[k].label}</MenuItem>
              ))}
            </TextField>
            <TextField
              name="handle"
              label={platform === 'website' ? 'Indirizzo del sito' : 'Nome profilo'}
              placeholder={platform === 'website' ? 'https://www.esempio.it' : '@profilo'}
              required
              fullWidth
              helperText={platform === 'website' ? 'Viene analizzato subito con Google PageSpeed (velocità, SEO tecnica, accessibilità).' : 'Senza collegamento resta come riferimento (es. competitor o canale non ancora collegato).'}
            />
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
