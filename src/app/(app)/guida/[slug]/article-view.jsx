'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';
import { DashboardContent } from 'src/layouts/dashboard';
import { CATEGORY_LABEL } from 'src/lib/guide/types';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------
// Un articolo della guida. Il testo può contenere **grassetto** per i nomi dei pulsanti.

function Rich({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
}

function Block({ b }) {
  if (b.h) return <Typography variant="h6" sx={{ mt: 2 }}>{b.h}</Typography>;
  if (b.p) return <Typography variant="body1"><Rich text={b.p} /></Typography>;
  if (b.tip) return <Alert severity="info" icon={<Iconify icon="solar:info-circle-bold" />}><Rich text={b.tip} /></Alert>;
  if (b.warn) return <Alert severity="warning"><Rich text={b.warn} /></Alert>;
  const ordered = !!b.steps;
  return (
    <Box component={ordered ? 'ol' : 'ul'} sx={{ m: 0, pl: 3, listStyleType: ordered ? 'decimal' : 'disc', '& li': { mb: 0.75, display: 'list-item' } }}>
      {(b.steps ?? b.list).map((x) => (
        <Typography key={x} component="li" variant="body1">
          <Rich text={x} />
        </Typography>
      ))}
    </Box>
  );
}

export function ArticleView({ article, related }) {
  return (
    <DashboardContent maxWidth="md">
      <CustomBreadcrumbs
        heading={article.title}
        links={[{ name: 'Guida', href: '/guida' }, { name: CATEGORY_LABEL[article.category] }]}
        action={
          article.open?.path ? (
            <Button component={RouterLink} href={article.open.path} variant="contained" endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}>
              {article.open.label}
            </Button>
          ) : null
        }
        sx={{ mb: 3 }}
      />
      <Card sx={{ p: { xs: 2.5, md: 4 } }}>
        <Typography variant="subtitle1" sx={{ color: 'text.secondary', mb: 2 }}>
          {article.summary}
        </Typography>
        <Stack spacing={2}>
          {article.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </Stack>
        {article.open?.clientTab && (
          <Typography variant="body2" sx={{ mt: 3, color: 'text.secondary' }}>
            Dove si trova: apri il cliente dal menu a sinistra → scheda <b>{article.open.label}</b>.
          </Typography>
        )}
      </Card>
      {!!related.length && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Vedi anche
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {related.map((r) => (
              <Button key={r.slug} component={RouterLink} href={`/guida/${r.slug}`} variant="outlined" color="inherit" size="small" startIcon={<Iconify icon={r.icon} />}>
                {r.title}
              </Button>
            ))}
          </Stack>
        </Box>
      )}
    </DashboardContent>
  );
}
