'use client';

import { useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { fmtDateTime } from 'src/lib/format';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { toast } from 'src/components/snackbar';
import { EvidenceHint } from 'src/components/evidence-hint';

import { CHANNEL } from '../canali/channels-view';
import { prepareFoundation } from '../../../checkup-ai-actions';

// ----------------------------------------------------------------------

// Base di lavoro preparata alla consegna del check-up: KPI, canali da collegare, rubriche, idee e bozza di piano,
// ognuno legato alle evidenze del check-up da cui nasce.

const ACTION = { collegare: 'Da collegare', aprire: 'Da aprire', riattivare: 'Da riattivare' };
const PRIORITY = { 1: { label: 'Subito', color: 'error' }, 2: { label: 'Entro un mese', color: 'warning' }, 3: { label: 'Più avanti', color: 'default' } };

export function FoundationCard({ clientId, checkup, aiConfigured }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const f = checkup.foundation;
  const working = f.state === 'in_corso' && f.running;
  // «In corso» senza un processo che la segue: l'app si è riavviata a metà
  const stopped = f.state === 'in_corso' && !f.running;

  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [working, router]);

  const prepare = () =>
    start(async () => {
      const r = await prepareFoundation(checkup.id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success('Preparazione avviata: ci vogliono 1-3 minuti');
        router.refresh();
      }
    });

  const header = (
    <CardHeader
      avatar={<Iconify icon="solar:file-check-bold-duotone" width={28} sx={{ color: 'primary.main' }} />}
      title="Base di lavoro dal check-up"
      subheader={
        f.state === 'pronta' && f.at
          ? `Preparata il ${fmtDateTime(f.at)} · ogni proposta riporta le evidenze del check-up da cui nasce`
          : 'KPI con punto di partenza e obiettivo, canali da collegare, rubriche, prime idee e bozza del primo mese di piano'
      }
    />
  );

  if (working) {
    return (
      <Card>
        {header}
        <Stack spacing={1.5} sx={{ p: 3, pt: 2 }}>
          <Typography variant="body2">{f.progress ?? 'Preparo la base di lavoro'}</Typography>
          <LinearProgress sx={{ height: 6, borderRadius: 1, maxWidth: 420 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Ci vogliono 1-3 minuti. Puoi chiudere la pagina.</Typography>
        </Stack>
      </Card>
    );
  }

  if (f.state !== 'pronta') {
    const failed = f.state === 'errore' || stopped;
    return (
      <Card>
        {header}
        <Stack spacing={2} sx={{ p: 3, pt: 2 }}>
          {failed && (
            <Alert severity="error">
              {stopped ? "La preparazione si è fermata per un riavvio dell'app." : f.error || 'La preparazione non è riuscita.'} Non è stato salvato niente: puoi rifarla.
            </Alert>
          )}
          {!failed && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Dal check-up consegnato l&apos;AI propone KPI, canali, rubriche, idee e una bozza di piano di 4 settimane. Non tocca ciò che c&apos;è già:
              i KPI con la stessa metrica non si duplicano e la bozza di piano si salta se c&apos;è già un piano nello stesso periodo.
            </Typography>
          )}
          {!aiConfigured && <Alert severity="warning">Manca la chiave API di Anthropic: un amministratore la inserisce in Impostazioni → Integrazioni.</Alert>}
          <Box>
            <Button variant="contained" onClick={prepare} loading={pending} disabled={!aiConfigured} startIcon={<Iconify icon="solar:atom-bold-duotone" />}>
              {failed ? 'Prepara di nuovo' : 'Prepara la base di lavoro'}
            </Button>
          </Box>
        </Stack>
      </Card>
    );
  }

  const s = f.summary;
  const tiles = [
    {
      icon: 'solar:flag-bold',
      title: `${s.kpis} KPI`,
      text: s.kpisSkipped ? `${s.kpisSkipped} già presenti, non duplicati` : 'Con punto di partenza e obiettivo',
      href: `/clienti/${clientId}/kpi`,
      cta: 'Apri i KPI',
    },
    {
      icon: 'solar:notebook-bold-duotone',
      title: `${s.pillars} rubriche · ${s.ideas} idee`,
      text: 'Nella bacheca, colonna «Idea»',
      href: `/clienti/${clientId}/idee`,
      cta: 'Apri le idee',
    },
    s.planId
      ? {
          icon: 'solar:calendar-date-bold',
          title: `Bozza di piano · ${s.planItems} contenuti`,
          text: 'Primo mese: titoli e angoli, testi da scrivere',
          href: `/clienti/${clientId}/piano?piano=${s.planId}`,
          cta: 'Apri il piano',
        }
      : {
          icon: 'solar:calendar-date-bold',
          title: 'Bozza di piano non creata',
          text: s.planSkipped ?? 'Nessun contenuto proposto',
          href: `/clienti/${clientId}/piano`,
          cta: 'Vai al piano',
        },
  ];
  const extra = [s.personas && `${s.personas} buyer persona`, s.objectives && `${s.objectives} obiettivi per fase del funnel`].filter(Boolean);
  const missing = s.channels.filter((c) => !c.connected).length;

  return (
    <Card>
      {header}
      <Box sx={{ p: 3, pt: 2 }}>
        <Grid container spacing={2}>
          {tiles.map((t) => (
            <Grid key={t.title} size={{ xs: 12, md: 4 }}>
              <Stack spacing={1} sx={{ p: 2, height: 1, borderRadius: 1.5, border: (theme) => `solid 1px ${theme.vars.palette.divider}` }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Iconify icon={t.icon} width={22} sx={{ color: 'primary.main' }} />
                  <Typography variant="subtitle2">{t.title}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>{t.text}</Typography>
                <Box>
                  <Button component={RouterLink} href={t.href} size="small" color="inherit" endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}>
                    {t.cta}
                  </Button>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>
        {extra.length > 0 && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary' }}>
            Aggiunti anche: {extra.join(' e ')} (mancavano per questo cliente).
          </Typography>
        )}

        {s.channels.length > 0 && (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Stack direction="row" sx={{ alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Canali {missing ? `· ${missing} da sistemare` : '· tutti collegati'}
              </Typography>
              {missing > 0 && (
                <Button component={RouterLink} href={`/clienti/${clientId}/canali`} size="small" variant="outlined">
                  Vai a Canali
                </Button>
              )}
            </Stack>
            <Stack spacing={1}>
              {s.channels.map((c) => (
                <Stack key={c.platform} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 1.5 }} sx={{ alignItems: { sm: 'center' } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 180 }}>
                    <Iconify icon={CHANNEL[c.platform]?.icon ?? 'solar:monitor-bold'} width={20} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{CHANNEL[c.platform]?.label ?? c.platform}</Typography>
                  </Stack>
                  <Box sx={{ minWidth: 220 }}>
                    {c.connected ? (
                      <Label color="success" startIcon={<Iconify icon="eva:checkmark-fill" />}>Collegato</Label>
                    ) : (
                      <Stack direction="row" spacing={0.75}>
                        <Label color="warning">{c.present && c.action === 'collegare' ? 'Inserito, non collegato' : ACTION[c.action]}</Label>
                        <Label color={PRIORITY[c.priority].color}>{PRIORITY[c.priority].label}</Label>
                      </Stack>
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>{c.why}</Typography>
                  <EvidenceHint evidence={c.evidence} />
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </Box>
    </Card>
  );
}
