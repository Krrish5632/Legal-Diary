import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Legal Diary Pro: plain build, no service worker (the APK must never
// serve stale files), no API keys.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
// end of vite.config.ts
