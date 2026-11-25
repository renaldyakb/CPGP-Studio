import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import type { AutoPostMode } from '../src/types/autopost.ts';
import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
  PlatformUploadStatus,
  UserContentProperties,
} from '../src/types/planner.ts';
import {
  DEFAULT_WATERMARK_CONFIG,
  type WatermarkEncoderMode,
  type WatermarkStyleConfig,
} from '../src/types/watermark.ts';
import type {
  BatchGenerateSlotsInput,
  CreateContentSlotInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from '../shared/types/workspace.ts';
import {
  getInternalMotionProvitConfig,
  toPublicMotionProvitConfig,
} from './addons/motionprovitConfig.ts';
import {
  cancelMotionProvitImport,
  checkMotionProvitSession,
  clearMotionProvitThumbCache,
  disconnectMotionProvit,
  enrichJobsWithWorkspaceStatus,
  fetchMotionProvitImageBuffer,
  getMotionProvitCacheStats,
  getMotionProvitImportProgress,
  loginMotionProvit,
  openMotionProvitLoginBrowser,
  scrapeMotionProvitJobs,
  startMotionProvitBatchImport,
} from './addons/motionprovitScraper.ts';
import {
  checkPlatformLoginSessions,
  closeBrowserSession,
  getActiveBrowserProfileDir,
  getBrowserSessionStatus,
  openLoginProfile,
  subscribeBrowserSession,
} from './autopost/browserSession.ts';
import {
  clearMetaConfig,
  clearYouTubeTokens,
  detectAutoPostCapabilities,
  getInternalAutoPostConfig,
  getPublicAutoPostSettings,
  updateAutoPostSettings,
  type UpdateAutoPostSettingsPatch,
} from './autopost/config.ts';
import { resolveUploadVideoForItem } from './autopost/contentHelpers.ts';
import {
  createMetaOAuthUrl,
  discoverMetaAccounts,
  exchangeMetaOAuthCode,
  exchangeShortLivedMetaToken,
  getCachedPageToken,
  testMetaConnection,
} from './autopost/metaApi.ts';
import { createAutoPostQueue } from './autopost/queue.ts';
import {
  createYouTubeOAuthUrl,
  exchangeYouTubeOAuthCode,
} from './autopost/youtubeApi.ts';
import {
  batchGenerateSlotsOnDisk,
  createContentFolderOnDisk,
  suggestNextAvailableSlot,
} from './core/contentCreator.ts';
import {
  pickWindowsFolder,
  validateContentRootPath,
} from './core/winSystem.ts';
import {
  checkLatestGitHubRelease,
  getCurrentAppVersion,
} from './core/updateChecker.ts';
import { WORKSPACE_ROOT } from './scanner.ts';
import {
  ALL_PLATFORM_KEYS,
  batchUpdateItemPlatforms,
  getOrInitDatabase,
  syncDatabaseWithDisk,
  updateItemCaptionOnDisk,
  updateItemPlatformState,
  updateItemUserProperties,
} from './storage.ts';
import { getFontFileById, listAvailableFonts } from './watermark/fonts.ts';
import {
  createPreset,
  deletePreset,
  getPresetById,
  getPresetStore,
  normalizeWatermarkConfig,
  setDefaultEncoder,
  setDefaultPreset,
  updatePreset,
} from './watermark/presets.ts';
import {
  createWatermarkQueue,
  type WatermarkOutputMode,
} from './watermark/queue.ts';
import { detectWatermarkCapabilities } from './watermark/renderer.ts';
import {
  activateWorkspace,
  createWorkspace,
  deleteWorkspace,
  getActiveWorkspace,
  getWorkspaceById,
  getWorkspacePaths,
  getWorkspacesRegistry,
  markOnboardingCompleted,
  updateWorkspace,
} from './workspaces/registry.ts';

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function readRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return decodeURIComponent(value[0] ?? '');
  }
  return decodeURIComponent(value ?? '');
}

function resolveItemId(db: PlannerDatabase, rawParamId: string): string | null {
  const decoded = decodeURIComponent(rawParamId).replace(/\\/g, '/').trim();
  if (db.items[decoded]) {
    return decoded;
  }

  // Fallback: match by folderCode (e.g., "24.01") or case-insensitive id
  const lower = decoded.toLowerCase();
  for (const [key, item] of Object.entries(db.items)) {
    if (
      key.toLowerCase() === lower ||
      item.folderCode.toLowerCase() === lower
    ) {
      return key;
    }
  }

  return null;
}

function openInWindowsExplorer(targetPath: string, selectFile: boolean): void {
  const normalizedWinPath = path.win32.normalize(targetPath);
  const args = selectFile
    ? ['/select,', normalizedWinPath]
    : [normalizedWinPath];

  const child = spawn('explorer.exe', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRequestOrigin(req: Request): string {
  const headerOrigin = req.headers.origin;
  if (typeof headerOrigin === 'string' && headerOrigin.trim()) {
    return headerOrigin.trim().replace(/\/+$/, '');
  }
  const host = req.get('host') || 'localhost:5173';
  const proto = req.protocol || 'http';
  return `${proto}://${host}`;
}

function renderOAuthResultHtml(params: {
  ok: boolean;
  title: string;
  message: string;
  eventType?: 'youtube-oauth-result' | 'meta-oauth-result';
  channelTitle?: string | null;
  pageName?: string | null;
  igUsername?: string | null;
}): string {
  const payload = JSON.stringify({
    type: params.eventType ?? 'youtube-oauth-result',
    ok: params.ok,
    channelTitle: params.channelTitle ?? null,
    pageName: params.pageName ?? null,
    igUsername: params.igUsername ?? null,
    message: params.message,
  }).replace(/</g, '\\u003c');

  const accent = params.ok ? '#10b981' : '#f43f5e';
  const badgeText = params.ok ? 'TERHUBUNG' : 'GAGAL';

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0f1115;
      color: #f3f4f6;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: min(440px, 90vw);
      background: #171a21;
      border: 1px solid #2b303b;
      border-radius: 14px;
      padding: 28px;
      box-sizing: border-box;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: ${accent};
      border: 1px solid ${accent}55;
      background: ${accent}18;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 19px;
      font-weight: 700;
    }
    p {
      margin: 0 0 20px;
      font-size: 14px;
      line-height: 1.55;
      color: #a1a8b8;
    }
    button {
      border: 1px solid #353b48;
      background: #222733;
      color: #f3f4f6;
      border-radius: 8px;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover {
      background: #2b3140;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${badgeText}</div>
    <h1>${escapeHtml(params.title)}</h1>
    <p>${escapeHtml(params.message)}</p>
    <button type="button" onclick="window.close()">Tutup Tab</button>
  </div>
  <script>
    (function () {
      var payload = ${payload};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
        }
      } catch (e) {}
      if (payload.ok) {
        setTimeout(function () {
          try { window.close(); } catch (e) {}
        }, 1600);
      }
    })();
  </script>
</body>
</html>`;
}

export interface ApiRouterInstance {
  app: Express;
  watcher: FSWatcher | null;
  broadcastUpdate: (reason: string, db: PlannerDatabase) => void;
}

let singletonInstance: ApiRouterInstance | null = null;

export function createApiRouter(): Express {
  if (singletonInstance) {
    return singletonInstance.app;
  }

  const app = express();
  const sseClients = new Set<Response>();

  // Ensure initial scan / JSON database exists on startup
  let cachedDb: PlannerDatabase = syncDatabaseWithDisk();

  function broadcastUpdate(reason: string, db: PlannerDatabase) {
    cachedDb = db;
    const activeWorkspace = getActiveWorkspace();
    const payload = JSON.stringify({
      type: 'planner-updated',
      reason,
      timestamp: new Date().toISOString(),
      workspaceId: activeWorkspace.id,
      stats: db.stats,
      lastFullScanAt: db.workspaceConfig.lastFullScanAt,
    });

    for (const client of sseClients) {
      try {
        client.write(`event: planner-updated\ndata: ${payload}\n\n`);
        client.write(`data: ${payload}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function broadcastWorkspaceSwitch(reason: string, db: PlannerDatabase) {
    cachedDb = db;
    const registry = getWorkspacesRegistry();
    const activeWorkspace = getActiveWorkspace();
    const payload = JSON.stringify({
      type: 'workspace-switched',
      reason,
      timestamp: new Date().toISOString(),
      activeWorkspaceId: activeWorkspace.id,
      workspace: activeWorkspace,
      registry,
      stats: db.stats,
    });

    for (const client of sseClients) {
      try {
        client.write(`event: workspace-switched\ndata: ${payload}\n\n`);
        client.write(`data: ${payload}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }

    broadcastUpdate(reason, db);
  }

  const watermarkQueue = createWatermarkQueue({
    onJobCompleted: (itemId, job) => {
      try {
        const activeWs = getActiveWorkspace();
        if (job.workspaceId && job.workspaceId !== activeWs.id) {
          const targetWs = getWorkspaceById(job.workspaceId);
          if (targetWs) {
            const targetPaths = getWorkspacePaths(targetWs.id);
            syncDatabaseWithDisk(
              targetWs.contentRootPath,
              targetWs.defaultYear,
              targetPaths.plannerFile,
              targetWs
            );
          }
          return;
        }
        const updatedDb = syncDatabaseWithDisk();
        broadcastUpdate(`watermark-completed:${itemId}`, updatedDb);
      } catch (err) {
        console.error('[WatermarkQueue Sync Error]:', err);
      }
    },
  });

  const autoPostQueue = createAutoPostQueue({
    onPlannerUpdated: (reason, updatedDb, workspaceId) => {
      if (workspaceId && workspaceId !== getActiveWorkspace().id) {
        return;
      }
      broadcastUpdate(reason, updatedDb);
    },
  });

  function syncBrowserSessionForActiveWorkspace() {
    const activeProfileDir = getActiveBrowserProfileDir();
    if (!activeProfileDir) {
      return;
    }
    const expectedProfileDir = getInternalAutoPostConfig().browser.profileDir;
    const normActive =
      process.platform === 'win32'
        ? path.resolve(activeProfileDir).toLowerCase()
        : path.resolve(activeProfileDir);
    const normExpected =
      process.platform === 'win32'
        ? path.resolve(expectedProfileDir).toLowerCase()
        : path.resolve(expectedProfileDir);
    if (normActive !== normExpected) {
      void closeBrowserSession();
    }
  }

  // Set up dynamic chokidar watcher bound to active workspace contentRootPath
  let watcher: FSWatcher | null = null;
  let watchedRootPath: string | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  function rebindWatcherToActiveWorkspace() {
    const activeWs = getActiveWorkspace();
    const targetRoot = activeWs.contentRootPath;

    if (watcher && watchedRootPath === targetRoot) {
      return;
    }

    if (watcher) {
      const oldWatcher = watcher;
      watcher = null;
      watchedRootPath = null;
      void oldWatcher.close().catch(() => {
        // Ignore close error
      });
    }

    if (!fs.existsSync(targetRoot)) {
      return;
    }

    watchedRootPath = targetRoot;
    watcher = chokidar.watch(targetRoot, {
      ignoreInitial: true,
      persistent: true,
      depth: 4,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    const triggerDebouncedScan = (eventType: string, changedPath: string) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const updatedDb = syncDatabaseWithDisk();
          broadcastUpdate(
            `fs:${eventType}:${path.basename(changedPath)}`,
            updatedDb
          );
        } catch (err) {
          console.error('[Chokidar Auto-Scan Error]:', err);
        }
      }, 300);
    };

    watcher
      .on('add', (p) => triggerDebouncedScan('add', p))
      .on('change', (p) => triggerDebouncedScan('change', p))
      .on('unlink', (p) => triggerDebouncedScan('unlink', p))
      .on('addDir', (p) => triggerDebouncedScan('addDir', p))
      .on('unlinkDir', (p) => triggerDebouncedScan('unlinkDir', p));

    if (singletonInstance) {
      singletonInstance.watcher = watcher;
    }
  }

  rebindWatcherToActiveWorkspace();

  // Only process /api and /media routes so Vite frontend requests pass straight through
  app.use((req, _res, next) => {
    const url = req.originalUrl || req.url || '';
    if (!url.startsWith('/api') && !url.startsWith('/media')) {
      return next();
    }
    next();
  });

  app.use('/api', cors());
  app.use('/api', express.json({ limit: '10mb' }));

  // 1. GET /api/events: Server-Sent Events for real-time UI sync
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const initPayload = JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
      stats: cachedDb.stats,
    });
    res.write(`data: ${initPayload}\n\n`);

    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // 2. GET /api/planner - Returns full PlannerDatabase
  app.get('/api/planner', (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      cachedDb = forceRefresh
        ? syncDatabaseWithDisk()
        : getOrInitDatabase();
      res.json(cachedDb);
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat database planner',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 3. POST /api/scan - Forces full disk rescan of active workspace contentRootPath
  app.post('/api/scan', (_req: Request, res: Response) => {
    try {
      const updatedDb = syncDatabaseWithDisk();
      broadcastUpdate('manual-scan', updatedDb);
      res.json(updatedDb);
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memindai ulang direktori KONTEN',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Multi-Workspace & Content Creation API Routes
  // GET /api/workspaces
  app.get('/api/workspaces', (_req: Request, res: Response) => {
    try {
      const registry = getWorkspacesRegistry();
      const activeWorkspace = getActiveWorkspace();
      res.json({
        ...registry,
        registry,
        activeWorkspace,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat daftar workspace',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/workspaces
  app.post('/api/workspaces', (req: Request, res: Response) => {
    try {
      const input = (req.body ?? {}) as CreateWorkspaceInput;
      const { workspace, registry } = createWorkspace(input);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      broadcastWorkspaceSwitch(`workspace-created:${workspace.id}`, updatedDb);

      res.status(201).json({
        ok: true,
        workspace,
        registry,
        database: updatedDb,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message.includes('tidak boleh kosong') || message.includes('wajib')
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  });

  // POST /api/workspaces/onboarding-complete
  app.post(
    '/api/workspaces/onboarding-complete',
    (_req: Request, res: Response) => {
      try {
        const registry = markOnboardingCompleted();
        res.json({
          ok: true,
          registry,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal menandai onboarding selesai',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/workspaces/:id/activate
  app.post('/api/workspaces/:id/activate', (req: Request, res: Response) => {
    try {
      const workspaceId = readRouteParam(req.params.id);
      const { workspace, registry } = activateWorkspace(workspaceId);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      broadcastWorkspaceSwitch(`workspace-activated:${workspace.id}`, updatedDb);

      res.json({
        ok: true,
        workspace,
        registry,
        database: updatedDb,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('tidak ditemukan') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  // PATCH /api/workspaces/:id
  app.patch('/api/workspaces/:id', (req: Request, res: Response) => {
    try {
      const workspaceId = readRouteParam(req.params.id);
      const patch = (req.body ?? {}) as UpdateWorkspaceInput;
      const { workspace, registry } = updateWorkspace(workspaceId, patch);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      broadcastWorkspaceSwitch(`workspace-updated:${workspace.id}`, updatedDb);

      res.json({
        ok: true,
        workspace,
        registry,
        database: updatedDb,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('tidak ditemukan') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  // DELETE /api/workspaces/:id
  app.delete('/api/workspaces/:id', (req: Request, res: Response) => {
    try {
      const workspaceId = readRouteParam(req.params.id);
      const registry = deleteWorkspace(workspaceId);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      const activeWorkspace = getActiveWorkspace();
      broadcastWorkspaceSwitch(`workspace-deleted:${workspaceId}`, updatedDb);

      res.json({
        ok: true,
        deletedId: workspaceId,
        activeWorkspace,
        registry,
        database: updatedDb,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('tidak ditemukan')
        ? 404
        : message.includes('Minimal')
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  });

  // GET /api/system/version - Checks latest GitHub Release for CPGP-Studio
  app.get('/api/system/version', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const status = await checkLatestGitHubRelease(forceRefresh);
      res.json(status);
    } catch (error) {
      res.json({
        currentVersion: getCurrentAppVersion(),
        latestVersion: null,
        hasUpdate: false,
        releaseUrl: 'https://github.com/renaldyakb/CPGP-Studio/releases',
        releaseName: null,
        releaseNotes: null,
        publishedAt: null,
        checkedAt: new Date().toISOString(),
        repoUrl: 'https://github.com/renaldyakb/CPGP-Studio',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/system/pick-folder
  app.post(
    '/api/system/pick-folder',
    async (req: Request, res: Response) => {
      try {
        const initialDir =
          typeof req.body?.initialDir === 'string'
            ? req.body.initialDir
            : getActiveWorkspace().contentRootPath;
        const picked = await pickWindowsFolder(initialDir);
        const validation = picked.path
          ? validateContentRootPath(picked.path)
          : null;
        res.json({
          ok: true,
          ...picked,
          validation,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal membuka dialog pilih folder Windows',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/system/validate-path
  app.post('/api/system/validate-path', (req: Request, res: Response) => {
    try {
      const rawPath =
        typeof req.body?.path === 'string'
          ? req.body.path
          : typeof req.body?.contentRootPath === 'string'
            ? req.body.contentRootPath
            : '';
      const validation = validateContentRootPath(rawPath);
      res.json({
        ...validation,
        ok: true,
        validation,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memvalidasi lokasi folder konten',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/items/suggest-slot
  app.get('/api/items/suggest-slot', (req: Request, res: Response) => {
    try {
      const preferredMonth =
        typeof req.query.month === 'string' ? req.query.month : undefined;
      const db = getOrInitDatabase();
      const workspace = getActiveWorkspace();
      const suggested = suggestNextAvailableSlot(db, workspace, preferredMonth);
      res.json({
        ...suggested,
        ok: true,
        suggested,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal menghitung saran slot berikutnya',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/items/create
  app.post('/api/items/create', (req: Request, res: Response) => {
    try {
      const input = (req.body ?? {}) as CreateContentSlotInput;
      const workspace = getActiveWorkspace();
      const created = createContentFolderOnDisk(workspace, input);
      let updatedDb = syncDatabaseWithDisk();

      let item = updatedDb.items[created.itemId];
      if (
        item &&
        (input.customTitle !== undefined ||
          input.priority !== undefined ||
          (Array.isArray(input.categoryTags) && input.categoryTags.length > 0))
      ) {
        const patch: Partial<UserContentProperties> = {};
        if (input.customTitle !== undefined) {
          patch.customTitle = String(input.customTitle);
        }
        if (input.priority !== undefined) {
          patch.priority = input.priority;
        }
        if (Array.isArray(input.categoryTags) && input.categoryTags.length > 0) {
          patch.categoryTags = input.categoryTags;
        }
        const propResult = updateItemUserProperties(created.itemId, patch);
        updatedDb = propResult.db;
        item = propResult.item;
      }

      if (input.openInExplorer && fs.existsSync(created.folderPath)) {
        openInWindowsExplorer(created.folderPath, false);
      }

      broadcastUpdate(`item-created:${created.itemId}`, updatedDb);

      res.status(201).json({
        ok: true,
        itemId: created.itemId,
        folderPath: created.folderPath,
        captionPath: created.captionPath,
        item: item ?? null,
        stats: updatedDb.stats,
        items: updatedDb.items,
        database: updatedDb,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal membuat folder slot konten baru di disk',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/items/batch-generate
  app.post('/api/items/batch-generate', (req: Request, res: Response) => {
    try {
      const input = (req.body ?? {}) as BatchGenerateSlotsInput;
      const workspace = getActiveWorkspace();
      const result = batchGenerateSlotsOnDisk(workspace, input);
      const updatedDb = syncDatabaseWithDisk();
      broadcastUpdate(
        `batch-generated:${result.monthFolder}:${result.createdCodes.length}`,
        updatedDb
      );

      res.status(201).json({
        ok: true,
        ...result,
        stats: updatedDb.stats,
        items: updatedDb.items,
        database: updatedDb,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal men-generate slot konten secara massal',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 4. PATCH /api/items/:id/platform - Updates a single platform's state & recalculates workflowStatus
  app.patch(
    /^\/api\/items\/(.+)\/platform$/,
    (req: Request, res: Response) => {
      try {
        const rawId = req.params[0];
        const db = getOrInitDatabase();
        const itemId = resolveItemId(db, rawId);

        if (!itemId) {
          res.status(404).json({ error: `Item tidak ditemukan: ${rawId}` });
          return;
        }

        const body = req.body ?? {};
        const platformKey = (body.platform ??
          body.platformKey ??
          body.key) as PlatformKey;

        if (!platformKey || !ALL_PLATFORM_KEYS.includes(platformKey)) {
          res.status(400).json({
            error: `Platform key tidak valid. Gunakan salah satu dari: ${ALL_PLATFORM_KEYS.join(', ')}`,
          });
          return;
        }

        const patch: Record<string, unknown> = {};
        if (body.status !== undefined) patch.status = body.status;
        if (body.publishedUrl !== undefined)
          patch.publishedUrl = body.publishedUrl;
        if (body.scheduledTime !== undefined)
          patch.scheduledTime = body.scheduledTime;
        if (body.notes !== undefined) patch.notes = body.notes;

        const result = updateItemPlatformState(itemId, platformKey, patch);
        broadcastUpdate(`platform:${itemId}:${platformKey}`, result.db);

        res.json({
          ok: true,
          item: result.item,
          stats: result.db.stats,
          items: result.db.items,
          database: result.db,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal memperbarui status platform',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // 5. POST /api/items/:id/platforms-batch - Sets all 4 platforms to a given status
  app.post(
    /^\/api\/items\/(.+)\/platforms-batch$/,
    (req: Request, res: Response) => {
      try {
        const rawId = req.params[0];
        const db = getOrInitDatabase();
        const itemId = resolveItemId(db, rawId);

        if (!itemId) {
          res.status(404).json({ error: `Item tidak ditemukan: ${rawId}` });
          return;
        }

        const status = (req.body?.status ??
          'published') as PlatformUploadStatus;
        const scheduledTime = req.body?.scheduledTime as string | undefined;

        const result = batchUpdateItemPlatforms(itemId, status, scheduledTime);
        broadcastUpdate(`platforms-batch:${itemId}:${status}`, result.db);

        res.json({
          ok: true,
          item: result.item,
          stats: result.db.stats,
          items: result.db.items,
          database: result.db,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal memperbarui batch platform',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // 6. PUT /api/items/:id/caption - Writes updated caption text to disk & re-scans item
  app.put(/^\/api\/items\/(.+)\/caption$/, (req: Request, res: Response) => {
    try {
      const rawId = req.params[0];
      const db = getOrInitDatabase();
      const itemId = resolveItemId(db, rawId);

      if (!itemId) {
        res.status(404).json({ error: `Item tidak ditemukan: ${rawId}` });
        return;
      }

      const rawText =
        req.body?.rawText ??
        req.body?.caption ??
        req.body?.text ??
        req.body?.content;

      if (typeof rawText !== 'string') {
        res.status(400).json({
          error: 'Field rawText (atau caption/text) wajib berupa string',
        });
        return;
      }

      const result = updateItemCaptionOnDisk(itemId, rawText);
      broadcastUpdate(`caption:${itemId}`, result.db);

      res.json({
        ok: true,
        item: result.item,
        stats: result.db.stats,
        items: result.db.items,
        database: result.db,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal menyimpan caption.txt ke disk',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 7. PATCH /api/items/:id - Updates userProperties for item :id
  app.patch(/^\/api\/items\/(.+)$/, (req: Request, res: Response) => {
    try {
      const rawId = req.params[0];
      const db = getOrInitDatabase();
      const itemId = resolveItemId(db, rawId);

      if (!itemId) {
        res.status(404).json({ error: `Item tidak ditemukan: ${rawId}` });
        return;
      }

      const body = req.body ?? {};
      const patchSource =
        body.userProperties && typeof body.userProperties === 'object'
          ? { ...body, ...body.userProperties }
          : body;

      const patch: Partial<UserContentProperties> = {};
      if (patchSource.workflowStatus !== undefined)
        patch.workflowStatus = patchSource.workflowStatus;
      if (patchSource.statusLockedManually !== undefined)
        patch.statusLockedManually = Boolean(patchSource.statusLockedManually);
      if (patchSource.priority !== undefined)
        patch.priority = patchSource.priority;
      if (patchSource.customTitle !== undefined)
        patch.customTitle = String(patchSource.customTitle);
      if (Array.isArray(patchSource.categoryTags))
        patch.categoryTags = patchSource.categoryTags;
      if (patchSource.notes !== undefined)
        patch.notes = String(patchSource.notes);
      if (Array.isArray(patchSource.checklist))
        patch.checklist = patchSource.checklist;
      if (patchSource.platforms && typeof patchSource.platforms === 'object')
        patch.platforms = patchSource.platforms;

      const result = updateItemUserProperties(itemId, patch);
      broadcastUpdate(`item:${itemId}`, result.db);

      res.json({
        ok: true,
        item: result.item,
        stats: result.db.stats,
        items: result.db.items,
        database: result.db,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memperbarui properti konten',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 8. POST /api/system/open-explorer - Opens Windows Explorer with /select or folder
  app.post('/api/system/open-explorer', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const rawItemId = body.itemId ?? body.id;
      const selectTarget = body.selectFile ?? body.assetType ?? body.target;
      const directPath = body.path ?? body.filePath ?? body.folderPath;

      if (rawItemId) {
        const db = getOrInitDatabase();
        const itemId = resolveItemId(db, String(rawItemId));
        if (!itemId) {
          res
            .status(404)
            .json({ error: `Item tidak ditemukan: ${String(rawItemId)}` });
          return;
        }

        const item: ContentPlannerItem = db.items[itemId];
        let targetFile: string | null = null;

        if (selectTarget === 'wmVideo' || selectTarget === 'wm_final') {
          targetFile = item.autoMetadata.assets.wmVideo.absolutePath;
        } else if (
          selectTarget === 'rawVideo' ||
          selectTarget === 'motionprovit'
        ) {
          targetFile = item.autoMetadata.assets.rawVideo.absolutePath;
        } else if (selectTarget === 'cover') {
          targetFile = item.autoMetadata.assets.cover.absolutePath;
        } else if (selectTarget === 'caption') {
          targetFile = item.autoMetadata.assets.caption.absolutePath;
        }

        if (targetFile && fs.existsSync(targetFile)) {
          openInWindowsExplorer(targetFile, true);
          res.json({
            ok: true,
            openedPath: targetFile,
            mode: 'select-file',
          });
          return;
        }

        if (fs.existsSync(item.absolutePath)) {
          openInWindowsExplorer(item.absolutePath, false);
          res.json({
            ok: true,
            openedPath: item.absolutePath,
            mode: 'open-folder',
          });
          return;
        }

        res.status(404).json({
          error: `Folder tidak ditemukan di disk: ${item.absolutePath}`,
        });
        return;
      }

      if (typeof directPath === 'string' && directPath.trim()) {
        const resolved = path.resolve(directPath.trim());
        if (!fs.existsSync(resolved)) {
          res
            .status(404)
            .json({ error: `Path tidak ditemukan di disk: ${resolved}` });
          return;
        }

        const stat = fs.statSync(resolved);
        const shouldSelectFile =
          stat.isFile() ||
          (typeof selectTarget === 'boolean' && selectTarget && stat.isFile());

        openInWindowsExplorer(resolved, shouldSelectFile);
        res.json({
          ok: true,
          openedPath: resolved,
          mode: shouldSelectFile ? 'select-file' : 'open-folder',
        });
        return;
      }

      // Default fallback: open active workspace contentRootPath
      const activeRoot = getActiveWorkspace().contentRootPath;
      if (fs.existsSync(activeRoot)) {
        openInWindowsExplorer(activeRoot, false);
        res.json({
          ok: true,
          openedPath: activeRoot,
          mode: 'open-folder',
        });
        return;
      }

      res.status(400).json({
        error: 'Parameter itemId atau path diperlukan untuk membuka Explorer',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal membuka Windows Explorer',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 9. GET /api/brand/emblem - Serves Jurnal Dunia emblem image
  app.get('/api/brand/emblem', (_req: Request, res: Response) => {
    const primaryEmblem = path.join(
      WORKSPACE_ROOT,
      'Vintage Historical Journal Emblem.png'
    );
    const fallbackEmblem = path.join(WORKSPACE_ROOT, 'png.png');

    const chosenPath = fs.existsSync(primaryEmblem)
      ? primaryEmblem
      : fs.existsSync(fallbackEmblem)
        ? fallbackEmblem
        : null;

    if (!chosenPath) {
      res.status(404).json({ error: 'File emblem Jurnal Dunia tidak ditemukan' });
      return;
    }

    const stat = fs.statSync(chosenPath);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=3600',
    });
    fs.createReadStream(chosenPath).pipe(res);
  });

  // Watermark Studio API Routes
  // GET /api/watermark/fonts
  app.get('/api/watermark/fonts', (_req: Request, res: Response) => {
    try {
      const fonts = listAvailableFonts();
      res.json({ fonts });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat daftar font watermark',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/watermark/fonts/:fontId
  app.get('/api/watermark/fonts/:fontId', (req: Request, res: Response) => {
    try {
      const fontId = readRouteParam(req.params.fontId);
      const resolved = getFontFileById(fontId);

      if (!resolved || !fs.existsSync(resolved.absolutePath)) {
        res.status(404).json({ error: `Font tidak ditemukan: ${fontId}` });
        return;
      }

      const stat = fs.statSync(resolved.absolutePath);
      res.writeHead(200, {
        'Content-Type': 'font/ttf',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
      });

      const stream = fs.createReadStream(resolved.absolutePath);
      stream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat file font',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/watermark/capabilities
  app.get('/api/watermark/capabilities', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const capabilities = await detectWatermarkCapabilities(forceRefresh);
      res.json(capabilities);
    } catch (error) {
      res.status(500).json({
        error: 'Gagal mendeteksi kapabilitas FFmpeg',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/watermark/presets
  app.get('/api/watermark/presets', (_req: Request, res: Response) => {
    try {
      const store = getPresetStore();
      res.json(store);
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat daftar preset watermark',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/watermark/presets
  app.post('/api/watermark/presets', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name : '';
      const description =
        typeof body.description === 'string' ? body.description : '';
      const config =
        body.config && typeof body.config === 'object'
          ? (body.config as Partial<WatermarkStyleConfig>)
          : {};
      const isDefault = Boolean(body.isDefault);

      const result = createPreset({ name, description, config, isDefault });
      res.status(201).json({
        ok: true,
        preset: result.preset,
        store: result.store,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('tidak boleh kosong') ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // PUT /api/watermark/presets/:id
  app.put('/api/watermark/presets/:id', (req: Request, res: Response) => {
    try {
      const presetId = readRouteParam(req.params.id);
      const body = req.body ?? {};
      const patch: {
        name?: string;
        description?: string;
        config?: Partial<WatermarkStyleConfig>;
        isDefault?: boolean;
      } = {};

      if (typeof body.name === 'string') patch.name = body.name;
      if (typeof body.description === 'string')
        patch.description = body.description;
      if (body.config && typeof body.config === 'object') {
        patch.config = body.config as Partial<WatermarkStyleConfig>;
      }
      if (body.isDefault !== undefined) patch.isDefault = Boolean(body.isDefault);

      const result = updatePreset(presetId, patch);
      res.json({
        ok: true,
        preset: result.preset,
        store: result.store,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('tidak ditemukan')
        ? 404
        : message.includes('tidak boleh kosong')
          ? 400
          : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // DELETE /api/watermark/presets/:id
  app.delete('/api/watermark/presets/:id', (req: Request, res: Response) => {
    try {
      const presetId = readRouteParam(req.params.id);
      const result = deletePreset(presetId);
      res.json({
        ok: true,
        deletedId: result.deletedId,
        store: result.store,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('tidak ditemukan')
        ? 404
        : message.includes('bawaan') || message.includes('Minimal')
          ? 400
          : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // POST /api/watermark/presets/:id/default
  app.post(
    '/api/watermark/presets/:id/default',
    (req: Request, res: Response) => {
      try {
        const presetId = readRouteParam(req.params.id);
        const result = setDefaultPreset(presetId);
        res.json({
          ok: true,
          preset: result.preset,
          store: result.store,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = message.includes('tidak ditemukan') ? 404 : 500;
        res.status(statusCode).json({ error: message });
      }
    }
  );

  // GET /api/watermark/jobs
  app.get('/api/watermark/jobs', (req: Request, res: Response) => {
    const includeAll = req.query.all === 'true';
    const workspaceId = includeAll ? undefined : getActiveWorkspace().id;
    res.json({ jobs: watermarkQueue.listJobs(workspaceId) });
  });

  // POST /api/watermark/render
  app.post('/api/watermark/render', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const rawItemIds: unknown[] = Array.isArray(body.itemIds)
        ? body.itemIds
        : [];

      if (rawItemIds.length === 0) {
        res.status(400).json({
          error: 'Parameter itemIds wajib berupa array yang tidak kosong',
        });
        return;
      }

      const store = getPresetStore();
      const presetId =
        typeof body.presetId === 'string' && body.presetId.trim()
          ? body.presetId.trim()
          : undefined;

      const selectedPreset = presetId
        ? getPresetById(presetId)
        : store.presets.find((p) => p.id === store.defaultPresetId) ??
          store.presets[0] ??
          null;

      if (presetId && !selectedPreset) {
        res.status(404).json({
          error: `Preset watermark tidak ditemukan: ${presetId}`,
        });
        return;
      }

      const rawConfig =
        body.config && typeof body.config === 'object'
          ? (body.config as Partial<WatermarkStyleConfig>)
          : undefined;

      const finalConfig = rawConfig
        ? normalizeWatermarkConfig(
            rawConfig,
            selectedPreset?.config ?? DEFAULT_WATERMARK_CONFIG
          )
        : normalizeWatermarkConfig(
            selectedPreset?.config ?? DEFAULT_WATERMARK_CONFIG
          );

      const presetName =
        typeof body.presetName === 'string' && body.presetName.trim()
          ? body.presetName.trim()
          : selectedPreset
            ? selectedPreset.name
            : 'Custom Watermark';

      const requestedEncoder = body.encoder as WatermarkEncoderMode | undefined;
      const encoder: WatermarkEncoderMode =
        requestedEncoder === 'auto' ||
        requestedEncoder === 'x264' ||
        requestedEncoder === 'nvenc'
          ? requestedEncoder
          : store.defaultEncoder;

      if (body.saveDefaultEncoder === true && requestedEncoder) {
        setDefaultEncoder(encoder);
      }

      const requestedOutputMode = body.outputMode as
        | WatermarkOutputMode
        | undefined;
      const outputMode: WatermarkOutputMode | undefined =
        requestedOutputMode === 'separate_wm_file' ||
        requestedOutputMode === 'overwrite_source'
          ? requestedOutputMode
          : undefined;

      const db = getOrInitDatabase();
      const seenResolvedIds = new Set<string>();
      const validItems: ContentPlannerItem[] = [];
      const skipped: Array<{ itemId: string; reason: string }> = [];

      for (const entry of rawItemIds) {
        const rawId = String(entry ?? '').trim();
        if (!rawId) continue;

        const resolvedId = resolveItemId(db, rawId);
        if (!resolvedId) {
          skipped.push({ itemId: rawId, reason: 'Item tidak ditemukan' });
          continue;
        }

        if (seenResolvedIds.has(resolvedId)) {
          continue;
        }
        seenResolvedIds.add(resolvedId);

        const item = db.items[resolvedId];
        if (
          !item.autoMetadata.assets.rawVideo.exists ||
          !item.autoMetadata.assets.rawVideo.absolutePath
        ) {
          skipped.push({
            itemId: resolvedId,
            reason: 'Video sumber belum tersedia di folder',
          });
          continue;
        }

        validItems.push(item);
      }

      if (validItems.length === 0) {
        res.status(400).json({
          error:
            'Tidak ada item valid dengan video sumber yang bisa dirender watermark',
          skipped,
        });
        return;
      }

      const jobs = watermarkQueue.enqueueBatch({
        items: validItems,
        config: finalConfig,
        presetName,
        encoder,
        outputMode,
      });

      res.json({
        ok: true,
        jobs,
        skipped,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memulai antrean render watermark',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/watermark/jobs/:jobId/cancel
  app.post(
    '/api/watermark/jobs/:jobId/cancel',
    (req: Request, res: Response) => {
      try {
        const jobId = readRouteParam(req.params.jobId);
        const job = watermarkQueue.cancelJob(jobId);

        if (!job) {
          res.status(404).json({
            error: `Job render watermark tidak ditemukan: ${jobId}`,
          });
          return;
        }

        res.json({
          ok: true,
          job,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal membatalkan job render watermark',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/watermark/events
  app.get('/api/watermark/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const initialPayload = JSON.stringify({
      type: 'jobs-snapshot',
      jobs: watermarkQueue.listJobs(getActiveWorkspace().id),
      timestamp: new Date().toISOString(),
    });
    res.write(`event: jobs-snapshot\ndata: ${initialPayload}\n\n`);
    res.write(`data: ${initialPayload}\n\n`);

    const unsubscribe = watermarkQueue.subscribe((event) => {
      try {
        const activeWsId = getActiveWorkspace().id;
        if (event.job.workspaceId && event.job.workspaceId !== activeWsId) {
          return;
        }
        const payload = JSON.stringify({
          ...event,
          jobs: watermarkQueue.listJobs(activeWsId),
        });
        res.write(`event: job-updated\ndata: ${payload}\n\n`);
        res.write(`data: ${payload}\n\n`);
      } catch {
        unsubscribe();
      }
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // Auto-Post Manual Trigger API Routes
  // GET /api/autopost/capabilities
  app.get('/api/autopost/capabilities', (_req: Request, res: Response) => {
    try {
      res.json({
        ...detectAutoPostCapabilities(),
        browserSession: getBrowserSessionStatus(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal mendeteksi kapabilitas Auto-Post',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/autopost/settings
  app.get('/api/autopost/settings', (_req: Request, res: Response) => {
    try {
      res.json(getPublicAutoPostSettings());
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat pengaturan Auto-Post',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // PUT /api/autopost/settings
  app.put('/api/autopost/settings', (req: Request, res: Response) => {
    try {
      const rawBody = (req.body ?? {}) as UpdateAutoPostSettingsPatch;
      const patch: UpdateAutoPostSettingsPatch = { ...rawBody };

      if (rawBody.metaApi) {
        const nextMetaPatch = { ...rawBody.metaApi };
        const incomingPageId =
          typeof nextMetaPatch.pageId === 'string'
            ? nextMetaPatch.pageId.trim()
            : '';
        const hasExplicitPageToken =
          typeof nextMetaPatch.pageAccessToken === 'string' &&
          nextMetaPatch.pageAccessToken.trim().length > 0;

        if (
          incomingPageId &&
          !hasExplicitPageToken &&
          !nextMetaPatch.clearPageAccessToken
        ) {
          const cachedPageToken = getCachedPageToken(incomingPageId);
          if (cachedPageToken) {
            nextMetaPatch.pageAccessToken = cachedPageToken;
          }
        }
        patch.metaApi = nextMetaPatch;
      }

      const settings = updateAutoPostSettings(patch);
      res.json({
        ok: true,
        settings,
        capabilities: detectAutoPostCapabilities(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal menyimpan pengaturan Auto-Post',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/autopost/open-profile
  app.post('/api/autopost/open-profile', async (req: Request, res: Response) => {
    try {
      const rawPlatforms = req.body?.platforms;
      let platforms: PlatformKey[] | undefined;

      if (Array.isArray(rawPlatforms) && rawPlatforms.length > 0) {
        const filtered = rawPlatforms.filter(
          (entry): entry is PlatformKey =>
            typeof entry === 'string' &&
            ALL_PLATFORM_KEYS.includes(entry as PlatformKey)
        );
        if (filtered.length === 0) {
          res.status(400).json({
            error: `Daftar platform tidak valid. Gunakan: ${ALL_PLATFORM_KEYS.join(', ')}`,
          });
          return;
        }
        platforms = Array.from(new Set(filtered));
      }

      const result = await openLoginProfile(platforms);
      res.json({
        ok: true,
        ...result,
        capabilities: detectAutoPostCapabilities(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Gagal membuka profil browser Auto-Post',
      });
    }
  });

  // POST /api/autopost/close-profile
  app.post(
    '/api/autopost/close-profile',
    async (_req: Request, res: Response) => {
      try {
        const browserSession = await closeBrowserSession();
        res.json({
          ok: true,
          browserSession,
          capabilities: {
            ...detectAutoPostCapabilities(),
            browserSession,
          },
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal menutup sesi browser Auto-Post',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/autopost/check-sessions
  app.post(
    '/api/autopost/check-sessions',
    async (req: Request, res: Response) => {
      try {
        const rawPlatforms = req.body?.platforms;
        let platforms: PlatformKey[] | undefined;

        if (Array.isArray(rawPlatforms) && rawPlatforms.length > 0) {
          const filtered = rawPlatforms.filter(
            (entry): entry is PlatformKey =>
              typeof entry === 'string' &&
              ALL_PLATFORM_KEYS.includes(entry as PlatformKey)
          );
          if (filtered.length === 0) {
            res.status(400).json({
              error: `Daftar platform tidak valid. Gunakan: ${ALL_PLATFORM_KEYS.join(', ')}`,
            });
            return;
          }
          platforms = Array.from(new Set(filtered));
        }

        const sessions = await checkPlatformLoginSessions(platforms);
        res.json({
          ok: true,
          sessions,
        });
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal memeriksa sesi login browser Auto-Post',
        });
      }
    }
  );

  // GET /api/autopost/youtube/auth-url
  app.get('/api/autopost/youtube/auth-url', (req: Request, res: Response) => {
    try {
      const origin = getRequestOrigin(req);
      const authUrl = createYouTubeOAuthUrl(origin);
      res.json({ ok: true, url: authUrl, authUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('belum dikonfigurasi') ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // GET /api/autopost/youtube/callback
  app.get(
    '/api/autopost/youtube/callback',
    async (req: Request, res: Response) => {
      const oauthError =
        typeof req.query.error === 'string' ? req.query.error : null;
      const code = typeof req.query.code === 'string' ? req.query.code : null;

      if (oauthError) {
        res.status(400).type('html').send(
          renderOAuthResultHtml({
            ok: false,
            title: 'Otorisasi YouTube Dibatalkan',
            message: `Google OAuth mengembalikan error: ${oauthError}`,
          })
        );
        return;
      }

      if (!code) {
        res.status(400).type('html').send(
          renderOAuthResultHtml({
            ok: false,
            title: 'Kode OAuth Tidak Ditemukan',
            message: 'Parameter code dari Google OAuth tidak tersedia.',
          })
        );
        return;
      }

      try {
        const origin = getRequestOrigin(req);
        const result = await exchangeYouTubeOAuthCode(code, origin);
        const channelLabel = result.channelTitle
          ? `Channel "${result.channelTitle}" berhasil terhubung.`
          : 'Akun YouTube Data API v3 berhasil terhubung.';

        res.status(200).type('html').send(
          renderOAuthResultHtml({
            ok: true,
            title: 'YouTube API Terhubung',
            message: `${channelLabel} Tab ini akan tertutup otomatis.`,
            channelTitle: result.channelTitle,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).type('html').send(
          renderOAuthResultHtml({
            ok: false,
            title: 'Gagal Menghubungkan YouTube API',
            message,
          })
        );
      }
    }
  );

  // POST /api/autopost/youtube/disconnect
  app.post(
    '/api/autopost/youtube/disconnect',
    (_req: Request, res: Response) => {
      try {
        const settings = clearYouTubeTokens();
        res.json({
          ok: true,
          settings,
          capabilities: detectAutoPostCapabilities(),
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal memutuskan koneksi YouTube API',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/autopost/meta/auth-url
  app.get('/api/autopost/meta/auth-url', (req: Request, res: Response) => {
    try {
      const origin = getRequestOrigin(req);
      const authUrl = createMetaOAuthUrl(origin);
      res.json({ ok: true, url: authUrl, authUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('belum dikonfigurasi') ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // GET /api/autopost/meta/callback
  app.get(
    '/api/autopost/meta/callback',
    async (req: Request, res: Response) => {
      const oauthError =
        typeof req.query.error === 'string' ? req.query.error : null;
      const oauthErrorDescription =
        typeof req.query.error_description === 'string'
          ? req.query.error_description
          : typeof req.query.error_reason === 'string'
            ? req.query.error_reason
            : null;
      const code = typeof req.query.code === 'string' ? req.query.code : null;

      if (oauthError) {
        const detail = oauthErrorDescription
          ? `${oauthError} (${oauthErrorDescription})`
          : oauthError;
        res.status(400).type('html').send(
          renderOAuthResultHtml({
            eventType: 'meta-oauth-result',
            ok: false,
            title: 'Otorisasi Meta Dibatalkan',
            message: `Meta OAuth mengembalikan error: ${detail}`,
          })
        );
        return;
      }

      if (!code) {
        res.status(400).type('html').send(
          renderOAuthResultHtml({
            eventType: 'meta-oauth-result',
            ok: false,
            title: 'Kode OAuth Tidak Ditemukan',
            message: 'Parameter code dari Meta OAuth tidak tersedia.',
          })
        );
        return;
      }

      try {
        const origin = getRequestOrigin(req);
        const result = await exchangeMetaOAuthCode(code, origin);
        const selected = result.autoSelectedPage;
        const targetLabel = selected
          ? selected.igUsername
            ? `Page "${selected.pageName}" dan Instagram @${selected.igUsername} berhasil terhubung.`
            : `Page "${selected.pageName}" berhasil terhubung.`
          : result.pages.length > 1
            ? `${result.pages.length} Facebook Page ditemukan. Pilih Page tujuan di pengaturan Meta API.`
            : 'Token Long-Lived Meta Graph API berhasil disimpan.';

        res.status(200).type('html').send(
          renderOAuthResultHtml({
            eventType: 'meta-oauth-result',
            ok: true,
            title: 'Meta Graph API Terhubung',
            message: `${targetLabel} Tab ini akan tertutup otomatis.`,
            pageName: selected?.pageName ?? null,
            igUsername: selected?.igUsername ?? null,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).type('html').send(
          renderOAuthResultHtml({
            eventType: 'meta-oauth-result',
            ok: false,
            title: 'Gagal Menghubungkan Meta Graph API',
            message,
          })
        );
      }
    }
  );

  // POST /api/autopost/meta/exchange-token
  app.post(
    '/api/autopost/meta/exchange-token',
    async (req: Request, res: Response) => {
      try {
        const appId =
          typeof req.body?.appId === 'string' ? req.body.appId : undefined;
        const appSecret =
          typeof req.body?.appSecret === 'string'
            ? req.body.appSecret
            : undefined;
        const shortLivedToken =
          typeof req.body?.shortLivedToken === 'string'
            ? req.body.shortLivedToken
            : typeof req.body?.accessToken === 'string'
              ? req.body.accessToken
              : '';
        const graphApiVersion =
          typeof req.body?.graphApiVersion === 'string'
            ? req.body.graphApiVersion
            : undefined;

        const result = await exchangeShortLivedMetaToken({
          appId,
          appSecret,
          shortLivedToken,
          graphApiVersion,
        });
        res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode =
          message.includes('belum diisi') || message.includes('wajib')
            ? 400
            : 500;
        res.status(statusCode).json({ error: message });
      }
    }
  );

  // POST /api/autopost/meta/test-connection
  app.post(
    '/api/autopost/meta/test-connection',
    async (_req: Request, res: Response) => {
      try {
        const result = await testMetaConnection();
        res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
      }
    }
  );

  // POST /api/autopost/meta/discover
  app.post(
    '/api/autopost/meta/discover',
    async (req: Request, res: Response) => {
      try {
        const accessToken =
          typeof req.body?.accessToken === 'string'
            ? req.body.accessToken
            : undefined;
        const graphApiVersion =
          typeof req.body?.graphApiVersion === 'string'
            ? req.body.graphApiVersion
            : undefined;

        const result = await discoverMetaAccounts(accessToken, graphApiVersion);
        res.json({
          ok: true,
          pages: result.pages,
          tokenType: result.tokenType,
          graphApiVersion: result.graphApiVersion,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = message.includes('belum diisi') ? 400 : 500;
        res.status(statusCode).json({ error: message });
      }
    }
  );

  // POST /api/autopost/meta/disconnect
  app.post('/api/autopost/meta/disconnect', (_req: Request, res: Response) => {
    try {
      const settings = clearMetaConfig();
      res.json({
        ok: true,
        settings,
        capabilities: detectAutoPostCapabilities(),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memutuskan koneksi Meta Graph API',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/autopost/jobs
  app.get('/api/autopost/jobs', (req: Request, res: Response) => {
    const includeAll = req.query.all === 'true';
    const workspaceId = includeAll ? undefined : getActiveWorkspace().id;
    res.json({ jobs: autoPostQueue.listJobs(workspaceId) });
  });

  // POST /api/autopost/trigger
  app.post('/api/autopost/trigger', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const rawItemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';

      if (!rawItemId) {
        res.status(400).json({
          error: 'Parameter itemId wajib diisi',
        });
        return;
      }

      const rawPlatforms: unknown[] = Array.isArray(body.platforms)
        ? body.platforms
        : [];
      const validPlatforms: PlatformKey[] = Array.from(
        new Set<PlatformKey>(
          rawPlatforms.filter(
            (entry): entry is PlatformKey =>
              typeof entry === 'string' &&
              ALL_PLATFORM_KEYS.includes(entry as PlatformKey)
          )
        )
      );

      if (validPlatforms.length === 0) {
        res.status(400).json({
          error: `Parameter platforms wajib berisi minimal satu platform valid: ${ALL_PLATFORM_KEYS.join(', ')}`,
        });
        return;
      }

      const workspace = getActiveWorkspace();
      const db = getOrInitDatabase();
      const itemId = resolveItemId(db, rawItemId);

      if (!itemId) {
        res.status(404).json({
          error: `Item tidak ditemukan: ${rawItemId}`,
        });
        return;
      }

      const item = db.items[itemId];
      const uploadVideo = resolveUploadVideoForItem(item, workspace);
      if (!uploadVideo) {
        const needsSeparateWm =
          workspace.rules.watermarkPolicy === 'separate_wm_file';
        res.status(400).json({
          error: needsSeparateWm
            ? `File video final watermark belum tersedia untuk item ${item.folderCode}`
            : `File video yang siap diunggah belum tersedia untuk item ${item.folderCode}`,
        });
        return;
      }

      const requestedMode = body.mode;
      const mode: AutoPostMode | undefined =
        requestedMode === 'review' || requestedMode === 'publish'
          ? requestedMode
          : undefined;

      const requestedPrivacy = body.youtubePrivacy;
      const youtubePrivacy: 'public' | 'unlisted' | 'private' | undefined =
        requestedPrivacy === 'public' ||
        requestedPrivacy === 'unlisted' ||
        requestedPrivacy === 'private'
          ? requestedPrivacy
          : undefined;

      let scheduledAt: string | null = null;
      if (typeof body.scheduledAt === 'string' && body.scheduledAt.trim()) {
        const candidate = body.scheduledAt.trim();
        const parsed = new Date(candidate);
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({
            error: `Format waktu jadwal tidak valid: ${candidate}`,
          });
          return;
        }
        scheduledAt = candidate;
      }

      const aiGenerated: boolean | undefined =
        typeof body.aiGenerated === 'boolean' ? body.aiGenerated : undefined;

      const jobs = autoPostQueue.enqueueBatch({
        item,
        platforms: validPlatforms,
        mode,
        youtubePrivacy,
        scheduledAt,
        aiGenerated,
      });

      res.json({
        ok: true,
        jobs,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memulai antrean Auto-Post',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/autopost/jobs/:jobId/cancel
  app.post(
    '/api/autopost/jobs/:jobId/cancel',
    (req: Request, res: Response) => {
      try {
        const jobId = readRouteParam(req.params.jobId);
        const job = autoPostQueue.cancelJob(jobId);

        if (!job) {
          res.status(404).json({
            error: `Job Auto-Post tidak ditemukan: ${jobId}`,
          });
          return;
        }

        res.json({
          ok: true,
          job,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Gagal membatalkan job Auto-Post',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/autopost/jobs/:jobId/confirm-published
  app.post(
    '/api/autopost/jobs/:jobId/confirm-published',
    async (req: Request, res: Response) => {
      try {
        const jobId = readRouteParam(req.params.jobId);
        const publishedUrl =
          typeof req.body?.publishedUrl === 'string'
            ? req.body.publishedUrl
            : undefined;

        const result = await autoPostQueue.confirmReviewJob(
          jobId,
          publishedUrl
        );
        if (!result) {
          res.status(404).json({
            error: `Job Auto-Post tidak ditemukan: ${jobId}`,
          });
          return;
        }

        res.json({
          ok: true,
          job: result.job,
          item: result.item,
          stats: result.db.stats,
          database: result.db,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Gagal mengonfirmasi publikasi job Auto-Post';
        res.status(500).json({
          error: message,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/autopost/events
  app.get('/api/autopost/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const initialPayload = JSON.stringify({
      type: 'jobs-snapshot',
      jobs: autoPostQueue.listJobs(getActiveWorkspace().id),
      browserSession: getBrowserSessionStatus(),
      timestamp: new Date().toISOString(),
    });
    res.write(`event: jobs-snapshot\ndata: ${initialPayload}\n\n`);
    res.write(`data: ${initialPayload}\n\n`);

    const unsubscribeJobs = autoPostQueue.subscribe((event) => {
      try {
        const activeWsId = getActiveWorkspace().id;
        if (event.job.workspaceId && event.job.workspaceId !== activeWsId) {
          return;
        }
        const payload = JSON.stringify({
          ...event,
          jobs: autoPostQueue.listJobs(activeWsId),
          browserSession: getBrowserSessionStatus(),
        });
        res.write(`event: job-updated\ndata: ${payload}\n\n`);
        res.write(`data: ${payload}\n\n`);
      } catch {
        unsubscribeJobs();
        unsubscribeBrowser();
      }
    });

    const unsubscribeBrowser = subscribeBrowserSession((browserSession) => {
      try {
        const payload = JSON.stringify({
          type: 'browser-session',
          browserSession,
          timestamp: new Date().toISOString(),
        });
        res.write(`event: browser-session\ndata: ${payload}\n\n`);
        res.write(`data: ${payload}\n\n`);
      } catch {
        unsubscribeJobs();
        unsubscribeBrowser();
      }
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        unsubscribeJobs();
        unsubscribeBrowser();
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeJobs();
      unsubscribeBrowser();
    });
  });

  // ---------------------------------------------------------------------------
  // 9b. Add-on: MotionProvit Scraper & Selective Batch Importer
  // ---------------------------------------------------------------------------

  // GET /api/addons/motionprovit/status
  app.get('/api/addons/motionprovit/status', (_req: Request, res: Response) => {
    try {
      const workspace = getActiveWorkspace();
      const internal = getInternalMotionProvitConfig(workspace.id);
      const db = getOrInitDatabase();
      const jobs = enrichJobsWithWorkspaceStatus(
        internal.cachedJobs,
        workspace.id
      );
      const nextSlot = suggestNextAvailableSlot(db, workspace);

      res.json({
        ok: true,
        config: toPublicMotionProvitConfig(internal, workspace.id),
        jobs,
        nextSlot,
        cacheStats: getMotionProvitCacheStats(workspace.id),
        importProgress: getMotionProvitImportProgress(workspace.id),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Gagal memuat status Add-on MotionProvit',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /api/addons/motionprovit/login
  app.post(
    '/api/addons/motionprovit/login',
    async (req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const email =
          typeof req.body?.email === 'string' ? req.body.email : undefined;
        const password =
          typeof req.body?.password === 'string'
            ? req.body.password
            : undefined;

        const result = await loginMotionProvit(
          { email, password },
          workspace.id
        );
        res.status(result.ok ? 200 : 401).json(result);
      } catch (error) {
        res.status(500).json({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Gagal login ke MotionProvit',
        });
      }
    }
  );

  // POST /api/addons/motionprovit/open-login
  app.post(
    '/api/addons/motionprovit/open-login',
    async (_req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const result = await openMotionProvitLoginBrowser(workspace.id);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal membuka halaman login MotionProvit di browser',
        });
      }
    }
  );

  // POST /api/addons/motionprovit/check-session
  app.post(
    '/api/addons/motionprovit/check-session',
    async (_req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const result = await checkMotionProvitSession(workspace.id);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          ok: false,
          connected: false,
          error:
            error instanceof Error
              ? error.message
              : 'Gagal memeriksa sesi MotionProvit',
        });
      }
    }
  );

  // POST /api/addons/motionprovit/disconnect
  app.post(
    '/api/addons/motionprovit/disconnect',
    async (_req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const config = await disconnectMotionProvit(workspace.id);
        res.json({ ok: true, config });
      } catch (error) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal memutuskan koneksi MotionProvit',
        });
      }
    }
  );

  // POST /api/addons/motionprovit/jobs/fetch
  app.post(
    '/api/addons/motionprovit/jobs/fetch',
    async (req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const rawMode = req.body?.mode;
        const mode = rawMode === 'full' ? 'full' : 'incremental';
        const result = await scrapeMotionProvitJobs(workspace.id, { mode });
        const db = getOrInitDatabase();
        const nextSlot = suggestNextAvailableSlot(db, workspace);

        res.json({
          ok: true,
          config: result.config,
          jobs: result.jobs,
          nextSlot,
          syncMode: result.syncMode,
          newFoundCount: result.newFoundCount,
          pagesScanned: result.pagesScanned,
          cacheStats: getMotionProvitCacheStats(workspace.id),
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Gagal mengambil daftar video dari MotionProvit',
        });
      }
    }
  );

  // POST /api/addons/motionprovit/cache/clear
  app.post(
    '/api/addons/motionprovit/cache/clear',
    (_req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const cacheStats = clearMotionProvitThumbCache(workspace.id);
        res.json({ ok: true, cacheStats });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Gagal membersihkan cache thumbnail MotionProvit',
        });
      }
    }
  );

  // GET /api/addons/motionprovit/thumb?url=...
  app.get(
    '/api/addons/motionprovit/thumb',
    async (req: Request, res: Response) => {
      try {
        const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
        if (!rawUrl || !rawUrl.startsWith('http')) {
          res.status(400).end();
          return;
        }
        const workspace = getActiveWorkspace();
        const result = await fetchMotionProvitImageBuffer(rawUrl, workspace.id);
        if (!result) {
          res.status(404).end();
          return;
        }
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(result.buffer);
      } catch {
        res.status(500).end();
      }
    }
  );

  // POST /api/addons/motionprovit/import
  app.post(
    '/api/addons/motionprovit/import',
    async (req: Request, res: Response) => {
      try {
        const workspace = getActiveWorkspace();
        const body = req.body ?? {};
        const jobIds = Array.isArray(body.jobIds)
          ? body.jobIds.filter(
              (id: unknown): id is string =>
                typeof id === 'string' && id.trim().length > 0
            )
          : [];
        const rawAssets = body.assets ?? {};
        const assets = {
          video: rawAssets.video !== false,
          cover: rawAssets.cover !== false,
          caption: rawAssets.caption !== false,
        };
        const startDateIso =
          typeof body.startDateIso === 'string' && body.startDateIso.trim()
            ? body.startDateIso.trim()
            : undefined;
        const startSlotCode =
          typeof body.startSlotCode === 'string' && body.startSlotCode.trim()
            ? body.startSlotCode.trim()
            : undefined;

        const progress = await startMotionProvitBatchImport(
          {
            jobIds,
            assets,
            startDateIso,
            startSlotCode,
          },
          workspace.id,
          (reason, updatedDb, wsId) => {
            if (wsId === getActiveWorkspace().id) {
              broadcastUpdate(reason, updatedDb);
            }
          }
        );

        res.json({ ok: true, importProgress: progress });
      } catch (error) {
        res.status(400).json({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Gagal memulai pengunduhan MotionProvit',
        });
      }
    }
  );

  // GET /api/addons/motionprovit/import/status
  app.get(
    '/api/addons/motionprovit/import/status',
    (_req: Request, res: Response) => {
      const workspace = getActiveWorkspace();
      res.json({
        ok: true,
        importProgress: getMotionProvitImportProgress(workspace.id),
      });
    }
  );

  // POST /api/addons/motionprovit/import/cancel
  app.post(
    '/api/addons/motionprovit/import/cancel',
    (_req: Request, res: Response) => {
      const workspace = getActiveWorkspace();
      const cancelled = cancelMotionProvitImport(workspace.id);
      res.json({
        ok: true,
        cancelled,
        importProgress: getMotionProvitImportProgress(workspace.id),
      });
    }
  );

  // 10. GET /media/* - Streams files from active workspace contentRootPath with HTTP Range (206 Partial Content)
  app.get(/^\/media\/(.+)$/, (req: Request, res: Response) => {
    try {
      const rawRelative = req.params[0] ?? '';
      const decodedRelative = rawRelative
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .join('/');

      const activeRoot = getActiveWorkspace().contentRootPath;
      const resolvedFilePath = path.resolve(activeRoot, decodedRelative);
      const normalizedRoot = path.resolve(activeRoot).toLowerCase();

      if (!resolvedFilePath.toLowerCase().startsWith(normalizedRoot)) {
        res.status(403).json({ error: 'Akses path di luar KONTEN ditolak' });
        return;
      }

      if (!fs.existsSync(resolvedFilePath)) {
        res.status(404).json({ error: 'File media tidak ditemukan' });
        return;
      }

      const stat = fs.statSync(resolvedFilePath);
      if (!stat.isFile()) {
        res.status(400).json({ error: 'Target bukan merupakan file' });
        return;
      }

      const fileSize = stat.size;
      const mimeType = getMimeType(resolvedFilePath);
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end =
          parts[1] && parts[1].trim() !== ''
            ? parseInt(parts[1], 10)
            : fileSize - 1;

        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          start >= fileSize ||
          end >= fileSize ||
          start > end
        ) {
          res.writeHead(416, {
            'Content-Range': `bytes */${fileSize}`,
          });
          res.end();
          return;
        }

        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache',
        });

        const stream = fs.createReadStream(resolvedFilePath, { start, end });
        stream.on('error', () => {
          if (!res.writableEnded) res.end();
        });
        stream.pipe(res);
        return;
      }

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });

      const stream = fs.createReadStream(resolvedFilePath);
      stream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({
        error: 'Gagal melakukan streaming media',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  singletonInstance = {
    app,
    watcher,
    broadcastUpdate,
  };

  return app;
}
