'use client';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// Pagina di una funzione spenta (raggiunta da un vecchio link o da un preferito): spiega dove riaccenderla.

export function FeatureOff({ label, where, href }) {
  return (
    <Card sx={{ p: 5, textAlign: 'center', maxWidth: 560, mx: 'auto', mt: 3 }}>
      <Iconify icon="solar:eye-closed-bold" width={40} sx={{ color: 'text.disabled', mb: 1 }} />
      <Typography variant="h6" sx={{ mb: 1 }}>
        «{label}» è spenta
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        È stata tolta per semplificare 2Target. Se serve, si riaccende da {where}.
      </Typography>
      {href && (
        <Button component={RouterLink} href={href} variant="outlined">
          Vai alle impostazioni delle funzioni
        </Button>
      )}
    </Card>
  );
}
