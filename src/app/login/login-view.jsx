'use client';

import { useState, useActionState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { Mark2T } from 'src/components/logo';
import { Iconify } from 'src/components/iconify';
import { PoweredBy } from 'src/layouts/components/powered-by';

import { login } from './actions';

// ----------------------------------------------------------------------

export function LoginView({ returnTo }) {
  const [error, action, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);

  return (
    <Box
      sx={(theme) => ({
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        px: 2,
        py: 6,
        background: `radial-gradient(1200px 500px at 50% -10%, ${theme.vars.palette.primary.lighter}, transparent 70%), ${theme.vars.palette.background.default}`,
      })}
    >
      <Card sx={{ width: 1, maxWidth: 420, p: { xs: 3, sm: 5 } }}>
        <Stack spacing={1.5} sx={{ alignItems: 'center', mb: 4, textAlign: 'center' }}>
          <Mark2T size={64} />
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
            2Target
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Check-up, strategia, piano editoriale e KPI dei clienti
          </Typography>
        </Stack>

        <Stack component="form" action={action} spacing={2.5}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <TextField name="email" label="Email o utente" autoComplete="username" required fullWidth />
          <TextField
            name="password"
            type={show ? 'text' : 'password'}
            label="Password"
            autoComplete="current-password"
            required
            fullWidth
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow((v) => !v)} edge="end" aria-label="Mostra password">
                      <Iconify icon={show ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" size="large" variant="contained" color="inherit" loading={pending} fullWidth>
            Entra
          </Button>
        </Stack>
      </Card>

      <PoweredBy height={64} />
    </Box>
  );
}
