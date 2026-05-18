import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.legaldiary.pro',
  appName: 'Legal Diary Pro',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'generativelanguage.googleapis.com',
      '*.googleapis.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0f1e',
      showSpinner: false,
    },
  },
};

export default config;
