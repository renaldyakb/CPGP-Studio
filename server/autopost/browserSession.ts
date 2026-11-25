import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'patchright';
import type { AutoPostBrowserSessionStatus } from '../../src/types/autopost.ts';
import type { PlatformKey } from '../../src/types/planner.ts';
import { ALL_PLATFORM_KEYS } from '../storage.ts';
import {
  detectAutoPostCapabilities,
  getInternalAutoPostConfig,
} from './config.ts';

export const PLATFORM_STUDIO_URLS: Record<PlatformKey, string> = {
  yt_shorts: 'https://studio.youtube.com',
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload?lang=en',
  ig_reels: 'https://www.instagram.com/',
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

let activeContext: BrowserContext | null = null;
let activeChannel: 'chrome' | 'msedge' | null = null;
let activeProfileDir: string | null = null;
let launchInFlight: Promise<BrowserContext> | null = null;
let launchInFlightProfileDir: string | null = null;
const sessionListeners = new Set<BrowserSessionListener>();

function normalizeProfilePath(dir: string): string {
  const resolved = path.resolve(dir);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSameProfileDir(a: string | null, b: string): boolean {
  if (!a) return false;
  return normalizeProfilePath(a) === normalizeProfilePath(b);
}

function isContextAlive(context: BrowserContext | null): boolean {
  if (!context) return false;
  try {
    const pages = context.pages();
    // If the underlying browser was closed, pages() throws or browser()?.isConnected() is false
    const browser = context.browser();
    if (browser && !browser.isConnected()) {
      return false;
    }
    return Array.isArray(pages);
  } catch {
    return false;
  }
}

export function getActiveBrowserProfileDir(): string | null {
  if (!isContextAlive(activeContext)) {
    return null;
  }
  return activeProfileDir;
}

export function getBrowserSessionStatus(): AutoPostBrowserSessionStatus {
  if (!isContextAlive(activeContext)) {
    activeContext = null;
    activeChannel = null;
    activeProfileDir = null;
    return {
      isOpen: false,
      channel: null,
      openTabsCount: 0,
    };
  }

  let openTabsCount = 0;
  try {
    openTabsCount = activeContext!.pages().filter((p) => !p.isClosed()).length;
  } catch {
    openTabsCount = 0;
  }

  if (openTabsCount === 0 && activeContext?.browser()?.isConnected() === false) {
    activeContext = null;
    activeChannel = null;
    activeProfileDir = null;
    return {
      isOpen: false,
      channel: null,
      openTabsCount: 0,
    };
  }

  return {
    isOpen: true,
    channel: activeChannel,
    openTabsCount,
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
  const profileDir = path.resolve(config.browser.profileDir);
  const resolvedChannel = resolveBrowserChannel(channel, workspaceId);

  if (isContextAlive(activeContext)) {
    const sameChannel = !channel || activeChannel === resolvedChannel;
    const sameProfile = isSameProfileDir(activeProfileDir, profileDir);
    if (sameChannel && sameProfile) {
      return activeContext as BrowserContext;
    }
    await closeBrowserSession();
  } else if (activeContext !== null) {
    activeContext = null;
    activeChannel = null;
    activeProfileDir = null;
    emitBrowserSessionStatus();
  }

  if (launchInFlight) {
    if (isSameProfileDir(launchInFlightProfileDir, profileDir)) {
      return launchInFlight;
    }
    try {
      await launchInFlight;
    } catch {
      // Previous launch failed; proceed with new launch
    }
    if (
      isContextAlive(activeContext) &&
      !isSameProfileDir(activeProfileDir, profileDir)
    ) {
      await closeBrowserSession();
    } else if (isContextAlive(activeContext)) {
      return activeContext as BrowserContext;
    }
  }

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  launchInFlightProfileDir = profileDir;
  launchInFlight = (async () => {
    try {
      const context = await chromium.launchPersistentContext(profileDir, {
        channel: resolvedChannel,
        headless: false,
        viewport: null,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      activeContext = context;
      activeChannel = resolvedChannel;
      activeProfileDir = profileDir;

      const handleContextClosed = () => {
        if (activeContext === context) {
          activeContext = null;
          activeChannel = null;
          activeProfileDir = null;
          emitBrowserSessionStatus();
        }
      };

      const attachPageCloseListener = (page: Page) => {
        page.on('close', () => {
          // Small tick so context/browser close state settles if it was the last tab
          setTimeout(() => {
            if (activeContext === context) {
              const alive = isContextAlive(context);
              const remaining = alive
                ? context.pages().filter((p) => !p.isClosed()).length
                : 0;
              if (!alive || remaining === 0) {
                activeContext = null;
                activeChannel = null;
                activeProfileDir = null;
              }
              emitBrowserSessionStatus();
            }
          }, 120);
        });
      };

      context.on('close', handleContextClosed);
      context.browser()?.on('disconnected', handleContextClosed);

      for (const existingPage of context.pages()) {
        attachPageCloseListener(existingPage);
      }
      context.on('page', (newPage) => {
        attachPageCloseListener(newPage);
        emitBrowserSessionStatus();
      });

      emitBrowserSessionStatus();
      return context;
    } catch (error) {
      activeContext = null;
      activeChannel = null;
      activeProfileDir = null;
      emitBrowserSessionStatus();
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Gagal membuka browser lokal (${resolvedChannel}) dengan profil persisten: ${details}`
      );
    } finally {
      launchInFlight = null;
      launchInFlightProfileDir = null;
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

  for (const platform of finalPlatforms) {
    // Stop opening additional tabs immediately if user already closed the browser window
    if (!isContextAlive(context) || activeContext !== context) {
      break;
    }

    const targetUrl = PLATFORM_STUDIO_URLS[platform];
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
    profileDir: config.browser.profileDir,
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

    if (platform === 'ig_reels') {
      await page.goto(PLATFORM_STUDIO_URLS.ig_reels, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page
        .locator(
          'a[href^="/direct/inbox/"], input[name="username"], a[href^="/accounts/login/"]'
        )
        .first()
        .waitFor({ state: 'attached', timeout: 15000 })
        .catch(() => {});

      const inboxCount = await page.locator('a[href^="/direct/inbox/"]').count();
      if (inboxCount > 0) {
        return {
          platform,
          state: 'logged_in',
          detail: 'Sesi Instagram aktif.',
          checkedAt: checkedAt(),
        };
      }
      return {
        platform,
        state: 'logged_out',
        detail: 'Belum login Instagram.',
        checkedAt: checkedAt(),
      };
    }

    // fb_reels
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
        detail: 'Belum login Meta Business Suite / Facebook.',
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
        detail: 'Sesi Meta Business Suite aktif.',
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
  const context = activeContext;
  activeContext = null;
  activeChannel = null;
  activeProfileDir = null;

  if (context) {
    try {
      await context.close();
    } catch {
      // Browser may have already been closed manually by user
    }
  }

  emitBrowserSessionStatus();
  return getBrowserSessionStatus();
}
