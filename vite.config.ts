import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createApiRouter } from './server/api.ts';
import {
  getRemoteControlConfig,
  isLoopbackAddress,
  setActualServerPort,
} from './server/core/remoteControl.ts';

const RUNTIME_DATA_DIR = path.resolve(__dirname, 'data').toLowerCase();
const CACHE_DIR = path.resolve(__dirname, '.cache').toLowerCase();
const GRAPHIFY_OUT_DIR = path.resolve(__dirname, 'graphify-out').toLowerCase();

export function jurnalDuniaApiPlugin(): Plugin {
  return {
    name: 'jurnal-dunia-api-middleware',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (addr && typeof addr === 'object' && typeof addr.port === 'number') {
          setActualServerPort(addr.port);
        }
      });

      server.middlewares.use((req, res, next) => {
        const remoteIp = req.socket?.remoteAddress ?? '';
        if (isLoopbackAddress(remoteIp)) {
          next();
          return;
        }
        const remoteCfg = getRemoteControlConfig();
        if (!remoteCfg.enabled) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            'Remote Control HP sedang dinonaktifkan. Aktifkan dari tombol Remote HP di aplikasi Desktop CPGP.'
          );
          return;
        }
        if (req.url === '/' && req.method === 'GET') {
          res.statusCode = 302;
          res.setHeader('Location', '/remote');
          res.end();
          return;
        }
        next();
      });

      const apiApp = createApiRouter();
      server.middlewares.use(apiApp);
    },
    configurePreviewServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (addr && typeof addr === 'object' && typeof addr.port === 'number') {
          setActualServerPort(addr.port);
        }
      });

      const apiApp = createApiRouter();
      server.middlewares.use(apiApp);
    },
    // Prevent Vite HMR / full-reload when runtime JSON databases or generated files change on disk
    handleHotUpdate({ file }) {
      const normalized = path.resolve(file).toLowerCase();
      if (
        normalized.startsWith(RUNTIME_DATA_DIR) ||
        normalized.startsWith(CACHE_DIR) ||
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (!normalized.includes('/node_modules/')) return undefined;
          if (
            normalized.includes('/node_modules/react/') ||
            normalized.includes('/node_modules/react-dom/') ||
            normalized.includes('/node_modules/scheduler/') ||
            normalized.includes('/node_modules/use-sync-external-store/')
          ) {
            return 'vendor-react';
          }
          if (normalized.includes('/node_modules/@tanstack/')) {
            return 'vendor-router';
          }
          if (
            normalized.includes('/node_modules/react-day-picker/') ||
            normalized.includes('/node_modules/date-fns/') ||
            normalized.includes('/node_modules/@date-fns/')
          ) {
            return 'vendor-calendar';
          }
          if (
            normalized.includes('/node_modules/lucide-react/') ||
            normalized.includes('/node_modules/react-icons/')
          ) {
            return 'vendor-icons';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    watch: {
      ignored: [
        '**/data/**',
        '**/.cache/**',
        '**/graphify-out/**',
        '**/planner-data.json',
        '**/watermark-presets.json',
        '**/*.tmp.mp4',
      ],
    },
  },
});
