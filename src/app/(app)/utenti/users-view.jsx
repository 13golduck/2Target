'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { fmtDateTime } from 'src/lib/format';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { Scrollbar } from 'src/components/scrollbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { addUser, updateUser } from './actions';

// ----------------------------------------------------------------------

export function UsersView({ meId, users }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const change = (u, patch) =>
    start(async () => {
      const fd = new FormData();
      fd.set('id', u.id);
      fd.set('role', patch.role ?? u.role);
      fd.set('active', String(patch.active ?? u.active));
      const r = await updateUser(fd);
      if (r?.error) toast.error(r.error);
      else toast.success('Utente aggiornato');
    });

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="Utenti"
        links={[{ name: 'Panoramica' }, { name: 'Utenti' }]}
        action={
          <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setOpen(true)}>
            Nuovo utente
          </Button>
        }
        sx={{ mb: 3 }}
      />
      <Card>
        <Typography variant="body2" sx={{ color: 'text.secondary', p: 3, pb: 1 }}>
          Nessuna password: ognuno accede con il codice che riceve via email. Per togliere l&apos;accesso a qualcuno, disattivalo.
        </Typography>
        <Scrollbar>
          <Table sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Ruolo</TableCell>
                <TableCell>Ultimo accesso</TableCell>
                <TableCell align="right">Stato</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    {u.name} {u.id === meId && <Label sx={{ ml: 1 }}>tu</Label>}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <TextField select size="small" value={u.role} onChange={(e) => change(u, { role: e.target.value })} disabled={pending} sx={{ minWidth: 150 }}>
                      <MenuItem value="admin">Amministratore</MenuItem>
                      <MenuItem value="consulente">Consulente</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>{u.lastLoginAt ? fmtDateTime(new Date(u.lastLoginAt)) : 'Mai'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" color={u.active ? 'inherit' : 'success'} disabled={pending} onClick={() => change(u, { active: !u.active })}>
                      {u.active ? 'Disattiva' : 'Riattiva'}
                    </Button>
                    {!u.active && <Label color="error" sx={{ ml: 1 }}>Disattivato</Label>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Scrollbar>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <Box
          component="form"
          action={(fd) =>
            start(async () => {
              const r = await addUser(fd);
              if (r?.error) toast.error(r.error);
              else {
                toast.success('Utente aggiunto: può accedere con la sua email');
                setOpen(false);
              }
            })
          }
        >
          <DialogTitle>Nuovo utente</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField name="name" label="Nome e cognome" required autoFocus fullWidth />
              <TextField name="email" type="email" label="Email" required fullWidth />
              <TextField select name="role" label="Ruolo" defaultValue="consulente" fullWidth>
                <MenuItem value="consulente">Consulente</MenuItem>
                <MenuItem value="admin">Amministratore (gestisce utenti e limiti AI)</MenuItem>
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="submit" variant="contained" loading={pending}>Aggiungi</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </DashboardContent>
  );
}
