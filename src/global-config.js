import packageJson from '../package.json';

// ----------------------------------------------------------------------

export const CONFIG = {
  appName: '2Target',
  appVersion: packageJson.version,
  assetsDir: process.env.NEXT_PUBLIC_ASSETS_DIR ?? '',
  isStaticExport: false,
};
