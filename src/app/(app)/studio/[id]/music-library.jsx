'use client';

import { useState, useEffect, useTransition } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';

import { useRouter } from 'src/routes/hooks';
import { licenseLabel } from 'src/lib/music/tracks';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { importMusic, searchMusic, musicProviders } from '../../studio-actions';

// ----------------------------------------------------------------------
// Libreria musicale dello Studio: ricerca nelle librerie gratuite (solo brani con licenza adatta ai clienti),
// ascolto dell'anteprima e scelta. Il brano scelto entra nel materiale e nella traccia audio al punto del cursore.

const sec = (n) => (n ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}` : '—');
const SUGGESTIONS = ['acoustic', 'piano', 'upbeat', 'corporate', 'chill', 'cinematic', 'lofi', 'jazz'];

export function MusicLibraryDialog({ itemId, onClose, onPicked }) {
  const router = useRouter();
  const [providers, setProviders] = useState(null);
  const [provider, setProvider] = useState('openverse');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(1);
  const [playing, setPlaying] = useState(null);
  const [searching, startSearch] = useTransition();
  const [importing, setImporting] = useState(null);

  useEffect(() => {
    musicProviders().then(setProviders);
  }, []);

  const search = (q = query, p = 1) =>
    startSearch(async () => {
      const r = await searchMusic({ itemId, provider, query: q, page: p });
      if (r.error) return toast.error(r.error);
      setPage(p);
      setResults((prev) => (p === 1 ? r.tracks : [...(prev ?? []), ...r.tracks]));
    });

  const pick = async (t) => {
    setImporting(t.id);
    const r = await importMusic({ itemId, provider: t.provider, trackId: t.id });
    setImporting(null);
    if (r.error) return toast.error(r.error);
    toast.success(`«${r.title}» aggiunto alla traccia audio`);
    onPicked({ id: r.mediaId, durationSec: r.durationSec });
    // Il brano nuovo deve comparire tra i file del progetto (nome, anteprima)
    router.refresh();
    onClose();
  };

  const current = providers?.find((p) => p.id === provider);

  return (
    <Dialog open onClose={importing ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Libreria musicale</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Solo brani utilizzabili per i clienti, anche nelle sponsorizzate: <b>CC0</b> (liberi) e <b>CC BY</b> (si cita l&apos;autore nel testo del post: 2Target te lo ricorda).
          </Typography>
          <Tabs value={provider} onChange={(_, v) => (setProvider(v), setResults(null))}>
            {(providers ?? [{ id: 'openverse', label: 'Openverse', ready: true }]).map((p) => (
              <Tab key={p.id} value={p.id} label={p.label} disabled={!p.ready} />
            ))}
          </Tabs>
          {current && !current.ready && <Alert severity="info">{current.hint}</Alert>}
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim().length >= 2) search();
            }}
            sx={{ display: 'flex', gap: 1 }}
          >
            <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Genere, atmosfera o strumento, in inglese (es. calm piano, upbeat pop)" fullWidth autoFocus />
            <Button type="submit" variant="contained" loading={searching && page === 1} disabled={query.trim().length < 2}>
              Cerca
            </Button>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
            {SUGGESTIONS.map((s) => (
              <Button key={s} size="small" variant="outlined" color="inherit" onClick={() => (setQuery(s), search(s))}>
                {s}
              </Button>
            ))}
          </Stack>
          {searching && page === 1 && <LinearProgress />}
          {importing && (
            <Alert severity="info" icon={<Iconify icon="eva:cloud-download-fill" />}>
              Scarico il brano dalla libreria: alcune fonti sono lente, può servire fino a un minuto.
            </Alert>
          )}
          {results && !results.length && <Alert severity="info">Nessun brano utilizzabile per «{query}»: prova un&apos;altra parola (in inglese funziona meglio).</Alert>}
          {!!results?.length && (
            <Stack spacing={1}>
              {results.map((t) => (
                <Stack key={`${t.provider}-${t.id}`} direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <IconButton onClick={() => setPlaying(playing === t.id ? null : t.id)} aria-label={playing === t.id ? 'Ferma l’anteprima' : 'Ascolta l’anteprima'}>
                    <Iconify icon={playing === t.id ? 'solar:pause-bold' : 'solar:play-bold'} />
                  </IconButton>
                  {playing === t.id && <audio src={t.previewUrl} autoPlay onEnded={() => setPlaying(null)} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {t.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="div">
                      {t.artist} · {sec(t.durationSec)} · {t.source}
                      {t.sourceUrl && (
                        <>
                          {' · '}
                          <Link href={t.sourceUrl} target="_blank" rel="noopener">
                            pagina del brano
                          </Link>
                        </>
                      )}
                    </Typography>
                  </Box>
                  <Label color={t.license === 'by' ? 'warning' : 'success'} variant="soft">
                    {licenseLabel(t.license)}
                  </Label>
                  <Button variant="contained" size="small" onClick={() => pick(t)} loading={importing === t.id} disabled={!!importing}>
                    Usa
                  </Button>
                </Stack>
              ))}
              <Button onClick={() => search(query, page + 1)} loading={searching && page > 0} sx={{ alignSelf: 'center' }}>
                Altri risultati
              </Button>
            </Stack>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Fonti: Openverse (raccoglie Jamendo, Freesound, ccMixter e Wikimedia) e Jamendo. Per una libreria a pagamento (es. Epidemic Sound) si aggiunge qui quando la sceglierete.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
