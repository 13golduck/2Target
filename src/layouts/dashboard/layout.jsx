'use client';

import { useBoolean } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import { Logo } from 'src/components/logo';
import { useSettingsContext } from 'src/components/settings';

import { NavMobile } from './nav-mobile';
import { NavVertical } from './nav-vertical';
import { AccountMenu } from './account-menu';
import { MenuButton } from '../components/menu-button';
import { SettingsButton } from '../components/settings-button';
import { dashboardLayoutVars, dashboardNavColorVars } from './css-vars';
import { MainSection, layoutClasses, HeaderSection, LayoutSection } from '../core';

// ----------------------------------------------------------------------
// Layout del pannello 2Target (dal kit Minimal, senza le parti dimostrative).
// navData e user arrivano dal server (src/app/(app)/layout.tsx).

export function DashboardLayout({ sx, children, navData, user, logoutAction, layoutQuery = 'lg' }) {
  const theme = useTheme();
  const settings = useSettingsContext();
  const navVars = dashboardNavColorVars(theme, settings.state.navColor, 'vertical');
  const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();
  const isNavMini = settings.state.navLayout === 'mini';

  const header = (
    <HeaderSection
      layoutQuery={layoutQuery}
      disableElevation
      slots={{
        leftArea: (
          <>
            <MenuButton
              onClick={onOpen}
              sx={{ mr: 1, ml: -1, [theme.breakpoints.up(layoutQuery)]: { display: 'none' } }}
            />
            <NavMobile data={navData} open={open} onClose={onClose} cssVars={navVars.section} />
            <Logo
              isSingle={false}
              size={32}
              sx={{ [theme.breakpoints.up(layoutQuery)]: { display: 'none' } }}
            />
          </>
        ),
        rightArea: (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
            <SettingsButton />
            <AccountMenu user={user} logoutAction={logoutAction} />
          </Box>
        ),
      }}
      slotProps={{ container: { maxWidth: false, sx: { px: { [layoutQuery]: 5 } } } }}
    />
  );

  const sidebar = (
    <NavVertical
      data={navData}
      isNavMini={isNavMini}
      layoutQuery={layoutQuery}
      cssVars={navVars.section}
      onToggleNav={() => settings.setField('navLayout', isNavMini ? 'vertical' : 'mini')}
    />
  );

  return (
    <LayoutSection
      headerSection={header}
      sidebarSection={sidebar}
      footerSection={null}
      cssVars={{ ...dashboardLayoutVars(theme), ...navVars.layout }}
      sx={[
        {
          [`& .${layoutClasses.sidebarContainer}`]: {
            [theme.breakpoints.up(layoutQuery)]: {
              pl: isNavMini ? 'var(--layout-nav-mini-width)' : 'var(--layout-nav-vertical-width)',
              transition: theme.transitions.create(['padding-left'], {
                easing: 'var(--layout-transition-easing)',
                duration: 'var(--layout-transition-duration)',
              }),
            },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <MainSection>{children}</MainSection>
    </LayoutSection>
  );
}
