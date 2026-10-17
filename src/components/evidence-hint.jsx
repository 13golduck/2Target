'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

/** Icona con le evidenze del check-up da cui nasce una proposta (al passaggio del mouse o al tocco). */
export function EvidenceHint({ evidence, label }) {
  const list = Array.isArray(evidence) ? evidence : String(evidence ?? '').split('\n').filter(Boolean);
  if (!list.length) return null;
  return (
    <Tooltip
      enterTouchDelay={0}
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>Dal check-up</Typography>
          {list.map((e) => (
            <Typography key={e} variant="caption" sx={{ display: 'block', mb: 0.5 }}>{e}</Typography>
          ))}
        </Box>
      }
    >
      <Box component="span" tabIndex={0} aria-label="Evidenze dal check-up" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'primary.main', cursor: 'help', typography: 'caption', fontWeight: 600 }}>
        <Iconify icon="solar:notes-bold-duotone" width={18} />
        {label}
      </Box>
    </Tooltip>
  );
}
