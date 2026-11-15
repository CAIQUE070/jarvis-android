import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.caique.jarvis',
  appName: 'J.A.R.V.I.S.',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#030713',
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
