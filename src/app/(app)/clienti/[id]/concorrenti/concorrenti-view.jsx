'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { askConfirm } from 'src/components/custom-dialog';

import { saveCompetitor, removeCompetitor, refreshCompetitorsNow } from '../../../competitor-actions';

// ----------------------------------------------------------------------
// Confronto con i concorrenti su Instagram: per ogni concorrente i numeri pubblici (follower, frequenza,
// interazioni, engagement, reel) accanto a quelli del cliente, con gli spunti e i loro post migliori.

const num = (n) => (n == null ? '—' : n.toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' }));
const pct = (n) => (n == null ? '—' : `${num(n)}%`);
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' }) : '—');
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

function MetricCells({ m, delta }) {
  const silent = daysSince(m?.lastPostAt);
  return (
    <>
      <TableCell align="right">
        {num(m?.followers)}
        {delta && (
          <Tooltip title={`Rispetto al ${date(delta.since)}`}>
            <Typography component="span" variant="caption" sx={{ ml: 0.5, color: delta.value >= 0 ? 'success.main' : 'error.main' }}>
              {delta.value >= 0 ? '+' : ''}
              {num(delta.value)}
            </Typography>
          </Tooltip>
        )}
      </TableCell>
      <TableCell align="right">{num(m?.postsPerWeek)}</TableCell>
      <TableCell align="right">{num(m?.avgInteractions)}</TableCell>
      <TableCell align="right">{pct(m?.er)}</TableCell>
      <TableCell align="right">{pct(m?.reelsShare)}</TableCell>
      <TableCell align="right" sx={{ color: silent != null && silent > 30 ? 'warning.main' : undefined }}>
        {date(m?.lastPostAt)}
      </TableCell>
    </>
  );
}

export function ConcorrentiView({ clientId, canEdit, client, rows, insights }) {
  const [edit, setEdit] = useState(null);
  // Esito dell'ultima lettura: resta visibile (un avviso a scomparsa si perde)
  const [problems, setProblems] = useState([]);
  const [busy, start] = useTransition();
  const missingIg = rows.filter((r) => !r.instagram);
  const tops = rows.flatMap((r) => (r.metrics?.topPosts ?? []).slice(0, 2).map((p) => ({ ...p, name: r.name })));

  const refresh = () =>
    start(async () => {
      const r = await refreshCompetitorsNow(clientId);
      setProblems(r.errors ?? []);
      if (r.done) toast.success(`Letti ${r.done} concorrenti`);
      else if (!r.errors?.length) toast.info('Nessun concorrente con profilo Instagram da leggere');
    });

  const remove = async (r) => {
    if (!(await askConfirm({ title: `Rimuovere «${r.name}»?`, content: 'Si perdono anche i numeri raccolti finora.', confirmText: 'Rimuovi' }))) return;
    start(async () => {
      const res = await removeCompetitor(r.id);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader
          title="Concorrenti su Instagram"
          subheader="Numeri pubblici letti ogni notte con l'API ufficiale di Meta (solo profili professionali). Il cliente è nella prima riga."
          action={
            canEdit && (
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={refresh} disabled={busy || !rows.length} startIcon={<Iconify icon="solar:restart-bold" />}>
                  Aggiorna ora
                </Button>
                <Button variant="contained" onClick={() => setEdit({})} startIcon={<Iconify icon="mingcute:add-line" />}>
                  Aggiungi
                </Button>
              </Stack>
            )
          }
          sx={{ flexWrap: 'wrap', gap: 2, '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }}
        />
        <Box sx={{ p: 3, pt: 2 }}>
          {!rows.length ? (
            <Alert severity="info">
              Nessun concorrente ancora. Il check-up li propone da solo; puoi anche aggiungerli qui con il loro profilo Instagram.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Profilo</TableCell>
                    <TableCell align="right">Follower</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Calcolati sugli ultimi 12 post">
                        <span>Post a settimana</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">Interazioni medie</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Interazioni medie (like + commenti) diviso follower">
                        <span>Engagement</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">Reel</TableCell>
                    <TableCell align="right">Ultimo post</TableCell>
                    {canEdit && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow sx={{ bgcolor: 'background.neutral' }}>
                    <TableCell>
                      <Typography variant="subtitle2">Cliente</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {client ? `@${client.handle}` : 'Instagram non collegato: collegalo da Canali per il confronto'}
                      </Typography>
                    </TableCell>
                    <MetricCells m={client?.metrics} />
                    {canEdit && <TableCell />}
                  </TableRow>
                  {rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2">{r.name}</Typography>
                        {r.instagram ? (
                          <Link href={`https://www.instagram.com/${r.instagram}/`} target="_blank" rel="noopener" variant="caption">
                            @{r.instagram}
                          </Link>
                        ) : (
                          <Label color="warning" variant="soft">senza profilo Instagram</Label>
                        )}
                        {r.instagram && !r.metrics && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>
                            non ancora letto
                          </Typography>
                        )}
                      </TableCell>
                      <MetricCells m={r.metrics} delta={r.followersDelta} />
                      {canEdit && (
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title="Modifica">
                            <IconButton size="small" onClick={() => setEdit(r)}>
                              <Iconify icon="solar:pen-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Rimuovi">
                            <IconButton size="small" onClick={() => remove(r)}>
                              <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {!!problems.length && (
            <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setProblems([])}>
              Lettura da Instagram non riuscita:
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </Box>
            </Alert>
          )}
          {!!missingIg.length && canEdit && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {missingIg.length === 1 ? `«${missingIg[0].name}» non ha` : `${missingIg.length} concorrenti non hanno`} il profilo Instagram: aggiungilo con la matita per
              seguirne i numeri.
            </Alert>
          )}
        </Box>
      </Card>

      {!!insights.length && (
        <Card>
          <CardHeader title="Cosa ci dicono" avatar={<Iconify icon="solar:cup-star-bold" sx={{ color: 'warning.main' }} />} />
          <Stack component="ul" spacing={1} sx={{ p: 3, pt: 1, m: 0, pl: 5 }}>
            {insights.map((t) => (
              <Typography key={t} component="li" variant="body2">
                {t}
              </Typography>
            ))}
          </Stack>
        </Card>
      )}

      {!!tops.length && (
        <Card>
          <CardHeader title="I loro post migliori" subheader="Da guardare per idee su formati e argomenti che funzionano nel settore" />
          <Stack spacing={1} sx={{ p: 3, pt: 2 }}>
            {tops.map((p) => (
              <Stack key={p.permalink} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Label variant="soft">{p.type === 'REELS' ? 'Reel' : p.type === 'CAROUSEL_ALBUM' ? 'Carosello' : 'Post'}</Label>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {p.name} · {date(p.at)} · {num(p.interactions)} interazioni
                </Typography>
                <Button size="small" href={p.permalink} target="_blank" rel="noopener" endIcon={<Iconify icon="eva:external-link-fill" />}>
                  Apri
                </Button>
              </Stack>
            ))}
          </Stack>
        </Card>
      )}

      {edit && <EditDialog clientId={clientId} value={edit} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

function EditDialog({ clientId, value, onClose }) {
  const [busy, start] = useTransition();
  const submit = (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveCompetitor({ clientId, id: value.id, name: String(f.get('name') ?? ''), instagram: String(f.get('instagram') ?? '') || undefined });
      if (r.error) return toast.error(r.error);
      if (r.warning) toast.warning(`Salvato, ma Instagram non l'ha restituito: ${r.warning}`);
      else toast.success('Salvato');
      onClose();
    });
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" component="form" onSubmit={submit}>
      <DialogTitle>{value.id ? 'Modifica concorrente' : 'Aggiungi concorrente'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField name="name" label="Nome" defaultValue={value.name ?? ''} required autoFocus fullWidth />
          <TextField
            name="instagram"
            label="Profilo Instagram"
            defaultValue={value.instagram ? `@${value.instagram}` : ''}
            placeholder="@nome oppure link del profilo"
            helperText="Deve essere un profilo professionale (aziendale o creator)"
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button type="submit" variant="contained" loading={busy}>
          Salva
        </Button>
      </DialogActions>
    </Dialog>
  );
}
