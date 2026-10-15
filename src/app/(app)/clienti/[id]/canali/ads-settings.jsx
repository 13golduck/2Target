'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { useRouter } from 'src/routes/hooks';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { loadAdAccounts, saveAdsSettings } from '../../../ads-actions';

// ----------------------------------------------------------------------
// Sponsorizzate del cliente: chi paga, da quale account pubblicitario, con quale tetto mensile.
// Se paga Golduck la spesa si rifattura al cliente con il ricarico (pagina Sponsorizzate).

const eur = (n) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export function AdsSettings({ clientId, ads, canEdit }) {
  const router = useRouter();
  const [payer, setPayer] = useState(ads.payer);
  const [account, setAccount] = useState(ads.adAccountId ? { id: ads.adAccountId, name: ads.adAccountName, currency: ads.currency } : null);
  const [accounts, setAccounts] = useState(null);
  const [cap, setCap] = useState(ads.monthlyCap ?? '');
  const [markup, setMarkup] = useState(ads.markup > 1 ? ads.markup : 1.8);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const load = () =>
    startLoad(async () => {
      const r = await loadAdAccounts(clientId);
      if (r.error) toast.error(r.error);
      else {
        setAccounts(r.accounts);
        if (!r.accounts.length) toast.warning('Nessun account pubblicitario visibile con questo collegamento Meta');
      }
    });

  const save = () =>
    startSave(async () => {
      const r = await saveAdsSettings({
        clientId,
        payer,
        adAccountId: account?.id ?? null,
        adAccountName: account?.name ?? null,
        currency: account?.currency ?? null,
        monthlyCap: cap === '' ? null : Number(cap),
        markup: Number(markup) || 1,
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success('Impostazioni delle sponsorizzate salvate');
        router.refresh();
      }
    });

  const options = accounts ?? (account ? [account] : []);
  const capUsed = ads.monthlyCap ? Math.min(100, ((ads.spentMonth + ads.committed) / ads.monthlyCap) * 100) : null;

  return (
    <Card sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Iconify icon="solar:wad-of-money-bold" width={26} sx={{ color: 'primary.main' }} />
        <Typography variant="subtitle1" sx={{ flex: 1 }}>Sponsorizzate Meta</Typography>
        <Label color={ads.payer === 'golduck' ? 'warning' : 'info'}>{ads.payer === 'golduck' ? 'Paga Golduck' : 'Paga il cliente'}</Label>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>Chi paga le inserzioni</Typography>
          <ToggleButtonGroup exclusive fullWidth size="small" value={payer} onChange={(_, v) => v && setPayer(v)} disabled={!canEdit} sx={{ mt: 0.5 }}>
            <ToggleButton value="cliente">Il cliente</ToggleButton>
            <ToggleButton value="golduck">Golduck (rifatturo)</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
            {payer === 'cliente'
              ? "Si usa l'account pubblicitario del cliente con la sua carta: Meta addebita direttamente a lui. Il cliente deve dare a Golduck l'accesso come partner."
              : "Si usa l'account pubblicitario di Golduck: Meta addebita a Golduck e a fine mese la spesa si rifattura al cliente con il ricarico."}
          </Typography>
          {payer === 'golduck' && (
            <TextField
              size="small"
              type="number"
              label="Ricarico sulla spesa"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              disabled={!canEdit}
              sx={{ mt: 2, width: 200 }}
              slotProps={{ htmlInput: { min: 1, max: 5, step: 0.05 }, input: { startAdornment: <InputAdornment position="start">×</InputAdornment> } }}
              helperText={`100 € di spesa → ${eur(100 * (Number(markup) || 1))} in fattura`}
            />
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>Account pubblicitario</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'flex-start' }}>
            <TextField
              select
              fullWidth
              size="small"
              value={account?.id ?? ''}
              onChange={(e) => setAccount(options.find((a) => a.id === e.target.value) ?? null)}
              disabled={!canEdit || !options.length}
              helperText={accounts ? `${accounts.length} account visibili con il collegamento Meta` : 'Premi «Carica» per leggere gli account da Meta'}
            >
              {options.map((a) => (
                <MenuItem key={a.id} value={a.id} disabled={a.status !== undefined && a.status !== 1}>
                  {a.name} · {a.currency}
                  {a.business ? ` · ${a.business}` : ''}
                  {a.status !== undefined && a.status !== 1 ? ' (non attivo)' : ''}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={load} loading={loading} disabled={!canEdit} sx={{ flexShrink: 0 }}>
              Carica
            </Button>
          </Stack>

          <TextField
            size="small"
            type="number"
            label="Tetto di spesa mensile"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            disabled={!canEdit}
            sx={{ mt: 2, width: 240 }}
            slotProps={{ htmlInput: { min: 0, step: 10 }, input: { endAdornment: <InputAdornment position="end">€</InputAdornment> } }}
            helperText="Vuoto = nessun tetto. Blocca i lanci che lo supererebbero."
          />
        </Grid>
      </Grid>

      {(ads.spentMonth > 0 || ads.committed > 0 || ads.monthlyCap) && (
        <Alert severity={capUsed != null && capUsed >= 90 ? 'warning' : 'info'} sx={{ mt: 2 }}>
          Questo mese: spesi {eur(ads.spentMonth)}, ancora impegnati {eur(ads.committed)} nelle sponsorizzate attive
          {ads.monthlyCap ? ` su un tetto di ${eur(ads.monthlyCap)}` : ''}.{' '}
          <Link href="/sponsorizzate">Vedi tutte le sponsorizzate</Link>
        </Alert>
      )}

      {canEdit ? (
        <Box sx={{ mt: 2, textAlign: 'right' }}>
          <Button variant="contained" onClick={save} loading={saving} startIcon={<Iconify icon="eva:checkmark-fill" />}>
            Salva
          </Button>
        </Box>
      ) : (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 2 }}>
          Le impostazioni delle sponsorizzate le modificano solo gli amministratori e chi è abilitato a pubblicare.
        </Typography>
      )}
    </Card>
  );
}
