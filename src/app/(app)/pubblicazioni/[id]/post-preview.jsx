'use client';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// Anteprima dal vivo del post (come in Buffer e Planable): cornice del social scelto, foto e video caricati,
// caption tagliata dove la taglia il social. È indicativa: ogni app ha i suoi dettagli.

const NETWORKS = {
  instagram: { label: 'Instagram', icon: 'socials:instagram', cut: 125 },
  facebook: { label: 'Facebook', icon: 'socials:facebook', cut: 240 },
  tiktok: { label: 'TikTok', icon: 'socials:tiktok', cut: 100 },
};

const vertical = (format) => ['reel', 'storia', 'video'].includes(format);

export function PostPreview({ clientName, logo, format, platform, caption, hashtags, media = [], channels = [], emptyText = 'Carica foto o video in «Pubblicazione» qui sotto' }) {
  const initial = NETWORKS[platform] ? platform : 'instagram';
  const [network, setNetwork] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [slide, setSlide] = useState(0);

  const channel = channels.find((c) => c.platform === network);
  const name = channel?.name ?? clientName;
  const handle = channel?.handle ?? clientName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const picture = channel?.pictureUrl ?? logo ?? undefined;
  const text = [caption, hashtags].filter(Boolean).join('\n\n');
  const cut = NETWORKS[network].cut;
  const shown = expanded || text.length <= cut ? text : `${text.slice(0, cut).trimEnd()}…`;
  const current = media[Math.min(slide, Math.max(media.length - 1, 0))];
  const tall = network === 'tiktok' || vertical(format);

  const Media = (
    <Box sx={{ position: 'relative', aspectRatio: tall ? '9 / 16' : '4 / 5', width: tall ? 'min(100%, 270px)' : 1, mx: 'auto', bgcolor: network === 'tiktok' ? '#000' : 'background.neutral', overflow: 'hidden' }}>
      {current ? (
        current.kind === 'video' || current.mime?.startsWith('video') ? (
          <Box component="video" src={current.url} muted loop autoPlay playsInline sx={{ width: 1, height: 1, objectFit: 'cover' }} />
        ) : (
          <Box component="img" src={current.url} alt="" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
        )
      ) : (
        <Stack sx={{ height: 1, alignItems: 'center', justifyContent: 'center', color: network === 'tiktok' ? 'grey.600' : 'text.disabled', gap: 1 }}>
          <Iconify icon={vertical(format) ? 'solar:play-circle-bold' : 'solar:gallery-wide-bold'} width={40} />
          <Typography variant="caption" sx={{ px: 2, textAlign: 'center' }}>{emptyText}</Typography>
        </Stack>
      )}
      {media.length > 1 && (
        <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', bottom: 8, left: 0, right: 0, justifyContent: 'center' }}>
          {media.map((m, n) => (
            <Box key={m.id} onClick={() => setSlide(n)} sx={{ width: 6, height: 6, borderRadius: '50%', cursor: 'pointer', bgcolor: n === slide ? 'primary.main' : 'rgba(255,255,255,0.7)' }} />
          ))}
        </Stack>
      )}
      {network === 'tiktok' && (
        <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, p: 1.5, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}>
          <Typography variant="subtitle2">@{handle}</Typography>
          <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', display: 'block' }} onClick={() => setExpanded(!expanded)}>
            {shown || 'La descrizione apparirà qui…'}
          </Typography>
        </Box>
      )}
      {network === 'tiktok' && (
        <Stack spacing={2} sx={{ position: 'absolute', right: 8, bottom: 90, color: '#fff', alignItems: 'center' }}>
          <Avatar src={picture} sx={{ width: 36, height: 36, border: '2px solid #fff' }}>{clientName.slice(0, 1)}</Avatar>
          <Iconify icon="solar:heart-bold" width={26} />
          <Iconify icon="solar:chat-round-dots-bold" width={26} />
          <Iconify icon="solar:share-bold" width={26} />
        </Stack>
      )}
    </Box>
  );

  return (
    <Card>
      <Stack direction="row" sx={{ alignItems: 'center', px: 2, pt: 2, pb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Anteprima</Typography>
        <ToggleButtonGroup size="small" exclusive value={network} onChange={(_, v) => v && setNetwork(v)}>
          {Object.entries(NETWORKS).map(([k, n]) => (
            <ToggleButton key={k} value={k} aria-label={n.label} sx={{ px: 1 }}>
              <Iconify icon={n.icon} width={18} />
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Box sx={{ mx: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper', maxWidth: 380, ml: 'auto', mr: 'auto' }}>
        {network !== 'tiktok' && (
          <Stack direction="row" spacing={1} sx={{ p: 1.25, alignItems: 'center' }}>
            <Avatar src={picture} sx={{ width: 32, height: 32, ...(network === 'instagram' && { outline: '2px solid #E1306C', outlineOffset: 1 }) }}>{clientName.slice(0, 1)}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap sx={{ lineHeight: 1.2 }}>{network === 'instagram' ? handle : name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{network === 'facebook' ? 'Adesso · 🌍' : 'Anteprima'}</Typography>
            </Box>
            <Iconify icon="eva:more-horizontal-fill" sx={{ color: 'text.secondary' }} />
          </Stack>
        )}

        {network === 'facebook' && (
          <Typography variant="body2" sx={{ px: 1.5, pb: 1, whiteSpace: 'pre-wrap', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
            {shown || <Box component="span" sx={{ color: 'text.disabled' }}>Il testo apparirà qui…</Box>}
            {!expanded && text.length > cut && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}> Altro</Box>}
          </Typography>
        )}

        {Media}

        {network === 'instagram' && (
          <Box sx={{ p: 1.25 }}>
            <Stack direction="row" spacing={1.5} sx={{ mb: 0.75 }}>
              <Iconify icon="solar:heart-outline" width={22} />
              <Iconify icon="solar:chat-round-dots-bold" width={22} />
              <Iconify icon="solar:share-bold" width={22} />
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
              <b>{handle}</b> {shown || <Box component="span" sx={{ color: 'text.disabled' }}>La caption apparirà qui…</Box>}
              {!expanded && text.length > cut && <Box component="span" sx={{ color: 'text.secondary' }}> altro</Box>}
            </Typography>
          </Box>
        )}

        {network === 'facebook' && (
          <Stack direction="row" sx={{ justifyContent: 'space-around', py: 1, borderTop: 1, borderColor: 'divider', color: 'text.secondary' }}>
            <Typography variant="caption">👍 Mi piace</Typography>
            <Typography variant="caption">💬 Commenta</Typography>
            <Typography variant="caption">↗ Condividi</Typography>
          </Stack>
        )}
      </Box>
    </Card>
  );
}
