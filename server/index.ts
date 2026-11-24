import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApiRouter } from './api.ts';
import {
  getActiveWorkspace,
  getWorkspacePaths,
  WORKSPACES_REGISTRY_FILE,
} from './workspaces/registry.ts';
import { getCurrentAppVersion } from './core/updateChecker.ts';

const PORT = Number(process.env.PORT ?? 5173);
const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist');
const HAS_DIST = fs.existsSync(path.join(DIST_DIR, 'index.html'));

const app = express();
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
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  const activeWorkspace = getActiveWorkspace();
  const workspacePaths = getWorkspacePaths(activeWorkspace.id);

  console.log('================================================================');
  console.log(
    ` CPGP Studio v${getCurrentAppVersion()} aktif di http://localhost:${PORT}`
  );
  console.log(` Mode            : ${HAS_DIST ? 'Production Bundle (dist/)' : 'API Server'}`);
  console.log(` Workspace Aktif : ${activeWorkspace.name} (${activeWorkspace.id})`);
  console.log(` Content Folder  : ${activeWorkspace.contentRootPath}`);
  console.log(` JSON Database   : ${workspacePaths.plannerFile}`);
  console.log(` Registry        : ${WORKSPACES_REGISTRY_FILE}`);
  console.log('================================================================');
});
