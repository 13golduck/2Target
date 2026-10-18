'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------
// Report del mese per il cliente: semplice da leggere (numeri grandi, poche parole) e stampabile in A4.

const C = { ink: '#121212', gold: '#CDA434', goldSoft: '#FBF6E6', muted: '#637381', line: '#E9ECEE', bg: '#F4F6F8' };
const KPI_COLOR = { bene: '#22A06B', male: '#E8A317', troppo_male: '#D9363E', in_attesa: '#919EAB' };
const KPI_WORD = { bene: 'In linea', male: 'Da migliorare', troppo_male: 'Sotto obiettivo', in_attesa: 'In attesa di dati' };
const PLATFORM = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' };
const n = (v) => Math.round(v ?? 0).toLocaleString('it-IT');
const eur = (v) => (v ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const day = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });

export function MonthlyReportView({ token, report: r }) {
  // Solo i numeri che ci sono: un riquadro con «0» davanti al cliente non dice nulla e fa brutta figura
  const big = [
    { label: 'contenuti pubblicati', raw: r.posts.length, value: r.posts.length },
    { label: 'persone raggiunte', raw: r.reach, value: n(r.reach) },
    { label: 'nuovi follower', raw: r.followersGained, value: `+${n(r.followersGained)}` },
    { label: 'contatti ricevuti', raw: r.leads, value: r.leads },
  ].filter((b) => b.raw > 0);

  return (
    <Box sx={{ bgcolor: C.bg, minHeight: '100vh', color: C.ink, '@media print': { bgcolor: '#fff' } }}>
      <Box sx={{ bgcolor: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 2, '@media print': { display: 'none' } }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 900, mx: 'auto', px: 2, py: 1.5, alignItems: 'center' }}>
          <Box sx={{ bgcolor: C.gold, color: C.ink, fontWeight: 800, borderRadius: 1, px: 1 }}>2T</Box>
          <Typography variant="subtitle2" sx={{ flex: 1, color: C.muted }} noWrap>
            Report di {r.label} · {r.clientName}
          </Typography>
          <Button size="small" variant="outlined" color="inherit" href={`/api/report-video/${token}`} startIcon={<Iconify icon="solar:videocamera-record-bold" />}>
            Video del mese
          </Button>
          <Button size="small" variant="contained" onClick={() => window.print()} startIcon={<Iconify icon="solar:download-bold" />} sx={{ bgcolor: C.ink, '&:hover': { bgcolor: '#000' } }}>
            PDF
          </Button>
        </Stack>
      </Box>

      <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, py: 4, '@media print': { p: 0 } }}>
        {/* Copertina */}
        <Box sx={{ bgcolor: C.ink, color: '#fff', borderRadius: 3, p: { xs: 3, md: 5 }, mb: 3, '@media print': { borderRadius: 0 } }}>
          <Typography variant="overline" sx={{ color: C.gold }}>I risultati del mese</Typography>
          <Typography variant="h3" sx={{ mt: 1 }}>{r.clientName}</Typography>
          <Typography variant="h5" sx={{ color: '#C4CDD5', textTransform: 'capitalize' }}>{r.label}</Typography>
        </Box>

        {/* Numeri principali */}
        {!big.length && (
          <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 3, mb: 3, border: `1px solid ${C.line}` }}>
            <Typography variant="body1">In questo mese i dati dei profili non sono ancora disponibili: li vedrai nel prossimo report.</Typography>
          </Box>
        )}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${Math.max(big.length, 1)}, 1fr)` }, mb: big.length ? 3 : 0 }}>
          {big.map((b) => (
            <Box key={b.label} sx={{ bgcolor: C.goldSoft, borderRadius: 2, p: 2.5, textAlign: 'center', breakInside: 'avoid' }}>
              <Typography variant="h3">{b.value}</Typography>
              <Typography variant="body2" sx={{ color: C.muted }}>{b.label}</Typography>
            </Box>
          ))}
        </Box>

        {r.best && (
          <Section title="Il contenuto che ha funzionato di più">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ alignItems: 'flex-start' }}>
              {r.best.thumbnailUrl && <Box component="img" src={r.best.thumbnailUrl} alt="" sx={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />}
              <Box>
                <Typography variant="caption" sx={{ color: C.muted }}>{PLATFORM[r.best.platform] ?? r.best.platform} · {day(r.best.at)}</Typography>
                <Typography variant="body1" sx={{ my: 1, whiteSpace: 'pre-wrap' }}>{(r.best.caption ?? '').slice(0, 280)}</Typography>
                <Typography variant="body2" sx={{ color: C.muted }}>
                  {[
                    r.best.metrics?.reach && `${n(r.best.metrics.reach)} persone raggiunte`,
                    (r.best.metrics?.likes ?? 0) > 0 && `${n(r.best.metrics.likes)} mi piace`,
                    (r.best.metrics?.comments ?? 0) > 0 && `${n(r.best.metrics.comments)} commenti`,
                    (r.best.metrics?.saved ?? 0) > 0 && `${n(r.best.metrics.saved)} salvataggi`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                {r.best.permalink && (
                  <Button size="small" href={r.best.permalink} target="_blank" rel="noopener" sx={{ mt: 1, px: 0, '@media print': { display: 'none' } }}>
                    Guarda il post →
                  </Button>
                )}
              </Box>
            </Stack>
          </Section>
        )}

        {r.profiles.length > 0 && (
          <Section title="I profili">
            {r.profiles.map((p) => (
              <Row key={`${p.platform}${p.name}`} left={`${PLATFORM[p.platform] ?? p.platform} · ${p.name}`}>
                {p.end != null ? `${n(p.end)} follower` : '—'}
                {p.start != null && p.end != null && (
                  <Box component="span" sx={{ color: p.end >= p.start ? KPI_COLOR.bene : KPI_COLOR.troppo_male, ml: 1 }}>
                    ({p.end - p.start >= 0 ? '+' : ''}
                    {n(p.end - p.start)})
                  </Box>
                )}
                {p.reach > 0 && <Box component="span" sx={{ color: C.muted, ml: 1 }}>· {n(p.reach)} raggiunti</Box>}
              </Row>
            ))}
          </Section>
        )}

        {r.ads.spend > 0 && (
          <Section title="Sponsorizzate">
            <Row left="Investimento del mese">{eur(r.ads.spend)}</Row>
            <Row left="Contatti arrivati dalle campagne">{r.ads.leads}</Row>
            {r.ads.leads > 0 && <Row left="Costo per contatto">{eur(r.ads.spend / r.ads.leads)}</Row>}
          </Section>
        )}

        {r.kpis.length > 0 && (
          <Section title="Gli obiettivi">
            {r.kpis.map((k) => (
              <Row
                key={k.label}
                left={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: KPI_COLOR[k.status] }} />
                    <span>{k.label}</span>
                  </Stack>
                }
              >
                <Box component="span" sx={{ color: KPI_COLOR[k.status], fontWeight: 600 }}>{KPI_WORD[k.status]}</Box>
              </Row>
            ))}
          </Section>
        )}

        {r.posts.length > 0 && (
          <Section title="Cosa è uscito">
            {r.posts.map((p, i) => (
              <Row key={i} left={`${day(p.at)} · ${PLATFORM[p.platform] ?? p.platform}`}>
                {p.permalink ? (
                  <Box component="a" href={p.permalink} target="_blank" rel="noopener" sx={{ color: '#9A7B1F' }}>
                    {(p.caption ?? 'post').slice(0, 70)}
                  </Box>
                ) : (
                  (p.caption ?? 'post').slice(0, 70)
                )}
              </Row>
            ))}
          </Section>
        )}

        <Typography variant="caption" component="p" sx={{ color: C.muted, textAlign: 'center', mt: 4 }}>
          Report preparato da Golduck con 2Target · per domande scrivi al tuo referente Golduck
        </Typography>
      </Box>
    </Box>
  );
}

function Section({ title, children }) {
  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: { xs: 2.5, md: 3.5 }, mb: 3, border: `1px solid ${C.line}`, breakInside: 'avoid', '@media print': { border: 0, px: 0 } }}>
      <Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography>
      {children}
    </Box>
  );
}

function Row({ left, children }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 1, borderBottom: `1px solid ${C.line}`, '&:last-of-type': { borderBottom: 0 }, alignItems: 'center' }}>
      <Box sx={{ flex: 1, minWidth: 0, typography: 'body2' }}>{left}</Box>
      <Box sx={{ typography: 'body2', textAlign: 'right' }}>{children}</Box>
    </Stack>
  );
}
