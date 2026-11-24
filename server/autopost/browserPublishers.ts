import type { Frame, Locator, Page } from 'patchright';
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

export interface BrowserPublishParams {
  platform: PlatformKey;
  item: ContentPlannerItem;
  mode: AutoPostMode;
  signal: AbortSignal;
  onProgress: (update: BrowserPublishProgressUpdate) => void;
  workspace?: WorkspaceMetadata;
}

export interface BrowserPublishResult {
  status: 'completed' | 'awaiting_review';
  publishedUrl?: string | null;
  summary: string;
}

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

async function humanDelay(
  minMs: number,
  maxMs: number,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  const delayMs =
    minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
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

async function findFirstVisibleLocator(
  target: Page | Frame,
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

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
}

async function findFirstAttachedLocator(
  target: Page | Frame,
  selectors: string[],
  timeoutMs = 10000,
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
        if ((await locator.count()) > 0) {
          return locator;
        }
      } catch {
        // Ignore transient lookup errors
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
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

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return null;
}

async function tryClickAny(
  target: Page | Frame,
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

async function fillEditableField(
  page: Page,
  locator: Locator,
  text: string,
  signal: AbortSignal
): Promise<boolean> {
  throwIfAborted(signal);
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await locator.click({ timeout: 5000 });
    await humanDelay(200, 450, signal);

    const tagName = await locator
      .evaluate((el) => el.tagName.toLowerCase())
      .catch(() => '');

    if (tagName === 'input' || tagName === 'textarea') {
      await locator.fill(text);
      return true;
    }

    await page.keyboard.press('Control+A');
    await humanDelay(120, 260, signal);
    await page.keyboard.press('Backspace');
    await humanDelay(120, 260, signal);
    await page.keyboard.insertText(text);
    return true;
  } catch {
    try {
      await locator.fill(text);
      return true;
    } catch {
      return false;
    }
  }
}

async function safeBringToFront(page: Page): Promise<void> {
  try {
    await page.bringToFront();
  } catch {
    // Ignore if browser window is minimized or closed
  }
}

async function isYouTubeLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (
    url.includes('accounts.google.com') ||
    url.includes('/signin') ||
    url.includes('servicelogin')
  ) {
    return true;
  }

  const emailInput = await findFirstVisibleLocator(
    page,
    ['input[type="email"]', 'a:has-text("Sign in")', 'a:has-text("Masuk")'],
    1200
  );
  return Boolean(emailInput);
}

async function isTikTokLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes('/login')) {
    return true;
  }

  const loginPrompt = await findFirstVisibleLocator(
    page,
    [
      'input[name="username"]',
      '[data-e2e="login-button"]',
      'button:has-text("Log in")',
      'button:has-text("Masuk")',
      '#loginContainer',
    ],
    1500
  );
  return Boolean(loginPrompt);
}

async function isInstagramLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes('/accounts/login')) {
    return true;
  }

  const loginInput = await findFirstVisibleLocator(
    page,
    ['input[name="username"]', 'input[name="password"]'],
    1500
  );
  return Boolean(loginInput);
}

async function isFacebookLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (
    url.includes('facebook.com/login') ||
    url.includes('/login.php') ||
    url.includes('login/?next=')
  ) {
    return true;
  }

  const loginInput = await findFirstVisibleLocator(
    page,
    ['input[name="email"]', 'input[name="pass"]', 'button[name="login"]'],
    1500
  );
  return Boolean(loginInput);
}

async function publishYouTubeStudio(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
  onProgress({
    step: 'Membuka YouTube Studio',
    progressPercent: 12,
    log: 'Membuka YouTube Studio di tab browser lokal.',
    level: 'info',
  });

  await page.goto(PLATFORM_STUDIO_URLS.yt_shorts, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await humanDelay(2000, 3200, signal);

  if (await isYouTubeLoginRequired(page)) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login YouTube Studio',
      progressPercent: 25,
      log: 'Silakan login YouTube Studio di tab Chrome yang terbuka',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login Google / YouTube Studio diperlukan. Silakan login di tab browser yang terbuka lalu jalankan ulang atau selesaikan manual.',
    };
  }

  onProgress({
    step: 'Mencari tombol Upload di YouTube Studio',
    progressPercent: 25,
    log: 'Mencari tombol Create / Upload video di YouTube Studio.',
    level: 'info',
  });

  let fileInput = await findFirstAttachedLocator(
    page,
    ['input[type="file"][name="Filedata"]', 'input[type="file"]'],
    2500,
    signal
  );

  if (!fileInput) {
    const clickedUploadIcon = await tryClickAny(
      page,
      [
        '#upload-icon',
        'ytcp-icon-button#upload-icon',
        'button[aria-label*="Upload video" i]',
        'button[aria-label*="Upload videos" i]',
        'button[aria-label*="Unggah video" i]',
      ],
      4000,
      signal
    );

    if (!clickedUploadIcon) {
      const clickedCreate = await tryClickAny(
        page,
        [
          '#create-icon',
          'ytcp-button#create-icon',
          'button[aria-label*="Create" i]',
          'button[aria-label*="Buat" i]',
          'ytcp-button:has-text("Create")',
          'ytcp-button:has-text("Buat")',
        ],
        7000,
        signal
      );

      if (clickedCreate) {
        await humanDelay(600, 1100, signal);
        await tryClickAny(
          page,
          [
            'tp-yt-paper-item#text-item-0',
            'tp-yt-paper-item:has-text("Upload video")',
            'tp-yt-paper-item:has-text("Upload videos")',
            'tp-yt-paper-item:has-text("Unggah video")',
          ],
          5000,
          signal
        );
      }
    }

    await humanDelay(700, 1200, signal);
    fileInput = await findFileInputAcrossFrames(
      page,
      ['input[type="file"][name="Filedata"]', 'input[type="file"]'],
      12000,
      signal
    );
  }

  if (!fileInput) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu upload manual di YouTube Studio',
      progressPercent: 40,
      log: 'Input file upload YouTube Studio tidak ditemukan otomatis. Tab dibiarkan terbuka agar Anda bisa memilih video secara manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Tombol upload YouTube Studio tidak terdeteksi otomatis. Silakan pilih file ${videoFileName} di tab YouTube Studio yang terbuka.`,
    };
  }

  onProgress({
    step: `Mengunggah video ${videoFileName} ke YouTube Studio`,
    progressPercent: 42,
    log: `Memasukkan file ${videoFileName} ke YouTube Studio.`,
    level: 'info',
  });

  await fileInput.setInputFiles(videoPath);
  await humanDelay(2500, 4000, signal);

  const title = getTitleForItem(item);
  const description = getCaptionForItem(item);

  const titleBox = await findFirstVisibleLocator(
    page,
    [
      'ytcp-social-suggestions-textbox[id="title-textarea"] #textbox',
      'div#textbox[aria-label*="Add a title" i]',
      'div#textbox[aria-label*="judul" i]',
      '#textbox',
    ],
    22000,
    signal
  );

  if (titleBox) {
    onProgress({
      step: 'Mengisi judul dan deskripsi YouTube',
      progressPercent: 60,
      log: `Mengisi judul YouTube (${title.length} karakter).`,
      level: 'info',
    });

    await fillEditableField(page, titleBox, title, signal);
    await humanDelay(500, 900, signal);

    const descriptionBox = await findFirstVisibleLocator(
      page,
      [
        'ytcp-social-suggestions-textbox[id="description-textarea"] #textbox',
        'div#textbox[aria-label*="Tell viewers" i]',
        'div#textbox[aria-label*="Ceritakan" i]',
      ],
      4000,
      signal
    );

    if (descriptionBox) {
      await fillEditableField(page, descriptionBox, description, signal);
    } else {
      try {
        const allTextboxes = page.locator('#textbox');
        if ((await allTextboxes.count()) >= 2) {
          await fillEditableField(page, allTextboxes.nth(1), description, signal);
        }
      } catch {
        onProgress({
          step: 'Deskripsi perlu dicek manual',
          progressPercent: 65,
          log: 'Kolom deskripsi YouTube tidak ditemukan otomatis, judul sudah diisi.',
          level: 'warning',
        });
      }
    }
  } else {
    onProgress({
      step: 'Form detail YouTube belum termuat penuh',
      progressPercent: 60,
      log: 'Kolom judul YouTube Studio belum terlihat. Tab tetap dibuka agar Anda bisa melanjutkan manual.',
      level: 'warning',
    });
  }

  await humanDelay(500, 1000, signal);
  const notForKidsClicked = await tryClickAny(
    page,
    [
      'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
      'input[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
      'tp-yt-paper-radio-button:has-text("No, it\'s not made for kids")',
      'tp-yt-paper-radio-button:has-text("Tidak, video ini tidak dibuat untuk anak-anak")',
    ],
    4000,
    signal
  );

  if (notForKidsClicked) {
    onProgress({
      step: 'Mengatur opsi audiens (Bukan untuk anak-anak)',
      progressPercent: 72,
      log: 'Opsi "Not made for kids" dipilih.',
      level: 'info',
    });
  }

  let detectedUrl: string | null = null;
  try {
    const linkLocator = page
      .locator(
        'a.style-scope.ytcp-video-info[href*="youtu"], a[href*="youtube.com/shorts/"], a[href*="youtu.be/"]'
      )
      .first();
    if ((await linkLocator.count()) > 0) {
      detectedUrl = (await linkLocator.getAttribute('href')) ?? null;
    }
  } catch {
    detectedUrl = null;
  }

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: 'Siap direview di YouTube Studio',
      progressPercent: 85,
      log: 'Video, judul, dan deskripsi sudah siap di tab YouTube Studio. Silakan review lalu klik Terbitkan.',
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
    step: 'Melanjutkan ke langkah Visibilitas YouTube',
    progressPercent: 80,
    log: 'Menuju tahap Visibilitas (Public) di YouTube Studio.',
    level: 'info',
  });

  for (let stepIdx = 0; stepIdx < 3; stepIdx += 1) {
    const clickedNext = await tryClickAny(
      page,
      ['#next-button', 'ytcp-button#next-button'],
      4000,
      signal
    );
    if (!clickedNext) break;
    await humanDelay(800, 1400, signal);
  }

  const publicSelected = await tryClickAny(
    page,
    [
      'tp-yt-paper-radio-button[name="PUBLIC"]',
      'tp-yt-paper-radio-button:has-text("Public")',
      'tp-yt-paper-radio-button:has-text("Publik")',
    ],
    5000,
    signal
  );

  if (!publicSelected) {
    await safeBringToFront(page);
    onProgress({
      step: 'Opsi Publik tidak ditemukan',
      progressPercent: 85,
      log: 'Opsi Visibilitas Public tidak terdeteksi otomatis. Tab dibiarkan terbuka untuk review manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: detectedUrl,
      summary:
        'Tidak bisa memilih opsi Public secara otomatis di YouTube Studio. Tab tetap dibuka agar Anda bisa menyelesaikannya.',
    };
  }

  await humanDelay(700, 1200, signal);
  const doneClicked = await tryClickAny(
    page,
    ['#done-button', 'ytcp-button#done-button'],
    5000,
    signal
  );

  if (!doneClicked) {
    await safeBringToFront(page);
    onProgress({
      step: 'Tombol Publish belum siap',
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

  await humanDelay(2500, 4000, signal);
  try {
    const finalLink = page
      .locator(
        'a#share-url, a[href*="youtube.com/shorts/"], a[href*="youtu.be/"], a.style-scope.ytcp-video-info[href*="youtu"]'
      )
      .first();
    if ((await finalLink.count()) > 0) {
      const href = await finalLink.getAttribute('href');
      if (href) detectedUrl = href;
    }
  } catch {
    // Keep previously detected URL if any
  }

  onProgress({
    step: 'Terpublikasi di YouTube Studio',
    progressPercent: 100,
    log: detectedUrl
      ? `Video berhasil dipublikasikan di YouTube Studio: ${detectedUrl}`
      : 'Video berhasil dipublikasikan melalui YouTube Studio.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: detectedUrl,
    summary: detectedUrl
      ? `Berhasil publish via YouTube Studio: ${detectedUrl}`
      : 'Berhasil publish via YouTube Studio.',
  };
}

async function publishTikTokStudio(
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

  await page.goto(PLATFORM_STUDIO_URLS.tiktok, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await humanDelay(2000, 3500, signal);

  if (await isTikTokLoginRequired(page)) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login TikTok Studio',
      progressPercent: 25,
      log: 'Silakan login TikTok Studio di tab Chrome yang terbuka',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login TikTok diperlukan. Silakan login di tab browser yang terbuka.',
    };
  }

  onProgress({
    step: 'Mencari input upload TikTok Studio',
    progressPercent: 28,
    log: 'Mencari input file video di TikTok Studio.',
    level: 'info',
  });

  const fileInput = await findFileInputAcrossFrames(
    page,
    ['input[type="file"][accept*="video"]', 'input[type="file"]'],
    18000,
    signal
  );

  if (!fileInput) {
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

  onProgress({
    step: `Mengunggah video ${videoFileName} ke TikTok`,
    progressPercent: 45,
    log: `Memasukkan file ${videoFileName} ke TikTok Studio.`,
    level: 'info',
  });

  await fileInput.setInputFiles(videoPath);
  await humanDelay(3000, 4800, signal);

  const caption = getCaptionForItem(item);
  const captionEditor = await findFirstVisibleLocator(
    page,
    [
      '.public-DraftEditor-content',
      '[data-e2e="caption-editor"] [contenteditable="true"]',
      'div[contenteditable="true"][role="combobox"]',
      'div[contenteditable="true"]',
    ],
    20000,
    signal
  );

  if (captionEditor) {
    onProgress({
      step: 'Mengisi caption TikTok',
      progressPercent: 70,
      log: `Mengisi caption TikTok (${caption.length} karakter).`,
      level: 'info',
    });
    await fillEditableField(page, captionEditor, caption, signal);
    await humanDelay(700, 1200, signal);
  } else {
    onProgress({
      step: 'Editor caption TikTok belum ditemukan',
      progressPercent: 70,
      log: 'Kolom caption TikTok belum muncul otomatis. Video sudah dimasukkan, silakan cek tab TikTok Studio.',
      level: 'warning',
    });
  }

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

  onProgress({
    step: 'Menekan tombol Post di TikTok Studio',
    progressPercent: 88,
    log: 'Mencoba mengirim postingan di TikTok Studio.',
    level: 'info',
  });

  await humanDelay(2500, 4000, signal);
  const posted = await tryClickAny(
    page,
    [
      '[data-e2e="post_video_button"]',
      'button[data-e2e="post_video_button"]',
      'button:has-text("Post")',
      'button:has-text("Posting")',
    ],
    10000,
    signal
  );

  if (!posted) {
    await safeBringToFront(page);
    onProgress({
      step: 'Tombol Post TikTok belum siap',
      progressPercent: 85,
      log: 'Tombol Post TikTok belum bisa diklik (mungkin video masih diproses). Tab dibiarkan terbuka untuk review manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Tombol Post TikTok belum siap diklik otomatis. Video dan caption tetap aman di tab browser.',
    };
  }

  await humanDelay(2500, 4000, signal);
  await tryClickAny(
    page,
    [
      'button:has-text("Post now")',
      'button:has-text("Posting sekarang")',
      'button:has-text("Continue")',
    ],
    2500,
    signal
  );

  onProgress({
    step: 'Terpublikasi di TikTok Studio',
    progressPercent: 100,
    log: 'Video telah dikirim ke TikTok Studio.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: null,
    summary: 'Berhasil klik Post di TikTok Studio.',
  };
}

async function publishInstagramReels(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
  onProgress({
    step: 'Membuka Instagram',
    progressPercent: 12,
    log: 'Membuka Instagram Web di browser lokal.',
    level: 'info',
  });

  await page.goto(PLATFORM_STUDIO_URLS.ig_reels, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await humanDelay(2000, 3200, signal);

  if (await isInstagramLoginRequired(page)) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login Instagram',
      progressPercent: 25,
      log: 'Silakan login Instagram di tab Chrome yang terbuka',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login Instagram diperlukan. Silakan login di tab browser yang terbuka.',
    };
  }

  // Dismiss optional notification modal if shown
  await tryClickAny(
    page,
    ['button:has-text("Not Now")', 'button:has-text("Lain kali")'],
    2000,
    signal
  );

  onProgress({
    step: 'Membuka dialog Create / Buat di Instagram',
    progressPercent: 26,
    log: 'Mencari tombol Create / Buat di navigasi Instagram.',
    level: 'info',
  });

  const createClicked = await tryClickAny(
    page,
    [
      'svg[aria-label="New post"]',
      'svg[aria-label="Postingan baru"]',
      'a:has-text("Create")',
      'span:has-text("Create")',
      'a:has-text("Buat")',
      'span:has-text("Buat")',
    ],
    10000,
    signal
  );

  if (!createClicked) {
    await safeBringToFront(page);
    onProgress({
      step: 'Tombol Create Instagram tidak ditemukan',
      progressPercent: 30,
      log: 'Tombol Create / Buat di Instagram tidak ditemukan otomatis. Tab dibiarkan terbuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Tombol Create Instagram tidak terdeteksi otomatis. Silakan klik Create secara manual di tab browser.',
    };
  }

  await humanDelay(700, 1200, signal);

  // If Instagram shows a dropdown menu ("Post" / "Postingan"), click it
  await tryClickAny(
    page,
    [
      'span:has-text("Post")',
      'span:has-text("Postingan")',
      'a:has-text("Post")',
    ],
    2000,
    signal
  );

  const fileInput = await findFileInputAcrossFrames(
    page,
    ['input[type="file"][accept*="video"]', 'input[type="file"]'],
    12000,
    signal
  );

  if (!fileInput) {
    await safeBringToFront(page);
    onProgress({
      step: 'Input file Instagram tidak ditemukan',
      progressPercent: 38,
      log: 'Input file unggahan Instagram tidak ditemukan otomatis. Tab tetap dibuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Input file upload Instagram tidak ditemukan. Silakan pilih ${videoFileName} secara manual di tab Instagram.`,
    };
  }

  onProgress({
    step: `Mengunggah video ${videoFileName} ke Instagram`,
    progressPercent: 45,
    log: `Memasukkan file ${videoFileName} ke Instagram.`,
    level: 'info',
  });

  await fileInput.setInputFiles(videoPath);
  await humanDelay(2200, 3500, signal);

  // Dismiss optional "Video posts are now shared as reels" popup
  await tryClickAny(
    page,
    ['button:has-text("OK")', 'button:has-text("Oke")'],
    2500,
    signal
  );

  onProgress({
    step: 'Melewati tahap crop dan edit Reels',
    progressPercent: 60,
    log: 'Menekan tombol Next / Selanjutnya menuju form caption Instagram.',
    level: 'info',
  });

  for (let stepIdx = 0; stepIdx < 2; stepIdx += 1) {
    const nextClicked = await tryClickAny(
      page,
      [
        'div[role="button"]:has-text("Next")',
        'button:has-text("Next")',
        'div[role="button"]:has-text("Selanjutnya")',
        'button:has-text("Selanjutnya")',
      ],
      6000,
      signal
    );
    if (!nextClicked) break;
    await humanDelay(1100, 1800, signal);
  }

  const caption = getCaptionForItem(item);
  const captionBox = await findFirstVisibleLocator(
    page,
    [
      'div[aria-label*="Write a caption" i]',
      'div[aria-label*="caption" i]',
      'div[aria-label*="keterangan" i]',
      'div[role="textbox"][contenteditable="true"]',
      'textarea[aria-label*="caption" i]',
      'textarea',
    ],
    10000,
    signal
  );

  if (captionBox) {
    onProgress({
      step: 'Mengisi caption Instagram Reels',
      progressPercent: 75,
      log: `Mengisi caption Instagram (${caption.length} karakter).`,
      level: 'info',
    });
    await fillEditableField(page, captionBox, caption, signal);
    await humanDelay(600, 1100, signal);
  } else {
    onProgress({
      step: 'Kolom caption Instagram belum terlihat',
      progressPercent: 75,
      log: 'Kolom caption Instagram tidak ditemukan otomatis. Tab tetap dibuka agar Anda bisa menempelkan caption.',
      level: 'warning',
    });
  }

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: 'Siap direview di Instagram Reels',
      progressPercent: 85,
      log: 'Video dan caption Instagram Reels sudah siap. Silakan review lalu klik Share / Bagikan.',
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Video dan caption sudah disiapkan di Instagram Reels. Cek tab browser untuk konfirmasi akhir.',
    };
  }

  onProgress({
    step: 'Membagikan Instagram Reels',
    progressPercent: 90,
    log: 'Menekan tombol Share / Bagikan di Instagram.',
    level: 'info',
  });

  const shared = await tryClickAny(
    page,
    [
      'div[role="button"]:has-text("Share")',
      'button:has-text("Share")',
      'div[role="button"]:has-text("Bagikan")',
      'button:has-text("Bagikan")',
    ],
    8000,
    signal
  );

  if (!shared) {
    await safeBringToFront(page);
    onProgress({
      step: 'Tombol Share Instagram tidak ditemukan',
      progressPercent: 85,
      log: 'Tombol Share / Bagikan tidak ditemukan otomatis. Tab dibiarkan terbuka untuk review manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Tombol Share Instagram tidak ditemukan otomatis. Video dan caption tetap terbuka di tab browser.',
    };
  }

  await humanDelay(3000, 5000, signal);
  onProgress({
    step: 'Instagram Reels dibagikan',
    progressPercent: 100,
    log: 'Tombol Share Instagram Reels telah diklik.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: null,
    summary: 'Berhasil klik Share di Instagram Reels.',
  };
}

async function publishFacebookReels(
  page: Page,
  item: ContentPlannerItem,
  videoPath: string,
  videoFileName: string,
  mode: AutoPostMode,
  signal: AbortSignal,
  onProgress: (update: BrowserPublishProgressUpdate) => void
): Promise<BrowserPublishResult> {
  onProgress({
    step: 'Membuka Meta Business Suite (Facebook Reels)',
    progressPercent: 12,
    log: 'Membuka halaman Facebook Reels Composer di Meta Business Suite.',
    level: 'info',
  });

  await page.goto(PLATFORM_STUDIO_URLS.fb_reels, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await humanDelay(2500, 3800, signal);

  if (await isFacebookLoginRequired(page)) {
    await safeBringToFront(page);
    onProgress({
      step: 'Menunggu login Facebook / Meta Business Suite',
      progressPercent: 25,
      log: 'Silakan login Meta Business Suite (Facebook) di tab Chrome yang terbuka',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Sesi login Facebook / Meta Business Suite diperlukan. Silakan login di tab browser yang terbuka.',
    };
  }

  onProgress({
    step: 'Mencari input upload Facebook Reels',
    progressPercent: 28,
    log: 'Mencari input file video di Meta Business Suite.',
    level: 'info',
  });

  let fileInput = await findFileInputAcrossFrames(
    page,
    ['input[type="file"][accept*="video"]', 'input[type="file"]'],
    14000,
    signal
  );

  if (!fileInput) {
    await tryClickAny(
      page,
      [
        'div[role="button"]:has-text("Add video")',
        'button:has-text("Add video")',
        'div[role="button"]:has-text("Tambahkan video")',
        'button:has-text("Tambahkan video")',
      ],
      5000,
      signal
    );
    await humanDelay(700, 1200, signal);
    fileInput = await findFileInputAcrossFrames(
      page,
      ['input[type="file"][accept*="video"]', 'input[type="file"]'],
      8000,
      signal
    );
  }

  if (!fileInput) {
    await safeBringToFront(page);
    onProgress({
      step: 'Input video Facebook Reels tidak ditemukan',
      progressPercent: 35,
      log: 'Input file video Facebook Reels tidak ditemukan otomatis. Tab dibiarkan terbuka untuk upload manual.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary: `Input file Facebook Reels tidak ditemukan otomatis. Silakan pilih ${videoFileName} di tab Meta Business Suite.`,
    };
  }

  onProgress({
    step: `Mengunggah video ${videoFileName} ke Facebook Reels`,
    progressPercent: 45,
    log: `Memasukkan file ${videoFileName} ke Facebook Reels Composer.`,
    level: 'info',
  });

  await fileInput.setInputFiles(videoPath);
  await humanDelay(3000, 4500, signal);

  const caption = getCaptionForItem(item);
  const captionBox = await findFirstVisibleLocator(
    page,
    [
      'div[role="textbox"][contenteditable="true"]',
      'div[role="textbox"]',
      'textarea',
    ],
    15000,
    signal
  );

  if (captionBox) {
    onProgress({
      step: 'Mengisi deskripsi Facebook Reels',
      progressPercent: 72,
      log: `Mengisi deskripsi Facebook Reels (${caption.length} karakter).`,
      level: 'info',
    });
    await fillEditableField(page, captionBox, caption, signal);
    await humanDelay(700, 1200, signal);
  } else {
    onProgress({
      step: 'Kolom deskripsi Facebook belum terlihat',
      progressPercent: 72,
      log: 'Kolom deskripsi Facebook Reels tidak ditemukan otomatis. Video sudah diunggah, silakan cek tab browser.',
      level: 'warning',
    });
  }

  if (mode === 'review') {
    await safeBringToFront(page);
    onProgress({
      step: 'Siap direview di Facebook Reels',
      progressPercent: 85,
      log: 'Video dan deskripsi Facebook Reels sudah siap. Silakan review lalu klik Terbitkan / Publish.',
      level: 'success',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Video dan deskripsi sudah disiapkan di Meta Business Suite. Cek tab browser untuk konfirmasi akhir.',
    };
  }

  onProgress({
    step: 'Melanjutkan ke tahap publikasi Facebook Reels',
    progressPercent: 84,
    log: 'Menekan tombol Next / Selanjutnya di Facebook Reels Composer.',
    level: 'info',
  });

  for (let stepIdx = 0; stepIdx < 2; stepIdx += 1) {
    const clickedNext = await tryClickAny(
      page,
      [
        'div[role="button"]:has-text("Next")',
        'button:has-text("Next")',
        'div[role="button"]:has-text("Selanjutnya")',
        'button:has-text("Selanjutnya")',
      ],
      6000,
      signal
    );
    if (!clickedNext) break;
    await humanDelay(1200, 2000, signal);
  }

  const published = await tryClickAny(
    page,
    [
      'div[role="button"]:has-text("Publish")',
      'button:has-text("Publish")',
      'div[role="button"]:has-text("Terbitkan")',
      'button:has-text("Terbitkan")',
      'div[role="button"]:has-text("Share")',
      'button:has-text("Share")',
      'div[role="button"]:has-text("Bagikan")',
      'button:has-text("Bagikan")',
    ],
    10000,
    signal
  );

  if (!published) {
    await safeBringToFront(page);
    onProgress({
      step: 'Tombol Publish Facebook belum siap',
      progressPercent: 85,
      log: 'Tombol Publish / Terbitkan Facebook belum bisa diklik (video mungkin masih diproses). Tab dibiarkan terbuka.',
      level: 'warning',
    });
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      summary:
        'Tombol Publish Facebook belum siap diklik otomatis. Video dan deskripsi tetap terbuka di tab browser.',
    };
  }

  await humanDelay(3000, 4500, signal);
  onProgress({
    step: 'Terpublikasi di Facebook Reels',
    progressPercent: 100,
    log: 'Tombol Publish / Terbitkan Facebook Reels telah diklik.',
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: null,
    summary: 'Berhasil klik Publish di Facebook Reels.',
  };
}

export async function publishViaBrowser(
  params: BrowserPublishParams
): Promise<BrowserPublishResult> {
  const { platform, item, mode, signal, onProgress, workspace } = params;
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
      return await publishYouTubeStudio(
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
      return await publishTikTokStudio(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress
      );
    }
    if (platform === 'ig_reels') {
      return await publishInstagramReels(
        page,
        item,
        videoPath,
        videoFileName,
        mode,
        signal,
        onProgress
      );
    }
    return await publishFacebookReels(
      page,
      item,
      videoPath,
      videoFileName,
      mode,
      signal,
      onProgress
    );
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
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
