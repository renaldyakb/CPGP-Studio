import fs from 'node:fs';
import path from 'node:path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'patchright';
import type { AutoPostBrowserSessionStatus } from '../../src/types/autopost.ts';
import type { PlatformKey } from '../../src/types/planner.ts';
import { ALL_PLATFORM_KEYS } from '../storage.ts';
import {
  detectAutoPostCapabilities,
  getInternalAutoPostConfig,
  invalidateAutoPostCapabilitiesCache,
} from './config.ts';

export const PLATFORM_STUDIO_URLS: Record<PlatformKey, string> = {
  yt_shorts: 'https://studio.youtube.com',
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload?lang=en',
  ig_reels: 'https://business.facebook.com/latest/composer/',
  fb_reels: 'https://business.facebook.com/latest/composer/',
};

export type PlatformSessionState = 'logged_in' | 'logged_out' | 'unknown';

export interface PlatformSessionCheckResult {
  platform: PlatformKey;
  state: PlatformSessionState;
  detail: string;
  checkedAt: string;
}

export type BrowserSessionListener = (
  status: AutoPostBrowserSessionStatus
) => void;

const STATUS_EMIT_DEBOUNCE_MS = 150;

let activeContext: BrowserContext | null = null;
let activeCdpBrowser: Browser | null = null;
let activeCdpUrl: string | null = null;
let activeChannel: 'chrome' | 'msedge' | null = null;
let activeProfileDir: string | null = null;
let launchInFlight: Promise<BrowserContext> | null = null;
let launchInFlightTargetKey: string | null = null;
let statusEmitTimer: ReturnType<typeof setTimeout> | null = null;
const sessionListeners = new Set<BrowserSessionListener>();

function normalizeProfilePath(dir: string): string {
  const resolved = path.resolve(dir);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSameProfileDir(a: string | null, b: string): boolean {
  if (!a) return false;
  return normalizeProfilePath(a) === normalizeProfilePath(b);
}

function resolveCdpUrl(raw?: string): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function clearStatusEmitTimer(): void {
  if (statusEmitTimer) {
    clearTimeout(statusEmitTimer);
    statusEmitTimer = null;
  }
}

function resetActiveSessionState(): void {
  activeContext = null;
  activeCdpBrowser = null;
  activeCdpUrl = null;
  activeChannel = null;
  activeProfileDir = null;
}

function isContextAlive(context: BrowserContext | null): boolean {
  if (!context) return false;
  try {
    const pages = context.pages();
    // If the underlying browser was closed, pages() throws or browser()?.isConnected() is false
    const browser = activeCdpBrowser ?? context.browser();
    if (browser && !browser.isConnected()) {
      return false;
    }
    return Array.isArray(pages);
  } catch {
    return false;
  }
}

export interface BrowserSessionStatusDetail
  extends AutoPostBrowserSessionStatus {
  isCdp: boolean;
  activeProfileDir: string | null;
  profileDir: string;
}

export function getActiveBrowserProfileDir(): string | null {
  if (!isContextAlive(activeContext)) {
    return null;
  }
  if (activeCdpBrowser || activeCdpUrl) {
    return null;
  }
  return activeProfileDir;
}

export function getBrowserSessionStatus(): BrowserSessionStatusDetail {
  if (!isContextAlive(activeContext)) {
    resetActiveSessionState();
    return {
      isOpen: false,
      channel: null,
      openTabsCount: 0,
      isCdp: false,
      activeProfileDir: null,
      profileDir: '',
    };
  }

  let openTabsCount = 0;
  try {
    openTabsCount = activeContext!.pages().filter((p) => !p.isClosed()).length;
  } catch {
    openTabsCount = 0;
  }

  const underlyingBrowser = activeCdpBrowser ?? activeContext?.browser();
  if (openTabsCount === 0 && underlyingBrowser?.isConnected() === false) {
    resetActiveSessionState();
    return {
      isOpen: false,
      channel: null,
      openTabsCount: 0,
      isCdp: false,
      activeProfileDir: null,
      profileDir: '',
    };
  }

  const isCdpSession = Boolean(activeCdpBrowser || activeCdpUrl);
  return {
    isOpen: true,
    channel: activeChannel,
    openTabsCount,
    isCdp: isCdpSession,
    activeProfileDir: isCdpSession ? null : activeProfileDir,
    profileDir: isCdpSession ? '' : (activeProfileDir ?? ''),
  };
}

function emitBrowserSessionStatus(): void {
  const snapshot = getBrowserSessionStatus();
  for (const listener of sessionListeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore subscriber errors
    }
  }
}

function scheduleDebouncedStatusEmit(
  context: BrowserContext,
  isCdpMode: boolean
): void {
  clearStatusEmitTimer();
  statusEmitTimer = setTimeout(() => {
    statusEmitTimer = null;
    if (activeContext === context) {
      const alive = isContextAlive(context);
      const remaining = alive
        ? context.pages().filter((p) => !p.isClosed()).length
        : 0;
      if (!alive || (!isCdpMode && remaining === 0)) {
        resetActiveSessionState();
        invalidateAutoPostCapabilitiesCache();
      }
      emitBrowserSessionStatus();
    }
  }, STATUS_EMIT_DEBOUNCE_MS);
}

export function subscribeBrowserSession(
  listener: BrowserSessionListener
): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function resolveBrowserChannel(
  requested?: 'chrome' | 'msedge',
  workspaceId?: string
): 'chrome' | 'msedge' {
  const capabilities = detectAutoPostCapabilities(workspaceId);
  const config = getInternalAutoPostConfig(workspaceId);
  const candidate = requested ?? config.browser.channel;

  if (candidate === 'chrome' && capabilities.chromeAvailable) {
    return 'chrome';
  }
  if (candidate === 'msedge' && capabilities.edgeAvailable) {
    return 'msedge';
  }
  if (capabilities.preferredChannel) {
    return capabilities.preferredChannel;
  }
  return candidate;
}

export async function getOrLaunchBrowserContext(
  channel?: 'chrome' | 'msedge',
  workspaceId?: string
): Promise<BrowserContext> {
  const config = getInternalAutoPostConfig(workspaceId);
  const cdpUrl = resolveCdpUrl(config.browser.cdpUrl);
  const profileDir = path.resolve(config.browser.profileDir);
  const resolvedChannel = resolveBrowserChannel(channel, workspaceId);
  const targetKey = cdpUrl
    ? `cdp:${cdpUrl}`
    : `profile:${resolvedChannel}:${normalizeProfilePath(profileDir)}`;

  if (isContextAlive(activeContext)) {
    const matchesTarget = cdpUrl
      ? activeCdpUrl === cdpUrl
      : !activeCdpUrl &&
        (!channel || activeChannel === resolvedChannel) &&
        isSameProfileDir(activeProfileDir, profileDir);
    if (matchesTarget) {
      return activeContext as BrowserContext;
    }
    await closeBrowserSession();
  } else if (activeContext !== null || activeCdpBrowser !== null) {
    resetActiveSessionState();
    invalidateAutoPostCapabilitiesCache();
    emitBrowserSessionStatus();
  }

  if (launchInFlight) {
    if (launchInFlightTargetKey === targetKey) {
      return launchInFlight;
    }
    try {
      await launchInFlight;
    } catch {
      // Previous launch failed; proceed with new launch
    }
    if (isContextAlive(activeContext)) {
      const matchesAfterWait = cdpUrl
        ? activeCdpUrl === cdpUrl
        : !activeCdpUrl &&
          (!channel || activeChannel === resolvedChannel) &&
          isSameProfileDir(activeProfileDir, profileDir);
      if (matchesAfterWait) {
        return activeContext as BrowserContext;
      }
      await closeBrowserSession();
    }
  }

  if (!cdpUrl && !fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  launchInFlightTargetKey = targetKey;
  launchInFlight = (async () => {
    try {
      let context: BrowserContext;
      let cdpBrowser: Browser | null = null;
      const isCdpMode = Boolean(cdpUrl);

      if (cdpUrl) {
        cdpBrowser = await chromium.connectOverCDP(cdpUrl);
        const existingContexts = cdpBrowser.contexts();
        context = existingContexts[0] ?? (await cdpBrowser.newContext());
      } else {
        context = await chromium.launchPersistentContext(profileDir, {
          channel: resolvedChannel,
          headless: false,
          viewport: null,
          ignoreDefaultArgs: ['--enable-automation'],
          args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
          ],
        });
      }

      activeContext = context;
      activeCdpBrowser = cdpBrowser;
      activeCdpUrl = cdpUrl || null;
      activeChannel = resolvedChannel;
      activeProfileDir = isCdpMode ? null : profileDir;

      const handleContextClosed = () => {
        if (activeContext === context) {
          clearStatusEmitTimer();
          resetActiveSessionState();
          invalidateAutoPostCapabilitiesCache();
          emitBrowserSessionStatus();
        }
      };

      const attachPageCloseListener = (page: Page) => {
        page.on('close', () => {
          scheduleDebouncedStatusEmit(context, isCdpMode);
        });
      };

      context.on('close', handleContextClosed);
      if (cdpBrowser) {
        cdpBrowser.on('disconnected', handleContextClosed);
      } else {
        context.browser()?.on('disconnected', handleContextClosed);
      }

      for (const existingPage of context.pages()) {
        attachPageCloseListener(existingPage);
      }
      context.on('page', (newPage) => {
        attachPageCloseListener(newPage);
        emitBrowserSessionStatus();
      });

      invalidateAutoPostCapabilitiesCache();
      emitBrowserSessionStatus();
      return context;
    } catch (error) {
      resetActiveSessionState();
      invalidateAutoPostCapabilitiesCache();
      emitBrowserSessionStatus();
      const details = error instanceof Error ? error.message : String(error);
      if (cdpUrl) {
        throw new Error(
          `Gagal menyambung ke Chrome melalui CDP (${cdpUrl}): ${details}`
        );
      }
      throw new Error(
        `Gagal membuka browser lokal (${resolvedChannel}) dengan profil persisten: ${details}`
      );
    } finally {
      launchInFlight = null;
      launchInFlightTargetKey = null;
    }
  })();

  return launchInFlight;
}

export async function openLoginProfile(
  platforms?: PlatformKey[]
): Promise<{
  openedUrls: string[];
  channel: string;
  profileDir: string;
  browserSession: AutoPostBrowserSessionStatus;
}> {
  const targetPlatforms =
    Array.isArray(platforms) && platforms.length > 0
      ? platforms.filter((p) => ALL_PLATFORM_KEYS.includes(p))
      : ALL_PLATFORM_KEYS;

  const finalPlatforms =
    targetPlatforms.length > 0 ? targetPlatforms : ALL_PLATFORM_KEYS;

  const config = getInternalAutoPostConfig();
  const resolvedChannel = resolveBrowserChannel(config.browser.channel);
  const context = await getOrLaunchBrowserContext(resolvedChannel);

  const existingPages = context.pages();
  let reusableBlankPage: Page | null =
    existingPages.find((page) => {
      const url = page.url();
      return (
        url === 'about:blank' ||
        url === '' ||
        url.startsWith('chrome://newtab')
      );
    }) ?? null;

  const openedUrls: string[] = [];
  const visitedUrls = new Set<string>();

  for (const platform of finalPlatforms) {
    // Stop opening additional tabs immediately if user already closed the browser window
    if (!isContextAlive(context) || activeContext !== context) {
      break;
    }

    const targetUrl = PLATFORM_STUDIO_URLS[platform];
    if (visitedUrls.has(targetUrl)) {
      continue;
    }
    visitedUrls.add(targetUrl);

    let page: Page;

    try {
      if (reusableBlankPage && !reusableBlankPage.isClosed()) {
        page = reusableBlankPage;
        reusableBlankPage = null;
      } else {
        page = await context.newPage();
      }

      openedUrls.push(targetUrl);
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    } catch {
      if (!isContextAlive(context) || activeContext !== context) {
        break;
      }
      // Keep tab open even if site takes longer or triggers auth redirect
    }
  }

  emitBrowserSessionStatus();

  return {
    openedUrls,
    channel: activeChannel ?? resolvedChannel,
    profileDir:
      activeCdpBrowser || activeCdpUrl
        ? ''
        : (activeProfileDir ?? config.browser.profileDir),
    browserSession: getBrowserSessionStatus(),
  };
}

export async function checkPlatformLoginSessions(
  platforms?: PlatformKey[]
): Promise<Record<PlatformKey, PlatformSessionCheckResult>> {
  const requestedPlatforms =
    Array.isArray(platforms) && platforms.length > 0
      ? platforms.filter((p) => ALL_PLATFORM_KEYS.includes(p))
      : ALL_PLATFORM_KEYS;

  const targetPlatforms =
    requestedPlatforms.length > 0 ? requestedPlatforms : ALL_PLATFORM_KEYS;

  const nowIso = new Date().toISOString();
  const results: Record<PlatformKey, PlatformSessionCheckResult> = {
    yt_shorts: {
      platform: 'yt_shorts',
      state: 'unknown',
      detail: 'Belum diperiksa.',
      checkedAt: nowIso,
    },
    tiktok: {
      platform: 'tiktok',
      state: 'unknown',
      detail: 'Belum diperiksa.',
      checkedAt: nowIso,
    },
    ig_reels: {
      platform: 'ig_reels',
      state: 'unknown',
      detail: 'Belum diperiksa.',
      checkedAt: nowIso,
    },
    fb_reels: {
      platform: 'fb_reels',
      state: 'unknown',
      detail: 'Belum diperiksa.',
      checkedAt: nowIso,
    },
  };

  const context = await getOrLaunchBrowserContext();
  const checkPage = await context.newPage();

  try {
    let metaBusinessResult: Omit<PlatformSessionCheckResult, 'platform'> | null =
      null;

    for (const platform of targetPlatforms) {
      if (!isContextAlive(context) || checkPage.isClosed()) {
        results[platform] = {
          platform,
          state: 'unknown',
          detail: 'Sesi browser ditutup saat pemeriksaan berlangsung.',
          checkedAt: new Date().toISOString(),
        };
        continue;
      }

      if (platform === 'fb_reels' || platform === 'ig_reels') {
        if (!metaBusinessResult) {
          const checked = await checkSinglePlatformSession(checkPage, platform);
          metaBusinessResult = {
            state: checked.state,
            detail: checked.detail,
            checkedAt: checked.checkedAt,
          };
        }
        results[platform] = {
          platform,
          ...metaBusinessResult,
        };
        continue;
      }

      results[platform] = await checkSinglePlatformSession(checkPage, platform);
    }
  } finally {
    if (!checkPage.isClosed()) {
      await checkPage.close().catch(() => {});
    }
    emitBrowserSessionStatus();
  }

  return results;
}

async function checkSinglePlatformSession(
  page: Page,
  platform: PlatformKey
): Promise<PlatformSessionCheckResult> {
  const checkedAt = () => new Date().toISOString();

  try {
    if (platform === 'yt_shorts') {
      await page.goto(PLATFORM_STUDIO_URLS.yt_shorts, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(2500);
      const url = page.url().toLowerCase();
      if (url.includes('accounts.google.com') || url.includes('/signin')) {
        return {
          platform,
          state: 'logged_out',
          detail: 'Belum login Google / YouTube Studio.',
          checkedAt: checkedAt(),
        };
      }
      if (url.includes('/channel/')) {
        return {
          platform,
          state: 'logged_in',
          detail: 'Sesi YouTube Studio aktif.',
          checkedAt: checkedAt(),
        };
      }
      return {
        platform,
        state: 'unknown',
        detail: `Status sesi YouTube Studio belum terkonfirmasi (${page.url()}).`,
        checkedAt: checkedAt(),
      };
    }

    if (platform === 'tiktok') {
      await page.goto(PLATFORM_STUDIO_URLS.tiktok, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(2500);
      const url = page.url().toLowerCase();
      if (url.includes('/login')) {
        return {
          platform,
          state: 'logged_out',
          detail: 'Belum login TikTok Studio.',
          checkedAt: checkedAt(),
        };
      }
      const uploadIndicator = page
        .locator(
          'iframe[data-tt="Upload_index_iframe"], div.upload-container, div.public-DraftEditor-content, button:has-text("Select video")'
        )
        .first();
      let indicatorFound = (await uploadIndicator.count()) > 0;
      if (!indicatorFound) {
        await uploadIndicator
          .waitFor({ state: 'attached', timeout: 3000 })
          .then(() => {
            indicatorFound = true;
          })
          .catch(() => {});
      }
      if (indicatorFound) {
        return {
          platform,
          state: 'logged_in',
          detail: 'Sesi TikTok Studio aktif.',
          checkedAt: checkedAt(),
        };
      }
      return {
        platform,
        state: 'unknown',
        detail: 'Halaman TikTok Studio terbuka, tetapi indikator upload belum muncul.',
        checkedAt: checkedAt(),
      };
    }

    // fb_reels & ig_reels both run through Meta Business Suite
    await page.goto(PLATFORM_STUDIO_URLS.fb_reels, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const url = page.url().toLowerCase();
    const emailVisible = await page
      .locator('input[name="email"]')
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (
      url.includes('/login') ||
      url.includes('checkpoint') ||
      url.includes('two_step_verification') ||
      emailVisible
    ) {
      return {
        platform,
        state: 'logged_out',
        detail: 'Belum login Meta Business Suite (Facebook & Instagram).',
        checkedAt: checkedAt(),
      };
    }

    const homeVisible = await page
      .locator('a[href*="/latest/home"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const composerVisible = homeVisible
      ? true
      : await page
          .locator('[data-surface*="bizweb_create_post"]')
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false);

    if (homeVisible || composerVisible) {
      return {
        platform,
        state: 'logged_in',
        detail: 'Sesi Meta Business Suite aktif (Facebook & Instagram).',
        checkedAt: checkedAt(),
      };
    }

    return {
      platform,
      state: 'unknown',
      detail: 'Halaman Meta Business Suite terbuka, tetapi status login belum terkonfirmasi.',
      checkedAt: checkedAt(),
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return {
      platform,
      state: 'unknown',
      detail: `Gagal memeriksa sesi (${details}).`,
      checkedAt: checkedAt(),
    };
  }
}

export async function closeBrowserSession(): Promise<AutoPostBrowserSessionStatus> {
  clearStatusEmitTimer();
  const context = activeContext;
  const cdpBrowser = activeCdpBrowser;
  resetActiveSessionState();

  if (cdpBrowser) {
    try {
      await cdpBrowser.close();
    } catch {
      // CDP browser may have already disconnected
    }
  } else if (context) {
    try {
      await context.close();
    } catch {
      // Browser may have already been closed manually by user
    }
  }

  invalidateAutoPostCapabilitiesCache();
  emitBrowserSessionStatus();
  return getBrowserSessionStatus();
}
