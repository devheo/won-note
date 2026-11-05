import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {defineConfig} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(() => {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  return {
    plugins: [react(), tailwindcss(), viteSingleFile()],
    resolve: {
      alias: {
        '@': path.resolve(configDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore mutable data and generated desktop bundles so builds do not trigger HMR or file-watch failures.
      watch: {
        ignored: [
          '**/user_data.json',
          '**/wonbee.sqlite*',
          '**/*.sqlite*',
          '**/release/**',
          '**/electron-dist/**',
        ],
      },
    },
  };
});
