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
  type WatermarkRenderSpeedMode,
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
  isAllowedMotionProvitUrl,
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
  evictAutoPostConfigCache,
  getInternalAutoPostConfig,
  getPublicAutoPostSettings,
  invalidateAutoPostCapabilitiesCache,
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
import {
  authenticateRemoteClient,
  getNotifSoundBuffer,
  getRemoteControlConfig,
  getRemoteControlPublicStatus,
  isAuthorizedRemoteRequest,
  isLoopbackRequest,
  REMOTE_COOKIE_NAME,
  updateRemoteControlConfig,
} from './core/remoteControl.ts';
import { WORKSPACE_ROOT } from './scanner.ts';
import {
  ALL_PLATFORM_KEYS,
  batchUpdateItemPlatforms,
  createEmptyDatabase,
  evictDatabaseMemoryCache,
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
  evictPresetStoreCache,
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
  APP_ROOT,
  activateWorkspace,
  createWorkspace,
  deleteWorkspace,
  getActiveWorkspace,
  getWorkspaceById,
  getWorkspacePaths,
  getWorkspacesRegistry,
  hasConfiguredWorkspace,
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

const FONT_MIME_TYPES: Record<string, string> = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ttc': 'font/collection',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const CPGP_FALLBACK_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="CPGP Studio Emblem">
  <defs>
    <linearGradient id="cpgpBurgundy" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7B1630"/>
      <stop offset="55%" stop-color="#580E22"/>
      <stop offset="100%" stop-color="#3B0816"/>
    </linearGradient>
    <linearGradient id="cpgpGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F1D9B5"/>
      <stop offset="100%" stop-color="#C89B62"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#cpgpBurgundy)"/>
  <rect x="12" y="12" width="104" height="104" rx="22" fill="none" stroke="url(#cpgpGold)" stroke-opacity="0.55" stroke-width="2"/>
  <text x="64" y="68" text-anchor="middle" fill="#F8EBDA" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="700" letter-spacing="2">CPGP</text>
  <line x1="34" y1="80" x2="94" y2="80" stroke="url(#cpgpGold)" stroke-opacity="0.6" stroke-width="1.5"/>
  <text x="64" y="96" text-anchor="middle" fill="#E4C69B" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="3.5">STUDIO</text>
</svg>`;

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function getFontMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return FONT_MIME_TYPES[ext] ?? 'font/ttf';
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
  let command: string;
  let args: string[];

  if (process.platform === 'win32') {
    const normalizedWinPath = path.win32.normalize(targetPath);
    command = 'explorer.exe';
    args = selectFile ? ['/select,', normalizedWinPath] : [normalizedWinPath];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = selectFile ? ['-R', targetPath] : [targetPath];
  } else {
    command = 'xdg-open';
    args = [selectFile ? path.dirname(targetPath) : targetPath];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: process.platform !== 'win32',
  });
  child.on('error', () => {
    // Prevent unhandled ENOENT crash when OS file manager binary is unavailable
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
  shutdown: () => Promise<void>;
}

let singletonInstance: ApiRouterInstance | null = null;

export async function shutdownApiRouter(): Promise<void> {
  if (!singletonInstance) return;
  await singletonInstance.shutdown();
}

export function createApiRouter(): Express {
  if (singletonInstance) {
    return singletonInstance.app;
  }

  const app = express();
  const sseClients = new Map<Response, () => void>();
  const watermarkSseClients = new Map<Response, () => void>();
  const autopostSseClients = new Map<Response, () => void>();

  // Ensure initial scan / JSON database exists on startup (skip if awaiting first-run onboarding)
  let cachedDb: PlannerDatabase = hasConfiguredWorkspace()
    ? syncDatabaseWithDisk()
    : createEmptyDatabase('', new Date().getFullYear());
  let cachedDbWorkspaceId: string | null = hasConfiguredWorkspace()
    ? getActiveWorkspace().id
    : null;

  function broadcastSseFrame(
    clients: Map<Response, () => void>,
    frame: string
  ): void {
    for (const [client, cleanupClient] of Array.from(clients.entries())) {
      try {
        client.write(frame);
      } catch {
        cleanupClient();
      }
    }
  }

  function broadcastUpdate(reason: string, db: PlannerDatabase) {
    cachedDb = db;
    const activeWorkspace = getActiveWorkspace();
    cachedDbWorkspaceId = activeWorkspace.id;
    if (sseClients.size === 0) return;

    const payload = JSON.stringify({
      type: 'planner-updated',
      reason,
      timestamp: new Date().toISOString(),
      workspaceId: activeWorkspace.id,
      stats: db.stats,
      lastFullScanAt: db.workspaceConfig.lastFullScanAt,
    });
    broadcastSseFrame(sseClients, `data: ${payload}\n\n`);
  }

  function broadcastWorkspaceSwitch(reason: string, db: PlannerDatabase) {
    cachedDb = db;
    const registry = getWorkspacesRegistry();
    const activeWorkspace = getActiveWorkspace();
    cachedDbWorkspaceId = activeWorkspace.id;
    if (sseClients.size === 0) return;

    const payload = JSON.stringify({
      type: 'workspace-switched',
      reason,
      timestamp: new Date().toISOString(),
      activeWorkspaceId: activeWorkspace.id,
      workspace: activeWorkspace,
      registry,
      stats: db.stats,
    });
    broadcastSseFrame(sseClients, `data: ${payload}\n\n`);
  }

  // Set up dynamic chokidar watcher bound to active workspace contentRootPath
  let watcher: FSWatcher | null = null;
  let watchedRootPath: string | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let lastSelfScanAt = 0;

  function markSelfDiskMutation(): void {
    lastSelfScanAt = Date.now();
  }

  const watermarkQueue = createWatermarkQueue({
    onJobCompleted: (itemId, job) => {
      try {
        markSelfDiskMutation();
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
        markSelfDiskMutation();
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

  const unsubscribeWatermarkBroadcast = watermarkQueue.subscribe((event) => {
    if (watermarkSseClients.size === 0) return;
    const activeWsId = getActiveWorkspace().id;
    if (event.job.workspaceId && event.job.workspaceId !== activeWsId) {
      return;
    }
    const payload = JSON.stringify({
      ...event,
      jobs: watermarkQueue.listJobs(activeWsId),
    });
    broadcastSseFrame(watermarkSseClients, `data: ${payload}\n\n`);
  });

  const unsubscribeAutopostJobsBroadcast = autoPostQueue.subscribe((event) => {
    if (autopostSseClients.size === 0) return;
    const activeWsId = getActiveWorkspace().id;
    if (event.job.workspaceId && event.job.workspaceId !== activeWsId) {
      return;
    }
    const payload = JSON.stringify({
      ...event,
      jobs: autoPostQueue.listJobs(activeWsId),
      browserSession: getBrowserSessionStatus(),
    });
    broadcastSseFrame(autopostSseClients, `data: ${payload}\n\n`);
  });

  const unsubscribeAutopostBrowserBroadcast = subscribeBrowserSession(
    (browserSession) => {
      if (autopostSseClients.size === 0) return;
      const payload = JSON.stringify({
        type: 'browser-session',
        browserSession,
        timestamp: new Date().toISOString(),
      });
      broadcastSseFrame(autopostSseClients, `data: ${payload}\n\n`);
    }
  );

  function syncBrowserSessionForActiveWorkspace() {
    const status = getBrowserSessionStatus();
    if (!status.isOpen) {
      return;
    }
    const activeProfileDir = getActiveBrowserProfileDir();
    const expectedProfileDir = getInternalAutoPostConfig().browser.profileDir;
    const normalizePath = (p: string) =>
      process.platform === 'win32'
        ? path.resolve(p).toLowerCase()
        : path.resolve(p);
    const samePersistentProfile = Boolean(
      activeProfileDir &&
        expectedProfileDir &&
        normalizePath(activeProfileDir) === normalizePath(expectedProfileDir)
    );
    if (samePersistentProfile) {
      return;
    }
    void closeBrowserSession();
  }

  const SELF_SCAN_SUPPRESS_WINDOW_MS = 600;

  const internalIgnoredRoots = [
    path.resolve(APP_ROOT, 'data'),
    path.resolve(APP_ROOT, '.cache'),
    path.resolve(APP_ROOT, 'node_modules'),
    path.resolve(APP_ROOT, 'dist'),
    path.resolve(APP_ROOT, 'dist-server'),
    path.resolve(APP_ROOT, '.git'),
    path.resolve(APP_ROOT, 'graphify-out'),
  ].map((p) => (process.platform === 'win32' ? p.toLowerCase() : p));

  const internalIgnoredDirNames = new Set([
    'node_modules',
    'data',
    '.cache',
    '.git',
    'dist',
    'dist-server',
    'browser-profile',
    'graphify-out',
  ]);

  const internalIgnoredFileNames = new Set([
    'planner.json',
    'planner-data.json',
    'workspaces.json',
    'watermark-presets.json',
    'autopost-config.json',
    'motionprovit-config.json',
    'motionprovit-session.json',
    '.cpgp-watermarked.json',
  ]);

  function isIgnoredWatchPath(
    candidatePath: string,
    rootPath?: string | null
  ): boolean {
    if (!candidatePath) return true;
    const resolved = path.resolve(candidatePath);
    const norm = process.platform === 'win32' ? resolved.toLowerCase() : resolved;

    for (const root of internalIgnoredRoots) {
      if (
        norm === root ||
        norm.startsWith(root + path.sep) ||
        norm.startsWith(`${root}/`)
      ) {
        return true;
      }
    }

    const base = path.basename(norm);
    if (
      internalIgnoredFileNames.has(base) ||
      base.endsWith('.part') ||
      base.endsWith('.tmp') ||
      base.includes('.tmp.')
    ) {
      return true;
    }

    let pathToCheck = norm;
    if (rootPath) {
      const resolvedRoot = path.resolve(rootPath);
      const normRoot =
        process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot;
      const relPath = path.relative(normRoot, norm);
      if (!relPath) {
        return false;
      }
      if (!relPath.startsWith('..') && !path.isAbsolute(relPath)) {
        pathToCheck = relPath;
      }
    }

    const segments = pathToCheck.split(/[\\/]+/).filter(Boolean);
    for (const seg of segments) {
      if (internalIgnoredDirNames.has(seg)) {
        return true;
      }
    }

    return false;
  }

  function rebindWatcherToActiveWorkspace() {
    if (!hasConfiguredWorkspace()) {
      return;
    }
    const activeWs = getActiveWorkspace();
    const targetRoot = activeWs.contentRootPath;
    if (!targetRoot) {
      return;
    }

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
      ignorePermissionErrors: true,
      persistent: true,
      depth: 4,
      ignored: (watchPath: string) => isIgnoredWatchPath(watchPath, targetRoot),
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    const triggerDebouncedScan = (eventType: string, changedPath: string) => {
      if (isIgnoredWatchPath(changedPath, targetRoot)) {
        return;
      }
      if (Date.now() - lastSelfScanAt < SELF_SCAN_SUPPRESS_WINDOW_MS) {
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          markSelfDiskMutation();
          const updatedDb = syncDatabaseWithDisk();
          broadcastUpdate(
            `fs:${eventType}:${path.basename(changedPath)}`,
            updatedDb
          );
        } catch (err) {
          console.error('[Chokidar Auto-Scan Error]:', err);
        }
      }, 450);
    };

    watcher
      .on('add', (p) => triggerDebouncedScan('add', p))
      .on('change', (p) => triggerDebouncedScan('change', p))
      .on('unlink', (p) => triggerDebouncedScan('unlink', p))
      .on('addDir', (p) => triggerDebouncedScan('addDir', p))
      .on('unlinkDir', (p) => triggerDebouncedScan('unlinkDir', p))
      .on('error', (err) => {
        const code = (err as NodeJS.ErrnoException | null)?.code;
        if (code === 'EBUSY' || code === 'EPERM' || code === 'ENOENT') {
          return;
        }
        console.warn('[Chokidar Watcher Warning]:', err);
      });

    if (singletonInstance) {
      singletonInstance.watcher = watcher;
    }
  }

  rebindWatcherToActiveWorkspace();

  const isPrivateLanHostname = (hostname: string): boolean => {
    return (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  };

  app.use(
    '/api',
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            if (
              parsed.hostname === 'localhost' ||
              parsed.hostname === '127.0.0.1' ||
              parsed.hostname === '[::1]' ||
              parsed.hostname === '::1'
            ) {
              callback(null, true);
              return;
            }
            if (
              getRemoteControlConfig().enabled &&
              isPrivateLanHostname(parsed.hostname)
            ) {
              callback(null, true);
              return;
            }
          }
        } catch {
          // Reject malformed origin
        }
        callback(null, false);
      },
      credentials: true,
    })
  );
  app.use('/api', express.json({ limit: '10mb' }));

  // Remote Control LAN Guard for /api/* and /media/*
  const PUBLIC_REMOTE_API_PATHS = new Set([
    '/api/remote/session',
    '/api/remote/auth',
    '/api/remote/logout',
    '/api/remote/notif-sound',
    '/api/brand/emblem',
  ]);

  app.use((req: Request, res: Response, next) => {
    const isApi = req.path.startsWith('/api');
    const isMedia = req.path.startsWith('/media');
    if (!isApi && !isMedia) {
      next();
      return;
    }

    if (isLoopbackRequest(req)) {
      next();
      return;
    }

    const remoteCfg = getRemoteControlConfig();
    if (!remoteCfg.enabled) {
      res.status(403).json({
        error:
          'Remote Control HP sedang dinonaktifkan. Aktifkan dari tombol Remote HP di aplikasi Desktop CPGP.',
        remoteDisabled: true,
      });
      return;
    }

    if (isApi && PUBLIC_REMOTE_API_PATHS.has(req.path)) {
      next();
      return;
    }

    if (!isAuthorizedRemoteRequest(req)) {
      res.status(401).json({
        error:
          'Sesi Remote Control belum terautentikasi. Scan QR Code atau masukkan PIN 6 digit.',
        requiresAuth: true,
      });
      return;
    }

    next();
  });

  // ---------------------------------------------------------------------------
  // 0. Remote Control HP (Local Wi-Fi Pairing, PIN/QR Auth & Notification Sound)
  // ---------------------------------------------------------------------------

  // GET /api/remote/config (Loopback Desktop or Authenticated Remote)
  app.get('/api/remote/config', (req: Request, res: Response) => {
    if (!isLoopbackRequest(req) && !isAuthorizedRemoteRequest(req)) {
      res.status(403).json({
        error: 'Hanya dapat diakses dari aplikasi Desktop CPGP atau perangkat terautentikasi.',
      });
      return;
    }
    res.json(getRemoteControlPublicStatus());
  });

  // PUT /api/remote/config (Loopback Desktop only for security)
  app.put('/api/remote/config', (req: Request, res: Response) => {
    if (!isLoopbackRequest(req)) {
      res.status(403).json({
        error:
          'Pengaturan PIN & aktivasi Remote Control hanya dapat diubah langsung dari PC Desktop.',
      });
      return;
    }
    const body = req.body ?? {};
    updateRemoteControlConfig({
      enabled:
        typeof body.enabled === 'boolean' ? body.enabled : undefined,
      soundOnDesktop:
        typeof body.soundOnDesktop === 'boolean'
          ? body.soundOnDesktop
          : undefined,
      regeneratePin: body.regeneratePin === true,
      customPin:
        typeof body.customPin === 'string' ? body.customPin : undefined,
    });
    res.json(getRemoteControlPublicStatus());
  });

  // GET /api/remote/session (Public bootstrap check for /remote on mobile)
  app.get('/api/remote/session', (req: Request, res: Response) => {
    const cfg = getRemoteControlConfig();
    const isLoopback = isLoopbackRequest(req);
    const authenticated = isAuthorizedRemoteRequest(req);
    const activeWs = hasConfiguredWorkspace() ? getActiveWorkspace() : null;

    res.json({
      enabled: cfg.enabled,
      authenticated,
      isLoopback,
      soundOnDesktop: cfg.soundOnDesktop,
      activeWorkspace: activeWs
        ? {
            id: activeWs.id,
            name: activeWs.name,
            handle: activeWs.handle,
          }
        : null,
    });
  });

  // POST /api/remote/auth (Exchange 6-digit PIN or QR pairToken for session cookie + token)
  app.post('/api/remote/auth', (req: Request, res: Response) => {
    const pin =
      typeof req.body?.pin === 'string' ? req.body.pin.trim() : undefined;
    const token =
      typeof req.body?.token === 'string' ? req.body.token.trim() : undefined;

    const result = authenticateRemoteClient(req, { pin, token });
    if (!result.ok || !result.sessionToken) {
      res.status(result.status ?? 401).json({
        ok: false,
        error: result.error ?? 'Autentikasi gagal.',
      });
      return;
    }

    res.setHeader(
      'Set-Cookie',
      `${REMOTE_COOKIE_NAME}=${encodeURIComponent(result.sessionToken)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`
    );
    res.json({
      ok: true,
      sessionToken: result.sessionToken,
    });
  });

  // POST /api/remote/logout
  app.post('/api/remote/logout', (_req: Request, res: Response) => {
    res.setHeader(
      'Set-Cookie',
      `${REMOTE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
    res.json({ ok: true });
  });

  // GET /api/remote/notif-sound (Serves bundled cpgp-notif.mp3)
  app.get('/api/remote/notif-sound', (req: Request, res: Response) => {
    const buf = getNotifSoundBuffer();
    const etag = `W/"cpgp-notif-${buf.length}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buf.length,
      ETag: etag,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(buf);
  });

  // 1. GET /api/events: Server-Sent Events for real-time UI sync
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let cleaned = false;
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, 25000);

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      sseClients.delete(res);
    };

    sseClients.set(res, cleanup);
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    const initPayload = JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
      stats: cachedDb.stats,
    });
    try {
      res.write(`data: ${initPayload}\n\n`);
    } catch {
      cleanup();
    }
  });

  // 2. GET /api/planner - Returns full PlannerDatabase
  app.get('/api/planner', (req: Request, res: Response) => {
    try {
      if (!hasConfiguredWorkspace()) {
        res.json(createEmptyDatabase('', new Date().getFullYear()));
        return;
      }
      const activeWs = getActiveWorkspace();
      const forceRefresh = req.query.refresh === 'true';
      if (forceRefresh) {
        cachedDb = syncDatabaseWithDisk();
        cachedDbWorkspaceId = activeWs.id;
      } else if (cachedDbWorkspaceId !== activeWs.id) {
        cachedDb = getOrInitDatabase();
        cachedDbWorkspaceId = activeWs.id;
      }
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
      markSelfDiskMutation();
      const updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();
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
      const activeWorkspace = hasConfiguredWorkspace()
        ? getActiveWorkspace()
        : null;
      const defaultContentBaseDir = path.join(APP_ROOT, 'KONTEN');
      res.json({
        ...registry,
        registry,
        activeWorkspace,
        defaultContentBaseDir,
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
      markSelfDiskMutation();
      const input = (req.body ?? {}) as CreateWorkspaceInput;
      const { workspace, registry } = createWorkspace(input);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();
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
      markSelfDiskMutation();
      const { workspace, registry } = activateWorkspace(workspaceId);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();
      broadcastWorkspaceSwitch(`workspace-activated:${workspace.id}`, updatedDb);

      res.json({
        ok: true,
        workspace,
        registry,
        database: updatedDb,
      });
    } catch (error) {
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL workspace tidak valid' });
        return;
      }
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
      markSelfDiskMutation();
      const { workspace, registry } = updateWorkspace(workspaceId, patch);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();
      broadcastWorkspaceSwitch(`workspace-updated:${workspace.id}`, updatedDb);

      res.json({
        ok: true,
        workspace,
        registry,
        database: updatedDb,
      });
    } catch (error) {
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL workspace tidak valid' });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes('tidak ditemukan') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  // DELETE /api/workspaces/:id
  app.delete('/api/workspaces/:id', (req: Request, res: Response) => {
    try {
      const workspaceId = readRouteParam(req.params.id);
      const deletedPaths = getWorkspacePaths(workspaceId);
      markSelfDiskMutation();
      const registry = deleteWorkspace(workspaceId);
      evictDatabaseMemoryCache(deletedPaths.plannerFile);
      evictPresetStoreCache(deletedPaths.watermarkPresetsFile);
      evictAutoPostConfigCache(workspaceId);
      invalidateAutoPostCapabilitiesCache(workspaceId);
      syncBrowserSessionForActiveWorkspace();
      rebindWatcherToActiveWorkspace();
      const updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();
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
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL workspace tidak valid' });
        return;
      }
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
      markSelfDiskMutation();
      const created = createContentFolderOnDisk(workspace, input);
      let updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();

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
      markSelfDiskMutation();
      const result = batchGenerateSlotsOnDisk(workspace, input);
      const updatedDb = syncDatabaseWithDisk();
      markSelfDiskMutation();
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
        if (error instanceof URIError) {
          res.status(400).json({ error: 'Parameter URL item tidak valid' });
          return;
        }
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
        if (error instanceof URIError) {
          res.status(400).json({ error: 'Parameter URL item tidak valid' });
          return;
        }
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

      markSelfDiskMutation();
      const result = updateItemCaptionOnDisk(itemId, rawText);
      markSelfDiskMutation();
      broadcastUpdate(`caption:${itemId}`, result.db);

      res.json({
        ok: true,
        item: result.item,
        stats: result.db.stats,
        items: result.db.items,
        database: result.db,
      });
    } catch (error) {
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL item tidak valid' });
        return;
      }
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
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL item tidak valid' });
        return;
      }
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
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL item tidak valid' });
        return;
      }
      res.status(500).json({
        error: 'Gagal membuka file manager sistem',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 9. GET /api/brand/emblem - Serves workspace emblem PNG or Luxury Burgundy CPGP SVG fallback
  app.get('/api/brand/emblem', (req: Request, res: Response) => {
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

    let stat: fs.Stats | null = null;
    if (chosenPath) {
      try {
        stat = fs.statSync(chosenPath);
      } catch {
        stat = null;
      }
    }

    if (!chosenPath || !stat) {
      const svgBuffer = Buffer.from(CPGP_FALLBACK_EMBLEM_SVG, 'utf-8');
      const svgEtag = `W/"cpgp-emblem-svg-${svgBuffer.length}"`;
      if (req.headers['if-none-match'] === svgEtag) {
        res.writeHead(304, {
          ETag: svgEtag,
          'Cache-Control': 'public, max-age=86400',
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Length': svgBuffer.length,
        ETag: svgEtag,
        'Cache-Control': 'public, max-age=86400',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(svgBuffer);
      return;
    }

    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    const lastModified = stat.mtime.toUTCString();
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        ETag: etag,
        'Last-Modified': lastModified,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': stat.size,
      ETag: etag,
      'Last-Modified': lastModified,
      'Cache-Control': 'public, max-age=3600',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(chosenPath);
    res.on('close', () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
    });
    stream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    stream.pipe(res);
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
      const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
      const lastModified = stat.mtime.toUTCString();
      const cacheControl = 'public, max-age=86400';

      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          ETag: etag,
          'Last-Modified': lastModified,
          'Cache-Control': cacheControl,
        });
        res.end();
        return;
      }

      res.writeHead(200, {
        'Content-Type': getFontMimeType(resolved.absolutePath),
        'Content-Length': stat.size,
        ETag: etag,
        'Last-Modified': lastModified,
        'Cache-Control': cacheControl,
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(resolved.absolutePath);
      res.on('close', () => {
        if (!stream.destroyed) {
          stream.destroy();
        }
      });
      stream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      stream.pipe(res);
    } catch (error) {
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL font tidak valid' });
        return;
      }
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
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL preset tidak valid' });
        return;
      }
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
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter URL preset tidak valid' });
        return;
      }
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
        if (error instanceof URIError) {
          res.status(400).json({ error: 'Parameter URL preset tidak valid' });
          return;
        }
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
        requestedEncoder === 'nvenc' ||
        requestedEncoder === 'qsv' ||
        requestedEncoder === 'amf' ||
        requestedEncoder === 'x264'
          ? requestedEncoder
          : store.defaultEncoder;

      const requestedSpeed = body.speedMode as
        | WatermarkRenderSpeedMode
        | undefined;
      const speedMode: WatermarkRenderSpeedMode =
        requestedSpeed === 'fast' ||
        requestedSpeed === 'balanced' ||
        requestedSpeed === 'max_compression'
          ? requestedSpeed
          : 'fast';

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
        speedMode,
        outputMode,
      });

      res.json({
        ok: true,
        jobs,
        skipped,
      });
    } catch (error) {
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter itemId tidak valid' });
        return;
      }
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
        if (error instanceof URIError) {
          res.status(400).json({ error: 'Parameter URL job tidak valid' });
          return;
        }
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

    let cleaned = false;
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, 15000);

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      watermarkSseClients.delete(res);
    };

    watermarkSseClients.set(res, cleanup);
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    const initialPayload = JSON.stringify({
      type: 'jobs-snapshot',
      jobs: watermarkQueue.listJobs(getActiveWorkspace().id),
      timestamp: new Date().toISOString(),
    });
    try {
      res.write(`data: ${initialPayload}\n\n`);
    } catch {
      cleanup();
    }
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
      if (
        error instanceof Error &&
        (error.name === 'ValidationError' || error.message.includes('URL CDP'))
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
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
      if (error instanceof URIError) {
        res.status(400).json({ error: 'Parameter itemId tidak valid' });
        return;
      }
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
        if (error instanceof URIError) {
          res.status(400).json({ error: 'Parameter URL job tidak valid' });
          return;
        }
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
        if (error instanceof URIError) {
          res.status(400).json({ error: 'Parameter URL job tidak valid' });
          return;
        }
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

    let cleaned = false;
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, 15000);

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      autopostSseClients.delete(res);
    };

    autopostSseClients.set(res, cleanup);
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    const initialPayload = JSON.stringify({
      type: 'jobs-snapshot',
      jobs: autoPostQueue.listJobs(getActiveWorkspace().id),
      browserSession: getBrowserSessionStatus(),
      timestamp: new Date().toISOString(),
    });
    try {
      res.write(`data: ${initialPayload}\n\n`);
    } catch {
      cleanup();
    }
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
        const rawUrl =
          typeof req.query.url === 'string' ? req.query.url.trim() : '';
        if (!rawUrl) {
          res.status(400).end();
          return;
        }
        try {
          new URL(rawUrl);
        } catch {
          res.status(400).end();
          return;
        }
        if (!isAllowedMotionProvitUrl(rawUrl)) {
          res.status(403).json({
            error:
              'Domain thumbnail tidak diizinkan. Hanya https://motion.clipprovit.com yang didukung.',
          });
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
            markSelfDiskMutation();
            if (wsId === getActiveWorkspace().id) {
              broadcastUpdate(reason, updatedDb);
            }
          },
          () => {
            markSelfDiskMutation();
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

  // 10. GET /media/* - Streams files from active workspace contentRootPath with HTTP Range (206 Partial Content) & ETag/304
  app.get(/^\/media\/(.+)$/, (req: Request, res: Response) => {
    try {
      const rawRelative = req.params[0] ?? '';
      let decodedRelative: string;
      try {
        decodedRelative = rawRelative
          .split('/')
          .map((segment) => decodeURIComponent(segment))
          .join('/');
      } catch (err) {
        if (err instanceof URIError) {
          res.status(400).json({ error: 'URL media tidak valid' });
          return;
        }
        throw err;
      }

      const activeRoot = getActiveWorkspace().contentRootPath;
      if (!activeRoot) {
        res.status(404).json({ error: 'Folder konten workspace belum diatur' });
        return;
      }

      const resolvedRoot = path.resolve(activeRoot);
      const resolvedFilePath = path.resolve(resolvedRoot, decodedRelative);
      const rel = path.relative(resolvedRoot, resolvedFilePath);

      if (
        !rel ||
        rel === '..' ||
        rel.startsWith(`..${path.sep}`) ||
        rel.startsWith('../') ||
        path.isAbsolute(rel)
      ) {
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
      const etag = `W/"${fileSize}-${Math.floor(stat.mtimeMs)}"`;
      const lastModified = stat.mtime.toUTCString();
      const cacheControl = 'private, max-age=60, must-revalidate';
      const rangeHeader = req.headers.range;

      const ifNoneMatch = req.headers['if-none-match'];
      if (
        !rangeHeader &&
        typeof ifNoneMatch === 'string' &&
        (ifNoneMatch === etag ||
          ifNoneMatch.split(',').some((tag) => tag.trim() === etag))
      ) {
        res.writeHead(304, {
          ETag: etag,
          'Last-Modified': lastModified,
          'Cache-Control': cacheControl,
        });
        res.end();
        return;
      }

      if (rangeHeader) {
        const rangeMatch = /^bytes=([^,]+)$/.exec(rangeHeader.trim());
        const parts = (
          rangeMatch ? rangeMatch[1] : rangeHeader.replace(/^bytes=/i, '')
        ).split('-');

        let start: number;
        let end: number;

        if (parts[0].trim() === '' && parts[1] && parts[1].trim() !== '') {
          // Suffix byte range (e.g. bytes=-500)
          const suffixLength = parseInt(parts[1].trim(), 10);
          if (Number.isNaN(suffixLength) || suffixLength <= 0 || fileSize === 0) {
            res.writeHead(416, {
              'Content-Range': `bytes */${fileSize}`,
            });
            res.end();
            return;
          }
          start = Math.max(0, fileSize - suffixLength);
          end = fileSize - 1;
        } else {
          start = parseInt(parts[0].trim(), 10);
          const rawEnd =
            parts[1] && parts[1].trim() !== ''
              ? parseInt(parts[1].trim(), 10)
              : fileSize - 1;
          end = Math.min(rawEnd, fileSize - 1);
        }

        if (
          fileSize === 0 ||
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          start >= fileSize ||
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
          ETag: etag,
          'Last-Modified': lastModified,
          'Cache-Control': cacheControl,
        });

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(resolvedFilePath, { start, end });
        res.on('close', () => {
          if (!stream.destroyed) {
            stream.destroy();
          }
        });
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
        ETag: etag,
        'Last-Modified': lastModified,
        'Cache-Control': cacheControl,
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(resolvedFilePath);
      res.on('close', () => {
        if (!stream.destroyed) {
          stream.destroy();
        }
      });
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

  const shutdown = async (): Promise<void> => {
    for (const [res, cleanupClient] of Array.from(sseClients.entries())) {
      cleanupClient();
      try {
        if (!res.writableEnded) res.end();
      } catch {
        // ignore close failure
      }
    }
    sseClients.clear();

    for (const [res, cleanupClient] of Array.from(watermarkSseClients.entries())) {
      cleanupClient();
      try {
        if (!res.writableEnded) res.end();
      } catch {
        // ignore close failure
      }
    }
    watermarkSseClients.clear();

    for (const [res, cleanupClient] of Array.from(autopostSseClients.entries())) {
      cleanupClient();
      try {
        if (!res.writableEnded) res.end();
      } catch {
        // ignore close failure
      }
    }
    autopostSseClients.clear();

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unsubscribeWatermarkBroadcast();
    unsubscribeAutopostJobsBroadcast();
    unsubscribeAutopostBrowserBroadcast();

    if (watcher) {
      const oldWatcher = watcher;
      watcher = null;
      watchedRootPath = null;
      await oldWatcher.close().catch(() => {});
    }

    await closeBrowserSession().catch(() => {});
  };

  singletonInstance = {
    app,
    watcher,
    broadcastUpdate,
    shutdown,
  };

  return app;
}
