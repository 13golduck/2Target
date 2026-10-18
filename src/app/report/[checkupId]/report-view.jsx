'use client';

import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';

// ----------------------------------------------------------------------
// Report del Communication Check-Up: pagina web con grafici e indice, stampabile in PDF (A4).
// Colori fissi (non quelli del tema) perché web e PDF devono essere identici, anche in modalità scura.

const C = {
  ink: '#1C1C1C',
  muted: '#5F6B7A',
  soft: '#919EAB',
  line: '#E6E8EB',
  paper: '#FFFFFF',
  bg: '#F6F5F1',
  gold: '#CDA434',
  goldSoft: '#FBF5E2',
  green: '#1F9D55',
  greenSoft: '#E8F6EE',
  red: '#D64545',
  redSoft: '#FCEBEB',
  orange: '#E07B24',
  orangeSoft: '#FDF1E6',
  blue: '#2F6FDB',
  blueSoft: '#EAF1FD',
};

const lines = (t) =>
  String(t ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

const fmtDay = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const clamp5 = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

const VERDICT = {
  miniera_d_oro: { label: 'Miniera d’oro', color: C.green, bg: C.greenSoft, icon: 'solar:star-bold' },
  da_rafforzare: { label: 'Da rafforzare', color: C.orange, bg: C.orangeSoft, icon: 'solar:graph-up-bold' },
  efficace: { label: 'Efficace', color: C.blue, bg: C.blueSoft, icon: 'solar:check-circle-bold' },
  spreco: { label: 'Spreco', color: C.red, bg: C.redSoft, icon: 'solar:danger-triangle-bold' },
  non_prioritario: { label: 'Non prioritario', color: C.soft, bg: '#F2F3F5', icon: 'solar:minus-circle-bold' },
};

const FUNNEL = [
  { key: 'see', alt: 'awareness', label: 'See', sub: 'Awareness', text: 'Pubblico ampio, nessun intento', color: '#E9D9A6' },
  { key: 'think', alt: 'consideration', label: 'Think', sub: 'Consideration', text: 'Valuta, confronta', color: '#DDBF63' },
  { key: 'do', alt: 'conversion', label: 'Do', sub: 'Conversion', text: 'Pronto all’azione', color: C.gold },
  { key: 'care', alt: 'retention', label: 'Care', sub: 'Retention', text: 'Clienti che tornano', color: '#9C7A1F' },
];

// ----------------------------------------------------------------------

export function ReportView({ staff, client, checkup, template, content, personas, objectives }) {
  const r = checkup.report;
  const sec = (key) => content[key] ?? {};
  const title = (key) => template.find((t) => t.key === key)?.title ?? key;

  const toc = useMemo(
    () =>
      [
        { id: 'sintesi', label: 'In sintesi' },
        ...template.filter((t) => t.key !== 'sintesi').map((t, i) => ({ id: t.key, label: `${i + 1}. ${t.title}` })),
        r?.evidence?.length ? { id: 'prove', label: 'Prove da documentare' } : null,
        checkup.sources.length ? { id: 'fonti', label: 'Fonti' } : null,
      ].filter(Boolean),
    [template, r, checkup.sources.length]
  );
  const active = useScrollSpy(toc.map((t) => t.id));

  // Executive: testo delle sezioni (aggiornato dalle revisioni), con i dati strutturati come complemento
  const problems = lines(sec('sintesi').problemi);
  const actions = lines(sec('sintesi').azioni);
  const execProblems = problems.length ? problems.map((p, i) => ({ title: p, impact: r?.executive?.problems?.[i]?.impact })) : (r?.executive?.problems ?? []);
  const execActions = actions.length ? actions.map((a, i) => ({ title: a, when: r?.executive?.actions?.[i]?.when })) : (r?.executive?.actions ?? []);

  return (
    <Box sx={{ bgcolor: C.bg, color: C.ink, minHeight: '100vh', '@media print': { bgcolor: C.paper } }}>
      <style>{PRINT_CSS}</style>

      {/* Barra superiore (solo web) */}
      <Box
        className="no-print"
        sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${C.line}` }}
      >
        <Stack direction="row" spacing={2} sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 3 }, py: 1.25, alignItems: 'center' }}>
          {staff && (
            <Button
              component={RouterLink}
              href={`/clienti/${client.id}/checkup?id=${checkup.id}`}
              size="small"
              color="inherit"
              startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
              sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Torna al check-up</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Indietro</Box>
            </Button>
          )}
          <Typography variant="subtitle2" sx={{ flex: 1, color: C.muted }} noWrap>
            Communication Check-Up · {client.name}
          </Typography>
          {checkup.status !== 'consegnato' && (
            <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: C.orangeSoft, color: C.orange, typography: 'caption', fontWeight: 700 }}>Bozza</Box>
          )}
          <MobileToc toc={toc} active={active} />
          <Button
            variant="contained"
            onClick={() => window.print()}
            startIcon={<Iconify icon="solar:download-bold" />}
            sx={{ bgcolor: C.ink, '&:hover': { bgcolor: '#000' }, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            PDF
          </Button>
        </Stack>
      </Box>

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 }, display: 'flex', gap: 4, '@media print': { p: 0, display: 'block' } }}>
        {/* Indice (solo web, desktop) */}
        <Box className="no-print" component="nav" sx={{ width: 240, flexShrink: 0, display: { xs: 'none', lg: 'block' } }}>
          <Box sx={{ position: 'sticky', top: 88 }}>
            <Typography variant="overline" sx={{ color: C.soft }}>Indice</Typography>
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {toc.map((t) => (
                <Box
                  key={t.id}
                  component="a"
                  href={`#${t.id}`}
                  sx={{
                    typography: 'body2',
                    textDecoration: 'none',
                    color: active === t.id ? C.ink : C.muted,
                    fontWeight: active === t.id ? 700 : 400,
                    borderLeft: `2px solid ${active === t.id ? C.gold : 'transparent'}`,
                    pl: 1.5,
                    py: 0.6,
                    transition: 'all .2s',
                    '&:hover': { color: C.ink },
                  }}
                >
                  {t.label}
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          <Cover client={client} checkup={checkup} headline={sec('sintesi').diagnosi || r?.executive?.headline} />

          {/* EXECUTIVE SUMMARY */}
          <Section id="sintesi" kicker="In una pagina" title="In sintesi">
            {(sec('sintesi').diagnosi || r?.executive?.headline) && (
              <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.45, mb: 3 }}>{sec('sintesi').diagnosi || r?.executive?.headline}</Typography>
            )}
            <Box className="g2" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              <Stack spacing={1.5}>
                <ColumnTitle color={C.red} icon="solar:danger-triangle-bold">I 3 problemi principali</ColumnTitle>
                {execProblems.slice(0, 3).map((p, i) => (
                  <NumberCard key={i} n={i + 1} color={C.red} bg={C.redSoft} title={p.title} text={p.impact} />
                ))}
              </Stack>
              <Stack spacing={1.5}>
                <ColumnTitle color={C.green} icon="solar:rocket-2-bold">Le 3 azioni prioritarie</ColumnTitle>
                {execActions.slice(0, 3).map((a, i) => (
                  <NumberCard key={i} n={i + 1} color={C.green} bg={C.greenSoft} title={a.title} text={a.why} tag={a.when} />
                ))}
              </Stack>
            </Box>
          </Section>

          {/* 1. STRUMENTI */}
          <Section id="strumenti" kicker="Situation · 1" title={title('strumenti')}>
            {sec('strumenti').canali && <Prose text={sec('strumenti').canali} />}
            <Box className="g2" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
              <ListBox title="In cosa funziona" items={lines(sec('strumenti').funziona)} color={C.green} bg={C.greenSoft} icon="solar:check-circle-bold" />
              <ListBox title="In cosa potrebbe performare meglio" items={lines(sec('strumenti').migliorabile)} color={C.orange} bg={C.orangeSoft} icon="solar:graph-up-bold" />
            </Box>
            <Fields data={sec('strumenti')} skip={['canali', 'funziona', 'migliorabile']} template={template} sectionKey="strumenti" />
          </Section>

          {/* 2. POSIZIONAMENTO + STORYBRAND */}
          <Section id="posizionamento" kicker="Situation · 2" title={title('posizionamento')}>
            <Fields data={sec('posizionamento')} template={template} sectionKey="posizionamento" listColor={{ distintivi: C.green, criticita: C.red }} />
            {r?.storybrand && <StoryBrand sb={r.storybrand} clientName={client.name} />}
          </Section>

          {/* 3. PERSONA */}
          <Section id="persona" kicker="Situation · 3" title={title('persona')}>
            {personas.length ? <Personas personas={personas} /> : <Prose text={sec('persona').personas} />}
          </Section>

          {/* 4. CANALI VS POTENZIALE */}
          <Section id="canali" kicker="Tactics · 4" title={title('canali')}>
            {r?.channels?.length ? <ChannelsMatrix channels={r.channels} /> : <Prose text={sec('canali').tabella} />}
            {sec('canali').ruolo && <Prose text={sec('canali').ruolo} sx={{ mt: 2 }} />}
          </Section>

          {/* 5. OBIETTIVI (See-Think-Do-Care) */}
          <Section id="obiettivi" kicker="Objectives · 5" title={title('obiettivi')}>
            {sec('obiettivi').premessa && <Prose text={sec('obiettivi').premessa} sx={{ mb: 2 }} />}
            <Funnel funnel={r?.funnel ?? []} objectives={objectives} />
            {lines(sec('obiettivi').attese).length > 0 && (
              <ListBox title="Cosa ci aspettiamo dal cambiamento" items={lines(sec('obiettivi').attese)} color={C.blue} bg={C.blueSoft} icon="solar:target-bold" sx={{ mt: 2 }} />
            )}
          </Section>

          {/* 6. BENCHMARK */}
          <Section id="benchmark" kicker="Situation · 6" title={title('benchmark')}>
            {r?.competitors?.length ? <Competitors competitors={r.competitors} clientName={client.name} clientEr={r.clientEr} /> : <Prose text={sec('benchmark').competitor} />}
            {sec('benchmark').sintesi && <Prose text={sec('benchmark').sintesi} sx={{ mt: 2 }} />}
          </Section>

          {/* 7. SWOT */}
          <Section id="swot" kicker="Situation · 7" title={title('swot')}>
            <Swot data={{ s: lines(sec('swot').s), w: lines(sec('swot').w), o: lines(sec('swot').o), t: lines(sec('swot').t) }} fallback={r?.swot} />
          </Section>

          {/* 8. BEST PRACTICE + QUICK WINS */}
          <Section id="best_practice" kicker="Strategy · Action · 8" title={title('best_practice')}>
            {sec('best_practice').priorita && (
              <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: C.goldSoft, border: `1px solid ${C.gold}`, mb: 2 }}>
                <Typography variant="overline" sx={{ color: '#8A6A12' }}>Priorità numero uno</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: 17, mt: 0.5, whiteSpace: 'pre-line' }}>{sec('best_practice').priorita}</Typography>
              </Box>
            )}
            {r?.quickWins?.length > 0 && <QuickWins items={r.quickWins} />}
            <Box className="g2" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
              <ListBox title="Best practice da mantenere" items={lines(sec('best_practice').best_practice)} color={C.green} bg={C.greenSoft} icon="solar:medal-ribbons-star-bold" />
              <ListBox title="Consigli di crescita" items={lines(sec('best_practice').consigli)} color={C.blue} bg={C.blueSoft} icon="solar:graph-up-bold" />
            </Box>
            {sec('best_practice').confronto && sec('best_practice').confronto.trim() !== 'Primo check-up' && (
              <Box sx={{ mt: 2 }}>
                <SubTitle>Cosa è cambiato rispetto al check-up precedente</SubTitle>
                <Prose text={sec('best_practice').confronto} />
              </Box>
            )}
            {checkup.kpiSnapshot.length > 0 && <KpiSnapshot rows={checkup.kpiSnapshot} />}
          </Section>

          {r?.evidence?.length > 0 && (
            <Section id="prove" kicker="Allegati" title="Prove da documentare" small>
              <Typography variant="body2" sx={{ color: C.muted, mb: 1.5 }}>Criticità da mostrare al cliente con uno screenshot reale.</Typography>
              <Stack spacing={1}>
                {r.evidence.map((e, i) => (
                  <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <Iconify icon="solar:camera-bold" width={18} sx={{ color: C.orange, mt: 0.25, flexShrink: 0 }} />
                    <Typography variant="body2">{e}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Section>
          )}

          {checkup.sources.length > 0 && (
            <Section id="fonti" kicker="Metodo" title="Fonti" small>
              <Stack spacing={0.5}>
                {checkup.sources.map((s) => (
                  <Typography key={s.url} variant="caption" sx={{ color: C.muted, wordBreak: 'break-all' }}>
                    {s.title ? `${s.title} — ` : ''}
                    <Box component="a" href={s.url} target="_blank" rel="noopener" sx={{ color: C.blue }}>
                      {s.url}
                    </Box>
                  </Typography>
                ))}
              </Stack>
            </Section>
          )}

          <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center', alignItems: 'center', py: 4, color: C.soft }}>
            <Box component="img" src="/logo/golduck-duck.png" alt="" sx={{ width: 22, height: 22 }} />
            <Typography variant="caption">Golduck consulting · report generato con 2Target</Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

// ----------------------------------------------------------------------
// Indice su smartphone e tablet (sul desktop c'è la colonna a sinistra)

function MobileToc({ toc, active }) {
  const [open, setOpen] = useState(null);
  return (
    <Box sx={{ display: { xs: 'block', lg: 'none' }, flexShrink: 0 }}>
      <Button size="small" color="inherit" variant="outlined" onClick={(e) => setOpen(e.currentTarget)} startIcon={<Iconify icon="solar:list-bold" />}>
        Indice
      </Button>
      <Menu anchorEl={open} open={!!open} onClose={() => setOpen(null)} slotProps={{ paper: { sx: { maxHeight: '70vh' } } }}>
        {toc.map((t) => (
          <MenuItem
            key={t.id}
            selected={active === t.id}
            onClick={() => {
              setOpen(null);
              document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            sx={{ whiteSpace: 'normal', maxWidth: 320 }}
          >
            {t.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

// ----------------------------------------------------------------------
// Blocchi

function Cover({ client, checkup, headline }) {
  return (
    <Box
      className="cover"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 3,
        bgcolor: C.ink,
        color: '#fff',
        p: { xs: 4, md: 6 },
        mb: 4,
        minHeight: { md: 320 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        '@media print': { borderRadius: 0, minHeight: '250mm', mb: 0 },
      }}
    >
      <Box sx={{ position: 'absolute', right: -60, top: -60, width: 280, height: 280, borderRadius: '50%', bgcolor: C.gold, opacity: 0.18 }} />
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box component="img" src="/logo/golduck-duck.png" alt="Golduck" sx={{ width: 36, height: 36 }} />
        <Typography sx={{ fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>GOLDUCK CONSULTING</Typography>
      </Stack>
      <Box sx={{ my: 5 }}>
        <Typography sx={{ color: C.gold, letterSpacing: 3, fontSize: 13, fontWeight: 700 }}>COMMUNICATION CHECK-UP</Typography>
        <Typography sx={{ fontSize: { xs: 34, md: 48 }, fontWeight: 800, lineHeight: 1.1, mt: 1 }}>{client.name}</Typography>
        {headline && <Typography sx={{ mt: 2, maxWidth: 640, fontSize: 17, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>{headline}</Typography>}
      </Box>
      <Stack direction="row" spacing={4} sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
        {client.sector && <span>{client.sector}</span>}
        {checkup.period && <span>{checkup.period}</span>}
        <span>{fmtDay(checkup.date)}</span>
      </Stack>
    </Box>
  );
}

function Section({ id, kicker, title, children, small }) {
  return (
    <Box
      id={id}
      component="section"
      className={small ? 'section small' : 'section'}
      sx={{ bgcolor: C.paper, borderRadius: 3, p: { xs: 3, md: 5 }, mb: 3, scrollMarginTop: 88, border: `1px solid ${C.line}`, '@media print': { border: 0, borderRadius: 0, p: 0, mb: 0 } }}
    >
      <Typography sx={{ color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{kicker}</Typography>
      <Typography component="h2" sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 800, lineHeight: 1.2, mt: 0.5, mb: 3 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function SubTitle({ children }) {
  return <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 1 }}>{children}</Typography>;
}

function ColumnTitle({ children, color, icon }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color }}>
      <Iconify icon={icon} width={20} />
      <Typography sx={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>{children}</Typography>
    </Stack>
  );
}

function Prose({ text, sx }) {
  if (!text) return null;
  return <Typography sx={[{ whiteSpace: 'pre-line', lineHeight: 1.7, fontSize: 15, color: C.ink }, ...(Array.isArray(sx) ? sx : [sx])]}>{text}</Typography>;
}

function NumberCard({ n, color, bg, title, text, tag }) {
  return (
    <Stack direction="row" spacing={2} className="avoid-break" sx={{ p: 2, borderRadius: 2, bgcolor: bg, borderLeft: `4px solid ${color}` }}>
      <Typography sx={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{n}</Typography>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.4 }}>{title}</Typography>
        {text && <Typography variant="body2" sx={{ color: C.muted, mt: 0.5, lineHeight: 1.6 }}>{text}</Typography>}
        {tag && <Box sx={{ display: 'inline-block', mt: 1, px: 1, py: 0.25, borderRadius: 1, bgcolor: '#fff', color, typography: 'caption', fontWeight: 700 }}>{tag}</Box>}
      </Box>
    </Stack>
  );
}

function ListBox({ title, items, color, bg, icon, sx }) {
  if (!items.length) return null;
  return (
    <Box className="avoid-break" sx={[{ p: 2.5, borderRadius: 2, bgcolor: bg }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Typography sx={{ fontWeight: 700, color, mb: 1.25 }}>{title}</Typography>
      <Stack spacing={1}>
        {items.map((it, i) => (
          <Stack key={i} direction="row" spacing={1.25}>
            <Iconify icon={icon} width={18} sx={{ color, mt: 0.3, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{it}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/** Campi testuali rimanenti di una sezione (elenchi colorati, testi in prosa). */
function Fields({ data, skip = [], template, sectionKey, listColor = {} }) {
  const fields = template.find((t) => t.key === sectionKey)?.fields ?? [];
  return (
    <Stack spacing={2.5}>
      {fields
        .filter((f) => !skip.includes(f.key) && data[f.key])
        .map((f) => (
          <Box key={f.key}>
            {f.kind === 'elenco' ? (
              <ListBox title={f.label} items={lines(data[f.key])} color={listColor[f.key] ?? C.ink} bg={listColor[f.key] === C.red ? C.redSoft : listColor[f.key] === C.green ? C.greenSoft : '#F6F7F8'} icon="solar:arrow-right-bold" />
            ) : (
              <>
                <SubTitle>{f.label}</SubTitle>
                <Prose text={data[f.key]} />
              </>
            )}
          </Box>
        ))}
    </Stack>
  );
}

function StoryBrand({ sb, clientName }) {
  const steps = [
    { k: 'hero', label: 'L’eroe', who: 'la buyer persona', color: C.blue },
    { k: 'problem', label: 'Ha un problema', color: C.red },
    { k: 'guide', label: 'Incontra una guida', who: clientName, color: C.gold },
    { k: 'plan', label: 'Che gli dà un piano', color: C.ink },
    { k: 'cta', label: 'E lo chiama all’azione', color: C.ink },
    { k: 'success', label: 'Successo', color: C.green },
    { k: 'failure', label: 'Fallimento evitato', color: C.orange },
  ];
  return (
    <Box className="avoid-break" sx={{ mt: 3 }}>
      <SubTitle>La storia del brand (modello StoryBrand)</SubTitle>
      <Typography variant="body2" sx={{ color: C.muted, mb: 2 }}>
        Il cliente non è l’eroe: è la guida che dà all’eroe lo strumento per risolvere il suo problema.
      </Typography>
      <Box className="g4" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {steps.map((s, i) => (
          <Box key={s.k} sx={{ p: 2, borderRadius: 2, border: `1px solid ${C.line}`, borderTop: `3px solid ${s.color}`, position: 'relative' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: 1 }}>
              {i + 1}. {s.label}
            </Typography>
            {s.who && <Typography sx={{ fontSize: 12, color: C.soft }}>{s.who}</Typography>}
            <Typography variant="body2" sx={{ mt: 0.75, lineHeight: 1.55 }}>{sb[s.k]}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function Personas({ personas }) {
  return (
    <Box className="g3" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fit, minmax(260px, 1fr))' }, gap: 2 }}>
      {personas.map((p) => (
        <Box key={p.name} className="avoid-break" sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${C.line}`, bgcolor: p.priority === 1 ? C.goldSoft : C.paper }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: C.ink, color: C.gold, display: 'grid', placeItems: 'center', fontWeight: 800 }}>{p.priority}</Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{p.name}</Typography>
              <Typography variant="caption" sx={{ color: C.muted }}>
                {[p.segment?.toUpperCase(), p.ageRange].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          </Stack>
          {[
            ['Bisogni', p.needs],
            ['Leva psicologica', p.lever],
            ['Canali preferiti', p.channels],
            ['Valori', p.values],
            ['Interessi', p.interests],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Box key={k} sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: 1 }}>{k}</Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.55 }}>{v}</Typography>
              </Box>
            ))}
        </Box>
      ))}
    </Box>
  );
}

function ChannelsMatrix({ channels }) {
  const rows = channels.map((c) => ({ ...c, current: clamp5(c.current), potential: clamp5(c.potential) })).sort((a, b) => b.potential - b.current - (a.potential - a.current));
  const counts = Object.keys(VERDICT).map((k) => ({ k, n: rows.filter((r) => r.verdict === k).length })).filter((x) => x.n);
  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {counts.map(({ k, n }) => (
          <Stack key={k} direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 1.25, py: 0.5, borderRadius: 5, bgcolor: VERDICT[k].bg, color: VERDICT[k].color }}>
            <Iconify icon={VERDICT[k].icon} width={16} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {n} {VERDICT[k].label.toLowerCase()}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ border: `1px solid ${C.line}`, borderRadius: 2, overflow: 'hidden' }}>
        <Box className="ch-head" sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '170px 1fr 150px', gap: 2, px: 2, py: 1.25, bgcolor: '#F6F7F8', typography: 'caption', fontWeight: 700, color: C.muted }}>
          <span>Canale</span>
          <span>Efficacia attuale vs potenziale (0-5)</span>
          <span>Verdetto</span>
        </Box>
        {rows.map((c) => {
          const v = VERDICT[c.verdict] ?? VERDICT.non_prioritario;
          return (
            <Box key={c.name} className="avoid-break ch-row" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '170px 1fr 150px' }, gap: { xs: 1, md: 2 }, px: 2, py: 1.75, borderTop: `1px solid ${C.line}`, alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 700 }}>{c.name}</Typography>
              <Box>
                <Tooltip title={`Attuale ${c.current}/5 · potenziale ${c.potential}/5 · margine ${c.potential - c.current}`} placement="top">
                  <Box sx={{ position: 'relative', height: 22 }}>
                    <Box sx={{ position: 'absolute', inset: 0, borderRadius: 1, bgcolor: '#F2F3F5' }} />
                    <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(c.potential / 5) * 100}%`, borderRadius: 1, bgcolor: v.bg, border: `1px dashed ${v.color}` }} />
                    <Box sx={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: `${(c.current / 5) * 100}%`, borderRadius: 1, bgcolor: v.color, transition: 'width .6s' }} />
                  </Box>
                </Tooltip>
                <Typography variant="body2" sx={{ color: C.muted, mt: 0.75, lineHeight: 1.5 }}>{c.note}</Typography>
              </Box>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: v.color }}>
                <Iconify icon={v.icon} width={18} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{v.label}</Typography>
              </Stack>
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 1, color: C.soft }}>
        Barra piena: efficacia attuale. Area tratteggiata: potenziale strategico. Più è ampio lo scarto, più c’è da guadagnare.
      </Typography>
    </>
  );
}

function Funnel({ funnel, objectives }) {
  const rows = FUNNEL.map((f, i) => {
    const fromReport = funnel.find((x) => x.stage === f.key);
    const obj = objectives.find((o) => o.stage === f.alt);
    const strategies = (obj?.strategies ?? []).filter((s) => !s.startsWith('KPI: '));
    const kpis = fromReport?.kpis?.length ? fromReport.kpis : (obj?.strategies ?? []).filter((s) => s.startsWith('KPI: ')).map((s) => s.slice(5));
    return { ...f, i, goal: fromReport?.goal || obj?.goal, micro: obj?.micro, strategies, kpis };
  }).filter((r) => r.goal || r.strategies.length);
  if (!rows.length) return null;
  return (
    <Stack spacing={1.25}>
      {rows.map((r) => (
        <Box key={r.key} className="avoid-break fn-row" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '220px 1fr' }, gap: 2, alignItems: 'stretch' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Box
              sx={{
                width: { xs: '100%', md: `${100 - r.i * 14}%` },
                bgcolor: r.color,
                color: r.i >= 2 ? '#fff' : C.ink,
                borderRadius: 2,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{r.label}</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>{r.sub}</Typography>
              <Typography sx={{ fontSize: 11, opacity: 0.75, mt: 0.5 }}>{r.text}</Typography>
            </Box>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${C.line}` }}>
            {r.goal && <Typography sx={{ fontWeight: 700, lineHeight: 1.45 }}>{r.goal}</Typography>}
            {r.micro && <Typography variant="body2" sx={{ color: C.muted, mt: 0.5 }}>{r.micro}</Typography>}
            {r.strategies.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {r.strategies.map((s, i) => (
                  <Typography key={i} variant="body2" sx={{ lineHeight: 1.5 }}>
                    → {s}
                  </Typography>
                ))}
              </Stack>
            )}
            {r.kpis.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
                {r.kpis.map((k, i) => (
                  <Box key={i} sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: C.goldSoft, color: '#8A6A12', typography: 'caption', fontWeight: 700 }}>
                    KPI · {k}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function Competitors({ competitors, clientName, clientEr }) {
  const withEr = competitors.filter((c) => typeof c.er === 'number');
  const bars = [...(typeof clientEr === 'number' ? [{ name: clientName, er: clientEr, me: true }] : []), ...withEr.map((c) => ({ name: c.name, er: c.er }))];
  const chart = useChart({
    chart: { animations: { enabled: false } },
    colors: bars.map((b) => (b.me ? C.gold : '#C4CDD5')),
    plotOptions: { bar: { horizontal: true, distributed: true, barHeight: '55%', borderRadius: 4 } },
    legend: { show: false },
    dataLabels: { enabled: true, formatter: (v) => `${Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`, style: { colors: [C.ink] }, offsetX: 28 },
    xaxis: { categories: bars.map((b) => b.name), labels: { formatter: (v) => `${v}%` } },
    tooltip: { y: { formatter: (v) => `${v}%` } },
  });
  return (
    <>
      {bars.length >= 2 && (
        <Box className="avoid-break" sx={{ mb: 3, p: 2, borderRadius: 2, border: `1px solid ${C.line}` }}>
          <SubTitle>Coinvolgimento del pubblico a confronto (%)</SubTitle>
          <Chart type="bar" series={[{ name: 'Engagement rate', data: bars.map((b) => b.er) }]} options={chart} sx={{ height: 60 + bars.length * 44 }} />
          <Typography variant="caption" sx={{ color: C.soft }}>Il gap con i competitor misura quanto margine c’è sulla relazione con la community.</Typography>
        </Box>
      )}
      <Stack spacing={2}>
        {competitors.map((c) => (
          <Box key={c.name} className="avoid-break" sx={{ borderRadius: 2, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2, bgcolor: '#F6F7F8', alignItems: { md: 'center' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{c.name}</Typography>
                <Typography variant="caption" sx={{ color: C.muted }}>
                  {[c.location, c.website].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Stack direction="row" spacing={2.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <KeyData label="Seguaci" value={c.community} />
                <KeyData label="Canali" value={c.channels} />
                <KeyData label="Coinvolgimento" value={typeof c.er === 'number' ? `${c.er}%` : 'n.d.'} hint={c.erSource} />
                <KeyData
                  label="Pubblicità Meta"
                  value={c.ads === 'si' ? 'Attiva' : c.ads === 'no' ? 'Nessuna' : 'Non verificato'}
                  color={c.ads === 'si' ? C.orange : c.ads === 'no' ? C.green : C.soft}
                />
              </Stack>
            </Stack>
            <Box className="g2" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, p: 2 }}>
              <ListBox title="Punti di forza" items={c.strengths} color={C.green} bg={C.greenSoft} icon="solar:check-circle-bold" />
              <ListBox title="Punti deboli" items={c.weaknesses} color={C.red} bg={C.redSoft} icon="solar:close-circle-bold" />
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ mx: 2, mb: 2, p: 2, borderRadius: 2, bgcolor: C.goldSoft, border: `1px solid ${C.gold}` }}>
              <Iconify icon="solar:lightbulb-bolt-bold" width={22} sx={{ color: '#8A6A12', flexShrink: 0 }} />
              <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#8A6A12', textTransform: 'uppercase', letterSpacing: 1 }}>Leva strategica per {clientName}</Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.6, mt: 0.25 }}>{c.lever}</Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Stack>
    </>
  );
}

function KeyData({ label, value, hint, color }) {
  const body = (
    <Box>
      <Typography sx={{ fontSize: 10, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, color: color ?? C.ink, maxWidth: 200 }}>{value || '—'}</Typography>
    </Box>
  );
  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
}

function Swot({ data, fallback }) {
  const pick = (k) => (data[k].length ? data[k] : (fallback?.[k] ?? []));
  const q = [
    { k: 's', t: 'Strengths', sub: 'Punti di forza', color: C.green, bg: C.greenSoft },
    { k: 'w', t: 'Weaknesses', sub: 'Punti di debolezza', color: C.red, bg: C.redSoft },
    { k: 'o', t: 'Opportunities', sub: 'Opportunità', color: C.blue, bg: C.blueSoft },
    { k: 't', t: 'Threats', sub: 'Minacce', color: C.orange, bg: C.orangeSoft },
  ];
  return (
    <Box className="avoid-break g2" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
      {q.map((x) => (
        <Box key={x.k} sx={{ p: 2.5, borderRadius: 2, bgcolor: x.bg, borderTop: `4px solid ${x.color}` }}>
          <Stack direction="row" sx={{ alignItems: 'baseline', mb: 1.25 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 30, color: x.color, lineHeight: 1, mr: 1 }}>{x.k.toUpperCase()}</Typography>
            <Box>
              <Typography sx={{ fontWeight: 700, color: x.color, lineHeight: 1.2 }}>{x.t}</Typography>
              <Typography variant="caption" sx={{ color: C.muted }}>{x.sub}</Typography>
            </Box>
          </Stack>
          <Stack spacing={0.75}>
            {pick(x.k).map((it, i) => (
              <Typography key={i} variant="body2" sx={{ lineHeight: 1.55 }}>
                • {it}
              </Typography>
            ))}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}

function QuickWins({ items }) {
  const lvl = { basso: 0, medio: 1, alto: 2 };
  // Matrice impatto (alto in alto) × sforzo (basso a sinistra): in alto a sinistra i quick win
  const cells = [
    { impact: 'alto', effort: 'low', title: 'Vittorie rapide', sub: 'Alto impatto, poco sforzo', color: C.green, bg: C.greenSoft },
    { impact: 'alto', effort: 'high', title: 'Progetti strategici', sub: 'Alto impatto, più sforzo', color: C.blue, bg: C.blueSoft },
    { impact: 'basso', effort: 'low', title: 'Riempitivi', sub: 'Poco impatto, poco sforzo', color: C.soft, bg: '#F6F7F8' },
    { impact: 'basso', effort: 'high', title: 'Da evitare', sub: 'Poco impatto, molto sforzo', color: C.red, bg: C.redSoft },
  ];
  const place = (it) => `${lvl[it.impact] >= 1 ? 'alto' : 'basso'}-${lvl[it.effort] <= 1 ? 'low' : 'high'}`;
  return (
    <Box className="avoid-break" sx={{ mb: 1 }}>
      <SubTitle>Matrice impatto / sforzo</SubTitle>
      <Box className="g2" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
        {cells.map((c) => {
          const list = items.filter((it) => place(it) === `${c.impact}-${c.effort}`);
          return (
            <Box key={c.title} sx={{ p: 2, borderRadius: 2, bgcolor: c.bg, minHeight: 110, border: `1px solid ${c.color}33` }}>
              <Typography sx={{ fontWeight: 800, color: c.color }}>{c.title}</Typography>
              <Typography variant="caption" sx={{ color: C.muted }}>{c.sub}</Typography>
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                {list.map((it, i) => (
                  <Box key={i} sx={{ p: 1, borderRadius: 1, bgcolor: '#fff' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{it.action}</Typography>
                    <Typography variant="caption" sx={{ color: C.soft }}>
                      Impatto {it.impact} · sforzo {it.effort} · {it.owner}
                    </Typography>
                  </Box>
                ))}
                {!list.length && <Typography variant="caption" sx={{ color: C.soft }}>—</Typography>}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function KpiSnapshot({ rows }) {
  const color = { bene: C.green, male: C.orange, troppo_male: C.red };
  return (
    <Box className="avoid-break" sx={{ mt: 3 }}>
      <SubTitle>KPI alla data del check-up</SubTitle>
      <Box className="g4" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {rows.map((k) => (
          <Box key={k.label} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${C.line}`, borderLeft: `4px solid ${color[k.status] ?? C.soft}` }}>
            <Typography variant="caption" sx={{ color: C.muted }}>{k.label}</Typography>
            <Typography sx={{ fontWeight: 800 }}>
              {k.value ?? 'n.d.'} <Box component="span" sx={{ fontWeight: 400, fontSize: 12, color: C.soft }}>/ {k.target} {k.unit}</Box>
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ----------------------------------------------------------------------

function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -60% 0px' }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

// Stampa / PDF: A4, niente barra e indice, ogni sezione su pagina nuova, colori fedeli
const PRINT_CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
@media print {
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
  .cover { break-after: page; }
  .section { break-before: page; }
  .section.small { break-before: auto; break-inside: avoid; margin-top: 10mm !important; }
  .avoid-break { break-inside: avoid; }
  a { color: inherit !important; text-decoration: none !important; }
  .MuiTooltip-popper { display: none !important; }
  /* La pagina stampata è stretta: si tengono le colonne della versione desktop */
  .g2 { grid-template-columns: 1fr 1fr !important; }
  .g3 { grid-template-columns: repeat(3, 1fr) !important; }
  .g4 { grid-template-columns: repeat(4, 1fr) !important; }
  .ch-head { display: grid !important; grid-template-columns: 120px 1fr 110px !important; }
  .ch-row { grid-template-columns: 120px 1fr 110px !important; }
  .fn-row { grid-template-columns: 170px 1fr !important; }
  html { font-size: 13px; }
}
`;
