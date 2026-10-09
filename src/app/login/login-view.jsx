'use client';

import { useActionState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';

import { Mark2T } from 'src/components/logo';
import { PoweredBy } from 'src/layouts/components/powered-by';

import { loginStep } from './actions';

// ----------------------------------------------------------------------
// Accesso senza password: 1) email  2) codice di 6 cifre ricevuto via email.

export function LoginView({ returnTo }) {
  const [state, action, pending] = useActionState(loginStep, { step: 'email' });
  const codeStep = state.step === 'code';

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
            {codeStep ? 'Inserisci il codice che ti abbiamo inviato' : 'Accedi con la tua email: ti mandiamo un codice'}
          </Typography>
        </Stack>

        <Stack component="form" action={action} spacing={2.5}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <TextField
            name="email"
            type="email"
            label="Email"
            autoComplete="username"
            defaultValue={state.email ?? ''}
            required
            fullWidth
            autoFocus={!codeStep}
            slotProps={{ input: { readOnly: codeStep } }}
          />

          {codeStep && (
            <>
              {state.info && !state.error && <Alert severity="info">{state.info}</Alert>}
              <TextField
                name="code"
                label="Codice di 6 cifre"
                autoComplete="one-time-code"
                required
                fullWidth
                autoFocus
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 7, style: { letterSpacing: 6, fontSize: 22, textAlign: 'center' } } }}
              />
              <FormControlLabel
                control={<Checkbox name="remember" />}
                label={
                  <Typography variant="body2">
                    Ricordami su questo dispositivo
                    <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                      Non ti chiediamo il codice per 30 giorni. Non usarlo su computer condivisi.
                    </Typography>
                  </Typography>
                }
                sx={{ alignItems: 'flex-start', mt: -1, '& .MuiCheckbox-root': { pt: 0.5 } }}
              />
            </>
          )}

          {state.error && <Alert severity="error">{state.error}</Alert>}

          <Button type="submit" size="large" variant="contained" color="inherit" loading={pending} fullWidth>
            {codeStep ? 'Entra' : 'Inviami il codice'}
          </Button>

          {codeStep && (
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Button type="submit" name="action" value="codice" size="small" disabled={pending} formNoValidate>
                Inviami un nuovo codice
              </Button>
              <Link href="/login" variant="body2" sx={{ alignSelf: 'center' }}>
                Cambia email
              </Link>
            </Stack>
          )}
        </Stack>
      </Card>

      <PoweredBy height={64} />
    </Box>
  );
}
