'use client';

import { ErrorText } from 'src/components/error-text';
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
  quickPost,
  removeConnection,
  connectMetaSystemUser,
} from '../../../channel-actions';

// ----------------------------------------------------------------------

// Tipi di post come li chiamano le piattaforme → come li chiamiamo noi
const MEDIA_TYPE = { IMAGE: 'foto', VIDEO: 'video', CAROUSEL_ALBUM: 'carosello', REEL: 'reel', REELS: 'reel', POST: 'post', TEXT: 'testo', TEXT_POST: 'testo', STORY: 'storia', SHORT: 'short' };

export const CHANNEL = {
  instagram: { label: 'Instagram', icon: 'socials:instagram' },
  facebook: { label: 'Facebook', icon: 'socials:facebook' },
  tiktok: { label: 'TikTok', icon: 'socials:tiktok' },
  linkedin: { label: 'LinkedIn', icon: 'socials:linkedin' },
  youtube: { label: 'YouTube', icon: 'socials:youtube' },
  threads: { label: 'Threads', icon: 'socials:threads' },
  pinterest: { label: 'Pinterest', icon: 'socials:pinterest' },
  search_console: { label: 'Search Console', icon: 'socials:google' },
  ga4: { label: 'Analytics 4', icon: 'solar:chart-square-outline' },
  business_profile: { label: 'Scheda Google', icon: 'custom:location-fill' },
  google_ads: { label: 'Google Ads', icon: 'socials:google' },
  website: { label: 'Sito web', icon: 'solar:monitor-bold' },
};

const PROVIDERS = [
  { key: 'meta', name: 'Meta', what: 'Instagram e pagine Facebook: profilo, follower, post e statistiche', icons: ['socials:instagram', 'socials:facebook'] },
  { key: 'google', name: 'Google', what: 'Search Console, Analytics 4, scheda Google (Business Profile), Google Ads e YouTube', icons: ['socials:google', 'socials:youtube'] },
  { key: 'instagram', name: 'Instagram senza Facebook', what: 'Per i profili professionali senza Pagina Facebook: accesso con Instagram, statistiche e pubblicazione', icons: ['socials:instagram'] },
  { key: 'tiktok', name: 'TikTok', what: 'Profilo, video e statistiche · pubblicazione di video e foto', icons: ['socials:tiktok'] },
  { key: 'linkedin', name: 'LinkedIn', what: 'Pagina aziendale: follower, statistiche, post e pubblicazione (accede chi amministra la pagina)', icons: ['socials:linkedin'] },
  { key: 'threads', name: 'Threads', what: 'Profilo Threads: follower, visualizzazioni, post e pubblicazione di testi, foto e video', icons: ['socials:threads'] },
  { key: 'pinterest', name: 'Pinterest', what: 'Bacheche: follower, statistiche dei pin e pubblicazione di pin con foto e link al sito', icons: ['socials:pinterest'] },
];

export function ChannelsView({ clientId, error, configured, connections, channels, picker, canConnect, ads, todo, metaSystem }) {
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
      {todo?.channels.length > 0 && (
        <Alert severity="info" icon={<Iconify icon="solar:notes-bold-duotone" />}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Dal check-up{todo.period ? ` di ${todo.period}` : ''}: {todo.channels.length === 1 ? '1 canale da sistemare' : `${todo.channels.length} canali da sistemare`}
          </Typography>
          {todo.channels.map((t) => (
            <Typography key={t.platform} variant="body2">
              <b>{CHANNEL[t.platform]?.label ?? t.platform}</b> · {t.action === 'collegare' ? 'da collegare' : t.action === 'aprire' ? 'da aprire' : 'da riattivare'} · {t.why}
            </Typography>
          ))}
        </Alert>
      )}

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
              <Grid key={p.key} size={{ xs: 12, sm: 6, lg: 4 }}>
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
                          {c.status !== 'attivo'
                            ? 'da ricollegare'
                            : p.key === 'meta' && c.permanent
                              ? 'accesso permanente del portfolio Golduck'
                              : p.key === 'meta'
                                ? 'collegato · pagine attive senza scadenza'
                              : (p.key === 'tiktok' || p.key === 'linkedin') && !c.canPublish
                                ? 'collegato senza permesso di pubblicare: ricollegalo'
                                : p.key === 'linkedin' && c.expiresAt
                                  ? `collegato · accesso fino al ${fmtDate(new Date(c.expiresAt))}`
                                : ['tiktok', 'instagram', 'threads', 'pinterest'].includes(p.key)
                                  ? 'collegato · accesso rinnovato in automatico'
                                  : 'collegato'}
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
                  {/* Meta: accesso permanente tramite il portfolio Golduck, per i clienti che vi hanno condiviso le loro risorse */}
                  {p.key === 'meta' && metaSystem && canConnect && !mine.some((c) => c.permanent) && (
                    <Box component="form" action={connectMetaSystemUser}>
                      <input type="hidden" name="clientId" value={clientId} />
                      <Tooltip title="Per le Pagine e gli Instagram che il cliente ha condiviso con il portfolio business di Golduck: l'accesso non scade e non dipende da chi l'ha collegato.">
                        <Button type="submit" fullWidth variant="soft" color="primary" startIcon={<Iconify icon="solar:shield-check-bold" />}>
                          Accesso permanente (portfolio Golduck)
                        </Button>
                      </Tooltip>
                    </Box>
                  )}
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
                <ChannelCard channel={c} canPublish={canConnect} />
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

function ChannelCard({ channel: c, canPublish }) {
  const [pending, start] = useTransition();
  const [posting, setPosting] = useState(false);
  const canPost = canPublish && c.connected && ['instagram', 'facebook'].includes(c.platform);
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
          { label: 'Persone raggiunte (30 gg)', value: c.platform === 'instagram' ? c.stats.reach30 : null },
          { label: 'Post letti', value: c.stats.posts },
        ]
      : c.platform === 'youtube'
        ? [
            { label: 'Iscritti', value: c.stats.followers },
            { label: 'Visualizzazioni 30 gg', value: c.stats.views30 },
            { label: 'Video', value: c.stats.videosTotal },
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
            { label: '% di clic', value: c.stats.impressions30 ? `${((c.stats.clicks30 / c.stats.impressions30) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%` : null },
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
                { label: 'Tempo di caricamento', value: c.pagespeed.lcp },
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
            <Typography variant="caption" sx={{ color: 'error.main' }}><ErrorText error={c.lastSyncError} /></Typography>
          ) : c.lastSyncAt ? (
            `Aggiornato ${fmtDateTime(new Date(c.lastSyncAt))}`
          ) : syncable ? (
            'Dati non ancora scaricati'
          ) : (
            c.platform === 'website' ? c.handle : `@${c.handle} · collega l'account per leggere i dati`
          )
        }
        action={
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            {canPost && (
              <Button size="small" variant="outlined" startIcon={<Iconify icon="solar:pen-bold" />} onClick={() => setPosting(true)} sx={{ mr: 1 }}>
                Nuovo post
              </Button>
            )}
            {syncable && (
              <Tooltip title={c.platform === 'website' ? 'Analizza di nuovo con PageSpeed' : 'Aggiorna ora'}>
                <IconButton onClick={sync} loading={pending}><Iconify icon="solar:restart-bold" /></IconButton>
              </Tooltip>
            )}
            <Box component="form" action={removeChannel} onSubmit={(e) => confirmSubmit(e, { tone: 'error', title: 'Togliere il canale?', content: 'Il canale e i dati scaricati verranno cancellati. Se viene dalla scheda del cliente (sito o link social), verrà tolto anche da lì.', confirmText: 'Togli canale' })}>
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
      {c.platform === 'website' && c.health && <SiteHealth health={c.health} />}
      {posting && <QuickPostDialog channel={c} onClose={() => setPosting(false)} />}
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
                  {p.publishedAt ? fmtDate(p.publishedAt, { day: 'numeric', month: 'short' }) : ''} · {MEDIA_TYPE[p.mediaType?.toUpperCase()] ?? p.mediaType?.toLowerCase()}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {p.metrics.reach != null && <>{p.metrics.reach.toLocaleString('it-IT')} persone raggiunte · </>}
                  {p.metrics.views != null && <>{p.metrics.views.toLocaleString('it-IT')} visualizzazioni · </>}
                  {(p.metrics.total_interactions ?? (p.metrics.likes ?? 0) + (p.metrics.comments ?? 0) + (p.metrics.shares ?? 0)).toLocaleString('it-IT')} interazioni
                  {p.metrics.saved != null && <> · {p.metrics.saved} salvataggi</>}
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
// Salute del sito: SSL, scadenza dominio, DNS, reindirizzamenti e segnali di compromissione.

const HEALTH_ICON = { ok: 'solar:check-circle-bold', attenzione: 'solar:danger-triangle-bold', grave: 'solar:shield-warning-bold' };
const HEALTH_COLOR = { ok: 'success', attenzione: 'warning', grave: 'error' };

function SiteHealth({ health }) {
  return (
    <>
      <Divider sx={{ borderStyle: 'dashed' }} />
      <Box sx={{ px: 3, py: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: health.checks.some((x) => x.level !== 'ok') ? 1.5 : 0 }}>
          <Iconify icon="solar:shield-check-bold" width={18} sx={{ color: 'text.secondary' }} />
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Salute del sito</Typography>
          <Label color={HEALTH_COLOR[health.severity]} startIcon={<Iconify icon={HEALTH_ICON[health.severity]} />}>
            {health.severity === 'ok' ? 'Tutto a posto' : `${health.score}/100`}
          </Label>
        </Stack>
        <Stack spacing={1}>
          {health.checks
            .filter((x) => x.level !== 'ok')
            .map((x) => (
              <Stack key={x.key} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <Iconify icon={HEALTH_ICON[x.level]} width={16} sx={{ color: `${HEALTH_COLOR[x.level]}.main`, mt: 0.3, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">
                    <b>{x.label}</b>
                    {x.value ? ` — ${x.value}` : ''}
                  </Typography>
                  {x.hint && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{x.hint}</Typography>}
                </Box>
              </Stack>
            ))}
        </Stack>
        {health.checkedAt && (
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1.5 }}>
            Controllato {fmtDate(health.checkedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Typography>
        )}
      </Box>
    </>
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
          <DialogContent><Alert severity="error"><ErrorText error={picker.error} /></Alert></DialogContent>
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
              Account {{ meta: 'Meta', tiktok: 'TikTok', instagram: 'Instagram', linkedin: 'LinkedIn', threads: 'Threads', pinterest: 'Pinterest' }[picker.provider] ?? 'Google'}: <b>{picker.accountName}</b>. Seleziona solo pagine, profili e
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
            } else {
              if (r?.warning) toast.warning(r.warning);
              else toast.success('Canale aggiunto');
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
              {['website', 'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'threads', 'pinterest'].map((k) => (
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

// ----------------------------------------------------------------------
// Post veloce: testo e formato qui, poi si apre la pubblicazione con il profilo già scelto per foto/video e invio.

function QuickPostDialog({ channel, onClose }) {
  const [caption, setCaption] = useState('');
  const [format, setFormat] = useState('post');
  const [pending, start] = useTransition();
  const label = CHANNEL[channel.platform]?.label ?? channel.platform;

  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('channelId', channel.id);
      fd.set('caption', caption);
      fd.set('format', format);
      const r = await quickPost(fd);
      if (r?.error) toast.error(r.error);
    });

  return (
    <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Iconify icon={CHANNEL[channel.platform]?.icon} />
          <span>Nuovo post su {label} · {channel.name ?? channel.handle}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Formato" value={format} onChange={(e) => setFormat(e.target.value)} fullWidth>
            <MenuItem value="post">Post (foto)</MenuItem>
            <MenuItem value="carosello">Carosello</MenuItem>
            <MenuItem value="reel">Reel / video</MenuItem>
            {channel.platform === 'instagram' && <MenuItem value="storia">Storia</MenuItem>}
          </TextField>
          <TextField
            label="Testo del post"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            multiline
            minRows={6}
            autoFocus
            fullWidth
            helperText={`${caption.length} / 2.200 · al passo dopo carichi foto o video, vedi l'anteprima e pubblichi (subito o programmato)`}
          />
          <Alert severity="info">Il post resta fuori dal piano editoriale ed è già considerato approvato.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>Annulla</Button>
        <Button variant="contained" onClick={submit} loading={pending} disabled={!caption.trim()} endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}>
          Continua
        </Button>
      </DialogActions>
    </Dialog>
  );
}
