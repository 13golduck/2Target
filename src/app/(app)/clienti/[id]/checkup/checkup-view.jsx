'use client';

import { useState, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Accordion from '@mui/material/Accordion';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';

import { fmtDate } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';

import { createCheckup, setCheckupStatus, saveCheckupSection } from '../../../actions';

// ----------------------------------------------------------------------

const STATUS = {
  bozza: { label: 'Bozza', color: 'default' },
  in_revisione: { label: 'In revisione', color: 'warning' },
  consegnato: { label: 'Consegnato', color: 'success' },
};

export function CheckupView({ clientId, checkup, template, content }) {
  if (!checkup) {
    return (
      <Card sx={{ p: 4, maxWidth: 520 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Communication Check-Up
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          Le 8 sezioni del modello Golduck: strumenti, posizionamento, buyer persona, canali, obiettivi, benchmark, SWOT e best
          practice.
        </Typography>
        <Stack component="form" action={createCheckup} direction="row" spacing={2}>
          <input type="hidden" name="clientId" value={clientId} />
          <TextField name="period" label="Periodo" placeholder="es. Ottobre 2026" size="small" />
          <Button type="submit" variant="contained">
            Inizia il check-up
          </Button>
        </Stack>
      </Card>
    );
  }

  const filledOf = (sec) => sec.fields.filter((f) => content[sec.key]?.[f.key]?.trim()).length;
  const total = template.reduce((t, s) => t + s.fields.length, 0);
  const filled = template.reduce((t, s) => t + filledOf(s), 0);

  return (
    <Stack spacing={3}>
      <Card sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' } }}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="h6">
                {checkup.title} · {checkup.period}
              </Typography>
              <Label color={STATUS[checkup.status].color}>{STATUS[checkup.status].label}</Label>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              {filled} campi compilati su {total}
              {checkup.deliveredAt && ` · consegnato il ${fmtDate(checkup.deliveredAt)}`}
            </Typography>
            <LinearProgress variant="determinate" value={(filled / total) * 100} sx={{ height: 8, borderRadius: 1, maxWidth: 420 }} />
          </Box>
          <Stack component="form" action={setCheckupStatus} direction="row" spacing={1}>
            <input type="hidden" name="checkupId" value={checkup.id} />
            <TextField select name="status" defaultValue={checkup.status} size="small" sx={{ minWidth: 160 }}>
              {Object.entries(STATUS).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  {v.label}
                </MenuItem>
              ))}
            </TextField>
            <Button type="submit" variant="outlined">
              Aggiorna
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Box>
        {template.map((sec, i) => (
          <Section key={sec.key} index={i} section={sec} checkupId={checkup.id} values={content[sec.key] ?? {}} filled={filledOf(sec)} />
        ))}
      </Box>
    </Stack>
  );
}

function Section({ index, section, checkupId, values, filled }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(index === 0);
  const complete = filled === section.fields.length;

  return (
    <Accordion expanded={open} onChange={(_, v) => setOpen(v)} sx={{ mb: 1.5, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<Iconify icon="eva:arrow-ios-downward-fill" />}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', width: 1, pr: 2 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 14,
              bgcolor: complete ? 'success.lighter' : 'primary.lighter',
              color: complete ? 'success.darker' : 'primary.darker',
            }}
          >
            {complete ? <Iconify icon="eva:checkmark-fill" width={18} /> : index + 1}
          </Box>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            {section.title}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {filled}/{section.fields.length}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack
          component="form"
          spacing={2.5}
          action={(fd) =>
            start(async () => {
              await saveCheckupSection(fd);
              toast.success('Sezione salvata');
            })
          }
        >
          <input type="hidden" name="checkupId" value={checkupId} />
          <input type="hidden" name="sectionKey" value={section.key} />
          {section.guide.length > 0 && (
            <Alert severity="info" icon={<Iconify icon="solar:info-circle-bold" />}>
              {section.guide.map((g) => (
                <div key={g}>{g}</div>
              ))}
            </Alert>
          )}
          {section.fields.map((f) => (
            <TextField
              key={f.key}
              name={`field:${f.key}`}
              label={f.label}
              defaultValue={values[f.key] ?? ''}
              helperText={f.kind === 'elenco' ? 'Una voce per riga' : ' '}
              multiline
              minRows={f.kind === 'testo' ? 3 : 4}
              fullWidth
            />
          ))}
          <Box>
            <Button type="submit" variant="contained" loading={pending}>
              Salva sezione
            </Button>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
