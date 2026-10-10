'use client';

import { usePopover } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

import { CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

export function AccountMenu({ user, logoutAction }) {
  const popover = usePopover();
  const initials = (user?.name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <IconButton onClick={popover.onOpen} aria-label="Account" sx={{ p: 0.25 }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: 'secondary.main', color: 'primary.main', fontSize: 14, fontWeight: 700 }}>
          {initials}
        </Avatar>
      </IconButton>
      <CustomPopover open={popover.open} anchorEl={popover.anchorEl} onClose={popover.onClose} slotProps={{ arrow: { placement: 'top-right' } }}>
        <Box sx={{ p: 2, minWidth: 220 }}>
          <Typography variant="subtitle2">{user?.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {user?.role}
          </Typography>
        </Box>
        <Divider sx={{ borderStyle: 'dashed' }} />
        <Box component="form" action={logoutAction} sx={{ p: 1 }}>
          <Button type="submit" fullWidth color="error" size="medium">
            Esci
          </Button>
        </Box>
      </CustomPopover>
    </>
  );
}
