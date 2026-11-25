import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import type { BrowserContext, Page } from 'patchright';
import { DEFAULT_TIME_SLOTS } from '../../shared/rulePresets.ts';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type {
  MotionProvitCacheStats,
  MotionProvitConfigPublic,
  MotionProvitImportItemResult,
  MotionProvitImportProgress,
  MotionProvitImportRequest,
  MotionProvitJobSummary,
} from '../../src/types/motionprovit.ts';
import type { PlannerDatabase } from '../../src/types/planner.ts';
import { getOrLaunchBrowserContext } from '../autopost/browserSession.ts';
import {
  createContentFolderOnDisk,
  suggestNextAvailableSlot,
} from '../core/contentCreator.ts';
import { getOrInitDatabase, syncDatabaseWithDisk } from '../storage.ts';
import {
  APP_ROOT,
  getActiveWorkspace,
  getWorkspaceById,
  getWorkspacePaths,
} from '../workspaces/registry.ts';
import {
  clearMotionProvitConfig,
  getInternalMotionProvitConfig,
  MOTIONPROVIT_BASE_URL,
  MOTIONPROVIT_JOBS_URL,
  MOTIONPROVIT_LOGIN_URL,
  toPublicMotionProvitConfig,
  updateMotionProvitConfig,
} from './motionprovitConfig.ts';

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const importRunsByWorkspace = new Map<string, MotionProvitImportProgress>();
const activeImportControllers = new Map<string, AbortController>();
const lastSyncTimestampByWorkspace = new Map<string, number>();

export const MOTIONPROVIT_THUMB_CACHE_ROOT = path.join(
  APP_ROOT,
  '.cache',
  'motionprovit-thumbs'
);
const SYNC_COOLDOWN_MS = 30_000;

function randomJitter(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(minMs + Math.random() * Math.max(1, maxMs - minMs));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function normalizeShortId(rawId: string): string {
  const cleaned = rawId.trim().replace(/^#/, '');
  if (cleaned.includes('-')) {
    const firstPart = cleaned.split('-')[0];
    if (firstPart && firstPart.length >= 6) {
      return firstPart.toLowerCase();
    }
  }
  return cleaned.slice(0, 8).toLowerCase();
}

function normalizeAspectForFile(aspectRatio: string): string {
  const m = aspectRatio.match(/(\d+)\s*[:xX]\s*(\d+)/);
  if (m) {
    return `${m[1]}x${m[2]}`;
  }
  return '9x16';
}

function resolveAbsoluteUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `${baseUrl.replace(/\/+$/, '')}${trimmed}`;
  }
  return null;
}

function normalizeJobStatus(
  raw: string | null | undefined
): { status: MotionProvitJobSummary['status']; label: string } {
  const val = (raw ?? '').trim().toLowerCase();
  if (
    val.includes('selesai') ||
    val === 'completed' ||
    val === 'done' ||
    val === 'success' ||
    val === 'ready' ||
    val === 'finished'
  ) {
    return { status: 'completed', label: 'Selesai' };
  }
  if (
    val.includes('proses') ||
    val === 'processing' ||
    val === 'running' ||
    val === 'queued' ||
    val === 'pending' ||
    val === 'rendering'
  ) {
    return { status: 'processing', label: 'Diproses' };
  }
  if (val.includes('gagal') || val === 'failed' || val === 'error') {
    return { status: 'failed', label: 'Gagal' };
  }
  return { status: 'unknown', label: raw?.trim() || 'Tidak diketahui' };
}

function extractJobsFromUnknownJson(
  payload: unknown,
  baseUrl: string
): MotionProvitJobSummary[] {
  const found: MotionProvitJobSummary[] = [];
  const visited = new Set<unknown>();

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 5 || visited.has(node)) {
      return;
    }
    visited.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const rec = entry as Record<string, unknown>;
          const rawId =
            typeof rec.id === 'string'
              ? rec.id
              : typeof rec.jobId === 'string'
                ? rec.jobId
                : typeof rec.uuid === 'string'
                  ? rec.uuid
                  : null;
          const hasRenderFields =
            Boolean(rawId) &&
            (typeof rec.title === 'string' ||
              typeof rec.judul === 'string' ||
              typeof rec.projectTitle === 'string' ||
              typeof rec.videoUrl === 'string' ||
              typeof rec.video_url === 'string' ||
              typeof rec.outputUrl === 'string' ||
              typeof rec.output_url === 'string' ||
              typeof rec.aspectRatio === 'string' ||
              typeof rec.aspect_ratio === 'string' ||
              typeof rec.status === 'string');

          if (rawId && hasRenderFields) {
            const shortId = normalizeShortId(rawId);
            const title =
              (typeof rec.title === 'string' && rec.title.trim()) ||
              (typeof rec.judul === 'string' && rec.judul.trim()) ||
              (typeof rec.projectTitle === 'string' && rec.projectTitle.trim()) ||
              (typeof rec.name === 'string' && rec.name.trim()) ||
              `Video #${shortId}`;

            const style =
              (typeof rec.style === 'string' && rec.style.trim()) ||
              (typeof rec.styleName === 'string' && rec.styleName.trim()) ||
              (typeof rec.template === 'string' && rec.template.trim()) ||
              (typeof rec.gaya === 'string' && rec.gaya.trim()) ||
              'MotionProvit';

            const statusInfo = normalizeJobStatus(
              typeof rec.status === 'string' ? rec.status : ''
            );

            const aspectRatio =
              (typeof rec.aspectRatio === 'string' && rec.aspectRatio.trim()) ||
              (typeof rec.aspect_ratio === 'string' && rec.aspect_ratio.trim()) ||
              (typeof rec.ratio === 'string' && rec.ratio.trim()) ||
              '9:16';

            const durationRaw =
              rec.durationSec ??
              rec.duration_sec ??
              rec.durationSeconds ??
              rec.duration ??
              null;
            const durationSec =
              typeof durationRaw === 'number' && Number.isFinite(durationRaw)
                ? Math.round(durationRaw)
                : null;

            const createdAtIso =
              (typeof rec.createdAt === 'string' && rec.createdAt) ||
              (typeof rec.created_at === 'string' && rec.created_at) ||
              (typeof rec.updatedAt === 'string' && rec.updatedAt) ||
              null;

            const thumbnailUrl = resolveAbsoluteUrl(
              (typeof rec.coverUrl === 'string' && rec.coverUrl) ||
                (typeof rec.cover_url === 'string' && rec.cover_url) ||
                (typeof rec.thumbnailUrl === 'string' && rec.thumbnailUrl) ||
                (typeof rec.thumbnail_url === 'string' && rec.thumbnail_url) ||
                (typeof rec.posterUrl === 'string' && rec.posterUrl) ||
                null,
              baseUrl
            );

            const videoUrl = resolveAbsoluteUrl(
              (typeof rec.videoUrl === 'string' && rec.videoUrl) ||
                (typeof rec.video_url === 'string' && rec.video_url) ||
                (typeof rec.outputUrl === 'string' && rec.outputUrl) ||
                (typeof rec.output_url === 'string' && rec.output_url) ||
                (typeof rec.mp4Url === 'string' && rec.mp4Url) ||
                null,
              baseUrl
            );

            const coverUrl = resolveAbsoluteUrl(
              (typeof rec.coverUrl === 'string' && rec.coverUrl) ||
                (typeof rec.cover_url === 'string' && rec.cover_url) ||
                (typeof rec.coverJpgUrl === 'string' && rec.coverJpgUrl) ||
                null,
              baseUrl
            );

            const captionPreview =
              (typeof rec.caption === 'string' && rec.caption.trim()) ||
              (typeof rec.description === 'string' && rec.description.trim()) ||
              (typeof rec.script === 'string' && rec.script.trim()) ||
              null;

            found.push({
              id: rawId,
              shortId,
              title,
              style,
              status: statusInfo.status,
              statusLabel: statusInfo.label,
              aspectRatio,
              durationSec,
              createdAtText: createdAtIso ?? '',
              createdAtIso,
              thumbnailUrl,
              detailUrl: `${baseUrl}/app/jobs/${encodeURIComponent(rawId)}`,
              videoUrl,
              coverUrl,
              captionPreview,
              alreadyImported: false,
              importedItemId: null,
              importedFolderCode: null,
            });
          } else {
            walk(entry, depth + 1);
          }
        }
      }
      return;
    }

    for (const val of Object.values(node as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        walk(val, depth + 1);
      }
    }
  };

  walk(payload, 0);
  return found;
}

export function enrichJobsWithWorkspaceStatus(
  jobs: MotionProvitJobSummary[],
  workspaceId?: string
): MotionProvitJobSummary[] {
  const workspace = workspaceId
    ? getWorkspaceById(workspaceId) ?? getActiveWorkspace()
    : getActiveWorkspace();
  const paths = getWorkspacePaths(workspace.id);
  const db = getOrInitDatabase(
    workspace.contentRootPath,
    workspace.defaultYear,
    paths.plannerFile,
    workspace
  );

  const byMotionId = new Map<string, { id: string; folderCode: string }>();
  for (const item of Object.values(db.items)) {
    const mpId = item.autoMetadata.motionprovitId?.trim().toLowerCase();
    if (mpId) {
      byMotionId.set(mpId, { id: item.id, folderCode: item.folderCode });
    }
    // Also match against raw video or cover file names
    const rawName = item.autoMetadata.assets.rawVideo.fileName?.toLowerCase() ?? '';
    const coverName = item.autoMetadata.assets.cover.fileName?.toLowerCase() ?? '';
    const idMatch =
      rawName.match(/motionprovit-([a-z0-9_-]{6,})/i) ??
      coverName.match(/cover-([a-z0-9_-]{6,})/i);
    if (idMatch?.[1]) {
      const normalized = idMatch[1].replace(/-\d+x\d+$/, '').toLowerCase();
      if (!byMotionId.has(normalized)) {
        byMotionId.set(normalized, { id: item.id, folderCode: item.folderCode });
      }
    }
  }

  return jobs.map((job) => {
    const match =
      byMotionId.get(job.shortId.toLowerCase()) ??
      byMotionId.get(job.id.toLowerCase()) ??
      null;
    return {
      ...job,
      alreadyImported: Boolean(match),
      importedItemId: match?.id ?? null,
      importedFolderCode: match?.folderCode ?? null,
    };
  });
}

async function readNextAuthSessionFromPage(
  page: Page,
  baseUrl: string
): Promise<{
  authenticated: boolean;
  name: string | null;
  email: string | null;
}> {
  try {
    const res = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    }, `${baseUrl}/api/auth/session`);

    if (res && typeof res === 'object') {
      const rec = res as {
        user?: { name?: string | null; email?: string | null };
      };
      if (rec.user && (rec.user.email || rec.user.name)) {
        return {
          authenticated: true,
          name:
            typeof rec.user.name === 'string' && rec.user.name.trim()
              ? rec.user.name.trim()
              : null,
          email:
            typeof rec.user.email === 'string' && rec.user.email.trim()
              ? rec.user.email.trim()
              : null,
        };
      }
    }
  } catch {
    // ignore session check failure
  }
  return { authenticated: false, name: null, email: null };
}

async function saveBrowserStorageState(
  context: BrowserContext,
  workspaceId?: string
): Promise<void> {
  try {
    const paths = getWorkspacePaths(workspaceId);
    const dir = path.dirname(paths.motionprovitSessionFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const cookies = await context.cookies(MOTIONPROVIT_BASE_URL);
    fs.writeFileSync(
      paths.motionprovitSessionFile,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          origin: MOTIONPROVIT_BASE_URL,
          cookies,
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
  } catch {
    // non-fatal
  }
}

async function restoreCookiesIfNeeded(
  context: BrowserContext,
  workspaceId?: string
): Promise<void> {
  try {
    const existing = await context.cookies(MOTIONPROVIT_BASE_URL);
    if (existing.length > 0) return;

    const paths = getWorkspacePaths(workspaceId);
    if (!fs.existsSync(paths.motionprovitSessionFile)) return;
    const raw = fs.readFileSync(paths.motionprovitSessionFile, 'utf-8');
    const parsed = JSON.parse(raw) as {
      cookies?: Parameters<BrowserContext['addCookies']>[0];
    };
    if (Array.isArray(parsed.cookies) && parsed.cookies.length > 0) {
      await context.addCookies(parsed.cookies);
    }
  } catch {
    // ignore restore errors
  }
}

async function performMotionProvitLoginOnPage(
  page: Page,
  email: string,
  password: string,
  baseUrl: string
): Promise<{
  ok: boolean;
  name: string | null;
  email: string | null;
  message: string;
}> {
  await page.goto(`${baseUrl}/login?callbackUrl=%2Fapp%2Fjobs`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(1800);

  // Already logged in and redirected straight to /app/jobs?
  if (!page.url().toLowerCase().includes('/login')) {
    const session = await readNextAuthSessionFromPage(page, baseUrl);
    if (session.authenticated || page.url().includes('/app')) {
      return {
        ok: true,
        name: session.name,
        email: session.email ?? (email || null),
        message: 'Sesi MotionProvit sudah aktif.',
      };
    }
  }

  if (!email.trim() || !password) {
    return {
      ok: false,
      name: null,
      email: null,
      message: 'Email dan password MotionProvit belum diisi.',
    };
  }

  const emailInput = page
    .locator('input[type="email"], input[autocomplete="email"]')
    .first();
  const passInput = page
    .locator('input[type="password"], input[autocomplete="current-password"]')
    .first();

  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.click();
  await emailInput.fill(email.trim());
  await page.waitForTimeout(200);

  await passInput.click();
  await passInput.fill(password);
  await page.waitForTimeout(300);

  const submitBtn = page
    .locator('button[type="submit"], button:has-text("Masuk")')
    .first();
  await submitBtn.click();

  // Wait up to 25s for redirect out of /login or inline error message
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (!page.url().toLowerCase().includes('/login')) {
      await page.waitForTimeout(1200);
      const session = await readNextAuthSessionFromPage(page, baseUrl);
      return {
        ok: true,
        name: session.name,
        email: session.email ?? email.trim(),
        message: 'Berhasil login ke MotionProvit.',
      };
    }

    const errorText = await page.evaluate(() => {
      const alertEl = document.querySelector(
        '[role="alert"], .text-red-500, .text-red-600, .text-destructive'
      );
      return (alertEl?.textContent ?? '').trim();
    });
    if (errorText && errorText.length > 3 && errorText.length < 220) {
      return {
        ok: false,
        name: null,
        email: null,
        message: errorText,
      };
    }

    await page.waitForTimeout(500);
  }

  // Final check via session endpoint in case login succeeded without immediate URL change
  const session = await readNextAuthSessionFromPage(page, baseUrl);
  if (session.authenticated) {
    return {
      ok: true,
      name: session.name,
      email: session.email ?? email.trim(),
      message: 'Berhasil login ke MotionProvit.',
    };
  }

  return {
    ok: false,
    name: null,
    email: null,
    message:
      'Login belum selesai (mungkin memerlukan verifikasi Turnstile/Captcha). Gunakan tombol Login via Browser lalu klik Cek Sesi.',
  };
}

export async function openMotionProvitLoginBrowser(
  workspaceId?: string
): Promise<{ ok: true; loginUrl: string }> {
  const config = getInternalMotionProvitConfig(workspaceId);
  const context = await getOrLaunchBrowserContext(undefined, workspaceId);
  await restoreCookiesIfNeeded(context, workspaceId);
  const page = await context.newPage();
  await page.bringToFront().catch(() => {});
  const loginUrl = `${config.baseUrl}/login?callbackUrl=%2Fapp%2Fjobs`;
  await page
    .goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    .catch(() => {});
  return { ok: true, loginUrl };
}

export async function loginMotionProvit(
  input: { email?: string; password?: string },
  workspaceId?: string
): Promise<{
  ok: boolean;
  message: string;
  config: MotionProvitConfigPublic;
}> {
  const current = getInternalMotionProvitConfig(workspaceId);
  const email =
    typeof input.email === 'string' && input.email.trim()
      ? input.email.trim()
      : current.email;
  const password =
    typeof input.password === 'string' && input.password.length > 0
      ? input.password
      : current.password;

  // Save credentials into workspace config immediately
  updateMotionProvitConfig({ email, password }, workspaceId);

  const context = await getOrLaunchBrowserContext(undefined, workspaceId);
  await restoreCookiesIfNeeded(context, workspaceId);
  const page = await context.newPage();

  try {
    await page.bringToFront().catch(() => {});
    const result = await performMotionProvitLoginOnPage(
      page,
      email,
      password,
      current.baseUrl
    );
    const nowIso = new Date().toISOString();

    if (result.ok) {
      await saveBrowserStorageState(context, workspaceId);
      const updated = updateMotionProvitConfig(
        {
          email,
          password,
          connected: true,
          accountName: result.name,
          accountEmail: result.email ?? (email || null),
          lastVerifiedAt: nowIso,
        },
        workspaceId
      );
      return {
        ok: true,
        message: result.message,
        config: toPublicMotionProvitConfig(updated, workspaceId),
      };
    }

    const updated = updateMotionProvitConfig(
      {
        connected: false,
        lastVerifiedAt: nowIso,
      },
      workspaceId
    );
    return {
      ok: false,
      message: result.message,
      config: toPublicMotionProvitConfig(updated, workspaceId),
    };
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

export async function checkMotionProvitSession(
  workspaceId?: string
): Promise<{
  ok: boolean;
  connected: boolean;
  message: string;
  config: MotionProvitConfigPublic;
}> {
  const current = getInternalMotionProvitConfig(workspaceId);
  const context = await getOrLaunchBrowserContext(undefined, workspaceId);
  await restoreCookiesIfNeeded(context, workspaceId);
  const page = await context.newPage();

  try {
    await page.goto(`${current.baseUrl}/app/jobs`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(2200);

    const isLoginPage = page.url().toLowerCase().includes('/login');
    const session = await readNextAuthSessionFromPage(page, current.baseUrl);
    const nowIso = new Date().toISOString();

    if (!isLoginPage || session.authenticated) {
      await saveBrowserStorageState(context, workspaceId);
      const updated = updateMotionProvitConfig(
        {
          connected: true,
          accountName: session.name ?? current.accountName,
          accountEmail: session.email ?? current.accountEmail ?? (current.email || null),
          lastVerifiedAt: nowIso,
        },
        workspaceId
      );
      return {
        ok: true,
        connected: true,
        message: 'Sesi MotionProvit aktif.',
        config: toPublicMotionProvitConfig(updated, workspaceId),
      };
    }

    const updated = updateMotionProvitConfig(
      {
        connected: false,
        lastVerifiedAt: nowIso,
      },
      workspaceId
    );
    return {
      ok: true,
      connected: false,
      message: 'Belum login ke MotionProvit.',
      config: toPublicMotionProvitConfig(updated, workspaceId),
    };
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

export async function disconnectMotionProvit(
  workspaceId?: string
): Promise<MotionProvitConfigPublic> {
  const cleared = clearMotionProvitConfig(workspaceId);
  return toPublicMotionProvitConfig(cleared, workspaceId);
}

async function ensureAuthenticatedOnPage(
  page: Page,
  context: BrowserContext,
  workspaceId?: string
): Promise<boolean> {
  const config = getInternalMotionProvitConfig(workspaceId);
  await restoreCookiesIfNeeded(context, workspaceId);
  await page.goto(`${config.baseUrl}/app/jobs`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(2200);

  if (!page.url().toLowerCase().includes('/login')) {
    await saveBrowserStorageState(context, workspaceId);
    return true;
  }

  // Auto-relogin using workspace saved credentials if available
  if (config.email && config.password) {
    const loginRes = await performMotionProvitLoginOnPage(
      page,
      config.email,
      config.password,
      config.baseUrl
    );
    if (loginRes.ok) {
      await saveBrowserStorageState(context, workspaceId);
      updateMotionProvitConfig(
        {
          connected: true,
          accountName: loginRes.name ?? config.accountName,
          accountEmail: loginRes.email ?? config.accountEmail ?? config.email,
          lastVerifiedAt: new Date().toISOString(),
        },
        workspaceId
      );
      if (!page.url().includes('/app/jobs')) {
        await page.goto(`${config.baseUrl}/app/jobs`, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await page.waitForTimeout(2000);
      }
      return true;
    }
  }

  updateMotionProvitConfig(
    { connected: false, lastVerifiedAt: new Date().toISOString() },
    workspaceId
  );
  return false;
}

export type MotionProvitSyncMode = 'incremental' | 'full';

export async function scrapeMotionProvitJobs(
  workspaceId?: string,
  options?: { mode?: MotionProvitSyncMode; bypassCooldown?: boolean }
): Promise<{
  jobs: MotionProvitJobSummary[];
  config: MotionProvitConfigPublic;
  syncMode: MotionProvitSyncMode;
  newFoundCount: number;
  pagesScanned: number;
}> {
  const current = getInternalMotionProvitConfig(workspaceId);
  const resolvedWsId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;

  const lastSyncMs = lastSyncTimestampByWorkspace.get(resolvedWsId) ?? 0;
  const elapsedMs = Date.now() - lastSyncMs;
  if (
    !options?.bypassCooldown &&
    current.cachedJobs.length > 0 &&
    elapsedMs < SYNC_COOLDOWN_MS
  ) {
    const waitSec = Math.max(1, Math.ceil((SYNC_COOLDOWN_MS - elapsedMs) / 1000));
    throw new Error(
      `Tunggu ${waitSec} detik lagi sebelum sinkron ulang agar aman dari rate-limit MotionProvit.`
    );
  }

  const syncMode: MotionProvitSyncMode =
    options?.mode === 'full' || current.cachedJobs.length === 0
      ? 'full'
      : 'incremental';

  const context = await getOrLaunchBrowserContext(undefined, workspaceId);
  const page = await context.newPage();

  const interceptedJobs: MotionProvitJobSummary[] = [];

  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('clipprovit.com')) return;
      const contentType = res.headers()['content-type'] ?? '';
      if (!contentType.includes('application/json')) return;
      if (url.includes('/api/sec/') || url.includes('/api/auth/')) return;
      const json = await res.json();
      const extracted = extractJobsFromUnknownJson(json, current.baseUrl);
      if (extracted.length > 0) {
        interceptedJobs.push(...extracted);
      }
    } catch {
      // ignore non-json responses
    }
  });

  try {
    const authed = await ensureAuthenticatedOnPage(page, context, workspaceId);
    if (!authed) {
      throw new Error(
        'Belum login ke MotionProvit. Silakan login terlebih dahulu dengan Email & Password atau Login via Browser.'
      );
    }

    const PER_PAGE = syncMode === 'incremental' ? 24 : 48;
    const MAX_PAGES = syncMode === 'incremental' ? 3 : 20;
    const existingIds = new Set(current.cachedJobs.map((j) => j.id));
    const freshOrderMap = new Map<string, MotionProvitJobSummary>();
    let totalRemoteCount = current.totalRemoteCount;
    let totalPages = 1;
    let pagesScanned = 0;
    let newFoundCount = 0;

    for (
      let currentPage = 1;
      currentPage <= Math.min(totalPages, MAX_PAGES);
      currentPage += 1
    ) {
      // Human-like polite pause between pages so pagination never looks like a bot burst
      if (currentPage > 1) {
        await randomJitter(2200, 4200);
      }

      const targetUrl = `${current.baseUrl}/app/jobs?hal=${currentPage}&per=${PER_PAGE}`;
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      await page
        .locator('article, a[href*="/app/jobs/"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {});
      await randomJitter(700, 1200);
      pagesScanned += 1;

      // Extract exact cards & pagination metadata from this page (100% inline, zero inner functions)
      const pageData = await page.evaluate((baseUrl) => {
        const nav = document.querySelector(
          'nav[aria-label="Halaman daftar render"]'
        );
        const navText = (nav?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const totalMatch = navText.match(/dari\s+(\d+)\s+render/i);
        const parsedTotal = totalMatch?.[1] ? Number(totalMatch[1]) : 0;

        let maxPageLink = 1;
        if (nav) {
          const pageLinks = Array.from(
            nav.querySelectorAll<HTMLAnchorElement>('a[href*="hal="]')
          );
          for (const a of pageLinks) {
            const m = (a.getAttribute('href') ?? '').match(/[?&]hal=(\d+)/);
            if (m?.[1]) {
              const n = Number(m[1]);
              if (n > maxPageLink) maxPageLink = n;
            }
          }
        }

        const items: Array<{
          id: string;
          shortId: string;
          title: string;
          style: string;
          statusText: string;
          aspectRatio: string;
          durationSec: number | null;
          createdAtText: string;
          thumbnailUrl: string | null;
          detailUrl: string;
          videoUrl: string | null;
          coverUrl: string | null;
        }> = [];
        const seenIds = new Set<string>();

        const articles = Array.from(document.querySelectorAll('article'));
        const cards: Element[] =
          articles.length > 0
            ? articles
            : Array.from(
                document.querySelectorAll<HTMLAnchorElement>(
                  'a[href*="/app/jobs/"]'
                )
              )
                .map((a) => a.closest('li') ?? a.parentElement ?? a)
                .filter(Boolean);

        for (const card of cards) {
          const detailLink =
            card.querySelector<HTMLAnchorElement>('a[href*="/app/jobs/"]') ??
            card.querySelector<HTMLAnchorElement>('a[href*="/api/jobs/"]');
          const href = detailLink?.getAttribute('href') ?? '';
          const idMatch =
            href.match(/\/app\/jobs\/([^/?#]+)/) ??
            href.match(/\/api\/jobs\/([^/?#]+)/);
          if (!idMatch?.[1]) continue;
          const jobId = decodeURIComponent(idMatch[1]).trim();
          if (!jobId || seenIds.has(jobId)) continue;
          seenIds.add(jobId);

          const rawText = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
          const uuidFirstPart = jobId.split('-')[0];
          const shortId =
            uuidFirstPart && uuidFirstPart.length >= 6
              ? uuidFirstPart.slice(0, 8).toLowerCase()
              : jobId.slice(0, 8).toLowerCase();

          // Exact title from <h2> inside <article>
          const h2Text = (
            card.querySelector('h2, h3, h1')?.textContent ?? ''
          ).trim();
          const title = h2Text || `Video #${shortId}`;

          // Status badge
          let statusText = 'Selesai';
          if (/\bgagal\b|\bfailed\b/i.test(rawText)) {
            statusText = 'Gagal';
          } else if (/\bdiproses\b|\bprocessing\b|\brendering\b/i.test(rawText)) {
            statusText = 'Diproses';
          } else if (/\bselesai\b|\bcompleted\b/i.test(rawText)) {
            statusText = 'Selesai';
          }

          // Dynamic style badge (first rounded-full badge pill before status badge)
          let style = 'MotionProvit';
          const pillSpans = Array.from(
            card.querySelectorAll<HTMLElement>(
              'span.rounded-full, span[class*="rounded-full"]'
            )
          );
          for (const pill of pillSpans) {
            const pText = (pill.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (!pText || pText.length > 48) continue;
            if (
              /^(?:selesai|diproses|gagal|completed|processing|failed)$/i.test(
                pText
              )
            ) {
              continue;
            }
            style = pText;
            break;
          }

          // Metadata line: "9:16 · 79 detik · 25 Nov 2026, 14.06"
          const ratioMatch = rawText.match(/\b(\d{1,2}:\d{1,2})\b/);
          const aspectRatio = ratioMatch?.[1] ?? '9:16';

          const durMatch = rawText.match(/(\d+)\s*(?:detik|sec|s\b)/i);
          const durationSec = durMatch?.[1] ? Number(durMatch[1]) : null;

          const dateMatch = rawText.match(
            /\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:,\s*\d{1,2}[.:]\d{2})?/
          );
          const createdAtText = dateMatch?.[0] ?? '';

          const img = card.querySelector<HTMLImageElement>('img');
          const imgSrc = img?.getAttribute('src') || img?.currentSrc || null;
          const thumbnailUrl = !imgSrc
            ? `${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/cover?thumb=1`
            : imgSrc.startsWith('http')
              ? imgSrc
              : imgSrc.startsWith('/')
                ? `${baseUrl}${imgSrc}`
                : null;

          const ratioTag = aspectRatio.replace(':', 'x');
          const downloadAnchor = card.querySelector<HTMLAnchorElement>(
            'a[href*="/download"]'
          );
          const dlHref = downloadAnchor?.getAttribute('href') ?? '';
          const videoUrl = dlHref
            ? dlHref.startsWith('http')
              ? dlHref
              : `${baseUrl}${dlHref}`
            : `${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/download?ratio=${ratioTag}`;

          const coverUrl = `${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/cover?ratio=${ratioTag}&art=1`;

          items.push({
            id: jobId,
            shortId,
            title,
            style,
            statusText,
            aspectRatio,
            durationSec,
            createdAtText,
            thumbnailUrl,
            detailUrl: `${baseUrl}/app/jobs/${encodeURIComponent(jobId)}`,
            videoUrl,
            coverUrl,
          });
        }

        return {
          parsedTotal,
          maxPageLink,
          items,
        };
      }, current.baseUrl);

      if (pageData.parsedTotal > 0) {
        totalRemoteCount = pageData.parsedTotal;
      }
      const computedPagesFromTotal =
        totalRemoteCount > 0 ? Math.ceil(totalRemoteCount / PER_PAGE) : 1;
      totalPages = Math.max(
        totalPages,
        pageData.maxPageLink,
        computedPagesFromTotal
      );

      let addedThisPage = 0;
      let hitExistingCachedItem = false;

      for (const domJob of pageData.items) {
        if (existingIds.has(domJob.id)) {
          hitExistingCachedItem = true;
        } else {
          newFoundCount += 1;
        }
        if (!freshOrderMap.has(domJob.id)) {
          addedThisPage += 1;
        }
        const statusInfo = normalizeJobStatus(domJob.statusText);
        freshOrderMap.set(domJob.id, {
          id: domJob.id,
          shortId: domJob.shortId,
          title: domJob.title,
          style: domJob.style,
          status: statusInfo.status,
          statusLabel: statusInfo.label,
          aspectRatio: domJob.aspectRatio,
          durationSec: domJob.durationSec,
          createdAtText: domJob.createdAtText,
          createdAtIso: null,
          thumbnailUrl: domJob.thumbnailUrl,
          detailUrl: domJob.detailUrl,
          videoUrl: domJob.videoUrl,
          coverUrl: domJob.coverUrl,
          captionPreview: null,
          alreadyImported: false,
          importedItemId: null,
          importedFolderCode: null,
        });
      }

      if (addedThisPage === 0) {
        break;
      }

      // Incremental mode stops immediately once we overlap existing cached items (typically 1 page load!)
      if (syncMode === 'incremental' && hitExistingCachedItem) {
        break;
      }
    }

    // Build final merged list: freshly scraped items first (newest), followed by remaining cached items in incremental mode
    const mergedMap = new Map<string, MotionProvitJobSummary>(freshOrderMap);
    if (syncMode === 'incremental') {
      for (const cachedJob of current.cachedJobs) {
        if (!mergedMap.has(cachedJob.id)) {
          mergedMap.set(cachedJob.id, cachedJob);
        }
      }
    }

    for (const jsonJob of interceptedJobs) {
      const existing = mergedMap.get(jsonJob.id);
      if (existing) {
        mergedMap.set(jsonJob.id, {
          ...existing,
          title:
            jsonJob.title && !jsonJob.title.startsWith('Video #')
              ? jsonJob.title
              : existing.title,
          style:
            jsonJob.style && jsonJob.style !== 'MotionProvit'
              ? jsonJob.style
              : existing.style,
          status:
            jsonJob.status !== 'unknown' ? jsonJob.status : existing.status,
          statusLabel:
            jsonJob.status !== 'unknown'
              ? jsonJob.statusLabel
              : existing.statusLabel,
          aspectRatio: jsonJob.aspectRatio || existing.aspectRatio,
          durationSec: jsonJob.durationSec ?? existing.durationSec,
          createdAtText: existing.createdAtText || jsonJob.createdAtText,
          createdAtIso: jsonJob.createdAtIso ?? existing.createdAtIso,
          thumbnailUrl: existing.thumbnailUrl || jsonJob.thumbnailUrl,
          videoUrl: jsonJob.videoUrl ?? existing.videoUrl,
          coverUrl: jsonJob.coverUrl ?? existing.coverUrl,
          captionPreview: jsonJob.captionPreview ?? existing.captionPreview,
        });
      } else {
        mergedMap.set(jsonJob.id, jsonJob);
      }
    }

    const session = await readNextAuthSessionFromPage(page, current.baseUrl);
    const mergedList = Array.from(mergedMap.values());
    const nowIso = new Date().toISOString();
    lastSyncTimestampByWorkspace.set(resolvedWsId, Date.now());

    const updatedConfig = updateMotionProvitConfig(
      {
        connected: true,
        accountName: session.name ?? current.accountName,
        accountEmail:
          session.email ?? current.accountEmail ?? (current.email || null),
        lastVerifiedAt: nowIso,
        lastSyncedAt: nowIso,
        totalRemoteCount: Math.max(totalRemoteCount, mergedList.length),
        cachedJobs: mergedList,
      },
      workspaceId
    );

    const enriched = enrichJobsWithWorkspaceStatus(mergedList, workspaceId);
    return {
      jobs: enriched,
      config: toPublicMotionProvitConfig(updatedConfig, workspaceId),
      syncMode,
      newFoundCount,
      pagesScanned,
    };
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}

interface CachedThumbEntry {
  buffer: Buffer;
  contentType: string;
  cachedAt: number;
}

const THUMB_CACHE_MAX = 200;
const THUMB_CACHE_TTL_MS = 30 * 60 * 1000;
const thumbCache = new Map<string, CachedThumbEntry>();
const thumbFetchQueue = new PQueue({ concurrency: 2 });
const inFlightThumbFetches = new Map<
  string,
  Promise<{ buffer: Buffer; contentType: string } | null>
>();

function getWorkspaceThumbCacheDir(workspaceId: string): string {
  const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
  return path.join(MOTIONPROVIT_THUMB_CACHE_ROOT, safeWs);
}

function resolveThumbDiskBaseName(targetUrl: string): string {
  const jobMatch = targetUrl.match(/\/api\/jobs\/([a-f0-9-]{8,64})\//i);
  if (jobMatch?.[1]) {
    return jobMatch[1].toLowerCase();
  }
  return createHash('sha1').update(targetUrl).digest('hex').slice(0, 16);
}

function extForImageContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  return '.jpg';
}

function contentTypeForExt(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === '.png') return 'image/png';
  if (lower === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function readThumbFromDisk(
  workspaceId: string,
  targetUrl: string
): { buffer: Buffer; contentType: string } | null {
  try {
    const dir = getWorkspaceThumbCacheDir(workspaceId);
    if (!fs.existsSync(dir)) return null;
    const baseName = resolveThumbDiskBaseName(targetUrl);
    for (const ext of ['.jpg', '.webp', '.png']) {
      const fullPath = path.join(dir, `${baseName}${ext}`);
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        if (buffer.length > 0) {
          return { buffer, contentType: contentTypeForExt(ext) };
        }
      }
    }
  } catch {
    // ignore disk cache read errors
  }
  return null;
}

function writeThumbToDisk(
  workspaceId: string,
  targetUrl: string,
  buffer: Buffer,
  contentType: string
): void {
  try {
    const dir = getWorkspaceThumbCacheDir(workspaceId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const baseName = resolveThumbDiskBaseName(targetUrl);
    const ext = extForImageContentType(contentType);
    fs.writeFileSync(path.join(dir, `${baseName}${ext}`), buffer);
  } catch {
    // non-fatal disk cache write error
  }
}

export function getMotionProvitCacheStats(
  workspaceId?: string
): MotionProvitCacheStats {
  const resolvedWsId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;
  const dir = getWorkspaceThumbCacheDir(resolvedWsId);
  let filesCount = 0;
  let totalBytes = 0;

  try {
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const stat = fs.statSync(path.join(dir, entry.name));
        filesCount += 1;
        totalBytes += stat.size;
      }
    }
  } catch {
    // ignore stat errors
  }

  return {
    filesCount,
    totalBytes,
    cacheDir: path.relative(APP_ROOT, dir).replace(/\\/g, '/'),
  };
}

export function clearMotionProvitThumbCache(
  workspaceId?: string
): MotionProvitCacheStats {
  const resolvedWsId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;
  const dir = getWorkspaceThumbCacheDir(resolvedWsId);

  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // ignore rm errors
  }

  const prefix = `${resolvedWsId}::`;
  for (const key of Array.from(thumbCache.keys())) {
    if (key.startsWith(prefix)) {
      thumbCache.delete(key);
    }
  }

  return getMotionProvitCacheStats(resolvedWsId);
}

function buildSavedMotionProvitCookieHeader(workspaceId?: string): string {
  try {
    const paths = getWorkspacePaths(workspaceId);
    if (!fs.existsSync(paths.motionprovitSessionFile)) return '';
    const raw = fs.readFileSync(paths.motionprovitSessionFile, 'utf-8');
    const parsed = JSON.parse(raw) as {
      cookies?: Array<{ name?: string; value?: string; expires?: number }>;
    };
    if (!Array.isArray(parsed.cookies) || parsed.cookies.length === 0) {
      return '';
    }
    const nowSec = Date.now() / 1000;
    return parsed.cookies
      .filter(
        (c) =>
          typeof c.name === 'string' &&
          typeof c.value === 'string' &&
          (!c.expires || c.expires <= 0 || c.expires > nowSec)
      )
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  } catch {
    return '';
  }
}

export async function fetchMotionProvitImageBuffer(
  targetUrl: string,
  workspaceId?: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!targetUrl || !targetUrl.startsWith('http')) return null;

  const resolvedWsId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;
  const cacheKey = `${resolvedWsId}::${targetUrl}`;

  // 1. RAM cache (instant 0ms)
  const cached = thumbCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < THUMB_CACHE_TTL_MS) {
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  // 2. Permanent Disk Cache in <project-root>/.cache/motionprovit-thumbs/<workspaceId>/
  const diskHit = readThumbFromDisk(resolvedWsId, targetUrl);
  if (diskHit) {
    if (thumbCache.size >= THUMB_CACHE_MAX) {
      const oldestKey = thumbCache.keys().next().value;
      if (oldestKey) thumbCache.delete(oldestKey);
    }
    thumbCache.set(cacheKey, {
      buffer: diskHit.buffer,
      contentType: diskHit.contentType,
      cachedAt: Date.now(),
    });
    return diskHit;
  }

  // 3. Deduplicate concurrent requests for the same URL + throttle via PQueue (max 2 concurrent + jitter)
  const existingInFlight = inFlightThumbFetches.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchPromise = thumbFetchQueue.add(async () => {
    try {
      await randomJitter(160, 380);
      const cookieHeader = buildSavedMotionProvitCookieHeader(resolvedWsId);
      const headers: Record<string, string> = {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: `${MOTIONPROVIT_BASE_URL}/app/jobs`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      };
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      const res = await fetch(targetUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return null;
      }

      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length === 0) return null;

      writeThumbToDisk(resolvedWsId, targetUrl, buffer, contentType);
      if (thumbCache.size >= THUMB_CACHE_MAX) {
        const oldestKey = thumbCache.keys().next().value;
        if (oldestKey) thumbCache.delete(oldestKey);
      }
      thumbCache.set(cacheKey, { buffer, contentType, cachedAt: Date.now() });

      return { buffer, contentType };
    } catch {
      return null;
    } finally {
      inFlightThumbFetches.delete(cacheKey);
    }
  });

  inFlightThumbFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

function allocateNextAvailableSlots(
  count: number,
  workspace: WorkspaceMetadata,
  db: PlannerDatabase,
  startDateIso?: string,
  startSlotCode?: string
): Array<{ monthFolder: string; dayOfMonth: number; slotCode: string; folderCode: string }> {
  const slotDefs =
    workspace.timeSlots && Object.keys(workspace.timeSlots).length > 0
      ? workspace.timeSlots
      : DEFAULT_TIME_SLOTS;
  const orderedSlotCodes = Object.keys(slotDefs).sort();
  if (orderedSlotCodes.length === 0) {
    orderedSlotCodes.push('01', '02');
  }

  const occupiedKeys = new Set<string>();
  for (const item of Object.values(db.items)) {
    const key = `${item.monthFolder.toLowerCase()}::${item.folderCode}`;
    occupiedKeys.add(key);
  }

  let cursorDate: Date;
  let initialSlotIndex = 0;

  if (startDateIso && /^\d{4}-\d{2}-\d{2}$/.test(startDateIso.trim())) {
    const [y, m, d] = startDateIso.trim().split('-').map(Number);
    cursorDate = new Date(y, m - 1, d);
    if (startSlotCode) {
      const idx = orderedSlotCodes.indexOf(startSlotCode.padStart(2, '0'));
      if (idx >= 0) initialSlotIndex = idx;
    }
  } else {
    const suggested = suggestNextAvailableSlot(db, workspace);
    const monthIdx = INDONESIAN_MONTHS.findIndex(
      (m) => m.toLowerCase() === suggested.monthFolder.toLowerCase()
    );
    cursorDate = new Date(
      workspace.defaultYear || new Date().getFullYear(),
      monthIdx >= 0 ? monthIdx : new Date().getMonth(),
      suggested.dayOfMonth
    );
    const idx = orderedSlotCodes.indexOf(suggested.slotCode);
    if (idx >= 0) initialSlotIndex = idx;
  }

  const results: Array<{
    monthFolder: string;
    dayOfMonth: number;
    slotCode: string;
    folderCode: string;
  }> = [];

  let slotIdx = initialSlotIndex;
  let safetyGuard = 0;

  while (results.length < count && safetyGuard < 1000) {
    safetyGuard += 1;
    const monthFolder = INDONESIAN_MONTHS[cursorDate.getMonth()] ?? 'November';
    const dayOfMonth = cursorDate.getDate();
    const slotCode = orderedSlotCodes[slotIdx] ?? '01';
    const folderCode = `${String(dayOfMonth).padStart(2, '0')}.${slotCode}`;
    const key = `${monthFolder.toLowerCase()}::${folderCode}`;

    if (!occupiedKeys.has(key)) {
      occupiedKeys.add(key);
      results.push({ monthFolder, dayOfMonth, slotCode, folderCode });
    }

    slotIdx += 1;
    if (slotIdx >= orderedSlotCodes.length) {
      slotIdx = 0;
      cursorDate = new Date(
        cursorDate.getFullYear(),
        cursorDate.getMonth(),
        cursorDate.getDate() + 1
      );
    }
  }

  return results;
}

function buildFallbackCaption(
  title: string,
  extractedCaption: string | null,
  workspace: WorkspaceMetadata
): string {
  if (extractedCaption && extractedCaption.trim().length >= 20) {
    return extractedCaption.trim();
  }

  const defaultHashtags =
    workspace.rules.defaultHashtags && workspace.rules.defaultHashtags.length > 0
      ? workspace.rules.defaultHashtags
          .map((t) => (t.startsWith('#') ? t : `#${t}`))
          .join(' ')
      : '#edukasi #sejarah';

  const cleanTitle = title.trim();
  const hook = cleanTitle.endsWith('?') ? cleanTitle : `${cleanTitle}?`;
  return `${hook}\n\nMenurut kamu bagaimana? Tulis di komentar.\n\n${defaultHashtags}`;
}

async function downloadFileFromUrl(
  context: BrowserContext,
  url: string,
  destPath: string
): Promise<boolean> {
  try {
    const res = await context.request.get(url, { timeout: 180_000 });
    if (!res.ok()) return false;
    const body = await res.body();
    if (!body || body.length < 256) return false;
    fs.writeFileSync(destPath, body);
    return true;
  } catch {
    return false;
  }
}

async function downloadViaButtonClick(
  page: Page,
  buttonLocator: ReturnType<Page['locator']>,
  destPath: string,
  timeoutMs = 120_000
): Promise<boolean> {
  try {
    if (!(await buttonLocator.isVisible({ timeout: 3000 }).catch(() => false))) {
      return false;
    }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: timeoutMs }),
      buttonLocator.click({ timeout: 8000 }),
    ]);
    await download.saveAs(destPath);
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 256;
  } catch {
    return false;
  }
}

export function getMotionProvitImportProgress(
  workspaceId?: string
): MotionProvitImportProgress | null {
  const wsId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;
  return importRunsByWorkspace.get(wsId) ?? null;
}

export function cancelMotionProvitImport(workspaceId?: string): boolean {
  const wsId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;
  const controller = activeImportControllers.get(wsId);
  if (!controller) return false;
  controller.abort();
  activeImportControllers.delete(wsId);
  const progress = importRunsByWorkspace.get(wsId);
  if (progress && progress.status === 'running') {
    progress.status = 'cancelled';
    progress.currentStep = 'Dibatalkan oleh pengguna.';
    progress.finishedAt = new Date().toISOString();
  }
  return true;
}

export async function startMotionProvitBatchImport(
  input: MotionProvitImportRequest,
  workspaceId: string | undefined,
  onPlannerUpdated?: (reason: string, db: PlannerDatabase, wsId: string) => void
): Promise<MotionProvitImportProgress> {
  const workspace = workspaceId
    ? getWorkspaceById(workspaceId) ?? getActiveWorkspace()
    : getActiveWorkspace();
  const wsId = workspace.id;

  const existingRun = importRunsByWorkspace.get(wsId);
  if (existingRun && existingRun.status === 'running') {
    throw new Error('Proses unduh MotionProvit lain sedang berjalan di workspace ini.');
  }

  const config = getInternalMotionProvitConfig(wsId);
  const jobMap = new Map(config.cachedJobs.map((j) => [j.id, j]));
  const selectedJobs: MotionProvitJobSummary[] = [];

  for (const jobId of input.jobIds) {
    const cached = jobMap.get(jobId);
    if (cached) {
      selectedJobs.push(cached);
    } else if (jobId.trim()) {
      const shortId = normalizeShortId(jobId);
      selectedJobs.push({
        id: jobId.trim(),
        shortId,
        title: `Video #${shortId}`,
        style: 'MotionProvit',
        status: 'completed',
        statusLabel: 'Selesai',
        aspectRatio: '9:16',
        durationSec: null,
        createdAtText: '',
        createdAtIso: null,
        thumbnailUrl: null,
        detailUrl: `${config.baseUrl}/app/jobs/${encodeURIComponent(jobId.trim())}`,
        videoUrl: null,
        coverUrl: null,
        captionPreview: null,
        alreadyImported: false,
        importedItemId: null,
        importedFolderCode: null,
      });
    }
  }

  if (selectedJobs.length === 0) {
    throw new Error('Pilih minimal satu video MotionProvit untuk diunduh.');
  }

  const paths = getWorkspacePaths(wsId);
  const currentDb = getOrInitDatabase(
    workspace.contentRootPath,
    workspace.defaultYear,
    paths.plannerFile,
    workspace
  );

  const allocations = allocateNextAvailableSlots(
    selectedJobs.length,
    workspace,
    currentDb,
    input.startDateIso,
    input.startSlotCode
  );

  const itemsProgress: MotionProvitImportItemResult[] = selectedJobs.map(
    (job, idx) => ({
      jobId: job.id,
      shortId: job.shortId,
      title: job.title,
      status: 'pending',
      itemId: null,
      folderCode: allocations[idx]?.folderCode ?? null,
      monthFolder: allocations[idx]?.monthFolder ?? null,
      downloadedFiles: [],
      error: null,
    })
  );

  const runProgress: MotionProvitImportProgress = {
    runId: `mp-${randomUUID().slice(0, 10)}`,
    workspaceId: wsId,
    status: 'running',
    total: selectedJobs.length,
    completedCount: 0,
    failedCount: 0,
    currentStep: 'Menyiapkan sesi MotionProvit...',
    progressPercent: 2,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    items: itemsProgress,
  };

  importRunsByWorkspace.set(wsId, runProgress);
  const controller = new AbortController();
  activeImportControllers.set(wsId, controller);

  // Execute batch import asynchronously so HTTP endpoint returns immediately and UI polls live progress
  void (async () => {
    let page: Page | null = null;
    try {
      const context = await getOrLaunchBrowserContext(undefined, wsId);
      page = await context.newPage();

      const authed = await ensureAuthenticatedOnPage(page, context, wsId);
      if (!authed) {
        throw new Error(
          'Sesi MotionProvit tidak aktif. Silakan login terlebih dahulu.'
        );
      }

      for (let i = 0; i < selectedJobs.length; i += 1) {
        if (controller.signal.aborted) {
          runProgress.status = 'cancelled';
          runProgress.currentStep = 'Dibatalkan oleh pengguna.';
          runProgress.finishedAt = new Date().toISOString();
          return;
        }

        // Human-paced pause between consecutive downloads to stay well below rate limits
        if (i > 0) {
          runProgress.currentStep = `(${i + 1}/${selectedJobs.length}) Menunggu jeda aman sebelum video berikutnya...`;
          await randomJitter(2800, 5200);
          if (controller.signal.aborted) {
            runProgress.status = 'cancelled';
            runProgress.currentStep = 'Dibatalkan oleh pengguna.';
            runProgress.finishedAt = new Date().toISOString();
            return;
          }
        }

        const job = selectedJobs[i];
        const slot = allocations[i];
        const itemState = itemsProgress[i];
        itemState.status = 'downloading';
        runProgress.currentStep = `(${i + 1}/${selectedJobs.length}) Membuka detail "${job.title}" (#${job.shortId})...`;
        runProgress.progressPercent = Math.max(
          5,
          Math.round((i / selectedJobs.length) * 100)
        );

        try {
          if (!slot) {
            throw new Error('Tidak ada slot tanggal kosong yang tersedia.');
          }

          // Collect detail JSON payloads while opening /app/jobs/{id}
          const detailPayloads: unknown[] = [];
          const onResp = async (res: import('patchright').Response) => {
            try {
              const u = res.url();
              if (!u.includes('clipprovit.com')) return;
              const ct = res.headers()['content-type'] ?? '';
              if (!ct.includes('application/json')) return;
              if (u.includes('/api/sec/') || u.includes('/api/auth/')) return;
              detailPayloads.push(await res.json());
            } catch {
              // ignore
            }
          };
          page.on('response', onResp);

          try {
            await page.goto(job.detailUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 60_000,
            });
            await page.waitForTimeout(2500);
          } finally {
            page.off('response', onResp);
          }

          if (page.url().toLowerCase().includes('/login')) {
            throw new Error('Sesi login MotionProvit kedaluwarsa di tengah proses.');
          }

          // Inspect DOM of /app/jobs/{id} (inline only, no inner helper functions!)
          const domDetail = await page.evaluate((baseUrl) => {
            const videoEl = document.querySelector<HTMLVideoElement>('video');
            const sourceEl = document.querySelector<HTMLSourceElement>('video source');
            const rawVideoSrc =
              videoEl?.currentSrc ||
              videoEl?.getAttribute('src') ||
              sourceEl?.getAttribute('src') ||
              null;

            const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map(
              (a) => ({
                href: a.getAttribute('href') ?? '',
                text: (a.textContent ?? '').trim(),
                download: a.hasAttribute('download'),
              })
            );

            let videoHref: string | null = rawVideoSrc;
            let coverHref: string | null = null;
            let thumbHref: string | null = null;

            for (const a of anchors) {
              const hrefLower = a.href.toLowerCase();
              const textLower = a.text.toLowerCase();
              if (
                !videoHref &&
                (hrefLower.includes('.mp4') ||
                  hrefLower.includes('download') ||
                  /unduh\s*\d+:\d+/i.test(a.text))
              ) {
                videoHref = a.href;
              }
              if (
                !coverHref &&
                (hrefLower.includes('cover') || textLower.includes('unduh jpg'))
              ) {
                coverHref = a.href;
              }
              if (
                !thumbHref &&
                (hrefLower.includes('thumb') ||
                  hrefLower.endsWith('.jpg') ||
                  hrefLower.endsWith('.jpeg'))
              ) {
                thumbHref = a.href;
              }
            }

            // Look for cover preview <img> inside Cover section
            const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
            for (const img of imgs) {
              const src = img.currentSrc || img.getAttribute('src') || '';
              if (!src) continue;
              if (!coverHref && src.toLowerCase().includes('cover')) {
                coverHref = src;
              } else if (!thumbHref && (src.includes('.jpg') || src.includes('.png') || src.includes('thumb'))) {
                thumbHref = src;
              }
            }

            // Try to extract caption / hook / hashtags if displayed on detail page
            let captionText: string | null = null;
            const captionCandidates = Array.from(
              document.querySelectorAll('textarea, pre, [data-caption], [class*="caption" i]')
            );
            for (const el of captionCandidates) {
              const val =
                el instanceof HTMLTextAreaElement
                  ? el.value.trim()
                  : (el.textContent ?? '').trim();
              if (val.length >= 20 && val.length <= 2200) {
                captionText = val;
                break;
              }
            }

            const titleEl = document.querySelector('h1');
            const headingTitle = (titleEl?.textContent ?? '').trim();

            const normalizedVideoUrl = !videoHref
              ? null
              : videoHref.startsWith('http://') || videoHref.startsWith('https://')
                ? videoHref
                : videoHref.startsWith('//')
                  ? `https:${videoHref}`
                  : videoHref.startsWith('/')
                    ? `${baseUrl}${videoHref}`
                    : null;

            const normalizedCoverUrl = !coverHref
              ? null
              : coverHref.startsWith('http://') || coverHref.startsWith('https://')
                ? coverHref
                : coverHref.startsWith('//')
                  ? `https:${coverHref}`
                  : coverHref.startsWith('/')
                    ? `${baseUrl}${coverHref}`
                    : null;

            const normalizedThumbUrl = !thumbHref
              ? null
              : thumbHref.startsWith('http://') || thumbHref.startsWith('https://')
                ? thumbHref
                : thumbHref.startsWith('//')
                  ? `https:${thumbHref}`
                  : thumbHref.startsWith('/')
                    ? `${baseUrl}${thumbHref}`
                    : null;

            return {
              headingTitle,
              videoUrl: normalizedVideoUrl,
              coverUrl: normalizedCoverUrl,
              thumbUrl: normalizedThumbUrl,
              captionText,
            };
          }, config.baseUrl);

          // Also scan intercepted detail JSON payloads for videoUrl / coverUrl / caption
          let jsonVideoUrl: string | null = null;
          let jsonCoverUrl: string | null = null;
          let jsonCaption: string | null = null;
          for (const payload of detailPayloads) {
            if (!payload || typeof payload !== 'object') continue;
            const str = JSON.stringify(payload);
            const rec = payload as Record<string, unknown>;
            const inner =
              (rec.job && typeof rec.job === 'object'
                ? (rec.job as Record<string, unknown>)
                : rec.data && typeof rec.data === 'object'
                  ? (rec.data as Record<string, unknown>)
                  : rec);

            const cap =
              (typeof inner.caption === 'string' && inner.caption.trim()) ||
              (typeof inner.socialCaption === 'string' && inner.socialCaption.trim()) ||
              (typeof inner.description === 'string' && inner.description.trim()) ||
              null;
            if (cap && !jsonCaption) jsonCaption = cap;

            const vid =
              (typeof inner.videoUrl === 'string' && inner.videoUrl) ||
              (typeof inner.video_url === 'string' && inner.video_url) ||
              (typeof inner.outputUrl === 'string' && inner.outputUrl) ||
              null;
            if (vid && !jsonVideoUrl) {
              jsonVideoUrl = resolveAbsoluteUrl(vid, config.baseUrl);
            }

            const cov =
              (typeof inner.coverUrl === 'string' && inner.coverUrl) ||
              (typeof inner.cover_url === 'string' && inner.cover_url) ||
              null;
            if (cov && !jsonCoverUrl) {
              jsonCoverUrl = resolveAbsoluteUrl(cov, config.baseUrl);
            }

            // Fallback regex for signed mp4/jpg URLs inside JSON payload
            if (!jsonVideoUrl) {
              const mp4Match = str.match(/https?:\/\/[^"\\]+\.mp4(?:[^"\\]*)?/i);
              if (mp4Match?.[0]) jsonVideoUrl = mp4Match[0];
            }
            if (!jsonCoverUrl) {
              const covMatch = str.match(/https?:\/\/[^"\\]*cover[^"\\]*\.(?:jpg|jpeg|png)(?:[^"\\]*)?/i);
              if (covMatch?.[0]) jsonCoverUrl = covMatch[0];
            }
          }

          const aspectFileTag = normalizeAspectForFile(job.aspectRatio);
          const finalTitle = domDetail.headingTitle || job.title;

          // Fetch official MotionProvit caption.txt directly from /api/jobs/{id}/kit?download=caption&opener=1
          let officialKitCaption: string | null = null;
          if (input.assets.caption) {
            try {
              const kitRes = await context.request.get(
                `${config.baseUrl}/api/jobs/${encodeURIComponent(job.id)}/kit?download=caption&opener=1`,
                {
                  headers: { Referer: job.detailUrl },
                  timeout: 20_000,
                }
              );
              if (kitRes.ok()) {
                const rawKit = (await kitRes.text()).trim();
                if (rawKit.length >= 10) {
                  officialKitCaption = rawKit;
                }
              }
            } catch {
              // fallback to DOM/template caption below
            }
          }

          const finalCaption = buildFallbackCaption(
            finalTitle,
            officialKitCaption ??
              jsonCaption ??
              domDetail.captionText ??
              job.captionPreview,
            workspace
          );

          // Create target slot folder on disk (assign/buat tanggal yang belum ada!)
          const created = createContentFolderOnDisk(workspace, {
            monthFolder: slot.monthFolder,
            dayOfMonth: slot.dayOfMonth,
            slotCode: slot.slotCode,
            rawCaptionText: input.assets.caption ? finalCaption : '',
          });

          const downloadedFiles: string[] = [];
          if (input.assets.caption && fs.existsSync(created.captionPath)) {
            downloadedFiles.push(path.basename(created.captionPath));
          } else if (!input.assets.caption && fs.existsSync(created.captionPath)) {
            // Remove auto-created empty caption if user opted out of caption
            fs.unlinkSync(created.captionPath);
          }

          // 1. Download Video MP4 -> motionprovit-{shortId}.mp4
          if (input.assets.video) {
            runProgress.currentStep = `(${i + 1}/${selectedJobs.length}) Mengunduh video "${finalTitle}" ke ${slot.folderCode}...`;
            const videoFileName = `motionprovit-${job.shortId}.mp4`;
            const videoDest = path.join(created.folderPath, videoFileName);

            let videoSaved = false;
            // Priority A: Click the yellow "Unduh 9:16" / download anchor to capture native browser download
            const videoDownloadBtn = page
              .locator('a[href*="/download"]')
              .filter({ hasText: /^Unduh/i })
              .first();
            videoSaved = await downloadViaButtonClick(
              page,
              videoDownloadBtn,
              videoDest,
              180_000
            );

            // Priority B: Direct authenticated GET with Referer header
            if (!videoSaved) {
              const candidateVideoUrl =
                domDetail.videoUrl ??
                jsonVideoUrl ??
                job.videoUrl ??
                `${config.baseUrl}/api/jobs/${encodeURIComponent(job.id)}/download?ratio=${aspectFileTag}`;
              try {
                const res = await context.request.get(candidateVideoUrl, {
                  headers: { Referer: job.detailUrl },
                  timeout: 180_000,
                });
                if (res.ok()) {
                  const buf = await res.body();
                  if (buf && buf.length > 1024) {
                    fs.writeFileSync(videoDest, buf);
                    videoSaved = true;
                  }
                }
              } catch {
                videoSaved = false;
              }
            }

            if (videoSaved) {
              downloadedFiles.push(videoFileName);
            } else {
              throw new Error(
                `Gagal mengunduh file MP4 untuk "${finalTitle}" (#${job.shortId}).`
              );
            }
          }

          // 2. Download Cover 9:16 JPG -> cover-{shortId}-9x16.jpg
          if (input.assets.cover) {
            runProgress.currentStep = `(${i + 1}/${selectedJobs.length}) Mengunduh cover "${finalTitle}" ke ${slot.folderCode}...`;
            const coverFileName = `cover-${job.shortId}-${aspectFileTag}.jpg`;
            const coverDest = path.join(created.folderPath, coverFileName);

            let coverSaved = false;
            // Priority A: Official artwork Cover JPG endpoint (/cover?ratio=9x16&art=1)
            const officialArtCoverUrl = `${config.baseUrl}/api/jobs/${encodeURIComponent(job.id)}/cover?ratio=${aspectFileTag}&art=1`;
            coverSaved = await downloadFileFromUrl(
              context,
              officialArtCoverUrl,
              coverDest
            );

            // Priority B: Click "Unduh JPG" inside Cover card
            if (!coverSaved) {
              const coverDownloadBtn = page
                .locator('a, button, [role="button"]')
                .filter({ hasText: /^Unduh\s*JPG$/i })
                .first();
              coverSaved = await downloadViaButtonClick(
                page,
                coverDownloadBtn,
                coverDest,
                45_000
              );
            }

            // Priority C: Fallback to Thumbnail JPG endpoint (/cover?ratio=9x16&format=jpg)
            if (!coverSaved) {
              const thumbFallbackUrl = `${config.baseUrl}/api/jobs/${encodeURIComponent(job.id)}/cover?ratio=${aspectFileTag}&format=jpg`;
              coverSaved = await downloadFileFromUrl(
                context,
                thumbFallbackUrl,
                coverDest
              );
            }

            // Priority D: Direct fetch from scraped cover/thumbnail URL
            if (!coverSaved) {
              const candidateCoverUrl =
                jsonCoverUrl ??
                domDetail.coverUrl ??
                job.coverUrl ??
                domDetail.thumbUrl ??
                job.thumbnailUrl;
              if (candidateCoverUrl) {
                coverSaved = await downloadFileFromUrl(
                  context,
                  candidateCoverUrl,
                  coverDest
                );
              }
            }

            if (coverSaved) {
              downloadedFiles.push(coverFileName);
            }
          }

          // Sync planner DB right after each downloaded item so UI updates live!
          const updatedDb = syncDatabaseWithDisk(
            workspace.contentRootPath,
            workspace.defaultYear,
            paths.plannerFile,
            workspace
          );
          onPlannerUpdated?.(
            `motionprovit-imported:${created.itemId}`,
            updatedDb,
            wsId
          );

          itemState.status = 'completed';
          itemState.itemId = created.itemId;
          itemState.downloadedFiles = downloadedFiles;
          runProgress.completedCount += 1;
        } catch (itemErr) {
          itemState.status = 'failed';
          itemState.error =
            itemErr instanceof Error ? itemErr.message : String(itemErr);
          runProgress.failedCount += 1;
        }

        runProgress.progressPercent = Math.min(
          99,
          Math.round(((i + 1) / selectedJobs.length) * 100)
        );
      }

      runProgress.status =
        runProgress.failedCount > 0 && runProgress.completedCount === 0
          ? 'failed'
          : 'completed';
      runProgress.progressPercent = 100;
      runProgress.currentStep = `Selesai: ${runProgress.completedCount} diunduh${runProgress.failedCount > 0 ? `, ${runProgress.failedCount} gagal` : ''}.`;
      runProgress.finishedAt = new Date().toISOString();
    } catch (fatalErr) {
      runProgress.status = 'failed';
      runProgress.currentStep =
        fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
      runProgress.finishedAt = new Date().toISOString();
    } finally {
      activeImportControllers.delete(wsId);
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  })();

  return runProgress;
}

export { MOTIONPROVIT_JOBS_URL, MOTIONPROVIT_LOGIN_URL };
