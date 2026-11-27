import fs from 'node:fs';
import type { Frame, FrameLocator, Locator, Page } from 'patchright';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type { AutoPostMode } from '../../src/types/autopost.ts';
import type { ContentPlannerItem, PlatformKey } from '../../src/types/planner.ts';
import {
  getOrLaunchBrowserContext,
  PLATFORM_STUDIO_URLS,
} from './browserSession.ts';
import { resolveUploadVideoForItem } from './contentHelpers.ts';

export interface BrowserPublishProgressUpdate {
  step: string;
  progressPercent: number;
  log?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
}

export interface MetaBusinessTargets {
  facebook: boolean;
  instagram: boolean;
}

export interface BrowserPublishParams {
  platform: PlatformKey;
  item: ContentPlannerItem;
  mode: AutoPostMode;
  signal: AbortSignal;
  onProgress: (update: BrowserPublishProgressUpdate) => void;
  workspace?: WorkspaceMetadata;
  metaTargets?: MetaBusinessTargets;
  scheduledAt?: string | null;
  aiGenerated?: boolean;
}

interface ParsedScheduleParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  dateObj: Date;
  displayLabel: string;
}

const SELECT_ALL_SHORTCUT =
  process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

const EN_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const EN_MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const ID_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const ID_MONTHS_FULL = [
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

function parseMonthWordToNumber(raw: string): number | null {
  const token = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!token) return null;
  const lookup: Record<string, number> = {
    jan: 1,
    january: 1,
    januari: 1,
    feb: 2,
    february: 2,
    februari: 2,
    mar: 3,
    march: 3,
    maret: 3,
    apr: 4,
    april: 4,
    may: 5,
    mei: 5,
    jun: 6,
    june: 6,
    juni: 6,
    jul: 7,
    july: 7,
    juli: 7,
    aug: 8,
    august: 8,
    agu: 8,
    ags: 8,
    agustus: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    okt: 10,
    oktober: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
    des: 12,
    desember: 12,
  };
  return lookup[token] ?? null;
}

function buildScheduleParts(dateObj: Date): ParsedScheduleParts {
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const hour = dateObj.getHours();
  const minute = dateObj.getMinutes();
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateObj,
    displayLabel: `${day} ${EN_MONTHS_SHORT[month - 1]} ${year}, ${hh}:${mm}`,
  };
}

function parseScheduledAt(raw?: string | null): ParsedScheduleParts | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.trim();

  // Prefer wall-clock YYYY-MM-DDTHH:mm (no UTC timezone shift)
  const localMatch = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    const dateObj = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (!Number.isNaN(dateObj.getTime())) {
      return buildScheduleParts(dateObj);
    }
  }

  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  return buildScheduleParts(parsed);
}

function snapScheduleMinutes(
  parts: ParsedScheduleParts,
  stepMinutes: number
): ParsedScheduleParts {
  if (stepMinutes <= 1) return parts;
  const totalMinutes = parts.hour * 60 + parts.minute;
  const snappedTotal = Math.round(totalMinutes / stepMinutes) * stepMinutes;
  const baseMidnight = new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  const adjusted = new Date(baseMidnight.getTime() + snappedTotal * 60_000);
  return buildScheduleParts(adjusted);
}

function formatDateMatchingSample(
  sample: string,
  parts: ParsedScheduleParts
): string {
  const s = sample.trim();
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const isIndonesian =
    /\b(januari|februari|maret|mei|juni|juli|agustus|agu|ags|oktober|okt|desember|des)\b/i.test(
      s
    );
  const fullMonth = isIndonesian
    ? ID_MONTHS_FULL[parts.month - 1]
    : EN_MONTHS_FULL[parts.month - 1];
  const shortMonth = isIndonesian
    ? ID_MONTHS_SHORT[parts.month - 1]
    : EN_MONTHS_SHORT[parts.month - 1];

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${parts.year}-${mm}-${dd}`;
  }

  // "Nov 26, 2026" or "November 26, 2026"
  const monthFirstMatch = s.match(/^([A-Za-z]+)\.?\s+\d{1,2},?\s+\d{4}$/);
  if (monthFirstMatch) {
    const useFull = monthFirstMatch[1].length > 3;
    const hasComma = s.includes(',');
    const monthLabel = useFull ? fullMonth : shortMonth;
    return hasComma
      ? `${monthLabel} ${parts.day}, ${parts.year}`
      : `${monthLabel} ${parts.day} ${parts.year}`;
  }

  // "25 November 2026" or "25 Nov 2026"
  const dayFirstMatch = s.match(/^\d{1,2}\s+([A-Za-z]+)\.?\s+\d{4}$/);
  if (dayFirstMatch) {
    const useFull = dayFirstMatch[1].length > 3;
    const monthLabel = useFull ? fullMonth : shortMonth;
    return `${parts.day} ${monthLabel} ${parts.year}`;
  }

  // Numeric "DD/MM/YYYY" or "MM/DD/YYYY"
  const numericMatch = s.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/);
  if (numericMatch) {
    const first = Number(numericMatch[1]);
    const sep = numericMatch[2];
    const second = Number(numericMatch[3]);
    // If first > 12 it is definitely day-first; if second > 12 it is month-first
    const dayFirst = first > 12 ? true : second > 12 ? false : true;
    return dayFirst
      ? `${dd}${sep}${mm}${sep}${parts.year}`
      : `${mm}${sep}${dd}${sep}${parts.year}`;
  }

  // Default: "26 November 2026"
  return `${parts.day} ${EN_MONTHS_FULL[parts.month - 1]} ${parts.year}`;
}

function formatTimeMatchingSample(
  sample: string,
  hour: number,
  minute: number
): string {
  const s = sample.trim();
  const mm = String(minute).padStart(2, '0');
  if (/am|pm/i.test(s)) {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${mm} ${suffix}`;
  }
  const sep = s.includes('.') && !s.includes(':') ? '.' : ':';
  return `${String(hour).padStart(2, '0')}${sep}${mm}`;
}

export interface BrowserPublishResult {
  status: 'completed' | 'awaiting_review';
  publishedUrl?: string | null;
  summary: string;
}

type LocatorScope = Page | Frame | FrameLocator;

function createAbortError(message = 'Proses auto-post dibatalkan.'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

async function abortableWait(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));

    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function humanDelay(
  minMs: number,
  maxMs: number,
  signal: AbortSignal
): Promise<void> {
  // Approximate Gaussian-like distribution by averaging two uniform samples
  const u = (Math.random() + Math.random()) / 2;
  const span = Math.max(1, maxMs - minMs);
  const delayMs = minMs + Math.round(u * span);
  await abortableWait(delayMs, signal);
}

const lastCursorByPage = new WeakMap<Page, { x: number; y: number }>();

async function getViewportBounds(
  page: Page
): Promise<{ width: number; height: number } | null> {
  const direct = page.viewportSize();
  if (direct && direct.width > 0 && direct.height > 0) {
    return direct;
  }
  return page
    .evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))
    .catch(() => null);
}

/**
 * Moves the pointer along a randomized cubic Bezier trajectory with ease-in-out
 * speed variation and subtle hand micro-jitter instead of a straight linear line.
 */
async function humanMoveMouse(
  page: Page,
  targetX: number,
  targetY: number,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  const viewport = await getViewportBounds(page);
  const vw = viewport?.width ?? 1280;
  const vh = viewport?.height ?? 800;

  let start = lastCursorByPage.get(page);
  if (!start) {
    // Seed an organic initial cursor position inside the viewport rather than (0, 0)
    start = {
      x: Math.round(vw * (0.25 + Math.random() * 0.5)),
      y: Math.round(vh * (0.2 + Math.random() * 0.5)),
    };
    await page.mouse.move(start.x, start.y).catch(() => {});
  }

  const dx = targetX - start.x;
  const dy = targetY - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 4) {
    await page.mouse.move(targetX, targetY);
    lastCursorByPage.set(page, { x: targetX, y: targetY });
    return;
  }

  // Perpendicular arc offset proportional to travel distance
  const perpX = -dy / distance;
  const perpY = dx / distance;
  const arcSign = Math.random() < 0.5 ? -1 : 1;
  const arcMag = Math.min(95, Math.max(12, distance * (0.12 + Math.random() * 0.16)));

  const cp1x = start.x + dx * (0.24 + Math.random() * 0.14) + perpX * arcSign * arcMag;
  const cp1y = start.y + dy * (0.24 + Math.random() * 0.14) + perpY * arcSign * arcMag;
  const cp2x = start.x + dx * (0.66 + Math.random() * 0.14) + perpX * arcSign * arcMag * 0.45;
  const cp2y = start.y + dy * (0.66 + Math.random() * 0.14) + perpY * arcSign * arcMag * 0.45;

  const steps = Math.max(12, Math.min(28, Math.round(distance / 28) + 8));

  for (let i = 1; i <= steps; i += 1) {
    throwIfAborted(signal);
    const linearT = i / steps;
    // Smoothstep ease-in-out timing curve
    const t = linearT * linearT * (3 - 2 * linearT);
    const inv = 1 - t;

    const jitterScale = i === steps ? 0 : Math.sin(linearT * Math.PI) * 1.4;
    const x =
      inv * inv * inv * start.x +
      3 * inv * inv * t * cp1x +
      3 * inv * t * t * cp2x +
      t * t * t * targetX +
      (Math.random() - 0.5) * jitterScale;
    const y =
      inv * inv * inv * start.y +
      3 * inv * inv * t * cp1y +
      3 * inv * t * t * cp2y +
      t * t * t * targetY +
      (Math.random() - 0.5) * jitterScale;

    const clampedX = Math.max(1, Math.min(vw - 1, x));
    const clampedY = Math.max(1, Math.min(vh - 1, y));
    await page.mouse.move(clampedX, clampedY);

    if (i < steps) {
      // Slightly slower near start and target, faster mid-travel
      const edgeFactor = 1 - Math.sin(linearT * Math.PI) * 0.55;
      const stepDelay = Math.round((5 + Math.random() * 9) * edgeFactor);
      await abortableWait(stepDelay, signal);
    }
  }

  // Occasional subtle human overshoot + micro-correction on longer cursor moves
  if (distance > 180 && Math.random() < 0.35) {
    const overX = Math.max(1, Math.min(vw - 1, targetX + (Math.random() - 0.5) * 6));
    const overY = Math.max(1, Math.min(vh - 1, targetY + (Math.random() - 0.5) * 5));
    await page.mouse.move(overX, overY);
    await humanDelay(25, 55, signal);
    await page.mouse.move(targetX, targetY);
  }

  lastCursorByPage.set(page, { x: targetX, y: targetY });
}

/**
 * Performs a subtle, natural mouse drift while reading a newly loaded page.
 */
async function humanIdleDrift(page: Page, signal: AbortSignal): Promise<void> {
  try {
    const viewport = await getViewportBounds(page);
    if (!viewport) return;
    const cur = lastCursorByPage.get(page) ?? {
      x: Math.round(viewport.width * 0.45),
      y: Math.round(viewport.height * 0.4),
    };
    const nextX = Math.max(
      40,
      Math.min(viewport.width - 40, cur.x + (Math.random() - 0.5) * 180)
    );
    const nextY = Math.max(
      60,
      Math.min(viewport.height - 60, cur.y + (Math.random() - 0.5) * 120)
    );
    await humanMoveMouse(page, nextX, nextY, signal);
  } catch {
    // Non-fatal
  }
}

/**
 * Emits natural wheel scroll ticks over a scrollable region or viewport.
 */
async function humanScrollWheel(
  page: Page,
  totalDeltaY: number,
  signal: AbortSignal,
  anchorLocator?: Locator
): Promise<void> {
  throwIfAborted(signal);
  try {
    if (anchorLocator) {
      const box = await anchorLocator.boundingBox({ timeout: 1500 }).catch(() => null);
      if (box && box.width > 10 && box.height > 10) {
        const hoverX = box.x + box.width * (0.3 + Math.random() * 0.4);
        const hoverY = box.y + box.height * (0.3 + Math.random() * 0.4);
        await humanMoveMouse(page, hoverX, hoverY, signal);
      }
    }
    const direction = totalDeltaY >= 0 ? 1 : -1;
    let remaining = Math.abs(totalDeltaY);
    while (remaining > 0) {
      throwIfAborted(signal);
      const tick = Math.min(remaining, 85 + Math.floor(Math.random() * 85));
      await page.mouse.wheel(0, direction * tick);
      remaining -= tick;
      await humanDelay(45, 115, signal);
    }
  } catch {
    // Ignore wheel scroll errors on non-scrollable targets
  }
}

/**
 * Enters text with realistic human cadence:
 * - Short strings (<= 65 chars): character-by-character typing with variable key delays.
 * - Longer multi-line captions: paragraph-by-paragraph entry with Enter keys and pauses,
 *   typing short bursts and inserting longer lines naturally so it stays fast without
 *   looking like an instant 0ms DOM dump.
 */
async function humanTypeText(
  page: Page,
  text: string,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  const normalized = text.replace(/\r\n/g, '\n');

  if (normalized.length <= 65 && !normalized.includes('\n')) {
    for (let i = 0; i < normalized.length; i += 1) {
      throwIfAborted(signal);
      const ch = normalized[i];
      await page.keyboard.type(ch);
      if (ch === ' ' || ch === '.' || ch === '?' || ch === '!') {
        await humanDelay(55, 130, signal);
      } else {
        await humanDelay(28, 78, signal);
      }
    }
    return;
  }

  const lines = normalized.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    throwIfAborted(signal);
    const line = lines[lineIdx];
    if (line.length > 0) {
      // Split long lines into natural word chunks (~18-36 chars) with brief pauses
      const words = line.split(' ');
      let chunk = '';
      for (let w = 0; w < words.length; w += 1) {
        const nextWord = words[w];
        const candidate = chunk ? `${chunk} ${nextWord}` : nextWord;
        if (candidate.length >= 24 + Math.floor(Math.random() * 14) || w === words.length - 1) {
          const toSend = w === words.length - 1 ? candidate : `${candidate} `;
          if (lineIdx === 0 && w < 3 && toSend.length <= 26) {
            for (const ch of toSend) {
              throwIfAborted(signal);
              await page.keyboard.type(ch);
              await humanDelay(25, 68, signal);
            }
          } else {
            await page.keyboard.insertText(toSend);
          }
          chunk = '';
          await humanDelay(90, 220, signal);
        } else {
          chunk = candidate;
        }
      }
      if (chunk) {
        await page.keyboard.insertText(chunk);
        await humanDelay(80, 180, signal);
      }
    }
    if (lineIdx < lines.length - 1) {
      await page.keyboard.press('Enter');
      await humanDelay(140, 320, signal);
    }
  }
}

async function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  throwIfAborted(signal);
  let onAbort: (() => void) | null = null;

  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } catch (error) {
    if (signal.aborted) {
      promise.catch(() => {});
    }
    throw error;
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

function getTitleForItem(item: ContentPlannerItem): string {
  const raw =
    item.userProperties.customTitle.trim() ||
    item.autoMetadata.captionParsed.hookTitle.trim() ||
    item.folderCode;
  return raw.slice(0, 100);
}

function getCaptionForItem(item: ContentPlannerItem): string {
  return (
    item.autoMetadata.captionParsed.rawText.trim() ||
    item.userProperties.customTitle.trim() ||
    item.folderCode
  );
}

function getCoverPathForItem(item: ContentPlannerItem): string | null {
  const cover = item.autoMetadata.assets.cover;
  if (cover.exists && cover.absolutePath && fs.existsSync(cover.absolutePath)) {
    return cover.absolutePath;
  }
  return null;
}

async function safeBringToFront(page: Page): Promise<void> {
  try {
    await page.bringToFront();
  } catch {
    // Ignore if browser window is minimized or closed
  }
}

async function findFirstVisibleLocator(
  target: LocatorScope,
  selectors: string[],
  timeoutMs = 8000,
  signal?: AbortSignal
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    for (const selector of selectors) {
      try {
        const locator = target.locator(selector).first();
        if (await locator.isVisible({ timeout: 250 })) {
          return locator;
        }
      } catch {
        // Selector not present or frame detached; try next selector
      }
    }

    if (signal) {
      await abortableWait(300, signal);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return null;
}

interface HumanClickOptions {
  timeout?: number;
  force?: boolean;
}

function isPageScope(target: LocatorScope): target is Page {
  return 'mouse' in target && 'keyboard' in target;
}

async function humanClick(
  page: Page,
  locator: Locator,
  signal: AbortSignal,
  options: HumanClickOptions = {}
): Promise<void> {
  throwIfAborted(signal);
  const timeout = options.timeout ?? 8000;

  try {
    await locator.scrollIntoViewIfNeeded({ timeout: Math.min(timeout, 4000) });
  } catch {
    await locator.click({ timeout, force: options.force });
    return;
  }

  const [visible, enabled] = await Promise.all([
    locator.isVisible().catch(() => false),
    locator.isEnabled().catch(() => false),
  ]);
  if (!visible || !enabled) {
    await locator.click({ timeout, force: options.force });
    return;
  }

  const box = await locator
    .boundingBox({ timeout: Math.min(timeout, 3000) })
    .catch(() => null);
  const viewport =
    page.viewportSize() ??
    (await page
      .evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }))
      .catch(() => null));

  if (box && box.width > 2 && box.height > 2) {
    const offsetX = box.width * (0.28 + Math.random() * 0.44);
    const offsetY = box.height * (0.28 + Math.random() * 0.44);
    const targetX = box.x + offsetX;
    const targetY = box.y + offsetY;

    const inViewport =
      viewport !== null &&
      targetX >= 1 &&
      targetY >= 1 &&
      targetX <= viewport.width - 1 &&
      targetY <= viewport.height - 1;

    if (inViewport) {
      const hitOk = await locator
        .evaluate(
          (el, pt) => {
            const doc = el.ownerDocument;
            // For elements inside an iframe, pt is in top-level page coords; check top-level doc only if same window
            if (doc.defaultView !== window.top) return false;
            const topEl = doc.elementFromPoint(pt.x, pt.y);
            if (!topEl) return false;
            return el === topEl || el.contains(topEl) || topEl.contains(el);
          },
          { x: targetX, y: targetY }
        )
        .catch(() => false);

      if (hitOk) {
        await humanMoveMouse(page, targetX, targetY, signal);
        await humanDelay(110, 240, signal);
        await page.mouse.down();
        await humanDelay(45, 115, signal);
        await page.mouse.up();
        return;
      }
    }
  }

  await locator.click({ timeout, force: options.force });
}

async function tryClickAny(
  target: LocatorScope,
  selectors: string[],
  timeoutMs = 6000,
  signal?: AbortSignal,
  pageOverride?: Page
): Promise<boolean> {
  const locator = await findFirstVisibleLocator(
    target,
    selectors,
    timeoutMs,
    signal
  );
  if (!locator) return false;

  const clickPage = pageOverride ?? (isPageScope(target) ? target : null);

  try {
    if (clickPage && signal) {
      await humanClick(clickPage, locator, signal, { timeout: 5000 });
    } else {
      await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await locator.click({ timeout: 5000 });
    }
    return true;
  } catch {
    try {
      await locator.click({ force: true, timeout: 4000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function findFileInputAcrossFrames(
  page: Page,
  selectors: string[],
  timeoutMs = 15000,
  signal?: AbortSignal
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const targets: Array<Page | Frame> = [page, ...page.frames()];
    for (const target of targets) {
      for (const selector of selectors) {
        try {
          const locator = target.locator(selector).first();
          if ((await locator.count()) > 0) {
            return locator;
          }
        } catch {
          // Frame may be cross-origin or detached
        }
      }
    }

    if (signal) {
      await abortableWait(350, signal);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  return null;
}

async function isLocatorEnabled(locator: Locator): Promise<boolean> {
  try {
    const visible = await locator.isVisible({ timeout: 300 });
    if (!visible) return false;
    const disabledAttr = await locator.getAttribute('disabled');
    const ariaDisabled = await locator.getAttribute('aria-disabled');
    return disabledAttr === null && ariaDisabled !== 'true';
  } catch {
    return false;
  }
}

async function waitForEnabledLocator(
  locator: Locator,
  timeoutMs: number,
  signal: AbortSignal
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (await isLocatorEnabled(locator)) {
      return true;
    }
    await abortableWait(500, signal);
  }
  return false;
}

async function fillTextWithInsertFallback(
  page: Page,
  locator: Locator,
  text: string,
  signal: AbortSignal
): Promise<boolean> {
  throwIfAborted(signal);
  try {
    await humanClick(page, locator, signal, { timeout: 6000 });
    await humanDelay(200, 420, signal);
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await humanDelay(90, 180, signal);
    await page.keyboard.press('Backspace');
    await humanDelay(140, 280, signal);
    await humanTypeText(page, text, signal);
    return true;
  } catch {
    try {
      await locator.click({ timeout: 4000 });
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(100, 220, signal);
      await page.keyboard.press('Backspace');
      await humanDelay(120, 240, signal);
      await page.keyboard.insertText(text);
      return true;
    } catch {
      return false;
    }
  }
}

async function fillYouTubeTextbox(
  page: Page,
  locator: Locator,
  text: string,
  signal: AbortSignal
): Promise<boolean> {
  throwIfAborted(signal);
  try {
    await humanClick(page, locator, signal, { timeout: 6000 });
    await humanDelay(160, 320, signal);
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await humanDelay(80, 160, signal);
    await page.keyboard.press('Delete');
    await humanDelay(140, 280, signal);

    try {
      await humanTypeText(page, text, signal);
    } catch {
      await page.keyboard.insertText(text);
    }

    await humanDelay(180, 360, signal);
    await page
      .evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && typeof active.blur === 'function') {
          active.blur();
        }
      })
      .catch(() => {});

    const dropdownCount = await page
      .locator('tp-yt-iron-dropdown:visible')
      .count()
      .catch(() => 0);
    if (dropdownCount > 0) {
      await page.keyboard.press('Escape').catch(() => {});
    }

    return true;
  } catch {
    return false;
  }
}

async function sweepGeoGuidanceCards(page: Page): Promise<void> {
  const buttons = page.locator(
    '[data-surface$="lib:GeoGuidanceCard"] [role="button"]:not([aria-label])'
  );
  const count = await buttons.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const btn = buttons.nth(i);
    const visible = await btn.isVisible({ timeout: 250 }).catch(() => false);
    if (visible) {
      await btn.click({ timeout: 2500 }).catch(() => {});
    }
  }
}

async function readFacebookActiveStepMarker(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const steps = Array.from(
        document.querySelectorAll('[aria-current="step"]')
      );
      return steps
        .map((el, idx) => {
          const text = (el.textContent ?? '').trim();
          const role = el.getAttribute('role') ?? '';
          return `${idx}:${role}:${text}`;
        })
        .join('|');
    })
    .catch(() => '');
}

async function extractYouTubeVideoUrl(page: Page): Promise<string | null> {
  try {
    const link = page
      .locator(
        'a#share-url, a[href*="youtu.be"], a[href*="/shorts/"], a[href*="watch?v="]'
      )
      .first();
    if ((await link.count()) > 0) {
      const href = await link.getAttribute('href');
      if (href && href.trim()) {
        return href.trim();
      }
    }
  } catch {
    // Ignore link scraping failure
  }
  return null;
}

function formatMetaTargetLabel(targets: MetaBusinessTargets): string {
  if (targets.facebook && targets.instagram) {
    return 'Facebook & Instagram Reels';
  }
  if (targets.instagram) {
    return 'Instagram Reels';
  }
  return 'Facebook Reels';
}

interface MetaTargetSelectionResult {
  applied: boolean;
  foundFacebook: boolean;
  foundInstagram: boolean;
  facebookChecked: boolean;
  instagramChecked: boolean;
}

async function selectMetaBusinessPostTargets(
  page: Page,
  reelSurface: Locator,
  targets: MetaBusinessTargets,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<MetaTargetSelectionResult> {
  const targetLabel = formatMetaTargetLabel(targets);

  const readOptionMetadata = async (
    optionLocator: Locator
  ): Promise<{ combinedText: string; checked: boolean }> =>
    optionLocator
      .evaluate((el) => {
        const row =
          el.closest('[role="option"], label, li') || el.parentElement || el;
        const parts: string[] = [
          el.getAttribute('aria-label') ?? '',
          row.getAttribute('aria-label') ?? '',
          row.textContent ?? '',
        ];
        row.querySelectorAll('img, svg, i, [aria-label], [alt], [title]').forEach(
          (child) => {
            parts.push(child.getAttribute('aria-label') ?? '');
            parts.push(child.getAttribute('alt') ?? '');
            parts.push(child.getAttribute('title') ?? '');
            parts.push(child.getAttribute('src') ?? '');
          }
        );

        let checked = false;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          checked = el.checked;
        } else if (el.getAttribute('aria-selected') !== null) {
          checked = el.getAttribute('aria-selected') === 'true';
        } else if (el.getAttribute('aria-checked') !== null) {
          checked = el.getAttribute('aria-checked') === 'true';
        } else if (row.getAttribute('aria-selected') !== null) {
          checked = row.getAttribute('aria-selected') === 'true';
        } else if (row.getAttribute('aria-checked') !== null) {
          checked = row.getAttribute('aria-checked') === 'true';
        } else {
          const nested = row.querySelector<HTMLInputElement>(
            'input[type="checkbox"]'
          );
          checked = nested ? nested.checked : false;
        }

        return {
          combinedText: parts.join(' ').toLowerCase(),
          checked,
        };
      })
      .catch(() => ({ combinedText: '', checked: false }));

  const readOptionChecked = async (optionLocator: Locator): Promise<boolean> => {
    const meta = await readOptionMetadata(optionLocator);
    return meta.checked;
  };

  try {
    onProgress({
      step: `Memilih target ${targetLabel} di Meta Business Suite`,
      progressPercent: 58,
      log: `Mengatur checklist "Post to" Meta Business Suite (Facebook: ${targets.facebook ? 'Ya' : 'Tidak'}, Instagram: ${targets.instagram ? 'Ya' : 'Tidak'}).`,
      level: 'info',
    });

    // Scroll left panel to top so the "Post to" combobox is visible
    const leftPanel = page
      .locator('[data-surface$="bizweb_create_reel:left_panel"]')
      .first();
    if (await leftPanel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await leftPanel
        .evaluate((el) => {
          el.scrollTop = 0;
        })
        .catch(() => {});
      await abortableWait(250, signal);
    }

    // Find the "Post to" dropdown trigger at the top of the left panel
    const triggerCandidates: Locator[] = [
      page
        .locator('[data-surface$="bizweb_create_reel:left_panel"] [role="combobox"]')
        .first(),
      reelSurface.locator('[role="combobox"]').first(),
      page
        .locator(
          '[data-surface$="bizweb_create_reel:left_panel"] [aria-haspopup="listbox"], [data-surface$="bizweb_create_reel:left_panel"] [aria-haspopup="menu"], [data-surface$="bizweb_create_reel:left_panel"] [aria-haspopup="dialog"], [data-surface$="bizweb_create_reel:left_panel"] [aria-haspopup="true"]'
        )
        .first(),
      reelSurface
        .locator(
          '[aria-haspopup="listbox"], [aria-haspopup="menu"], [aria-haspopup="dialog"], [aria-haspopup="true"]'
        )
        .first(),
    ];

    let trigger: Locator | null = null;
    for (const candidate of triggerCandidates) {
      if (await candidate.isVisible({ timeout: 1200 }).catch(() => false)) {
        trigger = candidate;
        break;
      }
    }

    if (!trigger) {
      onProgress({
        step: 'Dropdown "Post to" Meta tidak ditemukan',
        progressPercent: 59,
        log: 'Dropdown "Post to" tidak terlihat di panel Meta Business Suite.',
        level: 'warning',
      });
      return {
        applied: false,
        foundFacebook: false,
        foundInstagram: false,
        facebookChecked: false,
        instagramChecked: false,
      };
    }

    await humanClick(page, trigger, signal, { timeout: 8000 });
    await humanDelay(500, 800, signal);

    const headerRegex =
      /post to facebook and instagram|posting ke facebook dan instagram|post to facebook|posting ke facebook/i;

    // Locate the opened multiselectable listbox popover purely via Playwright Locators
    let activeListbox: Locator | null = null;
    const allListboxes = page.locator(
      '[role="listbox"][aria-multiselectable="true"], [role="listbox"]'
    );
    const listboxCount = await allListboxes.count().catch(() => 0);

    for (let i = 0; i < listboxCount; i += 1) {
      const lb = allListboxes.nth(i);
      if (!(await lb.isVisible({ timeout: 250 }).catch(() => false))) {
        continue;
      }
      const controlCount = await lb
        .locator('[role="option"], input[type="checkbox"]')
        .count()
        .catch(() => 0);
      if (controlCount < 1) continue;
      const containerText = (
        await lb
          .evaluate(
            (el) =>
              el.closest('[role="dialog"], [role="menu"], [data-visualcompletion]')
                ?.textContent ||
              el.parentElement?.parentElement?.textContent ||
              el.textContent ||
              ''
          )
          .catch(() => '')
      ).trim();
      if (headerRegex.test(containerText)) {
        activeListbox = lb;
        break;
      }
      if (!activeListbox) {
        activeListbox = lb;
      }
    }

    const collectVisibleBySelector = async (
      container: Locator,
      selector: string
    ): Promise<Locator[]> => {
      const found: Locator[] = [];
      const items = container.locator(selector);
      const count = await items.count().catch(() => 0);
      for (let idx = 0; idx < count; idx += 1) {
        const item = items.nth(idx);
        if (await item.isVisible({ timeout: 250 }).catch(() => false)) {
          found.push(item);
        }
      }
      return found;
    };

    const optionLocators: Locator[] = [];
    if (activeListbox) {
      const visibleOptions = await collectVisibleBySelector(
        activeListbox,
        '[role="option"]'
      );
      if (visibleOptions.length > 0) {
        optionLocators.push(...visibleOptions);
      } else {
        const visibleCheckboxes = await collectVisibleBySelector(
          activeListbox,
          'input[type="checkbox"]'
        );
        optionLocators.push(...visibleCheckboxes);
      }
    }

    // Secondary fallback: visible dialog/menu popover containing option or checkbox controls
    if (optionLocators.length === 0) {
      const fallbackPopovers = page.locator(
        '[role="dialog"]:visible, [role="menu"]:visible'
      );
      const popCount = await fallbackPopovers.count().catch(() => 0);
      for (let i = 0; i < popCount; i += 1) {
        const pop = fallbackPopovers.nth(i);
        const popText = (await pop.innerText().catch(() => '')).trim();
        if (!headerRegex.test(popText)) continue;
        for (const fallbackSelector of [
          '[role="option"]',
          '[role="menuitemcheckbox"]',
          '[role="checkbox"]',
          'input[type="checkbox"]',
        ]) {
          const matched = await collectVisibleBySelector(pop, fallbackSelector);
          if (matched.length > 0) {
            optionLocators.push(...matched);
            break;
          }
        }
        if (optionLocators.length > 0) break;
      }
    }

    let fbLocator: Locator | null = null;
    let igLocator: Locator | null = null;
    const unassigned: Locator[] = [];

    for (const optionLoc of optionLocators) {
      const meta = await readOptionMetadata(optionLoc);
      if (meta.combinedText.includes('instagram') && !igLocator) {
        igLocator = optionLoc;
      } else if (meta.combinedText.includes('facebook') && !fbLocator) {
        fbLocator = optionLoc;
      } else {
        unassigned.push(optionLoc);
      }
    }

    // Meta Business Suite lists Facebook Page first (index 0) and Instagram account second (index 1)
    if (!fbLocator && unassigned.length > 0) {
      fbLocator = unassigned.shift() ?? null;
    }
    if (!igLocator && unassigned.length > 0) {
      igLocator = unassigned.shift() ?? null;
    }

    const foundFacebook = Boolean(fbLocator);
    const foundInstagram = Boolean(igLocator);

    const setChannelState = async (
      targetLoc: Locator,
      desired: boolean
    ): Promise<boolean> => {
      const current = await readOptionChecked(targetLoc);
      if (current === desired) {
        return current;
      }

      await humanClick(page, targetLoc, signal, { timeout: 5000 }).catch(
        () => {}
      );
      await abortableWait(350, signal);

      let after = await readOptionChecked(targetLoc);
      if (after === desired) {
        return after;
      }

      // Fallback: standard Playwright locator click if pointer offset missed the hit region
      await targetLoc.click({ timeout: 5000, force: true }).catch(() => {});
      await abortableWait(350, signal);
      after = await readOptionChecked(targetLoc);
      return after;
    };

    // CRITICAL: Always enable desired target(s) FIRST before disabling undesired target(s),
    // because Meta Business Suite does not allow unchecking the last active account!
    const enableFirst: Array<{ locator: Locator; desired: boolean }> = [];
    const disableAfter: Array<{ locator: Locator; desired: boolean }> = [];

    if (fbLocator) {
      if (targets.facebook) {
        enableFirst.push({ locator: fbLocator, desired: true });
      } else {
        disableAfter.push({ locator: fbLocator, desired: false });
      }
    }
    if (igLocator) {
      if (targets.instagram) {
        enableFirst.push({ locator: igLocator, desired: true });
      } else {
        disableAfter.push({ locator: igLocator, desired: false });
      }
    }

    for (const op of [...enableFirst, ...disableAfter]) {
      throwIfAborted(signal);
      await setChannelState(op.locator, op.desired);
      await humanDelay(250, 450, signal);
    }

    const finalFb = fbLocator ? await readOptionChecked(fbLocator) : false;
    const finalIg = igLocator ? await readOptionChecked(igLocator) : false;

    // Close the "Post to" dropdown cleanly so it doesn't obstruct Description/Cover
    await page.keyboard.press('Escape').catch(() => {});
    await abortableWait(300, signal);
    const expanded = await trigger
      .getAttribute('aria-expanded')
      .catch(() => null);
    if (expanded === 'true') {
      await humanClick(page, trigger, signal, { timeout: 3000 }).catch(
        () => {}
      );
      await abortableWait(250, signal);
    }

    await humanDelay(450, 750, signal);

    const applied =
      (!targets.facebook || finalFb) &&
      (!targets.instagram || finalIg) &&
      (targets.facebook || !finalFb) &&
      (targets.instagram || !finalIg);

    onProgress({
      step: applied
        ? `Target ${targetLabel} terpilih`
        : `Verifikasi target ${targetLabel} perlu dicek`,
      progressPercent: 61,
      log: `Status checklist "Post to": Facebook=${finalFb ? 'Aktif' : 'Nonaktif'}, Instagram=${finalIg ? 'Aktif' : 'Nonaktif'}.`,
      level: applied ? 'success' : 'warning',
    });

    return {
      applied,
      foundFacebook,
      foundInstagram,
      facebookChecked: finalFb,
      instagramChecked: finalIg,
    };
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengatur checklist Post to (non-fatal)',
      progressPercent: 60,
      log: `Pengaturan checklist "Post to" Meta Business Suite terkendala: ${msg}`,
      level: 'warning',
    });
    return {
      applied: false,
      foundFacebook: false,
      foundInstagram: false,
      facebookChecked: false,
      instagramChecked: false,
    };
  }
}

export async function publishInstagramViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void,
  scheduledAt?: string | null,
  aiGenerated = false
): Promise<BrowserPublishResult> {
  return publishMetaBusinessSuiteViaBrowser(
    page,
    item,
    videoPath,
    videoFileName,
    mode,
    signal,
    onProgress,
    { facebook: false, instagram: true },
    scheduledAt,
    aiGenerated
  );
}

async function uploadFacebookReelCover(
  page: Page,
  reelSurface: Locator,
  coverPath: string,
  coverFileName: string,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  const UPLOAD_IMAGE_LABEL =
    /^(?:Upload image|Upload photo|Unggah gambar|Unggah foto|Upload thumbnail|Unggah thumbnail|Upload cover|Unggah sampul|Add thumbnail|Tambah thumbnail|Edit thumbnail|Edit cover|Edit sampul|上传图片)$/i;
  const CONFIRM_COVER_LABEL =
    /^(?:Save|Simpan|Apply|Terapkan|Done|Selesai|Confirm|Konfirmasi)$/i;

  const findUploadImageTrigger = async (): Promise<Locator | null> => {
    const candidates: Locator[] = [
      reelSurface
        .locator('[role="button"], [role="radio"], [role="tab"], button, a[role="link"]')
        .filter({ hasText: UPLOAD_IMAGE_LABEL })
        .first(),
      page
        .locator(
          '[data-surface$="bizweb_create_reel:left_panel"] [role="button"], [data-surface$="bizweb_create_reel:left_panel"] [role="radio"], [data-surface$="bizweb_create_reel:left_panel"] [role="tab"], [data-surface$="bizweb_create_reel:left_panel"] button'
        )
        .filter({ hasText: UPLOAD_IMAGE_LABEL })
        .first(),
      reelSurface.getByText(UPLOAD_IMAGE_LABEL).first(),
      page.getByText(UPLOAD_IMAGE_LABEL).first(),
    ];

    for (const candidate of candidates) {
      if ((await candidate.count().catch(() => 0)) === 0) continue;
      await candidate.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
      const visible = await candidate
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (visible && (await isLocatorEnabled(candidate))) {
        return candidate;
      }
    }
    return null;
  };

  /**
   * Read-only MutationObserver inside the Reels Composer DOM that detects the exact
   * moment Meta renders and enables the Thumbnail / Upload image button, even if it
   * is currently scrolled below the fold. Performs zero scrolling and zero DOM mutations
   * while waiting so the browser stays completely still and natural.
   */
  const waitForThumbnailReadyViaObserver = async (
    timeoutMs: number
  ): Promise<'trigger_ready' | 'file_input_ready' | 'timeout'> => {
    const patternSource = UPLOAD_IMAGE_LABEL.source;
    const waitStartMs = Date.now();

    const progressTimer = setInterval(() => {
      if (signal.aborted) return;
      const waitedSec = Math.round((Date.now() - waitStartMs) / 1000);
      if (waitedSec >= 10) {
        onProgress({
          step: `Menunggu bagian Thumbnail Meta muncul otomatis (${waitedSec}s)`,
          progressPercent: 71,
          log: `Memantau DOM Reels Composer secara pasif hingga bagian Thumbnail & Upload image muncul (${waitedSec}s)...`,
          level: 'info',
        });
      }
    }, 12_000);

    try {
      const result = await raceWithAbort(
        page.evaluate(
          ({ regexSource, maxWaitMs }) => {
            return new Promise<'trigger_ready' | 'file_input_ready' | 'timeout'>(
              (resolve) => {
                const labelRegex = new RegExp(regexSource, 'i');
                const root =
                  document.querySelector('[data-surface$="lib:bizweb_create_reel"]') ||
                  document.querySelector('[data-surface$="bizweb_create_reel:left_panel"]') ||
                  document.body;

                const isNodeReady = (el: Element): boolean => {
                  const htmlEl = el as HTMLElement;
                  if (htmlEl.getAttribute('aria-disabled') === 'true') return false;
                  if ((htmlEl as HTMLButtonElement).disabled === true) return false;
                  const style = window.getComputedStyle(htmlEl);
                  if (style.display === 'none' || style.visibility === 'hidden') {
                    return false;
                  }
                  const rect = htmlEl.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0;
                };

                const checkDom = (): 'trigger_ready' | 'file_input_ready' | null => {
                  const controls = root.querySelectorAll(
                    '[role="button"], [role="radio"], [role="tab"], button, a[role="link"]'
                  );
                  for (const el of controls) {
                    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (text && labelRegex.test(text) && isNodeReady(el)) {
                      return 'trigger_ready';
                    }
                  }
                  // Also check direct image file input scoped inside the reel composer
                  const scopedInput = root.querySelector(
                    'input[type="file"][accept*="image"]:not([accept*="video"])'
                  );
                  if (scopedInput) {
                    return 'file_input_ready';
                  }
                  return null;
                };

                const initial = checkDom();
                if (initial) {
                  resolve(initial);
                  return;
                }

                let finished = false;
                let timerId: number | null = null;
                const finish = (
                  outcome: 'trigger_ready' | 'file_input_ready' | 'timeout'
                ) => {
                  if (finished) return;
                  finished = true;
                  observer.disconnect();
                  if (timerId !== null) window.clearTimeout(timerId);
                  resolve(outcome);
                };

                const observer = new MutationObserver(() => {
                  const found = checkDom();
                  if (found) finish(found);
                });

                observer.observe(root, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ['aria-disabled', 'disabled', 'style', 'class'],
                });

                timerId = window.setTimeout(() => finish('timeout'), maxWaitMs);
              }
            );
          },
          { regexSource: patternSource, maxWaitMs: timeoutMs }
        ),
        signal
      );
      return result;
    } finally {
      clearInterval(progressTimer);
    }
  };

  const confirmCoverModalIfPresent = async (): Promise<void> => {
    await humanDelay(1100, 1800, signal);
    const dialog = page.locator('[role="dialog"]').last();
    if (!(await dialog.isVisible({ timeout: 800 }).catch(() => false))) {
      return;
    }
    const saveBtn = dialog
      .locator('[role="button"], button')
      .filter({ hasText: CONFIRM_COVER_LABEL })
      .last();
    if (
      (await saveBtn.isVisible({ timeout: 1200 }).catch(() => false)) &&
      (await waitForEnabledLocator(saveBtn, 10_000, signal))
    ) {
      await humanDelay(500, 950, signal);
      await humanClick(page, saveBtn, signal, { timeout: 6000 }).catch(() => {});
      await humanDelay(1600, 2600, signal);
    }
  };

  const waitUntilCoverUploadSettles = async (): Promise<void> => {
    // Wait calmly for any uploading spinner / progressbar inside left_panel to clear
    const settleDeadline = Date.now() + 18_000;
    await humanDelay(1800, 2600, signal);
    while (Date.now() < settleDeadline) {
      throwIfAborted(signal);
      const hasBusySpinner = await reelSurface
        .locator('[role="progressbar"]:visible, [aria-busy="true"]:visible')
        .first()
        .isVisible({ timeout: 250 })
        .catch(() => false);
      if (!hasBusySpinner) {
        break;
      }
      await humanDelay(700, 1100, signal);
    }
    await humanDelay(600, 1100, signal);
  };

  try {
    onProgress({
      step: `Menunggu bagian Thumbnail Meta Reels muncul otomatis untuk ${coverFileName}`,
      progressPercent: 71,
      log: `Menunggu bagian Thumbnail & tombol Upload image muncul otomatis di Meta Business Suite (tanpa scroll berulang)...`,
      level: 'info',
    });

    // Natural pause after finishing caption before waiting passively
    await humanDelay(750, 1350, signal);

    // Automatically detect the exact moment Meta mounts & enables Thumbnail controls (up to 120s)
    const detected = await waitForThumbnailReadyViaObserver(120_000);

    if (detected === 'timeout') {
      onProgress({
        step: 'Tombol Upload image thumbnail belum muncul',
        progressPercent: 72,
        log: 'Bagian Thumbnail / tombol Upload image Meta Business Suite belum muncul setelah 120 detik. Melanjutkan tanpa mengganti thumbnail.',
        level: 'warning',
      });
      return false;
    }

    // Natural reaction pause once Thumbnail automatically appears
    await humanDelay(600, 1150, signal);

    const trigger = await findUploadImageTrigger();

    if (!trigger) {
      const directImageInput = reelSurface
        .locator('input[type="file"][accept*="image"]:not([accept*="video"])')
        .last();
      if ((await directImageInput.count().catch(() => 0)) > 0) {
        await directImageInput.setInputFiles(coverPath);
        await confirmCoverModalIfPresent();
        await waitUntilCoverUploadSettles();
        onProgress({
          step: `Cover ${coverFileName} berhasil diunggah ke Meta Reels`,
          progressPercent: 74,
          log: `Cover ${coverFileName} terpasang langsung melalui input gambar di Reels Composer.`,
          level: 'success',
        });
        return true;
      }

      onProgress({
        step: 'Tombol Upload image thumbnail tidak dapat diklik',
        progressPercent: 72,
        log: 'Bagian Thumbnail terdeteksi tetapi tombol Upload image tidak aktif. Melanjutkan tanpa mengganti thumbnail.',
        level: 'warning',
      });
      return false;
    }

    await trigger.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await humanDelay(500, 950, signal);

    // Click Upload image while listening for an immediate native filechooser dialog
    const immediateChooserPromise = page
      .waitForEvent('filechooser', { timeout: 3500 })
      .catch(() => null);

    await humanClick(page, trigger, signal, { timeout: 8000 });
    const immediateChooser = await raceWithAbort(immediateChooserPromise, signal);

    if (immediateChooser) {
      await humanDelay(350, 700, signal);
      await immediateChooser.setFiles([coverPath]);
      await confirmCoverModalIfPresent();
      await waitUntilCoverUploadSettles();
      onProgress({
        step: `Cover ${coverFileName} berhasil diunggah ke Meta Reels`,
        progressPercent: 74,
        log: `Cover ${coverFileName} terpasang melalui tombol Upload image.`,
        level: 'success',
      });
      return true;
    }

    // Step 2: Meta Business Suite reveals a secondary row ("[icon] Upload image ... [Upload Image]")
    await humanDelay(850, 1450, signal);

    const secondaryCandidates: Locator[] = [
      reelSurface
        .locator('a[role="link"], a')
        .filter({ hasText: UPLOAD_IMAGE_LABEL })
        .last(),
      reelSurface
        .locator('a, button, [role="button"]')
        .filter({ hasText: /^Upload Image$/ })
        .last(),
      reelSurface
        .locator('a, button, [role="button"]')
        .filter({ hasText: UPLOAD_IMAGE_LABEL })
        .last(),
      reelSurface.getByText(UPLOAD_IMAGE_LABEL).last(),
      page
        .locator(
          '[data-surface$="bizweb_create_reel:left_panel"] a, [data-surface$="bizweb_create_reel:left_panel"] button, [data-surface$="bizweb_create_reel:left_panel"] [role="button"]'
        )
        .filter({ hasText: UPLOAD_IMAGE_LABEL })
        .last(),
    ];

    for (const secondBtn of secondaryCandidates) {
      const visible = await secondBtn
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (!visible) continue;

      try {
        const secondChooserPromise = page
          .waitForEvent('filechooser', { timeout: 5500 })
          .catch(() => null);
        await humanDelay(350, 650, signal);
        await humanClick(page, secondBtn, signal, { timeout: 6000 });
        const secondChooser = await raceWithAbort(secondChooserPromise, signal);

        if (secondChooser) {
          await humanDelay(350, 700, signal);
          await secondChooser.setFiles([coverPath]);
          await confirmCoverModalIfPresent();
          await waitUntilCoverUploadSettles();
          onProgress({
            step: `Cover ${coverFileName} berhasil diunggah ke Meta Reels`,
            progressPercent: 74,
            log: `Cover ${coverFileName} terpasang melalui tombol kedua Upload Image.`,
            level: 'success',
          });
          return true;
        }
      } catch (err) {
        if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw createAbortError();
        }
      }
    }

    // Fallback: direct image file input scoped strictly inside bizweb_create_reel
    const scopedImageInput = reelSurface
      .locator('input[type="file"][accept*="image"]:not([accept*="video"])')
      .last();
    if ((await scopedImageInput.count().catch(() => 0)) > 0) {
      await scopedImageInput.setInputFiles(coverPath);
      await confirmCoverModalIfPresent();
      await waitUntilCoverUploadSettles();
      onProgress({
        step: `Cover ${coverFileName} berhasil diunggah ke Meta Reels`,
        progressPercent: 74,
        log: `Cover ${coverFileName} terpasang melalui input gambar di Reels Composer.`,
        level: 'success',
      });
      return true;
    }

    onProgress({
      step: 'Input file cover thumbnail tidak muncul',
      progressPercent: 72,
      log: 'Tab Upload image sudah diklik tetapi input gambar tidak terdeteksi. Melanjutkan ke langkah berikutnya.',
      level: 'warning',
    });
    return false;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengunggah cover thumbnail (non-fatal)',
      progressPercent: 72,
      log: `Upload cover Meta Reels dilewati: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

async function configureMetaBusinessSchedule(
  page: Page,
  reelSurface: Locator,
  schedule: ParsedScheduleParts,
  targetLabel: string,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  try {
    onProgress({
      step: `Mengatur jadwal ${targetLabel} (${schedule.displayLabel})`,
      progressPercent: 83,
      log: `Memilih opsi Schedule di Meta Business Suite untuk ${schedule.displayLabel}.`,
      level: 'info',
    });

    const SCHEDULE_LABEL = /^(?:Schedule|Jadwalkan)$/i;

    // Click the "Schedule" segmented button under "Scheduling options" (exclude footer CTA!)
    const scheduleTabCandidates: Locator[] = [
      reelSurface
        .locator(
          ':not([data-surface$="bizweb_create_reel:footer"]) [role="button"], :not([data-surface$="bizweb_create_reel:footer"]) [role="radio"], :not([data-surface$="bizweb_create_reel:footer"]) [role="tab"], :not([data-surface$="bizweb_create_reel:footer"]) button'
        )
        .filter({ hasText: SCHEDULE_LABEL })
        .first(),
      reelSurface
        .locator('[role="button"], [role="radio"], [role="tab"], button')
        .filter({ hasText: SCHEDULE_LABEL })
        .first(),
      page
        .locator('[role="button"], [role="radio"], [role="tab"], button')
        .filter({ hasText: SCHEDULE_LABEL })
        .first(),
    ];

    let scheduleTab: Locator | null = null;
    for (const candidate of scheduleTabCandidates) {
      if (await candidate.isVisible({ timeout: 1500 }).catch(() => false)) {
        scheduleTab = candidate;
        break;
      }
    }

    if (!scheduleTab) {
      onProgress({
        step: 'Tombol Schedule Meta tidak ditemukan',
        progressPercent: 84,
        log: 'Opsi Schedule pada bagian Scheduling options Meta Business Suite tidak terlihat.',
        level: 'warning',
      });
      return false;
    }

    // Reset scroll position so Step 3 "Scheduling options" is fully visible below sticky header
    await page
      .evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll('*').forEach((el) => {
          if (el.scrollTop > 0) {
            el.scrollTop = 0;
          }
        });
      })
      .catch(() => {});
    await sweepGeoGuidanceCards(page);
    await abortableWait(300, signal);

    await humanClick(page, scheduleTab, signal, { timeout: 8000 }).catch(
      () => {}
    );
    await abortableWait(350, signal);
    const pressedAfterClick = await scheduleTab
      .getAttribute('aria-pressed')
      .catch(() => null);
    if (pressedAfterClick !== 'true') {
      await scheduleTab.click({ timeout: 5000 }).catch(() => {});
    }
    await humanDelay(650, 950, signal);

    // Single read-only classification pass over all visible schedule inputs in exact DOM order.
    // Guarantees mutual exclusion across buckets and captures both Row 1 (Facebook) and Row 2 (Instagram).
    const dateRegex =
      /^\d{1,2}\s+[A-Za-z]+\.?\s+\d{4}$|^[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}$|^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$|^\d{4}-\d{2}-\d{2}$/;
    const datePlaceholderRegex = /\bdd\b|dd[/.-]mm|mm[/.-]dd|yyyy/i;
    const dateAriaRegex = /\b(?:date|tanggal)\b/i;
    const ampmAriaRegex = /\b(?:meridiem|period)\b|am\/pm/i;
    const hourAriaRegex = /\b(?:hour|hours|jam)\b/i;
    const minAriaRegex = /\b(?:minute|minutes|menit)\b/i;

    const dateEntries: Array<{
      locator: Locator;
      value: string;
      placeholder: string;
    }> = [];
    const hourInputs: Locator[] = [];
    const minInputs: Locator[] = [];
    const ampmInputs: Locator[] = [];
    const timeEntries: Array<{ locator: Locator; sample: string }> = [];
    const unlabeledSpinButtons: Locator[] = [];

    const allSurfaceInputs = reelSurface.locator(
      'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])'
    );
    const totalInputs = await allSurfaceInputs.count().catch(() => 0);

    for (let i = 0; i < totalInputs; i += 1) {
      throwIfAborted(signal);
      const loc = allSurfaceInputs.nth(i);
      if (!(await loc.isVisible({ timeout: 200 }).catch(() => false))) {
        continue;
      }

      const meta = await loc
        .evaluate((el) => {
          const input = el as HTMLInputElement;
          return {
            inFooter: Boolean(
              el.closest('[data-surface$="bizweb_create_reel:footer"]')
            ),
            aria: (el.getAttribute('aria-label') ?? '').trim().toLowerCase(),
            placeholder: (el.getAttribute('placeholder') ?? '')
              .trim()
              .toLowerCase(),
            value: (input.value ?? '').trim(),
            role: (el.getAttribute('role') ?? '').trim().toLowerCase(),
            type: (input.type ?? '').trim().toLowerCase(),
          };
        })
        .catch(() => null);

      if (!meta || meta.inFooter) {
        continue;
      }

      if (
        meta.type === 'date' ||
        datePlaceholderRegex.test(meta.placeholder) ||
        dateAriaRegex.test(meta.aria) ||
        dateRegex.test(meta.value)
      ) {
        dateEntries.push({
          locator: loc,
          value: meta.value,
          placeholder: meta.placeholder,
        });
      } else if (
        ampmAriaRegex.test(meta.aria) ||
        /^(am|pm)$/i.test(meta.value)
      ) {
        ampmInputs.push(loc);
      } else if (hourAriaRegex.test(meta.aria)) {
        hourInputs.push(loc);
      } else if (minAriaRegex.test(meta.aria)) {
        minInputs.push(loc);
      } else if (
        meta.type === 'time' ||
        /^\d{1,2}[:.]\d{2}(\s*[ap]m)?$/i.test(meta.value)
      ) {
        timeEntries.push({ locator: loc, sample: meta.value });
      } else if (meta.role === 'spinbutton' || /^\d{1,2}$/.test(meta.value)) {
        unlabeledSpinButtons.push(loc);
      }
    }

    if (
      hourInputs.length === 0 &&
      minInputs.length === 0 &&
      unlabeledSpinButtons.length >= 2
    ) {
      for (let i = 0; i + 1 < unlabeledSpinButtons.length; i += 2) {
        hourInputs.push(unlabeledSpinButtons[i]);
        minInputs.push(unlabeledSpinButtons[i + 1]);
      }
    }

    if (
      dateEntries.length === 0 &&
      hourInputs.length === 0 &&
      timeEntries.length === 0
    ) {
      onProgress({
        step: 'Input tanggal/jam Schedule Meta tidak terdeteksi',
        progressPercent: 84,
        log: 'Opsi Schedule sudah diklik, tetapi kolom tanggal/jam Meta tidak ditemukan otomatis.',
        level: 'warning',
      });
      return false;
    }

    // Fill every date input (1 for single platform, 2 for Facebook + Instagram).
    // Meta's GeoDateInput opens a [role="grid"] calendar popup on click; selecting the day
    // inside the calendar reliably commits the date (typing + Enter reverts to today!).
    const ddStr = String(schedule.day).padStart(2, '0');
    const mmStr = String(schedule.month).padStart(2, '0');
    const targetEnMonth = EN_MONTHS_FULL[schedule.month - 1];
    const targetIdMonth = ID_MONTHS_FULL[schedule.month - 1];
    const targetMonthRegex = new RegExp(
      `\\b(?:${targetEnMonth}|${targetIdMonth}|${EN_MONTHS_SHORT[schedule.month - 1]}|${ID_MONTHS_SHORT[schedule.month - 1]})\\b`,
      'i'
    );

    for (let i = 0; i < dateEntries.length; i += 1) {
      throwIfAborted(signal);
      const { locator: dateInput, value: sampleVal, placeholder } = dateEntries[i];

      await page
        .evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelectorAll('*').forEach((el) => {
            if (el.scrollTop > 0) {
              el.scrollTop = 0;
            }
          });
        })
        .catch(() => {});
      await abortableWait(150, signal);

      await humanClick(page, dateInput, signal, { timeout: 5000, force: true });
      await abortableWait(450, signal);

      const calGrid = page.locator('[role="grid"]:visible').last();
      const gridVisible = await calGrid
        .isVisible({ timeout: 2500 })
        .catch(() => false);

      let dateSetViaCalendar = false;
      if (gridVisible) {
        // Scope strictly to the calendar popover container so we NEVER click buttons outside the calendar!
        const calContainer = calGrid.locator('xpath=ancestor::div[4]').first();
        for (let nav = 0; nav < 6; nav += 1) {
          throwIfAborted(signal);
          const calContainerText = await calContainer
            .innerText()
            .catch(() => '');
          if (targetMonthRegex.test(calContainerText)) {
            break;
          }
          const nextMonthBtn = calContainer
            .locator(
              '[aria-label*="Next month" i]:visible, [aria-label*="Bulan berikutnya" i]:visible, [aria-label*="Next" i]:visible'
            )
            .last();
          if (await nextMonthBtn.isVisible({ timeout: 500 }).catch(() => false)) {
            await humanClick(page, nextMonthBtn, signal, {
              timeout: 3000,
            }).catch(() => {});
            await abortableWait(300, signal);
          } else {
            break;
          }
        }

        const dayCells = calGrid
          .locator(
            '[role="gridcell"]:not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"]), button:not([disabled])'
          )
          .filter({ hasText: new RegExp(`^${schedule.day}$`) });
        const cellCount = await dayCells.count().catch(() => 0);
        if (cellCount > 0) {
          // Days 1..15 of current month appear before next month's leading days -> first()
          // Days 16..31 of current month appear after previous month's trailing days -> last()
          const targetCell =
            schedule.day <= 15 ? dayCells.first() : dayCells.last();
          try {
            await humanClick(page, targetCell, signal, { timeout: 2500 });
            await abortableWait(400, signal);
            dateSetViaCalendar = true;
          } catch (err) {
            if (
              signal.aborted ||
              (err instanceof Error && err.name === 'AbortError')
            ) {
              throw createAbortError();
            }
            dateSetViaCalendar = false;
          }
        }
      }

      if (!dateSetViaCalendar) {
        let formattedDate: string;
        if (placeholder.includes('dd/mm/yyyy')) {
          formattedDate = `${ddStr}/${mmStr}/${schedule.year}`;
        } else if (placeholder.includes('mm/dd/yyyy')) {
          formattedDate = `${mmStr}/${ddStr}/${schedule.year}`;
        } else if (placeholder.includes('yyyy-mm-dd')) {
          formattedDate = `${schedule.year}-${mmStr}-${ddStr}`;
        } else {
          formattedDate = formatDateMatchingSample(sampleVal, schedule);
        }
        await humanClick(page, dateInput, signal, {
          timeout: 5000,
          force: true,
        });
        await humanDelay(180, 320, signal);
        await page.keyboard.press(SELECT_ALL_SHORTCUT);
        await humanDelay(70, 140, signal);
        await page.keyboard.press('Backspace');
        await humanDelay(100, 200, signal);
        await humanTypeText(page, formattedDate, signal);
        await humanDelay(180, 320, signal);
        await page.keyboard.press('Tab');
        await humanDelay(250, 450, signal);
      }
    }

    const use12Hour = ampmInputs.length > 0;
    const hourValue = use12Hour
      ? String(schedule.hour % 12 === 0 ? 12 : schedule.hour % 12).padStart(2, '0')
      : String(schedule.hour).padStart(2, '0');
    const minValue = String(schedule.minute).padStart(2, '0');
    const meridiemValue = schedule.hour >= 12 ? 'PM' : 'AM';

    for (const hourInput of hourInputs) {
      throwIfAborted(signal);
      await humanClick(page, hourInput, signal, { timeout: 5000, force: true });
      await humanDelay(140, 260, signal);
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(70, 140, signal);
      await humanTypeText(page, hourValue, signal);
      await humanDelay(180, 340, signal);
    }

    for (const minInput of minInputs) {
      throwIfAborted(signal);
      await humanClick(page, minInput, signal, { timeout: 5000, force: true });
      await humanDelay(140, 260, signal);
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(70, 140, signal);
      await humanTypeText(page, minValue, signal);
      await humanDelay(180, 340, signal);
    }

    for (const ampmInput of ampmInputs) {
      throwIfAborted(signal);
      await humanClick(page, ampmInput, signal, { timeout: 5000, force: true });
      await humanDelay(140, 260, signal);
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(70, 140, signal);
      await humanTypeText(page, meridiemValue, signal);
      await humanDelay(180, 340, signal);
    }

    for (const { locator: timeInput, sample } of timeEntries) {
      throwIfAborted(signal);
      const formattedTime = formatTimeMatchingSample(
        sample,
        schedule.hour,
        schedule.minute
      );
      await humanClick(page, timeInput, signal, { timeout: 5000, force: true });
      await humanDelay(140, 260, signal);
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(70, 140, signal);
      await page.keyboard.press('Backspace');
      await humanDelay(100, 180, signal);
      await humanTypeText(page, formattedTime, signal);
      await humanDelay(150, 260, signal);
      await page.keyboard.press('Tab');
      await humanDelay(220, 400, signal);
    }

    await page.keyboard.press('Tab').catch(() => {});
    await humanDelay(450, 750, signal);

    onProgress({
      step: `Jadwal ${targetLabel} disetel ke ${schedule.displayLabel}`,
      progressPercent: 85,
      log: `Tanggal & jam jadwal (${schedule.displayLabel}) berhasil diisi di ${Math.max(dateEntries.length, 1)} baris Meta Business Suite.`,
      level: 'success',
    });
    return true;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengatur jadwal Meta Business Suite',
      progressPercent: 84,
      log: `Pengaturan jadwal Meta Business Suite terkendala: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

async function configureMetaAiLabel(
  page: Page,
  reelSurface: Locator,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  try {
    const aiRegex =
      /\b(?:ai info|ai label|generated with ai|made with ai|ai-generated|info ai|label ai|buatan ai)\b/i;

    const candidates = reelSurface.locator(
      '[role="switch"], input[type="checkbox"]'
    );
    const count = await candidates.count().catch(() => 0);

    for (let i = 0; i < count; i += 1) {
      throwIfAborted(signal);
      const candidate = candidates.nth(i);
      if (!(await candidate.isVisible({ timeout: 250 }).catch(() => false))) {
        continue;
      }

      const info = await candidate
        .evaluate((el) => {
          const label = (el.getAttribute('aria-label') ?? '').trim();
          const nearby = (
            el.closest('div')?.parentElement?.textContent ?? ''
          ).trim();
          let isChecked = false;
          if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            isChecked = el.checked;
          } else {
            isChecked = el.getAttribute('aria-checked') === 'true';
          }
          return { label, nearby, isChecked };
        })
        .catch(() => null);

      if (!info) continue;
      if (!aiRegex.test(info.label) && !aiRegex.test(info.nearby)) {
        continue;
      }

      if (!info.isChecked) {
        await humanClick(page, candidate, signal, { timeout: 5000 });
        await humanDelay(300, 500, signal);
      }

      onProgress({
        step: 'Label AI-Generated diaktifkan di Meta Business Suite',
        progressPercent: 84,
        log: 'Sakelar label AI di Meta Business Suite berhasil diaktifkan.',
        level: 'success',
      });
      return true;
    }

    onProgress({
      step: 'Info label AI Meta Business Suite',
      progressPercent: 84,
      log: 'Meta Business Suite web belum menyediakan sakelar label AI manual pada composer Reels (dideteksi otomatis oleh Meta).',
      level: 'info',
    });
    return false;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    return false;
  }
}

export async function publishFacebookViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void,
  scheduledAt?: string | null,
  aiGenerated = false
): Promise<BrowserPublishResult> {
  return publishMetaBusinessSuiteViaBrowser(
    page,
    item,
    videoPath,
    videoFileName,
    mode,
    signal,
    onProgress,
    { facebook: true, instagram: false },
    scheduledAt,
    aiGenerated
  );
}

export async function publishMetaBusinessSuiteViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void,
  targets: MetaBusinessTargets = { facebook: true, instagram: false },
  scheduledAt?: string | null,
  aiGenerated = false
): Promise<BrowserPublishResult> {
  const targetLabel = formatMetaTargetLabel(targets);
  const parsedSchedule = parseScheduledAt(scheduledAt);

  onProgress({
    step: `Membuka Meta Business Suite (${targetLabel})`,
    progressPercent: 12,
    log: `Membuka Meta Business Suite Composer untuk ${targetLabel}.`,
    level: 'info',
  });

  const initialUrl = page.url().toLowerCase();
  if (!initialUrl.includes('business.facebook.com')) {
    await raceWithAbort(
      page.goto('https://business.facebook.com/latest/home', {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      }),
      signal
    );
    await humanDelay(1800, 2800, signal);
  }

  const warmupUrl = page.url().toLowerCase();
  const warmupNeedsAuth =
    warmupUrl.includes('/login') ||
    warmupUrl.includes('checkpoint') ||
    warmupUrl.includes('two_step_verification');

  if (!warmupNeedsAuth) {
    await raceWithAbort(
      page.goto(PLATFORM_STUDIO_URLS.fb_reels, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      }),
      signal
    );
    await humanDelay(2400, 3600, signal);
    await humanIdleDrift(page, signal);
  }

  const currentUrl = page.url().toLowerCase();
  const emailVisible = await page
    .locator('input[name="email"]')
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  if (
    currentUrl.includes('/login') ||
    currentUrl.includes('checkpoint') ||
    currentUrl.includes('two_step_verification') ||
    emailVisible
  ) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login Meta Business Suite',
      progressPercent: 25,
      log: 'Belum login Meta Business Suite (Facebook & Instagram). Silakan login di tab Chrome yang terbuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login Meta Business Suite diperlukan. Silakan login di tab browser yang terbuka.',
    };
  }

  await sweepGeoGuidanceCards(page);

  onProgress({
    step: `Mengunggah video ${videoFileName} ke Meta Business Suite`,
    progressPercent: 30,
    log: `Memasukkan file ${videoFileName} ke Composer Meta Business Suite untuk ${targetLabel}.`,
    level: 'info',
  });

  const mediaSurface = page
    .locator('[data-surface$="lib:bizweb_create_post:media"]')
    .first();

  await raceWithAbort(
    page
      .locator(
        '[data-surface$="lib:bizweb_create_post:media"], input[type="file"][accept*="video"]'
      )
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => {}),
    signal
  );

  let videoUploaded = false;
  if (await mediaSurface.isVisible({ timeout: 2500 }).catch(() => false)) {
    try {
      const [chooser] = await raceWithAbort(
        Promise.all([
          page.waitForEvent('filechooser', { timeout: 15_000 }),
          humanClick(page, mediaSurface.getByRole('button').first(), signal, {
            timeout: 10_000,
          }),
        ]),
        signal
      );
      await chooser.setFiles([videoPath]);
      videoUploaded = true;
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw createAbortError();
      }
      videoUploaded = false;
    }
  }

  if (!videoUploaded) {
    const fallbackInput = await findFileInputAcrossFrames(
      page,
      ['input[type="file"][accept*="video"]', 'input[type="file"]'],
      8000,
      signal
    );
    if (fallbackInput) {
      await fallbackInput.setInputFiles(videoPath);
      videoUploaded = true;
    }
  }

  if (!videoUploaded) {
    await safeBringToFront(page);
    onProgress({
      step: 'Input video Meta Business Suite tidak ditemukan',
      progressPercent: 35,
      log: `Input file video ${targetLabel} tidak ditemukan otomatis. Tab dibiarkan terbuka untuk upload manual.`,
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Input file ${targetLabel} tidak ditemukan otomatis. Silakan pilih ${videoFileName} di tab Meta Business Suite.`,
    };
  }

  onProgress({
    step: 'Menunggu transisi ke Reels Composer',
    progressPercent: 45,
    log: 'Menunggu Meta Business Suite beralih ke antarmuka Create Reel.',
    level: 'info',
  });

  const reelSurface = page
    .locator('[data-surface$="lib:bizweb_create_reel"]')
    .first();
  await raceWithAbort(
    reelSurface.waitFor({ state: 'visible', timeout: 60_000 }),
    signal
  );

  await sweepGeoGuidanceCards(page);

  const footerButtons = page.locator(
    '[data-surface$="bizweb_create_reel:footer"] [role="button"]:not([aria-label])'
  );
  const getPrimaryFooterBtn = async (): Promise<Locator> => {
    // On Step 0/1/2 the rightmost footer button is ALWAYS the primary CTA (Next / Share / Schedule),
    // even when "Give us feedback" and "Back" precede it on Step 2.
    const count = await footerButtons.count().catch(() => 0);
    if (count > 0) {
      return footerButtons.last();
    }
    return page
      .locator('[data-surface$="bizweb_create_reel:footer"] [role="button"]')
      .last();
  };

  onProgress({
    step: `Menunggu proses upload video ${targetLabel} (100%)`,
    progressPercent: 54,
    log: 'Menunggu proses unggah video mencapai 100% atau tombol Next aktif.',
    level: 'info',
  });

  const uploadDeadline = Date.now() + 150_000;
  while (Date.now() < uploadDeadline) {
    throwIfAborted(signal);
    const has100Percent = await reelSurface
      .getByText('100%')
      .first()
      .isVisible({ timeout: 250 })
      .catch(() => false);
    const nextBtnCandidate = await getPrimaryFooterBtn();
    const nextReady = await isLocatorEnabled(nextBtnCandidate);
    if (has100Percent || nextReady) {
      break;
    }
    await abortableWait(600, signal);
  }

  await sweepGeoGuidanceCards(page);

  // Select target channels ("Post to Facebook and Instagram" checkboxes)
  const targetSelection = await selectMetaBusinessPostTargets(
    page,
    reelSurface,
    targets,
    signal,
    onProgress
  );

  // Guard: If Instagram was explicitly requested but no IG account is connected in Meta Business Suite,
  // stop cleanly in awaiting_review instead of publishing to Facebook alone by mistake!
  if (
    targets.instagram &&
    (!targetSelection.foundInstagram || !targetSelection.instagramChecked)
  ) {
    await safeBringToFront(page);
    onProgress({
      step: 'Akun Instagram di Meta Business Suite perlu dicek',
      progressPercent: 62,
      log: 'Checklist Instagram di dropdown "Post to" belum terpilih atau akun IG belum terhubung ke Facebook Page. Tab dibiarkan terbuka untuk pengecekan.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Checklist Instagram di Meta Business Suite belum dapat dicentang otomatis. Pastikan akun Instagram terhubung ke Facebook Page lalu lanjutkan di tab browser.',
    };
  }

  const title = getTitleForItem(item);
  const caption = getCaptionForItem(item);

  const titleInput = page
    .locator(
      '[data-surface$="bizweb_create_reel:left_panel"] input[type="text"]:not([role]):visible'
    )
    .first();
  if (
    (await titleInput.count().catch(() => 0)) > 0 &&
    (await titleInput.isVisible({ timeout: 500 }).catch(() => false))
  ) {
    await fillTextWithInsertFallback(page, titleInput, title, signal);
    await humanDelay(300, 600, signal);
  }

  const captionBox = reelSurface
    .locator('[contenteditable="true"]:visible')
    .first();
  const captionVisible = await captionBox
    .isVisible({ timeout: 8000 })
    .catch(() => false);

  if (captionVisible) {
    onProgress({
      step: `Mengisi deskripsi ${targetLabel}`,
      progressPercent: 68,
      log: `Mengisi deskripsi ${targetLabel} (${caption.length} karakter).`,
      level: 'info',
    });
    await fillTextWithInsertFallback(page, captionBox, caption, signal);
    await humanDelay(400, 800, signal);
  } else {
    const fallbackCaptionBox = page
      .locator('[contenteditable="true"]:visible')
      .first();
    if (await fallbackCaptionBox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fillTextWithInsertFallback(
        page,
        fallbackCaptionBox,
        caption,
        signal
      );
    } else {
      onProgress({
        step: `Kolom deskripsi ${targetLabel} belum terlihat`,
        progressPercent: 68,
        log: `Kolom deskripsi ${targetLabel} tidak ditemukan otomatis. Video sudah diunggah.`,
        level: 'warning',
      });
    }
  }

  // Upload custom 9:16 Cover / Thumbnail via "Upload image" button if cover file exists
  const coverPath = item.autoMetadata.assets.cover.absolutePath;
  const coverFileName =
    item.autoMetadata.assets.cover.fileName ?? 'cover-9x16.jpg';
  if (
    item.autoMetadata.assets.cover.exists &&
    coverPath &&
    fs.existsSync(coverPath)
  ) {
    await uploadFacebookReelCover(
      page,
      reelSurface,
      coverPath,
      coverFileName,
      signal,
      onProgress
    );
    await humanDelay(900, 1500, signal);
  }

  // Advance Reel wizard: Step 0 (Create) -> Step 1 (Edit, if enabled) -> Step 2 (Share).
  // CRITICAL: When Instagram-only is selected (or Edit is skipped by Meta), clicking Next on Step 0
  // jumps STRAIGHT to Step 2 (Share)! Always check whether we are already on the Share step
  // BEFORE clicking Next so we NEVER accidentally click the final Share button early!
  const isAlreadyOnShareStep = async (): Promise<boolean> => {
    const shareNowBtn = reelSurface
      .locator('[role="button"], [role="radio"], [role="tab"], button')
      .filter({ hasText: /^(?:Share now|Bagikan sekarang)$/i })
      .first();
    if (await shareNowBtn.isVisible({ timeout: 350 }).catch(() => false)) {
      return true;
    }
    const primaryBtn = await getPrimaryFooterBtn();
    const ctaText = (await primaryBtn.innerText().catch(() => '')).trim();
    if (
      /^(?:Share|Bagikan|Schedule|Jadwalkan|Publish|Terbitkan)$/i.test(ctaText)
    ) {
      return true;
    }
    return false;
  };

  for (let step = 0; step < 2; step += 1) {
    throwIfAborted(signal);
    if (await isAlreadyOnShareStep()) {
      break;
    }

    const nextBtn = await getPrimaryFooterBtn();
    const ready = await waitForEnabledLocator(nextBtn, 120_000, signal);
    if (!ready) {
      await safeBringToFront(page);
      onProgress({
        step: `Tombol Next ${targetLabel} belum aktif`,
        progressPercent: 78,
        log: `Tombol Next pada langkah ${step + 1} belum aktif dalam batas waktu. Tab dibiarkan terbuka.`,
        level: 'warning',
      });
      return {
        status: 'awaiting_review',
        publishedUrl: null,
        summary: `Tombol Next ${targetLabel} belum aktif. Silakan lanjutkan manual di tab Meta Business Suite.`,
      };
    }

    // Re-check right after waiting in case CTA label transitioned to Share/Schedule
    if (await isAlreadyOnShareStep()) {
      break;
    }

    onProgress({
      step:
        step === 0
          ? `Melanjutkan ke tahap berikutnya (${targetLabel})`
          : `Melanjutkan ke tahap Share ${targetLabel}`,
      progressPercent: step === 0 ? 75 : 82,
      log: `Menekan tombol Next langkah ${step + 1} di Meta Business Suite.`,
      level: 'info',
    });

    const prevStepMarker = await readFacebookActiveStepMarker(page);
    await humanClick(page, nextBtn, signal, { timeout: 10_000 });

    const stepDeadline = Date.now() + 45_000;
    while (Date.now() < stepDeadline) {
      throwIfAborted(signal);
      if (await isAlreadyOnShareStep()) {
        break;
      }
      const currStepMarker = await readFacebookActiveStepMarker(page);
      if (currStepMarker && currStepMarker !== prevStepMarker) {
        break;
      }
      await abortableWait(350, signal);
    }

    await sweepGeoGuidanceCards(page);
    await humanDelay(400, 750, signal);
  }

  // Future-proof non-fatal AI label toggle check on Meta Business Suite Step 3
  if (aiGenerated) {
    await configureMetaAiLabel(page, reelSurface, signal, onProgress);
  }

  // If native scheduling was requested, select "Schedule" on Step 3 and fill all date/time rows
  if (parsedSchedule) {
    const scheduleOk = await configureMetaBusinessSchedule(
      page,
      reelSurface,
      parsedSchedule,
      targetLabel,
      signal,
      onProgress
    );
    if (!scheduleOk && mode === 'publish') {
      await safeBringToFront(page);
      return {
        status: 'awaiting_review',
        publishedUrl: null,
        summary: `Jadwal ${targetLabel} (${parsedSchedule.displayLabel}) belum dapat diisi otomatis. Tab dibiarkan terbuka agar Anda dapat melanjutkannya manual.`,
      };
    }
  }

  const actionVerb = parsedSchedule ? 'Schedule' : 'Share';

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: parsedSchedule
        ? `Siap direview jadwal ${targetLabel} (${parsedSchedule.displayLabel})`
        : `Siap direview di tahap Share ${targetLabel}`,
      progressPercent: 85,
      log: parsedSchedule
        ? `${targetLabel} sudah disetel jadwalnya (${parsedSchedule.displayLabel}). Silakan review lalu klik Schedule.`
        : `${targetLabel} sudah sampai di tahap Share (Langkah 3). Silakan review lalu klik Share / Bagikan.`,
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: parsedSchedule
        ? `Jadwal ${targetLabel} (${parsedSchedule.displayLabel}) sudah disiapkan di Meta Business Suite. Cek tab browser untuk konfirmasi akhir.`
        : `Video, cover, dan deskripsi ${targetLabel} sudah siap di langkah Share Meta Business Suite. Cek tab browser untuk konfirmasi akhir.`,
    };
  }

  const shareBtn = await getPrimaryFooterBtn();
  const shareReady = await waitForEnabledLocator(shareBtn, 120_000, signal);
  if (!shareReady) {
    await safeBringToFront(page);
    onProgress({
      step: `Tombol ${actionVerb} ${targetLabel} belum siap`,
      progressPercent: 85,
      log: `Tombol ${actionVerb} ${targetLabel} belum aktif. Tab dibiarkan terbuka untuk review manual.`,
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Tombol ${actionVerb} ${targetLabel} belum siap diklik otomatis. Video dan deskripsi tetap terbuka di tab browser.`,
    };
  }

  onProgress({
    step: parsedSchedule
      ? `Menjadwalkan ${targetLabel} (${parsedSchedule.displayLabel})`
      : `Mempublikasikan ${targetLabel}`,
    progressPercent: 92,
    log: `Menekan tombol ${actionVerb} untuk ${targetLabel} dan menunggu konfirmasi GraphQL Meta Business Suite.`,
    level: 'info',
  });

  const graphqlPromise = page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/api/graphql')) return false;
      const postData = resp.request().postData() ?? '';
      return (
        postData.includes('BusinessComposerStoryCreationMutation') ||
        postData.includes('ComposerStoryCreation') ||
        postData.includes('CreateReel') ||
        postData.includes('Schedule')
      );
    },
    { timeout: 90_000 }
  );

  await humanClick(page, shareBtn, signal, { timeout: 10_000 });
  await raceWithAbort(graphqlPromise, signal);

  const doneDialog = page
    .locator('[role="dialog"][aria-labelledby][tabindex="-1"]')
    .first();
  try {
    await raceWithAbort(
      doneDialog.waitFor({ state: 'visible', timeout: 60_000 }),
      signal
    );
    const closeBtn = doneDialog
      .locator('[role="button"][aria-label], button')
      .last();
    if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await humanClick(page, closeBtn, signal, { timeout: 3000 }).catch(
        () => {}
      );
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    // Completion dialog may auto-close or redirect
  }

  onProgress({
    step: parsedSchedule
      ? `Terjadwal di ${targetLabel} (${parsedSchedule.displayLabel})`
      : `Terpublikasi di ${targetLabel}`,
    progressPercent: 100,
    log: parsedSchedule
      ? `${targetLabel} berhasil dijadwalkan untuk ${parsedSchedule.displayLabel} via Meta Business Suite.`
      : `${targetLabel} berhasil dipublikasikan via Meta Business Suite.`,
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: null,
    summary: parsedSchedule
      ? `Berhasil menjadwalkan ${targetLabel} (${parsedSchedule.displayLabel}) via Meta Business Suite.`
      : `Berhasil publish ${targetLabel} via Meta Business Suite.`,
  };
}

async function configureYouTubeSchedule(
  page: Page,
  schedule: ParsedScheduleParts,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  // YouTube Studio uses 15-minute dropdown intervals (12:00 AM, 12:15 AM, 12:30 AM, 12:45 AM...)
  const snapped = snapScheduleMinutes(schedule, 15);

  try {
    onProgress({
      step: `Mengatur jadwal YouTube (${snapped.displayLabel})`,
      progressPercent: 72,
      log: `Membuka panel Schedule di YouTube Studio untuk ${snapped.displayLabel}.`,
      level: 'info',
    });

    // Expand the "Schedule" box on Visibility step if #datepicker-trigger is not yet visible
    const dateTrigger = page.locator('#datepicker-trigger').first();
    const alreadyExpanded = await dateTrigger
      .isVisible({ timeout: 800 })
      .catch(() => false);

    if (!alreadyExpanded) {
      const expandClicked = await tryClickAny(
        page,
        [
          '#second-container-expand-button',
          'ytcp-button#second-container-expand-button',
          '#schedule-radio-button',
          'tp-yt-paper-radio-button[name="SCHEDULE"]',
          '#second-container',
        ],
        6000,
        signal
      );

      if (!expandClicked) {
        const scheduleHeading = page
          .locator('div, span, h3')
          .filter({ hasText: /^(?:Schedule|Jadwalkan)$/i })
          .first();
        if (await scheduleHeading.isVisible({ timeout: 2000 }).catch(() => false)) {
          await scheduleHeading.click({ timeout: 5000 }).catch(() => {});
        }
      }
      await humanDelay(450, 750, signal);
    }

    const triggerVisible = await dateTrigger
      .isVisible({ timeout: 6000 })
      .catch(() => false);
    if (!triggerVisible) {
      onProgress({
        step: 'Pemilih tanggal YouTube Schedule tidak muncul',
        progressPercent: 74,
        log: 'Kolom tanggal #datepicker-trigger di YouTube Studio tidak terlihat.',
        level: 'warning',
      });
      return false;
    }

    // 1. Set Date via #datepicker-trigger -> opened ytcp-date-picker input
    const currentDateSample = (
      await dateTrigger.innerText().catch(() => 'Nov 26, 2026')
    ).trim();
    const formattedDate = formatDateMatchingSample(currentDateSample, snapped);

    await humanClick(page, dateTrigger, signal, { timeout: 6000 });
    await abortableWait(400, signal);

    const dateInput = page
      .locator(
        'ytcp-date-picker input, tp-yt-paper-dialog input[type="text"], ytcp-date-picker #textbox input'
      )
      .first();
    if (await dateInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      await humanClick(page, dateInput, signal, { timeout: 4000 });
      await humanDelay(140, 260, signal);
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(70, 140, signal);
      await page.keyboard.press('Backspace');
      await humanDelay(100, 180, signal);
      await humanTypeText(page, formattedDate, signal);
      await humanDelay(160, 280, signal);
      await page.keyboard.press('Enter');
      await humanDelay(350, 650, signal);
    } else {
      onProgress({
        step: 'Input tanggal YouTube datepicker tidak ditemukan',
        progressPercent: 74,
        log: 'Input teks di dalam ytcp-date-picker tidak terdeteksi.',
        level: 'warning',
      });
      return false;
    }

    // 2. Set Time via #time-of-day-container input (matches 12h AM/PM or 24h locale automatically)
    const timeInput = page
      .locator(
        '#time-of-day-container input, ytcp-form-input-container#time-of-day-container input, #time-of-day-trigger input'
      )
      .first();
    if (await timeInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const currentTimeSample = (
        await timeInput.inputValue().catch(() => '12:00 AM')
      ).trim();
      const formattedTime = formatTimeMatchingSample(
        currentTimeSample || '12:00 AM',
        snapped.hour,
        snapped.minute
      );

      await humanClick(page, timeInput, signal, { timeout: 5000 });
      await humanDelay(180, 320, signal);
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await humanDelay(70, 140, signal);
      await page.keyboard.press('Backspace');
      await humanDelay(100, 180, signal);
      await humanTypeText(page, formattedTime, signal);
      await humanDelay(280, 480, signal);

      // Click exact matching option in YouTube's 15-min dropdown if rendered
      // Note: YouTube uses narrow no-break space (\u202f) between time and AM/PM, so match with \s+
      const timePattern = formattedTime
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
      const matchingOption = page
        .locator('tp-yt-paper-item:visible, tp-yt-paper-listbox [role="option"]:visible')
        .filter({
          hasText: new RegExp(`^${timePattern}$`, 'i'),
        })
        .first();
      if (await matchingOption.isVisible({ timeout: 800 }).catch(() => false)) {
        await humanClick(page, matchingOption, signal, { timeout: 4000 }).catch(
          () => {}
        );
      } else {
        await page.keyboard.press('Enter');
      }
      await humanDelay(300, 550, signal);
    }

    onProgress({
      step: `Jadwal YouTube disetel ke ${snapped.displayLabel}`,
      progressPercent: 76,
      log: `Tanggal (${formattedDate}) dan jam jadwal (${snapped.displayLabel}) berhasil disetel di YouTube Studio.`,
      level: 'success',
    });
    return true;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengatur jadwal YouTube Studio',
      progressPercent: 74,
      log: `Pengaturan jadwal YouTube terkendala: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

async function configureYouTubeAiDisclosure(
  page: Page,
  aiGenerated: boolean,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  const targetRadioName = aiGenerated
    ? 'VIDEO_HAS_ALTERED_CONTENT_YES'
    : 'VIDEO_HAS_ALTERED_CONTENT_NO';

  try {
    onProgress({
      step: aiGenerated
        ? 'Mengaktifkan label Altered Content (AI) YouTube'
        : 'Menyetel Altered Content YouTube (Non-AI)',
      progressPercent: 64,
      log: `Membuka Show more untuk menyetel Altered content = ${aiGenerated ? 'Yes (AI-Generated)' : 'No'}.`,
      level: 'info',
    });

    const targetRadio = page
      .locator(`tp-yt-paper-radio-button[name="${targetRadioName}"]`)
      .first();

    if (!(await targetRadio.isVisible({ timeout: 800 }).catch(() => false))) {
      const showMoreBtn = page
        .locator('#toggle-button, ytcp-button#toggle-button')
        .first();
      if (await showMoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await humanClick(page, showMoreBtn, signal, { timeout: 5000 });
        await humanDelay(600, 900, signal);
      }
    }

    if (await targetRadio.isVisible({ timeout: 4000 }).catch(() => false)) {
      await humanClick(page, targetRadio, signal, { timeout: 5000 });
      await humanDelay(300, 500, signal);

      // Verify Polymer tp-yt-paper-radio-button actually toggled aria-checked="true"
      const isNowChecked =
        (await targetRadio.getAttribute('aria-checked').catch(() => null)) ===
        'true';
      if (!isNowChecked) {
        const innerRadio = targetRadio.locator('#radioContainer').first();
        if (await innerRadio.isVisible({ timeout: 1000 }).catch(() => false)) {
          await humanClick(page, innerRadio, signal, {
            timeout: 3000,
            force: true,
          }).catch(() => {});
          await humanDelay(250, 400, signal);
        } else {
          await targetRadio.click({ force: true, timeout: 3000 }).catch(() => {});
          await humanDelay(250, 400, signal);
        }
      }

      const verified =
        (await targetRadio.getAttribute('aria-checked').catch(() => null)) ===
        'true';
      onProgress({
        step: aiGenerated
          ? 'Label Altered Content (AI) YouTube aktif'
          : 'Altered Content YouTube disetel ke No',
        progressPercent: 66,
        log: `Opsi Altered content YouTube Studio (${targetRadioName}) ${verified ? 'terkonfirmasi aktif' : 'sudah diklik'}.`,
        level: verified ? 'success' : 'warning',
      });
      return verified;
    }

    onProgress({
      step: 'Opsi Altered Content YouTube tidak terlihat',
      progressPercent: 65,
      log: 'Bagian Altered content (#altered-content) tidak ditemukan di halaman Details YouTube Studio.',
      level: 'warning',
    });
    return false;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengatur label AI YouTube (non-fatal)',
      progressPercent: 65,
      log: `Pengaturan Altered content YouTube dilewati: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

async function uploadYouTubeCover(
  page: Page,
  coverPath: string,
  coverFileName: string,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  try {
    onProgress({
      step: `Memasang cover ${coverFileName} di YouTube Studio`,
      progressPercent: 58,
      log: `Mencari bagian Thumbnail YouTube Studio untuk mengunggah cover ${coverFileName}.`,
      level: 'info',
    });

    const dialogBody = page.locator('#scrollable-content, ytcp-uploads-details').first();
    if (await dialogBody.isVisible({ timeout: 1000 }).catch(() => false)) {
      await humanScrollWheel(page, 320, signal, dialogBody);
      await humanDelay(450, 800, signal);
    }

    const uploadBtnSelectors = [
      'ytcp-thumbnail-editor #select-button',
      'ytcp-still-editor #select-button',
      'ytcp-video-thumbnail-with-info #select-button',
      'ytcp-thumbnail-uploader #select-button',
      'button:has-text("Upload file")',
      'button:has-text("Upload thumbnail")',
      'button:has-text("Unggah file")',
      'button:has-text("Unggah thumbnail")',
    ];

    // Wait up to 6s for thumbnail section to finish rendering
    const uploadBtn = await findFirstVisibleLocator(
      page,
      uploadBtnSelectors,
      6000,
      signal
    );

    if (uploadBtn) {
      const enabled = await isLocatorEnabled(uploadBtn);
      if (!enabled) {
        onProgress({
          step: 'Thumbnail kustom dinonaktifkan YouTube untuk Shorts ini',
          progressPercent: 60,
          log: 'Tombol Upload thumbnail di YouTube Studio berstatus nonaktif (bawaan YouTube web untuk Shorts / channel belum verifikasi). Melanjutkan tanpa mengubah thumbnail.',
          level: 'warning',
        });
        return false;
      }

      const chooserPromise = page
        .waitForEvent('filechooser', { timeout: 5000 })
        .catch(() => null);
      await humanClick(page, uploadBtn, signal, { timeout: 6000 });
      const chooser = await raceWithAbort(chooserPromise, signal);
      if (chooser) {
        await chooser.setFiles([coverPath]);
        await humanDelay(1400, 2200, signal);
        onProgress({
          step: `Cover ${coverFileName} berhasil dipasang di YouTube Studio`,
          progressPercent: 60,
          log: `Cover thumbnail ${coverFileName} berhasil diunggah melalui tombol Upload thumbnail YouTube.`,
          level: 'success',
        });
        return true;
      }
    }

    // Fallback: direct file input (note: #file-loader IS the <input type="file"> itself!)
    const thumbInput = page
      .locator(
        'input#file-loader[type="file"], ytcp-video-thumbnail-with-info input[type="file"], ytcp-still-editor input[type="file"], ytcp-thumbnail-uploader input[type="file"], #still-picker input[type="file"], ytcp-uploads-details input[type="file"][accept*="image"]'
      )
      .first();

    if ((await thumbInput.count().catch(() => 0)) > 0) {
      const isDisabled = await thumbInput.isDisabled().catch(() => false);
      if (isDisabled) {
        onProgress({
          step: 'Input thumbnail YouTube nonaktif untuk Shorts ini',
          progressPercent: 60,
          log: 'Input thumbnail YouTube Studio dinonaktifkan untuk video Shorts ini (batasan bawaan YouTube web). Melanjutkan...',
          level: 'warning',
        });
        return false;
      }
      await thumbInput.setInputFiles(coverPath);
      await humanDelay(1400, 2200, signal);
      onProgress({
        step: `Cover ${coverFileName} berhasil dipasang di YouTube Studio`,
        progressPercent: 60,
        log: `Cover thumbnail ${coverFileName} berhasil dipasang di YouTube Studio.`,
        level: 'success',
      });
      return true;
    }

    onProgress({
      step: 'Bagian thumbnail YouTube tidak ditemukan',
      progressPercent: 60,
      log: 'Input cover thumbnail YouTube Studio tidak tersedia pada halaman Details (normal untuk YouTube Shorts versi web). Melanjutkan...',
      level: 'warning',
    });
    return false;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Upload cover YouTube dilewati (non-fatal)',
      progressPercent: 60,
      log: `Upload cover YouTube Studio dilewati: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

export async function publishYouTubeViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void,
  scheduledAt?: string | null,
  aiGenerated = false
): Promise<BrowserPublishResult> {
  const parsedSchedule = parseScheduledAt(scheduledAt);
  onProgress({
    step: 'Membuka YouTube Upload',
    progressPercent: 12,
    log: 'Membuka https://www.youtube.com/upload di tab browser lokal.',
    level: 'info',
  });

  await raceWithAbort(
    page.goto('https://www.youtube.com/upload', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    }),
    signal
  );
  await humanDelay(2400, 3500, signal);
  await humanIdleDrift(page, signal);

  const currentUrl = page.url().toLowerCase();
  if (
    currentUrl.includes('accounts.google.com') ||
    currentUrl.includes('/signin') ||
    currentUrl.includes('servicelogin')
  ) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login YouTube Studio',
      progressPercent: 25,
      log: 'Belum login Google / YouTube Studio. Silakan login di tab Chrome yang terbuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login Google / YouTube Studio diperlukan. Silakan login di tab browser yang terbuka lalu jalankan ulang.',
    };
  }

  onProgress({
    step: `Mengunggah video ${videoFileName} ke YouTube`,
    progressPercent: 28,
    log: `Mencari input file video dan mengunggah ${videoFileName}.`,
    level: 'info',
  });

  const fileInput = page.locator('input[type="file"]').first();
  try {
    await raceWithAbort(
      fileInput.waitFor({ state: 'attached', timeout: 45_000 }),
      signal
    );
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    await safeBringToFront(page);
    onProgress({
      step: 'Input file YouTube tidak ditemukan',
      progressPercent: 35,
      log: 'Input file upload YouTube tidak ditemukan otomatis. Tab dibiarkan terbuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Input file upload YouTube tidak ditemukan. Silakan pilih ${videoFileName} secara manual di tab YouTube Studio.`,
    };
  }

  await fileInput.setInputFiles(videoPath);

  await raceWithAbort(
    page
      .locator('#title-textarea')
      .first()
      .waitFor({ state: 'visible', timeout: 90_000 }),
    signal
  );

  const title = getTitleForItem(item).slice(0, 100);
  const caption = getCaptionForItem(item);

  onProgress({
    step: 'Mengisi judul dan deskripsi YouTube',
    progressPercent: 52,
    log: `Mengisi judul (${title.length} karakter) dan deskripsi YouTube.`,
    level: 'info',
  });

  await fillYouTubeTextbox(
    page,
    page.locator('#title-textarea #textbox').first(),
    title,
    signal
  );
  await humanDelay(400, 750, signal);

  await fillYouTubeTextbox(
    page,
    page.locator('#description-textarea #textbox').first(),
    caption,
    signal
  );
  await humanDelay(400, 750, signal);

  // Optional cover / thumbnail upload (non-fatal)
  const coverPath = getCoverPathForItem(item);
  if (coverPath) {
    const coverFileName =
      item.autoMetadata.assets.cover.fileName ?? 'cover-9x16.jpg';
    await uploadYouTubeCover(page, coverPath, coverFileName, signal, onProgress);
  }

  await tryClickAny(
    page,
    [
      'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
      'input[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
      'tp-yt-paper-radio-button:has-text("No, it\'s not made for kids")',
      'tp-yt-paper-radio-button:has-text("Tidak, video ini tidak dibuat untuk anak-anak")',
    ],
    5000,
    signal
  );

  await configureYouTubeAiDisclosure(page, aiGenerated, signal, onProgress);

  onProgress({
    step: 'Menuju tahap Visibilitas YouTube',
    progressPercent: 68,
    log: 'Melanjutkan langkah wizard menuju pemilihan Visibilitas.',
    level: 'info',
  });

  for (let stepIdx = 0; stepIdx < 4; stepIdx += 1) {
    throwIfAborted(signal);
    const publicRadioVisible = await page
      .locator('tp-yt-paper-radio-button[name="PUBLIC"]')
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (publicRadioVisible) {
      break;
    }

    const clickedNext = await tryClickAny(
      page,
      ['#next-button', 'ytcp-button#next-button'],
      5000,
      signal
    );
    if (!clickedNext) break;
    await humanDelay(700, 1200, signal);
  }

  let scheduleConfigured = false;
  if (parsedSchedule) {
    scheduleConfigured = await configureYouTubeSchedule(
      page,
      parsedSchedule,
      signal,
      onProgress
    );
    if (!scheduleConfigured && mode === 'publish') {
      await safeBringToFront(page);
      return {
        status: 'awaiting_review',
        publishedUrl: await extractYouTubeVideoUrl(page),
        summary: `Jadwal YouTube (${parsedSchedule.displayLabel}) belum dapat diisi otomatis. Tab tetap dibuka agar Anda bisa menyelesaikannya.`,
      };
    }
  } else {
    const targetVisibility = mode === 'review' ? 'UNLISTED' : 'PUBLIC';
    const visibilitySelected = await tryClickAny(
      page,
      [`tp-yt-paper-radio-button[name="${targetVisibility}"]`],
      6000,
      signal
    );

    if (!visibilitySelected && mode === 'publish') {
      await safeBringToFront(page);
      onProgress({
        step: 'Opsi Visibilitas Public tidak ditemukan',
        progressPercent: 85,
        log: 'Opsi Visibilitas Public tidak terdeteksi otomatis. Tab dibiarkan terbuka untuk review manual.',
        level: 'warning',
      });
      return {
        status: 'awaiting_review',
        publishedUrl: await extractYouTubeVideoUrl(page),
        summary:
          'Tidak bisa memilih opsi Public secara otomatis di YouTube Studio. Tab tetap dibuka agar Anda bisa menyelesaikannya.',
      };
    }
  }

  onProgress({
    step: 'Menunggu proses upload YouTube selesai (100%)',
    progressPercent: 78,
    log: 'Memantau progres unggahan video di YouTube Studio.',
    level: 'info',
  });

  const progressSelector =
    '.progress-label, span.progress-label, ytcp-video-upload-progress';
  const completionRegex =
    /processing|checks|complete|finished|memproses|pemeriksaan|selesai|处理|检查/i;
  const uploadingRegex = /uploading|mengunggah|上传/i;
  const progressDeadline = Date.now() + 600_000;
  let emptyChecks = 0;

  while (Date.now() < progressDeadline) {
    throwIfAborted(signal);
    const texts = await page
      .locator(progressSelector)
      .allInnerTexts()
      .catch(() => [] as string[]);
    const combined = texts
      .map((t) => t.trim())
      .filter(Boolean)
      .join(' ');

    if (!combined) {
      emptyChecks += 1;
      if (emptyChecks >= 4) {
        break;
      }
    } else {
      emptyChecks = 0;
      if (completionRegex.test(combined)) {
        break;
      }
      if (!combined.includes('%') && !uploadingRegex.test(combined)) {
        break;
      }
    }

    await abortableWait(1500, signal);
  }

  const detectedUrl = await extractYouTubeVideoUrl(page);

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: parsedSchedule
        ? `Siap direview jadwal YouTube (${parsedSchedule.displayLabel})`
        : 'Siap direview di YouTube Studio',
      progressPercent: 85,
      log: parsedSchedule
        ? `Video, judul, deskripsi, dan jadwal (${parsedSchedule.displayLabel}) sudah siap di YouTube Studio. Silakan review lalu klik Schedule.`
        : 'Video, judul, deskripsi, dan visibilitas (Unlisted) sudah siap di tab YouTube Studio. Silakan review lalu klik Save / Publish.',
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: detectedUrl,
      summary: parsedSchedule
        ? `Jadwal YouTube (${parsedSchedule.displayLabel}) sudah disiapkan di YouTube Studio. Cek tab browser untuk konfirmasi akhir.`
        : 'Video dan caption sudah disiapkan di YouTube Studio. Cek tab browser untuk konfirmasi akhir.',
    };
  }

  onProgress({
    step: parsedSchedule
      ? `Menjadwalkan YouTube Shorts (${parsedSchedule.displayLabel})`
      : 'Menyelesaikan publikasi YouTube Shorts',
    progressPercent: 92,
    log: parsedSchedule
      ? 'Menekan tombol Schedule (#done-button) di YouTube Studio.'
      : 'Menekan tombol Publish (#done-button) di YouTube Studio.',
    level: 'info',
  });

  const doneClicked = await tryClickAny(
    page,
    ['#done-button', 'ytcp-button#done-button'],
    8000,
    signal
  );

  if (!doneClicked) {
    await safeBringToFront(page);
    onProgress({
      step: parsedSchedule
        ? 'Tombol Schedule YouTube belum siap'
        : 'Tombol Publish YouTube belum siap',
      progressPercent: 85,
      log: parsedSchedule
        ? 'Tombol Schedule YouTube belum dapat diklik otomatis. Tab dibiarkan terbuka untuk review manual.'
        : 'Tombol Publish YouTube belum dapat diklik otomatis. Tab dibiarkan terbuka untuk review manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: detectedUrl,
      summary: parsedSchedule
        ? 'Tombol Schedule YouTube Studio belum siap diklik. Silakan klik Schedule secara manual di tab browser.'
        : 'Tombol Publish YouTube Studio belum siap diklik. Silakan klik Publish secara manual di tab browser.',
    };
  }

  await abortableWait(4000, signal);
  const finalUrl = (await extractYouTubeVideoUrl(page)) ?? detectedUrl;

  onProgress({
    step: parsedSchedule
      ? `Terjadwal di YouTube Studio (${parsedSchedule.displayLabel})`
      : 'Terpublikasi di YouTube Studio',
    progressPercent: 100,
    log: parsedSchedule
      ? finalUrl
        ? `Video berhasil dijadwalkan di YouTube Studio (${parsedSchedule.displayLabel}): ${finalUrl}`
        : `Video berhasil dijadwalkan di YouTube Studio (${parsedSchedule.displayLabel}).`
      : finalUrl
        ? `Video berhasil dipublikasikan di YouTube Studio: ${finalUrl}`
        : 'Video berhasil dipublikasikan melalui YouTube Studio.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: finalUrl,
    summary: parsedSchedule
      ? finalUrl
        ? `Berhasil menjadwalkan via YouTube Studio (${parsedSchedule.displayLabel}): ${finalUrl}`
        : `Berhasil menjadwalkan via YouTube Studio (${parsedSchedule.displayLabel}).`
      : finalUrl
        ? `Berhasil publish via YouTube Studio: ${finalUrl}`
        : 'Berhasil publish via YouTube Studio.',
  };
}

async function configureTikTokSchedule(
  page: Page,
  root: Page | FrameLocator,
  schedule: ParsedScheduleParts,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  // TikTok Studio uses 5-minute increments (00, 05, 10, ..., 55)
  const snapped = snapScheduleMinutes(schedule, 5);

  try {
    onProgress({
      step: `Mengatur jadwal TikTok (${snapped.displayLabel})`,
      progressPercent: 72,
      log: `Memilih opsi Schedule di TikTok Studio untuk ${snapped.displayLabel}.`,
      level: 'info',
    });

    // 1. Click "Schedule" radio under "When to post"
    const scheduleCandidates: Locator[] = [
      root.getByLabel(/^(?:Schedule|Jadwalkan)$/i).first(),
      root
        .locator('label, [role="radio"]')
        .filter({ hasText: /^(?:Schedule|Jadwalkan)$/i })
        .first(),
      page.getByLabel(/^(?:Schedule|Jadwalkan)$/i).first(),
    ];

    let scheduleRadio: Locator | null = null;
    for (const candidate of scheduleCandidates) {
      if (await candidate.isVisible({ timeout: 2000 }).catch(() => false)) {
        scheduleRadio = candidate;
        break;
      }
    }

    if (!scheduleRadio) {
      onProgress({
        step: 'Radio Schedule TikTok tidak ditemukan',
        progressPercent: 74,
        log: 'Opsi Schedule di bawah "When to post" TikTok Studio tidak terlihat.',
        level: 'warning',
      });
      return false;
    }

    await humanClick(page, scheduleRadio, signal, {
      timeout: 6000,
      force: true,
    });
    await humanDelay(600, 950, signal);

    // 2. Handle first-time confirmation modal: "Allow your video to be saved for scheduled posting?" -> [Allow]
    const allowClickedInRoot = await tryClickAny(
      root,
      [
        'div.TUXButton-content:has-text("Allow")',
        'button:has-text("Allow")',
        'div.TUXButton-content:has-text("Izinkan")',
        'button:has-text("Izinkan")',
      ],
      2500,
      signal,
      page
    );
    if (!allowClickedInRoot) {
      await tryClickAny(
        page,
        [
          'div.TUXButton-content:has-text("Allow")',
          'button:has-text("Allow")',
          'div.TUXButton-content:has-text("Izinkan")',
          'button:has-text("Izinkan")',
        ],
        1500,
        signal
      );
    }
    await humanDelay(450, 750, signal);

    // 3. Locate date & time picker boxes (div.scheduled-picker -> nth(0) Time, nth(1) Date)
    const scheduledPicker = root.locator('div.scheduled-picker').first();
    const pickerVisible = await scheduledPicker
      .isVisible({ timeout: 6000 })
      .catch(() => false);
    if (!pickerVisible) {
      onProgress({
        step: 'Picker tanggal/jam TikTok tidak muncul',
        progressPercent: 74,
        log: 'Elemen div.scheduled-picker TikTok Studio tidak muncul setelah memilih Schedule.',
        level: 'warning',
      });
      return false;
    }

    const inputBoxes = scheduledPicker.locator('div.TUXInputBox');
    if ((await inputBoxes.count().catch(() => 0)) < 2) {
      onProgress({
        step: 'Box tanggal & jam TikTok tidak lengkap',
        progressPercent: 74,
        log: 'Box pilihan waktu & tanggal di TikTok Studio tidak lengkap.',
        level: 'warning',
      });
      return false;
    }

    // 4. Set Date (right box: nth(1), e.g., "2026-11-25")
    await humanClick(page, inputBoxes.nth(1), signal, { timeout: 6000 });
    await abortableWait(450, signal);

    const calendarWrapper = root.locator('div.calendar-wrapper').first();
    if (await calendarWrapper.isVisible({ timeout: 5000 }).catch(() => false)) {
      for (let nav = 0; nav < 14; nav += 1) {
        throwIfAborted(signal);
        const monthText = (
          await calendarWrapper
            .locator('span.month-title')
            .first()
            .innerText()
            .catch(() => '')
        ).trim();
        const yearText = (
          await calendarWrapper
            .locator('span.year-title')
            .first()
            .innerText()
            .catch(() => '')
        ).trim();

        const calMonth = parseMonthWordToNumber(monthText);
        const yearMatch = `${yearText} ${monthText}`.match(/\b(20\d{2})\b/);
        const calYear = yearMatch ? Number(yearMatch[1]) : snapped.year;

        if (!calMonth) break;
        const currentAbs = calYear * 12 + calMonth;
        const targetAbs = snapped.year * 12 + snapped.month;

        if (currentAbs === targetAbs) {
          break;
        }
        const arrows = calendarWrapper.locator('span.arrow');
        if (currentAbs < targetAbs) {
          await arrows.last().click({ timeout: 4000 }).catch(() => {});
        } else {
          await arrows.first().click({ timeout: 4000 }).catch(() => {});
        }
        await abortableWait(300, signal);
      }

      const validDays = calendarWrapper.locator('span.day.valid');
      const dayCount = await validDays.count().catch(() => 0);
      let dayClicked = false;
      for (let i = 0; i < dayCount; i += 1) {
        const dayEl = validDays.nth(i);
        const text = (await dayEl.innerText().catch(() => '')).trim();
        if (text === String(snapped.day)) {
          await humanClick(page, dayEl, signal, { timeout: 4000 });
          dayClicked = true;
          break;
        }
      }
      if (!dayClicked) {
        onProgress({
          step: `Tanggal ${snapped.day} tidak aktif di kalender TikTok`,
          progressPercent: 75,
          log: `Tanggal ${snapped.day} tidak dapat dipilih (pastikan jadwal antara 20 menit hingga 10 hari ke depan).`,
          level: 'warning',
        });
        return false;
      }
      await humanDelay(350, 550, signal);
    }

    // 5. Set Time (left box: nth(0), e.g., "18:25")
    await humanClick(page, inputBoxes.nth(0), signal, { timeout: 6000 });
    await abortableWait(500, signal);

    const hourStr = String(snapped.hour).padStart(2, '0');
    const minStr = String(snapped.minute).padStart(2, '0');

    const hourOption = root
      .locator('span.tiktok-timepicker-left')
      .filter({ hasText: new RegExp(`^${hourStr}$`) })
      .first();
    if (await hourOption.isVisible({ timeout: 4000 }).catch(() => false)) {
      await humanClick(page, hourOption, signal, { timeout: 5000 });
      await abortableWait(450, signal);
    } else {
      onProgress({
        step: `Jam ${hourStr} tidak ditemukan di timepicker TikTok`,
        progressPercent: 75,
        log: `Opsi jam ${hourStr} tidak ditemukan di timepicker TikTok Studio.`,
        level: 'warning',
      });
      return false;
    }

    const minOption = root
      .locator('span.tiktok-timepicker-right')
      .filter({ hasText: new RegExp(`^${minStr}$`) })
      .first();
    if (await minOption.isVisible({ timeout: 4000 }).catch(() => false)) {
      await humanClick(page, minOption, signal, { timeout: 5000 });
      await abortableWait(400, signal);
    } else {
      onProgress({
        step: `Menit ${minStr} tidak ditemukan di timepicker TikTok`,
        progressPercent: 75,
        log: `Opsi menit ${minStr} tidak ditemukan di timepicker TikTok Studio.`,
        level: 'warning',
      });
      return false;
    }

    // Close timepicker popup cleanly
    await page.keyboard.press('Escape').catch(() => {});
    await humanDelay(350, 550, signal);

    onProgress({
      step: `Jadwal TikTok disetel ke ${snapped.displayLabel}`,
      progressPercent: 77,
      log: `Jadwal TikTok Studio berhasil disetel ke ${snapped.displayLabel}.`,
      level: 'success',
    });
    return true;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengatur jadwal TikTok Studio',
      progressPercent: 75,
      log: `Pengaturan jadwal TikTok terkendala: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

async function configureTikTokAiLabel(
  page: Page,
  root: Page | FrameLocator,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  try {
    onProgress({
      step: 'Mengaktifkan label AI-generated content TikTok',
      progressPercent: 69,
      log: 'Membuka Show more di TikTok Studio untuk mengaktifkan label AI-generated content.',
      level: 'info',
    });

    const AI_LABEL_REGEX = /^(?:AI-generated content|Konten buatan AI)$/i;
    const aiLabelVisible = await root
      .getByText(AI_LABEL_REGEX)
      .first()
      .isVisible({ timeout: 800 })
      .catch(() => false);

    if (!aiLabelVisible) {
      const showMoreBtn = root
        .locator('button, div[role="button"], span')
        .filter({ hasText: /^(?:Show more|Tampilkan lebih banyak)$/i })
        .first();
      if (await showMoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await humanClick(page, showMoreBtn, signal, { timeout: 5000 });
        await humanDelay(650, 950, signal);
      }
    }

    // Locate the Switch__content inside the row containing "AI-generated content"
    // Verified live DOM: <div class="Switch__content Switch__content--checked-false" aria-checked="false" data-state="unchecked">
    const aiRow = root
      .locator('div, section, label')
      .filter({ hasText: /^(?:AI-generated content|Konten buatan AI)/i })
      .filter({ has: root.locator('.Switch__content, [role="switch"]') })
      .last();

    const switchTarget = aiRow
      .locator('.Switch__content, [role="switch"]')
      .first();

    if (await switchTarget.isVisible({ timeout: 4000 }).catch(() => false)) {
      const alreadyOn =
        (await switchTarget.getAttribute('aria-checked').catch(() => null)) ===
          'true' ||
        (await switchTarget.getAttribute('data-state').catch(() => null)) ===
          'checked';

      if (!alreadyOn) {
        await humanClick(page, switchTarget, signal, {
          timeout: 5000,
          force: true,
        });
        await humanDelay(500, 800, signal);

        // Handle optional TikTok disclosure confirmation modal if shown
        const confirmSelectors = [
          'div.TUXButton-content:has-text("Turn on")',
          'button:has-text("Turn on")',
          'div.TUXButton-content:has-text("Aktifkan")',
          'button:has-text("Aktifkan")',
          'button:has-text("Confirm")',
          'button:has-text("Allow")',
        ];
        const clickedInRoot = await tryClickAny(
          root,
          confirmSelectors,
          1500,
          signal,
          page
        );
        if (!clickedInRoot) {
          await tryClickAny(page, confirmSelectors, 1000, signal);
        }
        await abortableWait(300, signal);
      }

      onProgress({
        step: 'Label AI-generated content TikTok aktif',
        progressPercent: 71,
        log: 'Sakelar AI-generated content di TikTok Studio berhasil diaktifkan.',
        level: 'success',
      });
      return true;
    }

    onProgress({
      step: 'Sakelar AI-generated content TikTok tidak terlihat',
      progressPercent: 70,
      log: 'Opsi AI-generated content tidak ditemukan di bawah Show more TikTok Studio.',
      level: 'warning',
    });
    return false;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Gagal mengatur label AI TikTok (non-fatal)',
      progressPercent: 70,
      log: `Pengaturan AI-generated content TikTok dilewati: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

async function uploadTikTokCover(
  page: Page,
  root: Page | FrameLocator,
  coverPath: string,
  coverFileName: string,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<boolean> {
  const EDIT_COVER_SELECTORS = [
    '[data-e2e="edit_cover_button"]',
    'button:has-text("Edit cover")',
    'button:has-text("Edit sampul")',
    'button:has-text("Ubah sampul")',
    'button:has-text("Change cover")',
    '[role="button"]:has-text("Edit cover")',
    '[role="button"]:has-text("Edit sampul")',
    'div.edit-container:has-text("Edit cover")',
    'div.edit-container:has-text("Edit sampul")',
    '.cover-container .edit-cover',
    '.edit-cover-btn',
    'text=/^(?:Edit cover|Edit sampul|Ubah sampul|Change cover)$/i',
  ];

  const UPLOAD_COVER_TAB_SELECTORS = [
    'button:has-text("Upload cover")',
    'button:has-text("Unggah sampul")',
    'button:has-text("Upload image")',
    'button:has-text("Unggah gambar")',
    '[role="tab"]:has-text("Upload cover")',
    '[role="tab"]:has-text("Unggah sampul")',
    '[role="button"]:has-text("Upload cover")',
    '[role="button"]:has-text("Unggah sampul")',
    'div:has-text("Upload cover"):not(:has(div:has-text("Upload cover")))',
    'div:has-text("Unggah sampul"):not(:has(div:has-text("Unggah sampul")))',
  ];

  const CONFIRM_COVER_SELECTORS = [
    '[role="dialog"] button:has-text("Confirm")',
    '[role="dialog"] button:has-text("Konfirmasi")',
    '[role="dialog"] button:has-text("Save")',
    '[role="dialog"] button:has-text("Simpan")',
    'button[data-e2e="confirm_cover_button"]',
    '.cover-edit-modal button:has-text("Confirm")',
    '.cover-edit-modal button:has-text("Konfirmasi")',
    'button:has-text("Confirm")',
    'button:has-text("Konfirmasi")',
  ];

  try {
    onProgress({
      step: `Memasang cover ${coverFileName} di TikTok Studio`,
      progressPercent: 68,
      log: `Mencari tombol Edit cover TikTok Studio untuk mengunggah cover ${coverFileName}.`,
      level: 'info',
    });

    // TikTok generates the cover card once video metadata finishes parsing (~5-40s for larger videos)
    const editBtn = await findFirstVisibleLocator(
      root,
      EDIT_COVER_SELECTORS,
      45_000,
      signal
    );

    if (!editBtn) {
      onProgress({
        step: 'Tombol Edit cover TikTok tidak ditemukan',
        progressPercent: 69,
        log: 'Tombol Edit cover di TikTok Studio belum muncul setelah 45 detik. Melanjutkan tanpa mengganti sampul.',
        level: 'warning',
      });
      return false;
    }

    await waitForEnabledLocator(editBtn, 15_000, signal);
    await humanDelay(650, 1250, signal);
    await humanClick(page, editBtn, signal, { timeout: 8000 });
    await humanDelay(1000, 1650, signal);

    // Switch to the "Upload cover" tab inside the cover editor modal
    const uploadTab = await findFirstVisibleLocator(
      root,
      UPLOAD_COVER_TAB_SELECTORS,
      8000,
      signal
    );
    if (uploadTab) {
      await humanDelay(250, 550, signal);
      await humanClick(page, uploadTab, signal, { timeout: 6000 });
      await humanDelay(700, 1200, signal);
    }

    // Attach cover image either via scoped image file input or via filechooser trigger
    let coverAttached = false;
    const modalScope = root
      .locator('[role="dialog"], .cover-edit-modal, .TUXModal-content')
      .last();
    const hasModal = await modalScope
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    const imageInputCandidates = [
      ...(hasModal
        ? [
            modalScope.locator('input[type="file"][accept*="image"]').last(),
            modalScope.locator('input[type="file"]').last(),
          ]
        : []),
      root.locator('input[type="file"][accept*="image"]:not([accept*="video"])').last(),
    ];

    for (const inputLoc of imageInputCandidates) {
      if ((await inputLoc.count().catch(() => 0)) > 0) {
        try {
          await inputLoc.setInputFiles(coverPath);
          coverAttached = true;
          break;
        } catch {
          // Try next candidate
        }
      }
    }

    if (!coverAttached) {
      const uploadTriggerSelectors = [
        '[role="dialog"] button:has-text("Upload")',
        '[role="dialog"] button:has-text("Unggah")',
        '[role="dialog"] button:has-text("Select")',
        '[role="dialog"] button:has-text("Pilih")',
        '[role="dialog"] [class*="upload"]',
      ];
      const dropTrigger = await findFirstVisibleLocator(
        root,
        uploadTriggerSelectors,
        4000,
        signal
      );
      if (dropTrigger) {
        const chooserPromise = page
          .waitForEvent('filechooser', { timeout: 6000 })
          .catch(() => null);
        await humanClick(page, dropTrigger, signal, { timeout: 6000 });
        const chooser = await raceWithAbort(chooserPromise, signal);
        if (chooser) {
          await chooser.setFiles([coverPath]);
          coverAttached = true;
        }
      }
    }

    if (!coverAttached) {
      await page.keyboard.press('Escape').catch(() => {});
      await humanDelay(400, 700, signal);
      onProgress({
        step: 'Input unggah cover TikTok tidak ditemukan',
        progressPercent: 69,
        log: 'Modal Edit cover TikTok terbuka tetapi input file gambar tidak terdeteksi. Menutup modal dan melanjutkan...',
        level: 'warning',
      });
      return false;
    }

    // Allow TikTok cover crop preview to render before confirming
    await humanDelay(1800, 2800, signal);

    const confirmBtn = await findFirstVisibleLocator(
      root,
      CONFIRM_COVER_SELECTORS,
      8000,
      signal
    );

    if (confirmBtn) {
      await waitForEnabledLocator(confirmBtn, 8000, signal);
      await humanDelay(300, 650, signal);
      await humanClick(page, confirmBtn, signal, { timeout: 8000 });
      await humanDelay(1200, 2000, signal);

      onProgress({
        step: `Cover ${coverFileName} berhasil dipasang di TikTok Studio`,
        progressPercent: 71,
        log: `Cover sampul ${coverFileName} berhasil diunggah dan dikonfirmasi di TikTok Studio.`,
        level: 'success',
      });
      return true;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await humanDelay(400, 700, signal);
    onProgress({
      step: 'Tombol Confirm cover TikTok tidak ditemukan',
      progressPercent: 69,
      log: `File cover ${coverFileName} sudah masuk tetapi tombol Confirm di modal TikTok tidak ditemukan. Melanjutkan...`,
      level: 'warning',
    });
    return false;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    await page.keyboard.press('Escape').catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      step: 'Upload cover TikTok dilewati (non-fatal)',
      progressPercent: 69,
      log: `Upload cover TikTok Studio dilewati: ${msg}`,
      level: 'warning',
    });
    return false;
  }
}

export async function publishTikTokViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void,
  scheduledAt?: string | null,
  aiGenerated = false
): Promise<BrowserPublishResult> {
  const parsedSchedule = parseScheduledAt(scheduledAt);
  onProgress({
    step: 'Membuka TikTok Studio',
    progressPercent: 12,
    log: 'Membuka halaman upload TikTok Studio di browser lokal.',
    level: 'info',
  });

  await raceWithAbort(
    page.goto(PLATFORM_STUDIO_URLS.tiktok, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    }),
    signal
  );
  await humanDelay(2400, 3600, signal);
  await humanIdleDrift(page, signal);

  if (page.url().toLowerCase().includes('/login')) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login TikTok Studio',
      progressPercent: 25,
      log: 'Belum login TikTok Studio. Silakan login di tab Chrome yang terbuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login TikTok diperlukan. Silakan login di tab browser yang terbuka.',
    };
  }

  await raceWithAbort(
    page
      .locator(
        'iframe[data-tt="Upload_index_iframe"], div.upload-container, input[type="file"]'
      )
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => {}),
    signal
  );

  const hasIframe =
    (await page.locator('iframe[data-tt="Upload_index_iframe"]').count()) > 0;
  const root: Page | FrameLocator = hasIframe
    ? page.frameLocator('iframe[data-tt="Upload_index_iframe"]')
    : page;

  onProgress({
    step: `Mengunggah video ${videoFileName} ke TikTok Studio`,
    progressPercent: 35,
    log: `Memasukkan file ${videoFileName} ke TikTok Studio${hasIframe ? ' (iframe)' : ''}.`,
    level: 'info',
  });

  let videoUploaded = false;
  const fileInput = root.locator('input[type="file"]').first();
  try {
    await raceWithAbort(
      fileInput.waitFor({ state: 'attached', timeout: 8000 }),
      signal
    );
    await fileInput.setInputFiles(videoPath);
    videoUploaded = true;
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw createAbortError();
    }
    videoUploaded = false;
  }

  if (!videoUploaded) {
    const selectButton = root
      .locator('button:has-text("Select video"), button:has-text("Pilih video")')
      .first();
    if (await selectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        const [chooser] = await raceWithAbort(
          Promise.all([
            page.waitForEvent('filechooser', { timeout: 15_000 }),
            humanClick(page, selectButton, signal, { timeout: 8000 }),
          ]),
          signal
        );
        await chooser.setFiles([videoPath]);
        videoUploaded = true;
      } catch (err) {
        if (
          signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          throw createAbortError();
        }
        videoUploaded = false;
      }
    }
  }

  if (!videoUploaded) {
    await safeBringToFront(page);
    onProgress({
      step: 'Input file TikTok tidak ditemukan',
      progressPercent: 35,
      log: 'Input upload TikTok Studio tidak ditemukan otomatis. Tab tetap dibuka agar Anda bisa memilih video secara manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Input file upload TikTok Studio tidak ditemukan. Silakan pilih ${videoFileName} secara manual di tab browser.`,
    };
  }

  const captionEditor = root
    .locator('div.public-DraftEditor-content, [contenteditable="true"]')
    .first();

  await raceWithAbort(
    captionEditor.waitFor({ state: 'visible', timeout: 60_000 }),
    signal
  );

  const caption = getCaptionForItem(item);
  onProgress({
    step: 'Mengisi caption TikTok Studio',
    progressPercent: 65,
    log: `Mengisi caption TikTok (${caption.length} karakter).`,
    level: 'info',
  });

  await humanClick(page, captionEditor, signal, { timeout: 8000 });
  await humanDelay(250, 480, signal);
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await humanDelay(90, 180, signal);
  await page.keyboard.press('Delete');
  await humanDelay(180, 340, signal);
  await humanTypeText(page, caption, signal);
  await humanDelay(600, 1100, signal);

  // Upload custom 9:16 Cover via "Edit cover" -> "Upload cover" -> "Confirm" (both immediate & scheduled)
  const coverPath = getCoverPathForItem(item);
  if (coverPath) {
    const coverFileName =
      item.autoMetadata.assets.cover.fileName ?? 'cover-9x16.jpg';
    await uploadTikTokCover(
      page,
      root,
      coverPath,
      coverFileName,
      signal,
      onProgress
    );
  }

  if (aiGenerated) {
    await configureTikTokAiLabel(page, root, signal, onProgress);
  }

  if (parsedSchedule) {
    const scheduleOk = await configureTikTokSchedule(
      page,
      root,
      parsedSchedule,
      signal,
      onProgress
    );
    if (!scheduleOk && mode === 'publish') {
      await safeBringToFront(page);
      return {
        status: 'awaiting_review',
        publishedUrl: null,
        summary: `Jadwal TikTok (${parsedSchedule.displayLabel}) belum dapat diisi otomatis. Tab dibiarkan terbuka untuk penyesuaian manual.`,
      };
    }
  }

  const tiktokActionLabel = parsedSchedule ? 'Schedule' : 'Post';

  onProgress({
    step: `Menunggu tombol ${tiktokActionLabel} TikTok siap`,
    progressPercent: 78,
    log: `Menunggu pemrosesan video TikTok selesai hingga tombol ${tiktokActionLabel} aktif.`,
    level: 'info',
  });

  const postButton = root
    .locator(
      'button[data-e2e="post_video_button"], div.button-group > button:has-text("Schedule"), div.button-group > button:has-text("Jadwalkan"), div.button-group > button:has-text("Post"), div.button-group > button:has-text("Posting")'
    )
    .first();

  const postReady = await waitForEnabledLocator(postButton, 120_000, signal);

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: parsedSchedule
        ? `Siap direview jadwal TikTok (${parsedSchedule.displayLabel})`
        : 'Siap direview di TikTok Studio',
      progressPercent: 85,
      log: parsedSchedule
        ? `Video, caption, dan jadwal TikTok (${parsedSchedule.displayLabel}) sudah siap di tab browser. Silakan review lalu klik Schedule.`
        : 'Video dan caption TikTok sudah siap di tab browser. Silakan cek preview lalu klik Post.',
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: parsedSchedule
        ? `Jadwal TikTok (${parsedSchedule.displayLabel}) sudah dimasukkan di TikTok Studio. Cek tab browser untuk konfirmasi akhir.`
        : 'Video dan caption sudah dimasukkan di TikTok Studio. Cek tab browser untuk konfirmasi akhir.',
    };
  }

  if (!postReady) {
    await safeBringToFront(page);
    onProgress({
      step: `Tombol ${tiktokActionLabel} TikTok belum siap`,
      progressPercent: 85,
      log: `Tombol ${tiktokActionLabel} TikTok belum aktif dalam 120 detik. Tab dibiarkan terbuka untuk review manual.`,
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Tombol ${tiktokActionLabel} TikTok belum siap diklik otomatis. Video dan caption tetap aman di tab browser.`,
    };
  }

  onProgress({
    step: parsedSchedule
      ? `Menjadwalkan video di TikTok Studio (${parsedSchedule.displayLabel})`
      : 'Menekan tombol Post di TikTok Studio',
    progressPercent: 90,
    log: parsedSchedule
      ? `Menekan tombol Schedule di TikTok Studio (${parsedSchedule.displayLabel}).`
      : 'Mengirim postingan di TikTok Studio.',
    level: 'info',
  });

  await humanClick(page, postButton, signal, { timeout: 10_000 });
  await humanDelay(1200, 2000, signal);

  // Handle optional confirmation dialog ("Post now" / "Schedule" / "Posting sekarang")
  const confirmSelectors = [
    'button:has-text("Post now")',
    'button:has-text("Posting sekarang")',
    'button:has-text("Schedule now")',
    'button:has-text("Jadwalkan sekarang")',
  ];
  const confirmedInRoot = await tryClickAny(
    root,
    confirmSelectors,
    2500,
    signal,
    page
  );
  if (!confirmedInRoot) {
    await tryClickAny(page, confirmSelectors, 2000, signal);
  }

  await raceWithAbort(
    page
      .waitForURL('**/tiktokstudio/content**', { timeout: 20_000 })
      .catch(() => {}),
    signal
  );

  let publishedUrl: string | null = null;
  try {
    const videoLinks = page.locator('a[href*="/video/"]');
    const linkCount = await videoLinks.count();
    for (let i = 0; i < linkCount; i += 1) {
      const href = await videoLinks.nth(i).getAttribute('href');
      if (!href) continue;
      const match = href.match(/video\/(\d+)/);
      if (match) {
        publishedUrl = href.startsWith('http')
          ? href
          : `https://www.tiktok.com${href.startsWith('/') ? '' : '/'}${href}`;
        break;
      }
    }
  } catch {
    publishedUrl = null;
  }

  onProgress({
    step: parsedSchedule
      ? `Terjadwal di TikTok Studio (${parsedSchedule.displayLabel})`
      : 'Terpublikasi di TikTok Studio',
    progressPercent: 100,
    log: parsedSchedule
      ? `Video berhasil dijadwalkan di TikTok Studio (${parsedSchedule.displayLabel}).`
      : publishedUrl
        ? `Video berhasil dipublikasikan di TikTok Studio: ${publishedUrl}`
        : 'Video telah dikirim ke TikTok Studio.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl,
    summary: parsedSchedule
      ? `Berhasil menjadwalkan di TikTok Studio (${parsedSchedule.displayLabel}).`
      : publishedUrl
        ? `Berhasil publish di TikTok Studio: ${publishedUrl}`
        : 'Berhasil publish di TikTok Studio.',
  };
}

export async function publishViaBrowser(
  params: BrowserPublishParams
): Promise<BrowserPublishResult> {
  const {
    platform,
    item,
    mode,
    signal,
    onProgress,
    workspace,
    metaTargets,
    scheduledAt,
    aiGenerated = false,
  } = params;
  throwIfAborted(signal);

  const resolvedVideo = resolveUploadVideoForItem(item, workspace);
  if (!resolvedVideo) {
    throw new Error(
      `File video yang siap diunggah belum tersedia untuk item ${item.folderCode}.`
    );
  }
  const { absolutePath: videoPath, fileName: videoFileName } = resolvedVideo;

  onProgress({
    step: 'Membuka sesi browser lokal',
    progressPercent: 5,
    log: 'Menghubungkan ke profil browser lokal (Patchright).',
    level: 'info',
  });

  const context = await getOrLaunchBrowserContext(undefined, workspace?.id);
  throwIfAborted(signal);

  const page = await context.newPage();
  await safeBringToFront(page);

  let shouldClosePage = false;

  try {
    let result: BrowserPublishResult;
    if (platform === 'yt_shorts') {
      result = await publishYouTubeViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress,
        scheduledAt,
        aiGenerated
      );
    } else if (platform === 'tiktok') {
      result = await publishTikTokViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress,
        scheduledAt,
        aiGenerated
      );
    } else if (platform === 'ig_reels' || platform === 'fb_reels') {
      const resolvedMetaTargets: MetaBusinessTargets = metaTargets ?? {
        facebook: platform === 'fb_reels',
        instagram: platform === 'ig_reels',
      };
      result = await publishMetaBusinessSuiteViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress,
        resolvedMetaTargets,
        scheduledAt,
        aiGenerated
      );
    } else {
      result = await publishMetaBusinessSuiteViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress,
        { facebook: true, instagram: false },
        scheduledAt,
        aiGenerated
      );
    }

    if (mode === 'publish' && result.status === 'completed') {
      shouldClosePage = true;
    }

    return result;
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      shouldClosePage = true;
      throw createAbortError();
    }

    const message = error instanceof Error ? error.message : String(error);
    await safeBringToFront(page);
    onProgress({
      step: 'Butuh penanganan manual di tab browser',
      progressPercent: 85,
      log: `Terjadi kendala saat otomatisasi UI (${message}). Tab dibiarkan terbuka agar Anda bisa melanjutkan manual.`,
      level: 'warning',
    });

    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Otomatisasi menemui kendala (${message}). Tab browser dibiarkan terbuka untuk review manual.`,
    };
  } finally {
    if ((shouldClosePage || signal.aborted) && !page.isClosed()) {
      await page.close().catch(() => {});
    }
  }
}
