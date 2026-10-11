'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
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

const ROLE_COLORS = { superadmin: 'warning', admin: 'primary', user: 'info', viewer: 'default' };

export function UsersView({ meId, users, roles, roleLabels, clients }) {
  const [editing, setEditing] = useState(null); // {} = nuovo utente
  const [pending, start] = useTransition();

  const toggleActive = (u) =>
    start(async () => {
      const fd = new FormData();
      fd.set('id', u.id);
      fd.set('role', u.role);
      fd.set('active', String(!u.active));
      u.clientIds.forEach((c) => fd.append('clientIds', c));
      const r = await updateUser(fd);
      if (r?.error) toast.error(r.error);
      else toast.success(u.active ? 'Utente disattivato' : 'Utente riattivato');
    });

  const clientName = (id) => clients.find((c) => c.id === id)?.name ?? '—';

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="Utenti"
        links={[{ name: 'Panoramica' }, { name: 'Utenti' }]}
        action={
          <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setEditing({})}>
            Nuovo utente
          </Button>
        }
        sx={{ mb: 3 }}
      />
      <Card>
        <Stack spacing={0.5} sx={{ p: 3, pb: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Nessuna password: ognuno accede con il codice che riceve via email. Per togliere l&apos;accesso a qualcuno, disattivalo.
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            <b>Super admin</b> titolare, intoccabile · <b>Administrator</b> gestisce utenti e impostazioni · <b>User</b> operatore che
            lavora sui clienti · <b>Viewer</b> cliente: vede solo grafici e risultati dei suoi clienti
          </Typography>
        </Stack>
        {/* Smartphone: una scheda per utente */}
        <Stack spacing={1.5} sx={{ p: 2, display: { xs: 'flex', md: 'none' } }}>
          {users.map((u) => {
            const locked = u.role === 'superadmin';
            return (
              <Box key={u.id} sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {u.name} {u.id === meId && <Label sx={{ ml: 0.5 }}>tu</Label>}
                  </Typography>
                  <Label color={ROLE_COLORS[u.role]} startIcon={locked ? <Iconify icon="solar:lock-password-outline" /> : null}>
                    {roleLabels[u.role]}
                  </Label>
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary', wordBreak: 'break-all' }}>{u.email}</Typography>
                {u.role === 'viewer' && (
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                    {u.clientIds.map((id) => (
                      <Chip key={id} size="small" label={clientName(id)} />
                    ))}
                  </Stack>
                )}
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
                    Ultimo accesso: {u.lastLoginAt ? fmtDateTime(new Date(u.lastLoginAt)) : 'mai'}
                    {!u.active && ' · disattivato'}
                  </Typography>
                  {locked ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Non modificabile</Typography>
                  ) : (
                    <>
                      <Button size="small" color="inherit" disabled={pending} onClick={() => setEditing(u)}>
                        Modifica
                      </Button>
                      {u.id !== meId && (
                        <Button size="small" color={u.active ? 'inherit' : 'success'} disabled={pending} onClick={() => toggleActive(u)}>
                          {u.active ? 'Disattiva' : 'Riattiva'}
                        </Button>
                      )}
                    </>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>

        <Scrollbar sx={{ display: { xs: 'none', md: 'block' } }}>
          <Table sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Ruolo</TableCell>
                <TableCell>Clienti visibili</TableCell>
                <TableCell>Ultimo accesso</TableCell>
                <TableCell align="right">Stato</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => {
                const locked = u.role === 'superadmin';
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      {u.name} {u.id === meId && <Label sx={{ ml: 1 }}>tu</Label>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Label color={ROLE_COLORS[u.role]} startIcon={locked ? <Iconify icon="solar:lock-password-outline" /> : null}>
                        {roleLabels[u.role]}
                      </Label>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      {u.role === 'viewer' ? (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {u.clientIds.map((id) => (
                            <Chip key={id} size="small" label={clientName(id)} />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Tutti
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{u.lastLoginAt ? fmtDateTime(new Date(u.lastLoginAt)) : 'Mai'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {locked ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Non modificabile
                        </Typography>
                      ) : (
                        <>
                          {!u.active && (
                            <Label color="error" sx={{ mr: 1 }}>
                              Disattivato
                            </Label>
                          )}
                          <Tooltip title="Modifica ruolo e clienti">
                            <IconButton size="small" disabled={pending} onClick={() => setEditing(u)}>
                              <Iconify icon="solar:pen-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                          {u.id !== meId && (
                            <Button size="small" color={u.active ? 'inherit' : 'success'} disabled={pending} onClick={() => toggleActive(u)}>
                              {u.active ? 'Disattiva' : 'Riattiva'}
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Scrollbar>
      </Card>

      {editing && (
        <UserDialog
          key={editing.id ?? 'nuovo'}
          user={editing}
          roles={roles}
          clients={clients}
          onClose={() => setEditing(null)}
        />
      )}
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function UserDialog({ user, roles, clients, onClose }) {
  const isNew = !user.id;
  const [role, setRole] = useState(user.role ?? 'user');
  const [selected, setSelected] = useState(clients.filter((c) => (user.clientIds ?? []).includes(c.id)));
  const [pending, start] = useTransition();

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <Box
        component="form"
        action={(fd) =>
          start(async () => {
            selected.forEach((c) => fd.append('clientIds', c.id));
            if (!isNew) {
              fd.set('id', user.id);
              fd.set('active', String(user.active));
            }
            const r = isNew ? await addUser(fd) : await updateUser(fd);
            if (r?.error) toast.error(r.error);
            else {
              toast.success(isNew ? 'Utente aggiunto: può accedere con la sua email' : 'Utente aggiornato');
              onClose();
            }
          })
        }
      >
        <DialogTitle>{isNew ? 'Nuovo utente' : `Modifica ${user.name}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {isNew && (
              <>
                <TextField name="name" label="Nome e cognome" required autoFocus fullWidth />
                <TextField name="email" type="email" label="Email" required fullWidth />
              </>
            )}
            <TextField select name="role" label="Ruolo" value={role} onChange={(e) => setRole(e.target.value)} fullWidth>
              {roles.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  <Stack>
                    <Typography variant="body2">{r.label}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {r.hint}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            {role === 'viewer' && (
              <Autocomplete
                multiple
                options={clients}
                value={selected}
                onChange={(_, v) => setSelected(v)}
                getOptionLabel={(c) => c.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => (
                  <TextField {...params} label="Clienti che può vedere" helperText="Vedrà solo KPI, Lead e SEO di questi clienti" />
                )}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annulla</Button>
          <Button type="submit" variant="contained" loading={pending}>
            {isNew ? 'Aggiungi' : 'Salva'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
