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
  const delayMs =
    minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));
  await abortableWait(delayMs, signal);
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

async function tryClickAny(
  target: LocatorScope,
  selectors: string[],
  timeoutMs = 6000,
  signal?: AbortSignal
): Promise<boolean> {
  const locator = await findFirstVisibleLocator(
    target,
    selectors,
    timeoutMs,
    signal
  );
  if (!locator) return false;

  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await locator.click({ timeout: 5000 });
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
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await locator.click({ timeout: 6000 });
    await humanDelay(180, 350, signal);
    await locator.fill(text);
    return true;
  } catch {
    try {
      await locator.click({ timeout: 4000 });
      await page.keyboard.press('Control+A');
      await humanDelay(100, 220, signal);
      await page.keyboard.press('Backspace');
      await humanDelay(100, 220, signal);
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
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await locator.click({ timeout: 6000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await humanDelay(120, 250, signal);

    try {
      await locator.fill(text);
    } catch {
      await page.keyboard.type(text);
    }

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

  const cleanupTags = async () => {
    await page
      .evaluate(() => {
        document
          .querySelectorAll('[data-cpgp-meta-target], [data-cpgp-meta-row]')
          .forEach((el) => {
            el.removeAttribute('data-cpgp-meta-target');
            el.removeAttribute('data-cpgp-meta-row');
          });
      })
      .catch(() => {});
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

    await trigger.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await trigger.click({ timeout: 8000 });
    await humanDelay(500, 800, signal);

    // Inspect the opened popover and tag Facebook & Instagram checkbox targets
    const inspectAndTag = async () =>
      page.evaluate(() => {
        document
          .querySelectorAll('[data-cpgp-meta-target], [data-cpgp-meta-row]')
          .forEach((el) => {
            el.removeAttribute('data-cpgp-meta-target');
            el.removeAttribute('data-cpgp-meta-row');
          });

        const isVisible = (el: Element): boolean => {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = window.getComputedStyle(el);
          return style.visibility !== 'hidden' && style.display !== 'none';
        };

        const readChecked = (el: Element): boolean => {
          if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            return el.checked;
          }
          const ariaChecked = el.getAttribute('aria-checked');
          if (ariaChecked === 'true') return true;
          if (ariaChecked === 'false') return false;
          const ariaSelected = el.getAttribute('aria-selected');
          if (ariaSelected === 'true') return true;
          const nestedInput = el.querySelector<HTMLInputElement>(
            'input[type="checkbox"]'
          );
          if (nestedInput) return nestedInput.checked;
          const nestedAria = el.querySelector('[aria-checked]');
          if (nestedAria) {
            return nestedAria.getAttribute('aria-checked') === 'true';
          }
          return false;
        };

        // Locate the "Post to Facebook and Instagram" floating popover first
        let scope: Element | null = null;
        const headerRegex =
          /post to facebook and instagram|posting ke facebook dan instagram|post to facebook|posting ke facebook/i;

        const allNodes = Array.from(document.querySelectorAll('div, section, ul'));
        let bestPopover: Element | null = null;
        let bestArea = Number.POSITIVE_INFINITY;

        for (const node of allNodes) {
          if (!isVisible(node)) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width < 180 || rect.height < 60 || rect.width > 760) continue;
          const text = (node.textContent ?? '').trim();
          if (!headerRegex.test(text)) continue;

          const boxes = node.querySelectorAll(
            'input[type="checkbox"], [role="checkbox"], [role="menuitemcheckbox"]'
          );
          if (boxes.length >= 1 && boxes.length <= 8) {
            const area = rect.width * rect.height;
            if (area < bestArea) {
              bestArea = area;
              bestPopover = node;
            }
          }
        }

        if (bestPopover) {
          scope = bestPopover;
        } else {
          // Fallback to visible floating menu/listbox/dialog with checkboxes
          const popups = Array.from(
            document.querySelectorAll(
              '[role="dialog"], [role="listbox"], [role="menu"], [data-visualcompletion="ignore-dynamic"]'
            )
          ).filter((el) => isVisible(el));
          for (const popup of popups) {
            const boxes = popup.querySelectorAll(
              'input[type="checkbox"], [role="checkbox"], [role="menuitemcheckbox"]'
            );
            if (boxes.length >= 1 && boxes.length <= 8) {
              scope = popup;
              break;
            }
          }
        }

        if (!scope) {
          return {
            foundFacebook: false,
            foundInstagram: false,
            facebookChecked: false,
            instagramChecked: false,
            totalBoxes: 0,
          };
        }

        const rawBoxes = Array.from(
          scope.querySelectorAll(
            'input[type="checkbox"], [role="checkbox"], [role="menuitemcheckbox"]'
          )
        ).filter((el) => {
          // Avoid duplicates when a [role="checkbox"] wraps an <input type="checkbox">
          if (
            el.tagName !== 'INPUT' &&
            el.querySelector('input[type="checkbox"]')
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          const parentRect = el.parentElement?.getBoundingClientRect();
          return (
            (rect.width > 0 && rect.height > 0) ||
            (parentRect ? parentRect.width > 0 && parentRect.height > 0 : false)
          );
        });

        const getRowElement = (box: Element): Element => {
          const explicitRow = box.closest(
            '[role="option"], [role="menuitemcheckbox"], label, li'
          );
          if (explicitRow && scope!.contains(explicitRow)) {
            return explicitRow;
          }
          let curr: Element | null = box.parentElement;
          let candidate: Element = box.parentElement ?? box;
          for (let depth = 0; depth < 5 && curr && curr !== scope; depth += 1) {
            const r = curr.getBoundingClientRect();
            const siblingBoxes = curr.querySelectorAll(
              'input[type="checkbox"], [role="checkbox"], [role="menuitemcheckbox"]'
            );
            // Stop before ascending to a container that holds multiple rows
            const uniqueInputs = Array.from(siblingBoxes).filter(
              (b) =>
                !(
                  b.tagName !== 'INPUT' &&
                  b.querySelector('input[type="checkbox"]')
                )
            );
            if (uniqueInputs.length > 1) break;
            if (r.height >= 28 && r.height <= 96 && r.width >= 140) {
              candidate = curr;
            }
            curr = curr.parentElement;
          }
          return candidate;
        };

        const rowHint = (row: Element): 'facebook' | 'instagram' | null => {
          const parts: string[] = [];
          parts.push(row.getAttribute('aria-label') ?? '');
          parts.push(row.textContent ?? '');
          row.querySelectorAll('img, svg, i, [aria-label], [alt], [title]').forEach(
            (child) => {
              parts.push(child.getAttribute('aria-label') ?? '');
              parts.push(child.getAttribute('alt') ?? '');
              parts.push(child.getAttribute('title') ?? '');
              parts.push(child.getAttribute('src') ?? '');
            }
          );
          const combined = parts.join(' ').toLowerCase();
          if (combined.includes('instagram')) return 'instagram';
          if (combined.includes('facebook')) return 'facebook';
          return null;
        };

        let fbBox: Element | null = null;
        let igBox: Element | null = null;
        const unassigned: Element[] = [];

        for (const box of rawBoxes) {
          const row = getRowElement(box);
          const hint = rowHint(row);
          if (hint === 'facebook' && !fbBox) {
            fbBox = box;
          } else if (hint === 'instagram' && !igBox) {
            igBox = box;
          } else {
            unassigned.push(box);
          }
        }

        // Meta Business Suite lists Facebook Page first (index 0) and Instagram account second (index 1)
        if (!fbBox && unassigned.length > 0) {
          fbBox = unassigned.shift() ?? null;
        }
        if (!igBox && unassigned.length > 0) {
          igBox = unassigned.shift() ?? null;
        }

        if (fbBox) {
          fbBox.setAttribute('data-cpgp-meta-target', 'facebook');
          getRowElement(fbBox).setAttribute('data-cpgp-meta-row', 'facebook');
        }
        if (igBox) {
          igBox.setAttribute('data-cpgp-meta-target', 'instagram');
          getRowElement(igBox).setAttribute('data-cpgp-meta-row', 'instagram');
        }

        return {
          foundFacebook: Boolean(fbBox),
          foundInstagram: Boolean(igBox),
          facebookChecked: fbBox ? readChecked(fbBox) : false,
          instagramChecked: igBox ? readChecked(igBox) : false,
          totalBoxes: rawBoxes.length,
        };
      });

    let state = await inspectAndTag();

    const readTargetChecked = async (
      channel: 'facebook' | 'instagram'
    ): Promise<boolean> =>
      page
        .evaluate((ch) => {
          const el = document.querySelector(`[data-cpgp-meta-target="${ch}"]`);
          if (!el) return false;
          if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            return el.checked;
          }
          const ariaChecked = el.getAttribute('aria-checked');
          if (ariaChecked === 'true') return true;
          if (ariaChecked === 'false') return false;
          const nested = el.querySelector<HTMLInputElement>(
            'input[type="checkbox"]'
          );
          return nested ? nested.checked : false;
        }, channel)
        .catch(() => false);

    const setChannelState = async (
      channel: 'facebook' | 'instagram',
      desired: boolean
    ): Promise<boolean> => {
      const current = await readTargetChecked(channel);
      if (current === desired) {
        return current;
      }

      const targetLoc = page
        .locator(`[data-cpgp-meta-target="${channel}"]`)
        .first();
      if ((await targetLoc.count().catch(() => 0)) > 0) {
        await targetLoc
          .click({ timeout: 5000, force: true })
          .catch(() => {});
        await abortableWait(350, signal);
      }

      let after = await readTargetChecked(channel);
      if (after === desired) {
        return after;
      }

      // Fallback: click the row wrapper if the raw input is visually obscured
      const rowLoc = page
        .locator(`[data-cpgp-meta-row="${channel}"]`)
        .first();
      if ((await rowLoc.count().catch(() => 0)) > 0) {
        await rowLoc.click({ timeout: 5000 }).catch(() => {});
        await abortableWait(350, signal);
        after = await readTargetChecked(channel);
      }
      return after;
    };

    // CRITICAL: Always enable desired target(s) FIRST before disabling undesired target(s),
    // because Meta Business Suite does not allow unchecking the last active account!
    const enableFirst: Array<{ channel: 'facebook' | 'instagram'; desired: boolean }> = [];
    const disableAfter: Array<{ channel: 'facebook' | 'instagram'; desired: boolean }> = [];

    if (state.foundFacebook) {
      if (targets.facebook) {
        enableFirst.push({ channel: 'facebook', desired: true });
      } else {
        disableAfter.push({ channel: 'facebook', desired: false });
      }
    }
    if (state.foundInstagram) {
      if (targets.instagram) {
        enableFirst.push({ channel: 'instagram', desired: true });
      } else {
        disableAfter.push({ channel: 'instagram', desired: false });
      }
    }

    for (const op of [...enableFirst, ...disableAfter]) {
      throwIfAborted(signal);
      await setChannelState(op.channel, op.desired);
      await humanDelay(250, 450, signal);
    }

    const finalFb = state.foundFacebook
      ? await readTargetChecked('facebook')
      : false;
    const finalIg = state.foundInstagram
      ? await readTargetChecked('instagram')
      : false;

    await cleanupTags();

    // Close the "Post to" dropdown cleanly so it doesn't obstruct Description/Cover
    await page.keyboard.press('Escape').catch(() => {});
    await abortableWait(300, signal);
    const expanded = await trigger
      .getAttribute('aria-expanded')
      .catch(() => null);
    if (expanded === 'true') {
      await trigger.click({ timeout: 3000 }).catch(() => {});
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
      foundFacebook: state.foundFacebook,
      foundInstagram: state.foundInstagram,
      facebookChecked: finalFb,
      instagramChecked: finalIg,
    };
  } catch (err) {
    await cleanupTags();
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
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
  return publishMetaBusinessSuiteViaBrowser(
    page,
    item,
    videoPath,
    videoFileName,
    mode,
    signal,
    onProgress,
    { facebook: false, instagram: true }
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
    /^(?:Upload image|Unggah gambar|Upload thumbnail|Unggah thumbnail|Upload cover|Unggah sampul|上传图片)$/i;

  const findUploadImageTrigger = async (): Promise<Locator | null> => {
    const candidates: Locator[] = [
      reelSurface
        .locator('[role="button"], [role="radio"], [role="tab"], button')
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
      const visible = await candidate
        .isVisible({ timeout: 1200 })
        .catch(() => false);
      if (visible) {
        return candidate;
      }
    }
    return null;
  };

  try {
    onProgress({
      step: `Mengunggah cover ${coverFileName} ke Thumbnail Facebook Reels`,
      progressPercent: 71,
      log: `Mencari tombol Upload image untuk memasang cover ${coverFileName}.`,
      level: 'info',
    });

    // Scroll left panel down slightly in case Thumbnail section is lazy-rendered below caption
    const leftPanel = page
      .locator('[data-surface$="bizweb_create_reel:left_panel"]')
      .first();
    if (await leftPanel.isVisible({ timeout: 800 }).catch(() => false)) {
      await leftPanel
        .evaluate((el) => {
          el.scrollTop = Math.min(el.scrollHeight, 520);
        })
        .catch(() => {});
      await abortableWait(350, signal);
    }

    const trigger = await findUploadImageTrigger();
    if (!trigger) {
      onProgress({
        step: 'Tombol Upload image thumbnail tidak ditemukan',
        progressPercent: 72,
        log: 'Tombol Upload image pada bagian Thumbnail tidak terlihat. Melanjutkan tanpa mengganti thumbnail.',
        level: 'warning',
      });
      return false;
    }

    await trigger.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await abortableWait(250, signal);

    // Click Upload image while listening for an immediate native filechooser dialog
    const immediateChooserPromise = page
      .waitForEvent('filechooser', { timeout: 3500 })
      .catch(() => null);

    await trigger.click({ timeout: 8000 });
    const immediateChooser = await raceWithAbort(immediateChooserPromise, signal);

    if (immediateChooser) {
      await immediateChooser.setFiles([coverPath]);
      await humanDelay(2000, 2800, signal);
      onProgress({
        step: `Cover ${coverFileName} berhasil diunggah ke Facebook Reels`,
        progressPercent: 73,
        log: `Cover ${coverFileName} terpasang melalui tombol Upload image.`,
        level: 'success',
      });
      return true;
    }

    // Step 2: Meta Business Suite reveals a secondary row ("[icon] Upload image ... [Upload Image]")
    // Prioritize clicking the revealed "Upload Image" button/link on the right side of that row!
    await abortableWait(650, signal);

    const secondaryCandidates: Locator[] = [
      // Exact case match for the blue "Upload Image" link/button shown in Meta Business Suite
      reelSurface
        .locator('a, button, [role="button"], span, div')
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
        await secondBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        const secondChooserPromise = page
          .waitForEvent('filechooser', { timeout: 5500 })
          .catch(() => null);
        await secondBtn.click({ timeout: 6000 });
        const secondChooser = await raceWithAbort(secondChooserPromise, signal);

        if (secondChooser) {
          await secondChooser.setFiles([coverPath]);
          await humanDelay(2200, 3000, signal);
          onProgress({
            step: `Cover ${coverFileName} berhasil diunggah ke Facebook Reels`,
            progressPercent: 73,
            log: `Cover ${coverFileName} terpasang melalui tombol kedua Upload Image.`,
            level: 'success',
          });
          return true;
        }
      } catch (err) {
        if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw createAbortError();
        }
        // Try next candidate
      }
    }

    // Fallback: direct image file input scoped strictly inside bizweb_create_reel (not hidden post composer)
    const scopedImageInput = reelSurface
      .locator('input[type="file"][accept*="image"]:not([accept*="video"])')
      .last();
    if ((await scopedImageInput.count().catch(() => 0)) > 0) {
      await scopedImageInput.setInputFiles(coverPath);
      await humanDelay(2200, 3000, signal);
      onProgress({
        step: `Cover ${coverFileName} berhasil diunggah ke Facebook Reels`,
        progressPercent: 73,
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
      log: `Upload cover Facebook Reels dilewati: ${msg}`,
      level: 'warning',
    });
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
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
  return publishMetaBusinessSuiteViaBrowser(
    page,
    item,
    videoPath,
    videoFileName,
    mode,
    signal,
    onProgress,
    { facebook: true, instagram: false }
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
  targets: MetaBusinessTargets = { facebook: true, instagram: false }
): Promise<BrowserPublishResult> {
  const targetLabel = formatMetaTargetLabel(targets);

  onProgress({
    step: `Membuka Meta Business Suite (${targetLabel})`,
    progressPercent: 12,
    log: `Membuka Meta Business Suite Composer untuk ${targetLabel}.`,
    level: 'info',
  });

  await raceWithAbort(
    page.goto(PLATFORM_STUDIO_URLS.fb_reels, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    }),
    signal
  );
  await humanDelay(2500, 3500, signal);

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
          mediaSurface.getByRole('button').first().click({ timeout: 10_000 }),
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
    const count = await footerButtons.count().catch(() => 0);
    return count >= 2 ? footerButtons.nth(1) : footerButtons.last();
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
  }

  // Advance Reel wizard: Step 0 (Details) -> Step 1 (Edit) -> Step 2 (Share)
  for (let step = 0; step < 2; step += 1) {
    throwIfAborted(signal);
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

    onProgress({
      step:
        step === 0
          ? `Melanjutkan ke tahap Edit ${targetLabel}`
          : `Melanjutkan ke tahap Share ${targetLabel}`,
      progressPercent: step === 0 ? 75 : 82,
      log: `Menekan tombol Next langkah ${step + 1} di Meta Business Suite.`,
      level: 'info',
    });

    const prevStepMarker = await readFacebookActiveStepMarker(page);
    await nextBtn.click({ timeout: 10_000 });

    const stepDeadline = Date.now() + 45_000;
    while (Date.now() < stepDeadline) {
      throwIfAborted(signal);
      const currStepMarker = await readFacebookActiveStepMarker(page);
      if (currStepMarker && currStepMarker !== prevStepMarker) {
        break;
      }
      await abortableWait(350, signal);
    }

    await sweepGeoGuidanceCards(page);
    await humanDelay(400, 750, signal);
  }

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: `Siap direview di tahap Share ${targetLabel}`,
      progressPercent: 85,
      log: `${targetLabel} sudah sampai di tahap Share (Langkah 3). Silakan review lalu klik Share / Bagikan.`,
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Video, cover, dan deskripsi ${targetLabel} sudah siap di langkah Share Meta Business Suite. Cek tab browser untuk konfirmasi akhir.`,
    };
  }

  const shareBtn = await getPrimaryFooterBtn();
  const shareReady = await waitForEnabledLocator(shareBtn, 120_000, signal);
  if (!shareReady) {
    await safeBringToFront(page);
    onProgress({
      step: `Tombol Share ${targetLabel} belum siap`,
      progressPercent: 85,
      log: `Tombol Share / Bagikan ${targetLabel} belum aktif. Tab dibiarkan terbuka untuk review manual.`,
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Tombol Share ${targetLabel} belum siap diklik otomatis. Video dan deskripsi tetap terbuka di tab browser.`,
    };
  }

  onProgress({
    step: `Mempublikasikan ${targetLabel}`,
    progressPercent: 92,
    log: `Menekan tombol Share untuk ${targetLabel} dan menunggu konfirmasi GraphQL Meta Business Suite.`,
    level: 'info',
  });

  const graphqlPromise = page.waitForResponse(
    (resp) => {
      if (!resp.url().includes('/api/graphql')) return false;
      const postData = resp.request().postData() ?? '';
      return (
        postData.includes('BusinessComposerStoryCreationMutation') ||
        postData.includes('ComposerStoryCreation') ||
        postData.includes('CreateReel')
      );
    },
    { timeout: 90_000 }
  );

  await shareBtn.click({ timeout: 10_000 });
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
      await closeBtn.click({ timeout: 3000 }).catch(() => {});
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
    step: `Terpublikasi di ${targetLabel}`,
    progressPercent: 100,
    log: `${targetLabel} berhasil dipublikasikan via Meta Business Suite.`,
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: null,
    summary: `Berhasil publish ${targetLabel} via Meta Business Suite.`,
  };
}

export async function publishYouTubeViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
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
  await abortableWait(2500, signal);

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
    try {
      const thumbInput = page
        .locator(
          '#file-loader input[type="file"], ytcp-thumbnail-uploader input[type="file"]'
        )
        .first();
      if ((await thumbInput.count()) > 0) {
        await thumbInput.setInputFiles(coverPath);
        onProgress({
          step: 'Memasang cover thumbnail YouTube',
          progressPercent: 60,
          log: 'Cover thumbnail berhasil dipasang di YouTube Studio.',
          level: 'info',
        });
        await humanDelay(400, 700, signal);
      }
    } catch {
      // Non-fatal if thumbnail input is disabled for Shorts or unverified channel
    }
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
      step: 'Siap direview di YouTube Studio',
      progressPercent: 85,
      log: 'Video, judul, deskripsi, dan visibilitas (Unlisted) sudah siap di tab YouTube Studio. Silakan review lalu klik Save / Publish.',
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: detectedUrl,
      summary:
        'Video dan caption sudah disiapkan di YouTube Studio. Cek tab browser untuk konfirmasi akhir.',
    };
  }

  onProgress({
    step: 'Menyelesaikan publikasi YouTube Shorts',
    progressPercent: 92,
    log: 'Menekan tombol Publish (#done-button) di YouTube Studio.',
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
      step: 'Tombol Publish YouTube belum siap',
      progressPercent: 85,
      log: 'Tombol Publish YouTube belum dapat diklik otomatis. Tab dibiarkan terbuka untuk review manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: detectedUrl,
      summary:
        'Tombol Publish YouTube Studio belum siap diklik. Silakan klik Publish secara manual di tab browser.',
    };
  }

  await abortableWait(4000, signal);
  const finalUrl = (await extractYouTubeVideoUrl(page)) ?? detectedUrl;

  onProgress({
    step: 'Terpublikasi di YouTube Studio',
    progressPercent: 100,
    log: finalUrl
      ? `Video berhasil dipublikasikan di YouTube Studio: ${finalUrl}`
      : 'Video berhasil dipublikasikan melalui YouTube Studio.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: finalUrl,
    summary: finalUrl
      ? `Berhasil publish via YouTube Studio: ${finalUrl}`
      : 'Berhasil publish via YouTube Studio.',
  };
}

export async function publishTikTokViaBrowser(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
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
  await abortableWait(2500, signal);

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
            selectButton.click({ timeout: 8000 }),
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

  await captionEditor.click({ timeout: 8000 });
  await humanDelay(200, 400, signal);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await humanDelay(150, 300, signal);
  await page.keyboard.insertText(caption);

  onProgress({
    step: 'Menunggu tombol Post TikTok siap',
    progressPercent: 78,
    log: 'Menunggu pemrosesan video TikTok selesai hingga tombol Post aktif.',
    level: 'info',
  });

  const postButton = root
    .locator(
      'button[data-e2e="post_video_button"], div.button-group > button:has-text("Post"), div.button-group > button:has-text("Posting")'
    )
    .first();

  const postReady = await waitForEnabledLocator(postButton, 120_000, signal);

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: 'Siap direview di TikTok Studio',
      progressPercent: 85,
      log: 'Video dan caption TikTok sudah siap di tab browser. Silakan cek preview lalu klik Post.',
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Video dan caption sudah dimasukkan di TikTok Studio. Cek tab browser untuk konfirmasi akhir.',
    };
  }

  if (!postReady) {
    await safeBringToFront(page);
    onProgress({
      step: 'Tombol Post TikTok belum siap',
      progressPercent: 85,
      log: 'Tombol Post TikTok belum aktif dalam 120 detik. Tab dibiarkan terbuka untuk review manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Tombol Post TikTok belum siap diklik otomatis. Video dan caption tetap aman di tab browser.',
    };
  }

  onProgress({
    step: 'Menekan tombol Post di TikTok Studio',
    progressPercent: 90,
    log: 'Mengirim postingan di TikTok Studio.',
    level: 'info',
  });

  await postButton.click({ timeout: 10_000 });
  await humanDelay(1200, 2000, signal);

  // Handle optional confirmation dialog ("Post now" / "Posting sekarang")
  const confirmedInRoot = await tryClickAny(
    root,
    ['button:has-text("Post now")', 'button:has-text("Posting sekarang")'],
    2500,
    signal
  );
  if (!confirmedInRoot) {
    await tryClickAny(
      page,
      ['button:has-text("Post now")', 'button:has-text("Posting sekarang")'],
      2000,
      signal
    );
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
    step: 'Terpublikasi di TikTok Studio',
    progressPercent: 100,
    log: publishedUrl
      ? `Video berhasil dipublikasikan di TikTok Studio: ${publishedUrl}`
      : 'Video telah dikirim ke TikTok Studio.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl,
    summary: publishedUrl
      ? `Berhasil publish di TikTok Studio: ${publishedUrl}`
      : 'Berhasil publish di TikTok Studio.',
  };
}

export async function publishViaBrowser(
  params: BrowserPublishParams
): Promise<BrowserPublishResult> {
  const { platform, item, mode, signal, onProgress, workspace, metaTargets } =
    params;
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

  try {
    if (platform === 'yt_shorts') {
      return await publishYouTubeViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress
      );
    }
    if (platform === 'tiktok') {
      return await publishTikTokViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress
      );
    }
    if (platform === 'ig_reels' || platform === 'fb_reels') {
      const resolvedMetaTargets: MetaBusinessTargets = metaTargets ?? {
        facebook: platform === 'fb_reels',
        instagram: platform === 'ig_reels',
      };
      return await publishMetaBusinessSuiteViaBrowser(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress,
        resolvedMetaTargets
      );
    }
    return await publishMetaBusinessSuiteViaBrowser(
      page,
      item,
      videoPath,
      videoFileName,
      mode,
      signal,
      onProgress,
      { facebook: true, instagram: false }
    );
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
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
  }
}
