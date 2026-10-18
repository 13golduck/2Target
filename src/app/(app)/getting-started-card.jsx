'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// «Primi passi» nella Home: cosa resta da preparare, in ordine. Sparisce quando è tutto fatto.

export function GettingStartedCard({ steps }) {
  const done = steps.filter((s) => s.done).length;
  if (!steps.length || done === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader
        title="Primi passi"
        subheader={`${done} di ${steps.length} fatti · il prossimo: ${next.label.toLowerCase()}`}
        action={
          <Button component={RouterLink} href="/guida/primi-passi" color="inherit" size="small" startIcon={<Iconify icon="solar:info-circle-bold" />}>
            Come si fa
          </Button>
        }
      />
      <Box sx={{ px: 3, pt: 1.5 }}>
        <LinearProgress variant="determinate" value={(done / steps.length) * 100} sx={{ height: 6, borderRadius: 1 }} />
      </Box>
      <Stack sx={{ p: 2 }}>
        {steps.map((s) => (
          <Stack key={s.key} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 1, py: 0.75, borderRadius: 1, bgcolor: s === next ? 'action.hover' : 'transparent' }}>
            <Iconify icon={s.done ? 'eva:checkmark-circle-2-outline' : 'eva:radio-button-off-fill'} sx={{ color: s.done ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, color: s.done ? 'text.disabled' : 'text.primary', textDecoration: s.done ? 'line-through' : 'none' }}>
              {s.label}
            </Typography>
            {!s.done && (
              <Button component={RouterLink} href={s.href} size="small" variant={s === next ? 'contained' : 'text'}>
                Fallo ora
              </Button>
            )}
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}
