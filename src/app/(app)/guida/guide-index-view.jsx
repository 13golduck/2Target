'use client';

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CardActionArea from '@mui/material/CardActionArea';
import InputAdornment from '@mui/material/InputAdornment';

import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';
import { searchArticles, CATEGORY_LABEL, CATEGORY_ORDER } from 'src/lib/guide/types';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------
// Indice della guida: ricerca in alto, poi gli articoli per argomento.

export function GuideIndexView({ articles }) {
  const [query, setQuery] = useState('');
  const router = useRouter();
  const found = useMemo(() => searchArticles(articles, query), [articles, query]);
  const searching = query.trim().length > 1;

  return (
    <DashboardContent maxWidth="lg">
      <CustomBreadcrumbs
        heading="Guida"
        links={[{ name: 'Panoramica', href: '/' }, { name: 'Guida' }]}
        action={
          <Button variant="outlined" color="inherit" onClick={() => router.push('/guida?tour=1')} startIcon={<Iconify icon="solar:play-circle-bold" />}>
            Rivedi il tour
          </Button>
        }
        sx={{ mb: 3 }}
      />

      <TextField
        fullWidth
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cosa vuoi fare? Es. «programmare un post», «collegare Instagram», «lead»"
        slotProps={{ input: { startAdornment: (<InputAdornment position="start"><Iconify icon="eva:search-fill" /></InputAdornment>) } }}
        sx={{ mb: 4 }}
      />

      {searching ? (
        found.length ? (
          <ArticleGrid items={found} />
        ) : (
          <Typography sx={{ color: 'text.secondary' }}>Nessun articolo trovato. Prova con un&apos;altra parola, oppure sfoglia gli argomenti qui sotto svuotando la ricerca.</Typography>
        )
      ) : (
        <Stack spacing={4}>
          {CATEGORY_ORDER.map((cat) => {
            const items = articles.filter((a) => a.category === cat);
            if (!items.length) return null;
            return (
              <Box key={cat}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  {CATEGORY_LABEL[cat]}
                </Typography>
                <ArticleGrid items={items} />
              </Box>
            );
          })}
        </Stack>
      )}
    </DashboardContent>
  );
}

function ArticleGrid({ items }) {
  return (
    <Grid container spacing={2}>
      {items.map((a) => (
        <Grid key={a.slug} size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ height: 1 }}>
            <CardActionArea component={RouterLink} href={`/guida/${a.slug}`} sx={{ p: 2.5, height: 1, alignItems: 'flex-start', display: 'flex', gap: 1.5 }}>
              <Iconify icon={a.icon} width={28} sx={{ color: 'primary.main', flexShrink: 0, mt: 0.25 }} />
              <Box>
                <Typography variant="subtitle1">{a.title}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {a.summary}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
