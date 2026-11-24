import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createApiRouter } from './server/api.ts';

const RUNTIME_DATA_DIR = path.resolve(__dirname, 'data').toLowerCase();
const GRAPHIFY_OUT_DIR = path.resolve(__dirname, 'graphify-out').toLowerCase();

export function jurnalDuniaApiPlugin(): Plugin {
  return {
    name: 'jurnal-dunia-api-middleware',
    configureServer(server) {
      const apiApp = createApiRouter();
      server.middlewares.use(apiApp);
    },
    configurePreviewServer(server) {
      const apiApp = createApiRouter();
      server.middlewares.use(apiApp);
    },
    // Prevent Vite HMR / full-reload when runtime JSON databases or generated files change on disk
    handleHotUpdate({ file }) {
      const normalized = path.resolve(file).toLowerCase();
      if (
        normalized.startsWith(RUNTIME_DATA_DIR) ||
        normalized.startsWith(GRAPHIFY_OUT_DIR) ||
        normalized.endsWith('planner-data.json') ||
        normalized.endsWith('watermark-presets.json')
      ) {
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), jurnalDuniaApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: [
        '**/data/**',
        '**/graphify-out/**',
        '**/planner-data.json',
        '**/watermark-presets.json',
        '**/*.tmp.mp4',
      ],
    },
  },
});
