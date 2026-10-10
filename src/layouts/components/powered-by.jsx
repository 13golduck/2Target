import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------
// "powered by" + logo ufficiale Golduck (papera dorata, scritta nera)

export function PoweredBy({ height = 56, sx }) {
  return (
    <Box
      component="a"
      href="https://www.golduck.it"
      target="_blank"
      rel="noopener"
      sx={[
        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, textDecoration: 'none' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography variant="caption" sx={{ color: 'text.disabled', letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>
        powered by
      </Typography>
      <Box
        component="img"
        src="/logo/golduck.png"
        alt="Golduck consulting"
        sx={{
          height,
          width: 'auto',
          // In tema scuro il logo (scritta nera) sta su un fondo chiaro
          '[data-color-scheme="dark"] &': { bgcolor: '#fff', borderRadius: 1, p: 0.75, boxSizing: 'content-box' },
        }}
      />
    </Box>
  );
}

// ----------------------------------------------------------------------
// Versione per il menu ridotto: solo la papera Golduck, senza scritta

export function PoweredByMini({ size = 32, sx }) {
  return (
    <Box
      component="a"
      href="https://www.golduck.it"
      target="_blank"
      rel="noopener"
      title="powered by Golduck consulting"
      sx={[{ display: 'flex', justifyContent: 'center', py: 2.5 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Box component="img" src="/logo/golduck-duck.png" alt="Golduck" sx={{ width: size, height: size }} />
    </Box>
  );
}
