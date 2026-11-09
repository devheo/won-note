import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {defineConfig} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const plugins = [react(), tailwindcss()];
  // Keep the self-contained client build for offline desktop use. The intranet
  // server build ships local chunks so the browser downloads code on demand.
  if (mode !== 'intranet') plugins.push(viteSingleFile());
  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(configDir, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
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
