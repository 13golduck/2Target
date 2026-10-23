'use client';

import { mergeClasses } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';

import { RouterLink } from 'src/routes/components';

import { logoClasses } from './classes';

// ----------------------------------------------------------------------
// Marchio 2Target: icona "2T" (quadrato oro, lettere nere) + nome.

export function Mark2T({ size = 40, sx }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      aria-hidden
      sx={[{ width: size, height: size, flexShrink: 0, display: 'block' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <rect width="64" height="64" rx="16" fill="#CDA434" />
      <text
        x="32"
        y="43"
        textAnchor="middle"
        fontFamily="'Public Sans Variable', Arial, sans-serif"
        fontWeight="800"
        fontSize="30"
        letterSpacing="-1.5"
        fill="#1C1C1C"
      >
        2T
      </text>
    </Box>
  );
}

export function Logo({ sx, disabled, className, href = '/', isSingle = true, size = 40, ...other }) {
  return (
    <LogoRoot
      component={RouterLink}
      href={href}
      aria-label="2Target"
      underline="none"
      className={mergeClasses([logoClasses.root, className])}
      sx={[
        { display: 'inline-flex', alignItems: 'center', gap: 1.25, ...(disabled && { pointerEvents: 'none' }) },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...other}
    >
      <Mark2T size={size} />
      {!isSingle && (
        <Box
          component="span"
          sx={{ fontWeight: 800, fontSize: size * 0.5, letterSpacing: '-0.02em', color: 'text.primary', lineHeight: 1 }}
        >
          2Target
        </Box>
      )}
    </LogoRoot>
  );
}

// ----------------------------------------------------------------------

const LogoRoot = styled(Link)(() => ({
  flexShrink: 0,
  color: 'transparent',
  display: 'inline-flex',
  verticalAlign: 'middle',
}));
