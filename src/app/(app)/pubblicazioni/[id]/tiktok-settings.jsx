'use client';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import FormControlLabel from '@mui/material/FormControlLabel';

import { PRIVACY_LABELS, tiktokKind, tiktokLabel, checkTikTokOptions } from 'src/lib/publishing/tiktok-rules';

import { Iconify } from 'src/components/iconify';

import { tiktokCreator } from '../../publish-actions';

// ----------------------------------------------------------------------
// Impostazioni del post TikTok, come chiede TikTok per approvare l'app (Content Sharing Guidelines):
// account su cui si pubblica (riletto ogni volta), visibilità scelta a mano tra quelle consentite,
// interazioni non attive di default e bloccate se l'account non le consente, indicazione di contenuto
// commerciale, controllo della durata del video, anteprima e dichiarazione di consenso.

export const EMPTY_TIKTOK = { privacyLevel: '', allowComment: false, allowDuet: false, allowStitch: false, disclose: false, brandOrganic: false, brandContent: false };

const MUSIC_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

function useVideoSeconds(url) {
  const [seconds, setSeconds] = useState(null);
  useEffect(() => {
    if (!url) return undefined;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => setSeconds(Number.isFinite(v.duration) ? v.duration : null);
    v.src = url;
    return () => {
      v.removeAttribute('src');
    };
  }, [url]);
  return url ? seconds : null;
}

export function TikTokSettings({ channel, format, media, caption, value, onChange, onValid }) {
  const [info, setInfo] = useState({ loading: true });
  const kind = tiktokKind(format, media);
  const video = kind === 'video' ? media[0] : null;
  const seconds = useVideoSeconds(video?.url);

  // Informazioni dell'account rilette ogni volta che si apre la sezione (richiesta di TikTok)
  useEffect(() => {
    let alive = true;
    tiktokCreator(channel.id).then((r) => alive && setInfo({ loading: false, ...r }));
    return () => {
      alive = false;
    };
  }, [channel.id]);

  const creator = info.creator;
  const set = (patch) => onChange({ ...value, ...patch });
  const tooLong = !!creator?.maxVideoSeconds && seconds != null && seconds > creator.maxVideoSeconds;
  const problem = creator && kind ? checkTikTokOptions(value, creator, kind) : null;
  const label = tiktokLabel(value);

  // Il pannello padre sa se si può inviare: impostazioni valide e video entro la durata consentita
  const valid = !!creator && !!kind && !problem && !tooLong;
  useEffect(() => {
    onValid(valid);
  }, [valid, onValid]);

  if (info.loading) {
    return (
      <Box sx={{ py: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Leggo l&apos;account TikTok…</Typography>
        <LinearProgress sx={{ mt: 0.5 }} />
      </Box>
    );
  }
  if (info.error) return <Alert severity="error">{info.error}</Alert>;
  if (!kind) return <Alert severity="warning">Per TikTok carica un solo video, oppure solo foto (JPEG o WebP).</Alert>;

  return (
    <Stack spacing={2} sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
      {/* Account su cui si pubblica */}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar src={creator.avatarUrl ?? undefined} alt={creator.nickname} sx={{ width: 40, height: 40 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Pubblichi su TikTok come</Typography>
          <Typography variant="subtitle2" noWrap>
            {creator.nickname}
            {creator.username ? ` · @${creator.username}` : ''}
          </Typography>
        </Box>
        <Iconify icon="socials:tiktok" width={22} sx={{ ml: 'auto' }} />
      </Stack>
      {info.simulated && <Alert severity="warning">Simulazione: opzioni di prova, TikTok non viene contattato.</Alert>}

      {/* Anteprima */}
      <Stack direction="row" spacing={1.5}>
        <Box sx={{ width: 72, height: 128, flexShrink: 0, borderRadius: 1, overflow: 'hidden', bgcolor: 'common.black' }}>
          {video ? (
            <Box component="video" src={video.url} muted preload="metadata" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
          ) : (
            <Box component="img" src={media[0].url} alt="" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Anteprima · {video ? `video${seconds != null ? ` di ${Math.round(seconds)} s` : ''}` : `${media.length} ${media.length === 1 ? 'foto' : 'foto in sequenza'}`}
          </Typography>
          <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }}>
            {caption || <i>Nessun testo</i>}
          </Typography>
          {label && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}>
              Etichetta di TikTok: «{label}»
            </Typography>
          )}
        </Box>
      </Stack>
      {tooLong && (
        <Alert severity="error">
          Il video dura {Math.round(seconds)} s: questo account TikTok accetta al massimo {creator.maxVideoSeconds} s.
        </Alert>
      )}

      {/* Visibilità: nessun valore predefinito */}
      <TextField
        select
        size="small"
        label="Chi può vedere il post"
        value={value.privacyLevel}
        onChange={(e) => set({ privacyLevel: e.target.value })}
        error={!value.privacyLevel}
        helperText={!value.privacyLevel ? 'Scegli la visibilità: TikTok non ne ammette una predefinita' : 'Finché TikTok non approva l’app di Golduck, i post escono comunque come privati'}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      >
        <MenuItem value="" disabled>
          Scegli…
        </MenuItem>
        {creator.privacyOptions.map((o) => (
          <MenuItem key={o} value={o} disabled={o === 'SELF_ONLY' && value.disclose && value.brandContent}>
            {PRIVACY_LABELS[o] ?? o}
            {o === 'SELF_ONLY' && value.disclose && value.brandContent ? ' · non per i contenuti sponsorizzati' : ''}
          </MenuItem>
        ))}
      </TextField>

      {/* Interazioni: spente di default, bloccate se l'account non le consente */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Consenti agli utenti di</Typography>
        <FormGroup row>
          {[
            { key: 'allowComment', label: 'Commentare', off: creator.commentDisabled },
            ...(kind === 'video'
              ? [
                  { key: 'allowDuet', label: 'Fare duetti', off: creator.duetDisabled },
                  { key: 'allowStitch', label: 'Fare stitch', off: creator.stitchDisabled },
                ]
              : []),
          ].map((x) => (
            <FormControlLabel
              key={x.key}
              disabled={x.off}
              control={<Checkbox size="small" checked={!x.off && value[x.key]} onChange={(e) => set({ [x.key]: e.target.checked })} />}
              label={x.off ? `${x.label} (disattivato dall’account)` : x.label}
            />
          ))}
        </FormGroup>
      </Box>

      {/* Contenuto commerciale */}
      <Box>
        <FormControlLabel
          control={<Switch checked={value.disclose} onChange={(e) => set({ disclose: e.target.checked, ...(!e.target.checked && { brandOrganic: false, brandContent: false }) })} />}
          label="Indica che è un contenuto commerciale"
        />
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          Attivalo se il post promuove un brand, un prodotto o un servizio in cambio di qualcosa di valore.
        </Typography>
        {value.disclose && (
          <Stack spacing={0.5} sx={{ mt: 1, pl: 1 }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={value.brandOrganic} onChange={(e) => set({ brandOrganic: e.target.checked })} />}
              label={
                <Box>
                  <Typography variant="body2">Il tuo brand</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Promuove l’attività del cliente: etichetta «Contenuto promozionale».</Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={value.brandContent}
                  onChange={(e) => set({ brandContent: e.target.checked, ...(e.target.checked && value.privacyLevel === 'SELF_ONLY' && { privacyLevel: '' }) })}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Contenuto sponsorizzato</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Promuove un altro brand o una terza parte: etichetta «Partnership retribuita». Non può essere privato.</Typography>
                </Box>
              }
            />
            {!value.brandOrganic && !value.brandContent && (
              <Typography variant="caption" sx={{ color: 'error.main' }}>Indica se il post promuove il cliente, un altro brand o entrambi.</Typography>
            )}
          </Stack>
        )}
      </Box>

      {problem && value.privacyLevel && <Alert severity="warning">{problem}</Alert>}

      {/* Dichiarazione di consenso */}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Pubblicando accetti{' '}
        {value.disclose && value.brandContent && (
          <>
            la{' '}
            <Link href={BRANDED_URL} target="_blank" rel="noopener">
              Branded Content Policy
            </Link>{' '}
            e{' '}
          </>
        )}
        la{' '}
        <Link href={MUSIC_URL} target="_blank" rel="noopener">
          Music Usage Confirmation
        </Link>{' '}
        di TikTok. Dopo l’invio il post può richiedere qualche minuto prima di comparire sul profilo.
      </Typography>
    </Stack>
  );
}
