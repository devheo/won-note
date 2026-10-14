import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), viteSingleFile()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore database and json sync files to prevent Vite page reloads during backend DB sync
      watch: {
        ignored: ['**/user_data.json', '**/wonbee.sqlite*', '**/*.sqlite*'],
      },
    },
  };
});
