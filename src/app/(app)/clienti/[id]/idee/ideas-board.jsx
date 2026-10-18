'use client';

import { useState, useOptimistic, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Menu from '@mui/material/Menu';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { Scrollbar } from 'src/components/scrollbar';
import { EvidenceHint } from 'src/components/evidence-hint';

import { addIdea, moveIdea, planIdea, voteIdea, setIdeaStatus } from '../../../actions';

// ----------------------------------------------------------------------

const COLUMNS = [
  { key: 'idea', label: 'Idee', color: 'default' },
  { key: 'in_sviluppo', label: 'In sviluppo', color: 'info' },
  { key: 'approvata', label: 'Approvate', color: 'success' },
  { key: 'pianificata', label: 'Nel piano', color: 'primary' },
];
const ORIGIN = { team: 'team', ai: 'AI', cliente: 'cliente' };
const FORMAT_COLOR = { reel: 'secondary', post: 'primary', carosello: 'info', storia: 'warning' };

export function IdeasBoard({ clientId, ideas, plans, formats, stages }) {
  const [list, moveLocal] = useOptimistic(ideas, (state, { id, status }) =>
    state.map((i) => (i.id === id ? { ...i, status } : i))
  );
  const [, start] = useTransition();
  const [over, setOver] = useState(null);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(null);
  const [filter, setFilter] = useState('');

  const visible = list.filter((i) => i.status !== 'scartata' && (!filter || i.format === filter));
  const discarded = list.filter((i) => i.status === 'scartata').length;

  const onDrop = (status, e) => {
    e.preventDefault();
    setOver(null);
    moveTo(Number(e.dataTransfer.getData('text/idea')), status);
  };

  /** Sposta un'idea in un'altra colonna (trascinando o dal menu «Sposta», che funziona anche col dito). */
  const moveTo = (id, status) => {
    const idea = list.find((i) => i.id === id);
    if (!idea || idea.status === status) return;
    if (status === 'pianificata') {
      setPlanning(idea);
      return;
    }
    start(async () => {
      moveLocal({ id, status });
      await moveIdea(id, status);
    });
  };

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          Trascina le schede da una colonna all&apos;altra, oppure usa «Sposta» sulla scheda. Portandole in «Nel piano» diventano una pubblicazione.
        </Typography>
        <TextField
          select
          size="small"
          label="Formato"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Tutti</MenuItem>
          {formats.map((f) => (
            <MenuItem key={f} value={f}>
              {f}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setAdding(true)}>
          Nuova idea
        </Button>
      </Stack>

      <Scrollbar sx={{ pb: 2 }}>
        <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} sx={{ alignItems: 'flex-start', minWidth: { md: 1100 } }}>
          {COLUMNS.map((col) => {
            const items = visible.filter((i) => i.status === col.key).sort((a, b) => b.score - a.score);
            return (
              <Paper
                key={col.key}
                variant="outlined"
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(col.key);
                }}
                onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
                onDrop={(e) => onDrop(col.key, e)}
                sx={{
                  flex: 1,
                  minWidth: { xs: '82vw', sm: 300, md: 260 },
                  scrollSnapAlign: 'start',
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: over === col.key ? 'primary.lighter' : 'background.neutral',
                  borderStyle: over === col.key ? 'dashed' : 'solid',
                  borderColor: over === col.key ? 'primary.main' : 'divider',
                  transition: 'background-color 120ms',
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 1 }}>
                  <Typography variant="h6" sx={{ flex: 1 }}>
                    {col.label}
                  </Typography>
                  <Label color={col.color}>{items.length}</Label>
                </Stack>
                <Stack spacing={1.5} sx={{ minHeight: 120 }}>
                  {items.map((i) => (
                    <IdeaCard key={i.id} idea={i} onPlan={() => setPlanning(i)} onMove={(status) => moveTo(i.id, status)} canPlan={plans.length > 0} />
                  ))}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Scrollbar>
      {discarded > 0 && (
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {discarded} idee scartate non mostrate.
        </Typography>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm">
        <Box component="form" action={async (fd) => { await addIdea(fd); setAdding(false); }}>
          <DialogTitle>Nuova idea</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <input type="hidden" name="clientId" value={clientId} />
              <TextField name="title" label="Titolo" required autoFocus fullWidth />
              <TextField name="body" label="Descrizione / spunti" multiline minRows={3} fullWidth />
              <Stack direction="row" spacing={2}>
                <TextField select name="format" label="Formato" defaultValue="" fullWidth>
                  <MenuItem value="">—</MenuItem>
                  {formats.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </TextField>
                <TextField select name="stage" label="Fase del funnel" defaultValue="" fullWidth>
                  <MenuItem value="">—</MenuItem>
                  {stages.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
                </TextField>
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAdding(false)}>Annulla</Button>
            <Button type="submit" variant="contained">Aggiungi</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={!!planning} onClose={() => setPlanning(null)} fullWidth maxWidth="xs">
        {planning && (
          <Box component="form" action={planIdea}>
            <DialogTitle>Metti nel piano</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 2 }}>
                «{planning.title}» diventa una scheda del piano editoriale, da completare con data, script, caption e CTA.
              </Typography>
              <input type="hidden" name="ideaId" value={planning.id} />
              {plans.length ? (
                <TextField select name="planId" label="Piano" defaultValue={plans[0].id} fullWidth>
                  {plans.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              ) : (
                <Typography color="error">Crea prima un piano editoriale.</Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPlanning(null)}>Annulla</Button>
              <Button type="submit" variant="contained" disabled={!plans.length}>Crea la scheda</Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </>
  );
}

// ----------------------------------------------------------------------

function IdeaCard({ idea, onPlan, onMove, canPlan }) {
  const [menu, setMenu] = useState(null);
  return (
    <Card
      draggable={idea.status !== 'pianificata'}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/idea', String(idea.id));
        e.dataTransfer.effectAllowed = 'move';
      }}
      sx={{
        p: 2,
        cursor: idea.status === 'pianificata' ? 'default' : 'grab',
        '&:active': { cursor: idea.status === 'pianificata' ? 'default' : 'grabbing' },
        '&:hover .idea-actions': { opacity: 1 },
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        {idea.title}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
        {idea.format && <Label color={FORMAT_COLOR[idea.format] ?? 'default'}>{idea.format}</Label>}
        {idea.stage && <Label variant="outlined">{idea.stage}</Label>}
        <Label variant="outlined" color="default">da {ORIGIN[idea.origin]}</Label>
        {idea.evidence != null && <EvidenceHint evidence={idea.evidence || 'Proposta alla consegna del check-up'} label="Dal check-up" />}
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Box component="form" action={voteIdea} sx={{ display: 'flex', alignItems: 'center' }}>
          <input type="hidden" name="ideaId" value={idea.id} />
          <Tooltip title="Mi piace">
            <IconButton type="submit" name="value" value="1" size="small">
              <Iconify icon="eva:arrow-upward-fill" width={18} />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ width: 20, textAlign: 'center', fontWeight: 700 }}>
            {idea.score}
          </Typography>
          <Tooltip title="Non convince">
            <IconButton type="submit" name="value" value="-1" size="small">
              <Iconify icon="eva:arrow-downward-fill" width={18} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" className="idea-actions" sx={{ opacity: { xs: 1, md: 0 }, transition: 'opacity 120ms' }}>
          {idea.status !== 'pianificata' && (
            <>
              <Tooltip title="Sposta in un'altra colonna">
                <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)}>
                  <Iconify icon="eva:more-horizontal-fill" width={18} />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
                {COLUMNS.filter((c) => c.key !== idea.status && (c.key !== 'pianificata' || canPlan)).map((c) => (
                  <MenuItem
                    key={c.key}
                    onClick={() => {
                      setMenu(null);
                      onMove(c.key);
                    }}
                  >
                    Sposta in «{c.label}»
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
          {idea.status === 'approvata' && canPlan && (
            <Tooltip title="Metti nel piano">
              <IconButton size="small" color="primary" onClick={onPlan}>
                <Iconify icon="solar:calendar-date-bold" width={18} />
              </IconButton>
            </Tooltip>
          )}
          {idea.status !== 'pianificata' && (
            <Box component="form" action={setIdeaStatus} onSubmit={() => toast.success('Idea scartata')}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <Tooltip title="Scarta (non si cancella)">
                <IconButton type="submit" name="status" value="scartata" size="small" aria-label="Scarta idea">
                  <Iconify icon="solar:archive-down-minimlistic-bold" width={18} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
