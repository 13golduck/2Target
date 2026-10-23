'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';

import { friendlyError } from 'src/lib/friendly-error';

// ----------------------------------------------------------------------
// Messaggio d'errore comprensibile; il testo tecnico originale resta in «Dettagli» (passando sopra col mouse
// o toccando), così si può girare a chi assiste senza spaventare chi legge.

export function ErrorText({ error, component = 'span' }) {
  const { text, detail } = friendlyError(error);
  return (
    <Box component={component}>
      {text}
      {detail && (
        <Tooltip title={detail} enterTouchDelay={0}>
          <Box component="span" sx={{ ml: 0.75, textDecoration: 'underline dotted', cursor: 'help', whiteSpace: 'nowrap', opacity: 0.8 }}>
            Dettagli
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}

/** Solo il testo (per i toast). */
export const errorMessage = (error) => friendlyError(error).text;
