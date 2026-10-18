import "./globals.css";

import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";

import { themeConfig, ThemeProvider } from "src/theme";
import { Snackbar } from "src/components/snackbar";
import { ProgressBar } from "src/components/progress-bar";
import { DateProvider } from "src/components/date-provider";
import { MotionLazy } from "src/components/animate/motion-lazy";
import { detectSettings } from "src/components/settings/server";
import { SettingsDrawer, defaultSettings, SettingsProvider } from "src/components/settings";

export const metadata = {
  title: { default: "2Target", template: "%s · 2Target" },
  description: "Check-up, strategia, piano editoriale e KPI dei clienti Golduck",
  robots: { index: false, follow: false },
  // Installabile come app (schermata Home di iPhone e Android): serve per le notifiche sul telefono
  appleWebApp: { capable: true, title: "2Target", statusBarStyle: "default" },
  icons: { apple: "/icon-192.png" },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#CDA434" };

export default async function RootLayout({ children }) {
  const settings = await detectSettings();
  return (
    <html lang="it" dir="ltr" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript
          modeStorageKey={themeConfig.modeStorageKey}
          attribute={themeConfig.cssVariables.colorSchemeSelector}
          defaultMode={themeConfig.defaultMode}
        />
        <SettingsProvider defaultSettings={defaultSettings} cookieSettings={settings}>
          <AppRouterCacheProvider options={{ key: "css" }}>
            <ThemeProvider modeStorageKey={themeConfig.modeStorageKey} defaultMode={themeConfig.defaultMode}>
              <DateProvider>
                <MotionLazy>
                  <Snackbar />
                  <ProgressBar />
                  <SettingsDrawer defaultSettings={defaultSettings} />
                  {children}
                </MotionLazy>
              </DateProvider>
            </ThemeProvider>
          </AppRouterCacheProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
