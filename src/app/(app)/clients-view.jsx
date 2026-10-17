'use client';

import { useBoolean } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CardActionArea from '@mui/material/CardActionArea';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { StatusBadge } from 'src/components/status-badge';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { createClient } from './actions';
import { TodayView } from './today-view';

// ----------------------------------------------------------------------

export function ClientsView({ clients, readOnly = false, board, userName = '' }) {
  const dialog = useBoolean();

  return (
    <DashboardContent>
      {board && <TodayView board={board} userName={userName} />}

      <CustomBreadcrumbs
        heading="Clienti"
        links={board ? [] : [{ name: 'Panoramica' }, { name: 'Clienti' }]}
        action={
          readOnly ? null : (
            <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={dialog.onTrue}>
              Nuovo cliente
            </Button>
          )
        }
        sx={{ mb: 3 }}
      />

      {clients.length === 0 ? (
        <EmptyContent filled title="Nessun cliente" description="Aggiungi il primo cliente per iniziare il check-up." sx={{ py: 10 }} />
      ) : (
        <Grid container spacing={3}>
          {clients.map((c) => (
            <Grid key={c.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card>
                <CardActionArea component={RouterLink} href={`/clienti/${c.id}`} sx={{ p: 3 }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <Avatar src={c.logo ?? undefined} alt={c.name} variant={c.logo ? 'rounded' : 'circular'} sx={{ bgcolor: c.logo ? '#fff' : 'primary.lighter', color: 'primary.darker', fontWeight: 700, '& img': { objectFit: 'contain' } }}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" noWrap>
                        {c.name}
                      </Typography>
                      <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
                        {c.sector ?? '—'}
                      </Typography>
                    </Box>
                    <StatusBadge status={c.status} />
                  </Stack>

                  <Divider sx={{ my: 2.5, borderStyle: 'dashed' }} />

                  <Stack direction="row" sx={{ justifyContent: 'space-between', textAlign: 'center' }}>
                    <Stat label="Prossima uscita" value={c.nextAt ? new Date(c.nextAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '—'} />
                    <Stat label="In 7 giorni" value={c.week} />
                    <Stat label="Da approvare" value={c.toApprove} color={c.toApprove ? 'warning.main' : 'text.primary'} />
                    <Stat
                      label={c.kpi.total ? 'KPI in linea' : 'KPI'}
                      value={c.kpi.total ? `${c.kpi.bene}/${c.kpi.total}` : '—'}
                      color={c.kpi.troppo_male ? 'error.main' : c.kpi.male ? 'warning.main' : c.kpi.total ? 'success.main' : 'text.disabled'}
                    />
                  </Stack>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={dialog.value} onClose={dialog.onFalse} fullWidth maxWidth="xs">
        <Box component="form" action={createClient}>
          <DialogTitle>Nuovo cliente</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField name="name" label="Ragione sociale o nome" required autoFocus fullWidth />
              <TextField name="sector" label="Settore" fullWidth />
              <TextField name="website" label="Sito web" placeholder="www.esempio.it" fullWidth />
              <Stack direction="row" spacing={2}>
                <TextField name="vatNumber" label="Partita IVA" fullWidth />
                <TextField name="city" label="Città / zona" fullWidth />
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Dopo la creazione si apre il check-up: con l&apos;AI si parte da questi dati.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={dialog.onFalse}>Annulla</Button>
            <Button type="submit" variant="contained">
              Crea e inizia il check-up
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </DashboardContent>
  );
}

function Stat({ label, value, color = 'text.primary' }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ color }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
        {label}
      </Typography>
    </Box>
  );
}
