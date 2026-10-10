'use client';

import { useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';

import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';

import { updateLimits } from './actions';

// ----------------------------------------------------------------------
// Limiti di spesa delle API Claude (prima erano in Consumi AI): solo amministratori, area riservata.

export function AiLimitsCard({ limits }) {
  const isAdmin = true;
  const [pending, start] = useTransition();
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader
        avatar={<Iconify icon="solar:shield-check-bold" width={24} sx={{ color: 'primary.main' }} />}
        title="Limiti e blocchi automatici"
        subheader="L’app ferma l’AI prima di superarli. I consumi si guardano in Consumi AI."
      />
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            const r = await updateLimits(fd);
            if (r?.error) toast.error(r.error);
            else toast.success('Limiti salvati');
          })
        }
        sx={{ p: 3, pt: 1 }}
      >
        <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
          <FormControlLabel control={<Switch name="enabled" defaultChecked={limits.enabled} />} label="AI attiva" sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {[
              ['monthlyUsd', 'Budget mensile dell’app', limits.monthlyUsd, '$', 'Oltre si blocca tutto fino al mese dopo'],
              ['warnPct', 'Avviso al', Math.round(limits.warnPct * 100), '%', 'Banner di avviso in Consumi AI'],
              ['checkupUsd', 'Tetto per check-up', limits.checkupUsd, '$', 'Comprese ricerche e revisioni'],
              ['clientMonthlyUsd', 'Tetto mensile per cliente', limits.clientMonthlyUsd, '$', '0 = nessun tetto'],
              ['maxConcurrent', 'Lavori AI contemporanei', limits.maxConcurrent, '', 'Evita picchi di spesa'],
              ['maxCheckupsPerDay', 'Check-up AI al giorno', limits.maxCheckupsPerDay, '', 'Su tutti i clienti'],
            ].map(([name, label, value, unit, help]) => (
              <Grid key={name} size={{ xs: 12, sm: 6 }}>
                <TextField
                  name={name}
                  label={label}
                  defaultValue={value}
                  helperText={help}
                  size="small"
                  fullWidth
                  slotProps={{ input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined }}
                />
              </Grid>
            ))}
          </Grid>
          {isAdmin && (
            <Button type="submit" variant="contained" loading={pending} sx={{ mt: 2 }}>
              Salva limiti
            </Button>
          )}
        </fieldset>
        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>
          Imposta anche il limite di spesa su platform.claude.com (organizzazione e workspace 2Target): è il blocco definitivo se
          qualcosa sfugge a questi controlli.
        </Typography>
      </Box>
    </Card>
  );
}
