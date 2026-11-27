import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApiRouter, shutdownApiRouter } from './api.ts';
import {
  getActiveWorkspace,
  getWorkspacePaths,
  WORKSPACES_REGISTRY_FILE,
} from './workspaces/registry.ts';
import { resolveAppRoot } from './core/appPaths.ts';
import {
  getRemoteControlConfig,
  isLoopbackRequest,
  setActualServerPort,
} from './core/remoteControl.ts';
import { getCurrentAppVersion } from './core/updateChecker.ts';

const HOST = process.env.HOST || '0.0.0.0';
const BASE_PORT = Number(process.env.PORT ?? 5173);
const MAX_PORT_RETRIES = 5;
const DIST_DIR = path.join(resolveAppRoot(), 'dist');
const DIST_ASSETS_DIR = path.resolve(DIST_DIR, 'assets');
const HAS_DIST = fs.existsSync(path.join(DIST_DIR, 'index.html'));

const app = express();

// Block non-loopback LAN requests immediately when Remote Control HP is disabled
app.use((req, res, next) => {
  if (isLoopbackRequest(req)) {
    next();
    return;
  }
  const remoteCfg = getRemoteControlConfig();
  if (!remoteCfg.enabled) {
    res
      .status(403)
      .type('text/plain; charset=utf-8')
      .send(
        'Remote Control HP sedang dinonaktifkan. Aktifkan dari tombol Remote HP di aplikasi Desktop CPGP.'
      );
    return;
  }
  if (req.path === '/' && req.method === 'GET') {
    res.redirect(302, '/remote');
    return;
  }
  next();
});

app.use(createApiRouter());

app.get('/health', (_req, res) => {
  const activeWorkspace = getActiveWorkspace();
  const workspacePaths = getWorkspacePaths(activeWorkspace.id);

  res.json({
    status: 'ok',
    service: 'cpgp-studio-server',
    brand: `CPGP (Content Planer Gam Puko) v${getCurrentAppVersion()}`,
    version: getCurrentAppVersion(),
    mode: HAS_DIST ? 'production' : 'api-only',
    activeWorkspace: {
      id: activeWorkspace.id,
      name: activeWorkspace.name,
      handle: activeWorkspace.handle,
      contentRootPath: activeWorkspace.contentRootPath,
      browserProfileMode: activeWorkspace.browserProfileMode,
    },
    contentRoot: activeWorkspace.contentRootPath,
    databaseFile: workspacePaths.plannerFile,
    workspacesRegistry: WORKSPACES_REGISTRY_FILE,
    timestamp: new Date().toISOString(),
  });
});

// Serve production Vite build when dist/ exists (used by GitHub Release bundle & cpgp-studio CLI)
if (HAS_DIST) {
  app.use(
    express.static(DIST_DIR, {
      setHeaders(res, filePath) {
        const resolvedFile = path.resolve(filePath);
        const relToAssets = path.relative(DIST_ASSETS_DIR, resolvedFile);
        const isAssetFile =
          Boolean(relToAssets) &&
          !relToAssets.startsWith('..') &&
          !path.isAbsolute(relToAssets);

        if (isAssetFile) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.basename(resolvedFile).toLowerCase() === 'index.html') {
          res.setHeader(
            'Cache-Control',
            'no-cache, no-store, must-revalidate'
          );
        }
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const server = http.createServer(app);
let currentPort =
  Number.isFinite(BASE_PORT) && BASE_PORT > 0 ? Math.floor(BASE_PORT) : 5173;
const maxPort = currentPort + MAX_PORT_RETRIES;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    if (currentPort < maxPort) {
      const nextPort = currentPort + 1;
      console.warn(
        `[CPGP Studio] Port ${currentPort} sudah digunakan. Mencoba port ${nextPort}...`
      );
      currentPort = nextPort;
      server.listen(currentPort, HOST);
      return;
    }
    console.error(
      `[CPGP Studio] Gagal menjalankan server: port ${BASE_PORT} s/d ${maxPort} semuanya sedang digunakan.`
    );
    console.error(
      'Tutup instance CPGP Studio lain yang sedang berjalan atau jalankan dengan --port <port_lain>.'
    );
    process.exit(1);
  }
  console.error('[CPGP Studio] Server error:', err);
  process.exit(1);
});

server.on('listening', () => {
  setActualServerPort(currentPort);
  const activeWorkspace = getActiveWorkspace();
  const workspacePaths = getWorkspacePaths(activeWorkspace.id);
  const displayHost =
    HOST === '127.0.0.1' || HOST === '0.0.0.0' ? 'localhost' : HOST;

  console.log('================================================================');
  console.log(
    ` CPGP Studio v${getCurrentAppVersion()} aktif di http://${displayHost}:${currentPort} (bind ${HOST})`
  );
  console.log(` Mode            : ${HAS_DIST ? 'Production Bundle (dist/)' : 'API Server'}`);
  console.log(` Workspace Aktif : ${activeWorkspace.name} (${activeWorkspace.id})`);
  console.log(` Content Folder  : ${activeWorkspace.contentRootPath}`);
  console.log(` JSON Database   : ${workspacePaths.plannerFile}`);
  console.log(` Registry        : ${WORKSPACES_REGISTRY_FILE}`);
  console.log('================================================================');
});

server.listen(currentPort, HOST);

let isShuttingDown = false;
function handleGracefulShutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[CPGP Studio] Menerima ${signal}, menutup server dengan bersih...`);

  const forceExitTimer = setTimeout(() => {
    process.exit(0);
  }, 5000);
  forceExitTimer.unref();

  // Synchronously terminates open SSE streams first so server.close() cannot hang
  const routerShutdownPromise = shutdownApiRouter();

  const serverClosePromise = new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  });

  void Promise.allSettled([routerShutdownPromise, serverClosePromise]).finally(
    () => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }
  );
}

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
