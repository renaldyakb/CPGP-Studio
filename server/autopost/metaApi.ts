import fs from 'node:fs';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type {
  AutoPostMode,
  MetaDiscoveredPage,
} from '../../src/types/autopost.ts';
import type { ContentPlannerItem } from '../../src/types/planner.ts';
import {
  detectAutoPostCapabilities,
  getInternalAutoPostConfig,
} from './config.ts';
import { resolveUploadVideoForItem } from './contentHelpers.ts';

const META_GRAPH_BASE = 'https://graph.facebook.com';
const META_RUPLOAD_BASE = 'https://rupload.facebook.com';
const DEFAULT_GRAPH_VERSION = 'v25.0';
const IG_POLL_INTERVAL_MS = 3000;
const IG_POLL_MAX_ATTEMPTS = 50;

const discoveredPageTokens = new Map<string, string>();

export interface MetaApiProgressUpdate {
  step: string;
  progressPercent: number;
  log?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
}

export interface MetaApiPublishParams {
  item: ContentPlannerItem;
  mode: AutoPostMode;
  signal: AbortSignal;
  onProgress: (update: MetaApiProgressUpdate) => void;
  workspace?: WorkspaceMetadata;
}

export interface MetaApiPublishResult {
  status: 'completed' | 'awaiting_review';
  publishedUrl: string | null;
  summary: string;
  pendingIgContainerId?: string;
}

export interface DiscoverMetaAccountsResult {
  pages: MetaDiscoveredPage[];
  tokenType: 'user_or_system' | 'page';
  graphApiVersion: string;
}

interface MetaGraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

interface RawMetaPageNode {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
  } | null;
}

export function getCachedPageToken(pageId: string): string | null {
  const key = pageId.trim();
  if (!key) return null;
  return discoveredPageTokens.get(key) ?? null;
}

function normalizeGraphVersion(raw?: string | null): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return DEFAULT_GRAPH_VERSION;
  return /^v\d+/i.test(trimmed) ? trimmed : `v${trimmed}`;
}

function createAbortError(message: string): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal, message = 'Proses Meta Graph API dibatalkan.'): void {
  if (signal?.aborted) {
    throw createAbortError(message);
  }
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError('Proses Meta Graph API dibatalkan.'));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError('Proses Meta Graph API dibatalkan.'));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
}

function extractMetaErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const errObj = (payload as MetaGraphErrorPayload).error;
    if (errObj && typeof errObj === 'object') {
      const detail =
        (typeof errObj.error_user_msg === 'string' && errObj.error_user_msg.trim()) ||
        (typeof errObj.message === 'string' && errObj.message.trim()) ||
        '';
      if (detail) {
        return typeof errObj.code === 'number'
          ? `${detail} (Kode Meta: ${errObj.code})`
          : detail;
      }
    }
    const rawText = (payload as { rawText?: unknown }).rawText;
    if (typeof rawText === 'string' && rawText.trim()) {
      return rawText.trim().slice(0, 300);
    }
  }
  return fallback;
}

function getItemCaption(item: ContentPlannerItem): string {
  return (
    item.autoMetadata.captionParsed.rawText.trim() ||
    item.userProperties.customTitle.trim() ||
    item.autoMetadata.captionParsed.hookTitle.trim() ||
    item.folderCode
  );
}

function getItemTitle(item: ContentPlannerItem): string {
  const candidate =
    item.userProperties.customTitle.trim() ||
    item.autoMetadata.captionParsed.hookTitle.trim() ||
    item.folderCode;
  return candidate.slice(0, 100);
}

function toMetaDiscoveredPage(
  node: RawMetaPageNode,
  fallbackHasPageToken: boolean
): MetaDiscoveredPage {
  const pageId = String(node.id ?? '').trim();
  const pageName =
    typeof node.name === 'string' && node.name.trim()
      ? node.name.trim()
      : `Page ${pageId}`;
  const hasPageToken =
    fallbackHasPageToken ||
    Boolean(typeof node.access_token === 'string' && node.access_token.trim());
  const igUserId = node.instagram_business_account?.id
    ? String(node.instagram_business_account.id).trim()
    : null;
  const igUsername =
    typeof node.instagram_business_account?.username === 'string' &&
    node.instagram_business_account.username.trim()
      ? node.instagram_business_account.username.trim()
      : null;

  return {
    pageId,
    pageName,
    hasPageToken,
    igUserId,
    igUsername,
  };
}

export async function discoverMetaAccounts(
  inputToken?: string,
  graphVersion?: string
): Promise<DiscoverMetaAccountsResult> {
  const config = getInternalAutoPostConfig();
  const token =
    inputToken?.trim() ||
    config.metaApi.accessToken.trim() ||
    config.metaApi.pageAccessToken.trim();

  if (!token) {
    throw new Error(
      'Access Token Meta belum diisi. Masukkan User, System, atau Page Access Token terlebih dahulu.'
    );
  }

  const ver = normalizeGraphVersion(graphVersion || config.metaApi.graphApiVersion);

  const accountsUrl = new URL(`${META_GRAPH_BASE}/${ver}/me/accounts`);
  accountsUrl.searchParams.set(
    'fields',
    'id,name,access_token,instagram_business_account{id,username}'
  );
  accountsUrl.searchParams.set('limit', '50');
  accountsUrl.searchParams.set('access_token', token);

  let accountsErrorMessage: string | null = null;
  let accountsSucceededEmpty = false;

  try {
    const accountsRes = await fetch(accountsUrl.toString(), { method: 'GET' });
    const accountsPayload = (await parseJsonSafe(accountsRes)) as {
      data?: RawMetaPageNode[];
      error?: MetaGraphErrorPayload['error'];
    };

    if (accountsRes.ok && Array.isArray(accountsPayload.data)) {
      const validNodes = accountsPayload.data.filter(
        (node): node is RawMetaPageNode => Boolean(node && node.id)
      );

      if (validNodes.length > 0) {
        const pages = validNodes.map((node) => {
          const pageId = String(node.id).trim();
          if (typeof node.access_token === 'string' && node.access_token.trim()) {
            discoveredPageTokens.set(pageId, node.access_token.trim());
          }
          return toMetaDiscoveredPage(node, false);
        });

        return {
          pages,
          tokenType: 'user_or_system',
          graphApiVersion: ver,
        };
      }

      accountsSucceededEmpty = true;
    } else {
      accountsErrorMessage = extractMetaErrorMessage(
        accountsPayload,
        `HTTP ${accountsRes.status}`
      );
    }
  } catch (err) {
    accountsErrorMessage = err instanceof Error ? err.message : String(err);
  }

  // Fallback for Page Access Token pasted directly
  const meUrl = new URL(`${META_GRAPH_BASE}/${ver}/me`);
  meUrl.searchParams.set(
    'fields',
    'id,name,instagram_business_account{id,username}'
  );
  meUrl.searchParams.set('access_token', token);

  const meRes = await fetch(meUrl.toString(), { method: 'GET' });
  const mePayload = (await parseJsonSafe(meRes)) as RawMetaPageNode &
    MetaGraphErrorPayload;

  if (meRes.ok && mePayload && typeof mePayload.id === 'string' && mePayload.id.trim()) {
    const pageId = mePayload.id.trim();
    discoveredPageTokens.set(pageId, token);

    return {
      pages: [toMetaDiscoveredPage(mePayload, true)],
      tokenType: 'page',
      graphApiVersion: ver,
    };
  }

  const meErrorMessage = extractMetaErrorMessage(
    mePayload,
    `HTTP ${meRes.status}`
  );

  if (accountsSucceededEmpty) {
    throw new Error(
      `Token valid tetapi tidak ditemukan Facebook Page yang dapat diakses. Pastikan izin pages_show_list dan akses Page aktif. Detail Meta: ${meErrorMessage}`
    );
  }

  const combinedDetail = accountsErrorMessage || meErrorMessage;
  throw new Error(
    `Token Meta Graph API tidak valid atau sudah kedaluwarsa: ${combinedDetail}`
  );
}

export async function publishFacebookReelViaMetaApi(
  params: MetaApiPublishParams
): Promise<MetaApiPublishResult> {
  const { item, mode, signal, onProgress, workspace } = params;
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');

  const resolvedVideo = resolveUploadVideoForItem(item, workspace);
  if (!resolvedVideo) {
    throw new Error(
      `File video yang siap diunggah tidak ditemukan untuk item ${item.folderCode}.`
    );
  }
  const {
    absolutePath: videoPath,
    fileName,
    sizeFormatted: fileSizeLabel,
  } = resolvedVideo;

  const capabilities = detectAutoPostCapabilities(workspace?.id);
  const config = getInternalAutoPostConfig(workspace?.id);
  const pageId = config.metaApi.pageId.trim();
  const token =
    config.metaApi.pageAccessToken.trim() || config.metaApi.accessToken.trim();
  const ver = normalizeGraphVersion(config.metaApi.graphApiVersion);

  if (!capabilities.metaFbApiReady || !pageId || !token) {
    throw new Error(
      'Meta Graph API untuk Facebook Reels belum siap. Aktifkan Meta API, isi Access Token, dan pilih Facebook Page terlebih dahulu.'
    );
  }

  const captionRawText = getItemCaption(item);
  const hookTitle = getItemTitle(item);

  // Step 1: Start upload session
  onProgress({
    step: 'Memulai sesi upload Facebook Reels',
    progressPercent: 15,
    log: `Menginisialisasi sesi upload Facebook Reels untuk Page ${config.metaApi.pageName || pageId} (${fileName}, ${fileSizeLabel}).`,
    level: 'info',
  });

  const startBody = new URLSearchParams({
    upload_phase: 'start',
    access_token: token,
  });

  const startRes = await fetch(
    `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(pageId)}/video_reels`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: startBody.toString(),
      signal,
    }
  );

  const startPayload = (await parseJsonSafe(startRes)) as {
    video_id?: string;
    upload_url?: string;
  } & MetaGraphErrorPayload;

  if (!startRes.ok || startPayload.error) {
    const detail = extractMetaErrorMessage(
      startPayload,
      `HTTP ${startRes.status}`
    );
    throw new Error(`Gagal memulai sesi upload Facebook Reels: ${detail}`);
  }

  const videoId =
    typeof startPayload.video_id === 'string'
      ? startPayload.video_id.trim()
      : '';
  if (!videoId) {
    throw new Error(
      'Meta Graph API tidak mengembalikan video_id saat memulai sesi upload Facebook Reels.'
    );
  }

  const uploadUrl =
    typeof startPayload.upload_url === 'string' && startPayload.upload_url.trim()
      ? startPayload.upload_url.trim()
      : `${META_RUPLOAD_BASE}/video-upload/${ver}/${encodeURIComponent(videoId)}`;

  // Step 2: Upload binary video to rupload.facebook.com
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');
  onProgress({
    step: `Membaca file video ${fileName}`,
    progressPercent: 25,
    log: `Membaca file ${fileName} dari disk untuk diunggah ke server Meta.`,
    level: 'info',
  });

  const videoBuffer = await fs.promises.readFile(videoPath);
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');

  onProgress({
    step: 'Mengunggah video ke server Meta (rupload)',
    progressPercent: 45,
    log: `Mengirim biner video (${videoBuffer.length} byte) ke server rupload Meta.`,
    level: 'info',
  });

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      offset: '0',
      file_size: String(videoBuffer.length),
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(videoBuffer),
    signal,
  });

  const uploadPayload = (await parseJsonSafe(uploadRes)) as {
    success?: boolean;
  } & MetaGraphErrorPayload;

  if (!uploadRes.ok || uploadPayload.error || uploadPayload.success === false) {
    const detail = extractMetaErrorMessage(
      uploadPayload,
      `HTTP ${uploadRes.status}`
    );
    throw new Error(
      `Gagal mengunggah biner video Facebook Reels ke server Meta: ${detail}`
    );
  }

  onProgress({
    step: 'Upload biner video Facebook selesai',
    progressPercent: 75,
    log: `Video berhasil terunggah ke server Meta (Video ID: ${videoId}).`,
    level: 'info',
  });

  // Step 3: Finish upload & set state (PUBLISHED or DRAFT)
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');
  const videoState = mode === 'publish' ? 'PUBLISHED' : 'DRAFT';

  onProgress({
    step:
      mode === 'publish'
        ? 'Menerbitkan Facebook Reels'
        : 'Menyimpan draft Facebook Reels',
    progressPercent: 85,
    log: `Menyelesaikan publikasi Facebook Reels dengan status ${videoState}.`,
    level: 'info',
  });

  const finishBody = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: videoState,
    description: captionRawText,
    title: hookTitle,
    access_token: token,
  });

  const finishRes = await fetch(
    `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(pageId)}/video_reels`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: finishBody.toString(),
      signal,
    }
  );

  const finishPayload = (await parseJsonSafe(finishRes)) as {
    success?: boolean;
  } & MetaGraphErrorPayload;

  if (!finishRes.ok || finishPayload.error || finishPayload.success === false) {
    const detail = extractMetaErrorMessage(
      finishPayload,
      `HTTP ${finishRes.status}`
    );
    throw new Error(`Gagal menyelesaikan publikasi Facebook Reels: ${detail}`);
  }

  const publishedUrl = `https://www.facebook.com/reel/${videoId}`;

  onProgress({
    step:
      mode === 'publish'
        ? 'Facebook Reels berhasil diterbitkan'
        : 'Draft Facebook Reels berhasil disimpan',
    progressPercent: mode === 'publish' ? 100 : 95,
    log:
      mode === 'publish'
        ? `Facebook Reels telah tayang di ${publishedUrl}.`
        : `Draft Facebook Reels tersimpan (${publishedUrl}).`,
    level: 'success',
  });

  return {
    status: mode === 'publish' ? 'completed' : 'awaiting_review',
    publishedUrl,
    summary:
      mode === 'publish'
        ? `Berhasil publish Facebook Reels via Meta Graph API: ${publishedUrl}`
        : `Draft Facebook Reels berhasil diunggah via Meta Graph API (${publishedUrl}). Periksa di Meta Business Suite lalu klik Tandai Sudah Publish.`,
  };
}

export async function publishInstagramContainerNow(
  containerId: string,
  signal?: AbortSignal,
  workspaceId?: string
): Promise<{ mediaId: string; permalink: string | null }> {
  throwIfAborted(signal, 'Publikasi container Instagram Reels dibatalkan.');

  const cleanContainerId = containerId.trim();
  if (!cleanContainerId) {
    throw new Error('Container ID Instagram tidak valid.');
  }

  const config = getInternalAutoPostConfig(workspaceId);
  const igUserId = config.metaApi.igUserId.trim();
  const token =
    config.metaApi.accessToken.trim() || config.metaApi.pageAccessToken.trim();
  const ver = normalizeGraphVersion(config.metaApi.graphApiVersion);

  if (!igUserId || !token) {
    throw new Error(
      'Konfigurasi Meta Graph API untuk Instagram belum lengkap (IG User ID atau Access Token kosong).'
    );
  }

  const publishBody = new URLSearchParams({
    creation_id: cleanContainerId,
    access_token: token,
  });

  const publishRes = await fetch(
    `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(igUserId)}/media_publish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: publishBody.toString(),
      signal,
    }
  );

  const publishPayload = (await parseJsonSafe(publishRes)) as {
    id?: string;
  } & MetaGraphErrorPayload;

  if (!publishRes.ok || publishPayload.error) {
    const detail = extractMetaErrorMessage(
      publishPayload,
      `HTTP ${publishRes.status}`
    );
    throw new Error(`Gagal menerbitkan container Instagram Reels: ${detail}`);
  }

  const mediaId =
    typeof publishPayload.id === 'string' ? publishPayload.id.trim() : '';
  if (!mediaId) {
    throw new Error(
      'Meta Graph API tidak mengembalikan Media ID setelah media_publish Instagram.'
    );
  }

  let permalink: string | null = null;
  try {
    const mediaUrl = new URL(
      `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(mediaId)}`
    );
    mediaUrl.searchParams.set('fields', 'permalink');
    mediaUrl.searchParams.set('access_token', token);

    const mediaRes = await fetch(mediaUrl.toString(), {
      method: 'GET',
      signal,
    });
    const mediaPayload = (await parseJsonSafe(mediaRes)) as {
      permalink?: string;
    };
    if (
      mediaRes.ok &&
      typeof mediaPayload.permalink === 'string' &&
      mediaPayload.permalink.trim()
    ) {
      permalink = mediaPayload.permalink.trim();
    }
  } catch {
    permalink = null;
  }

  return { mediaId, permalink };
}

export async function publishInstagramReelViaMetaApi(
  params: MetaApiPublishParams
): Promise<MetaApiPublishResult> {
  const { item, mode, signal, onProgress, workspace } = params;
  throwIfAborted(signal, 'Upload Instagram Reels via Meta API dibatalkan.');

  const resolvedVideo = resolveUploadVideoForItem(item, workspace);
  if (!resolvedVideo) {
    throw new Error(
      `File video yang siap diunggah tidak ditemukan untuk item ${item.folderCode}.`
    );
  }
  const {
    absolutePath: videoPath,
    fileName,
    sizeFormatted: fileSizeLabel,
  } = resolvedVideo;

  const capabilities = detectAutoPostCapabilities(workspace?.id);
  const config = getInternalAutoPostConfig(workspace?.id);
  const igUserId = config.metaApi.igUserId.trim();
  const token =
    config.metaApi.accessToken.trim() || config.metaApi.pageAccessToken.trim();
  const ver = normalizeGraphVersion(config.metaApi.graphApiVersion);

  if (!capabilities.metaIgApiReady || !igUserId || !token) {
    throw new Error(
      'Meta Graph API untuk Instagram Reels belum siap. Aktifkan Meta API, isi Access Token, dan pastikan akun Instagram Business/Creator terpilih.'
    );
  }

  const captionRawText = getItemCaption(item);
  const shareToFeed = config.metaApi.shareToFeed;
  const igThumbOffsetMs = Math.max(0, Math.round(config.metaApi.igThumbOffsetMs));

  // Step 1: Create resumable Reels container
  onProgress({
    step: 'Membuat container upload Instagram Reels',
    progressPercent: 15,
    log: `Membuat container resumable Instagram Reels untuk ${config.metaApi.igUsername ? `@${config.metaApi.igUsername}` : igUserId} (${fileName}, ${fileSizeLabel}).`,
    level: 'info',
  });

  const createBody = new URLSearchParams({
    media_type: 'REELS',
    upload_type: 'resumable',
    caption: captionRawText,
    share_to_feed: String(shareToFeed),
    thumb_offset: String(igThumbOffsetMs),
    access_token: token,
  });

  const createRes = await fetch(
    `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(igUserId)}/media`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: createBody.toString(),
      signal,
    }
  );

  const createPayload = (await parseJsonSafe(createRes)) as {
    id?: string;
    uri?: string;
  } & MetaGraphErrorPayload;

  if (!createRes.ok || createPayload.error) {
    const detail = extractMetaErrorMessage(
      createPayload,
      `HTTP ${createRes.status}`
    );
    throw new Error(
      `Gagal membuat container upload Instagram Reels: ${detail}`
    );
  }

  const containerId =
    typeof createPayload.id === 'string' ? createPayload.id.trim() : '';
  const uploadUri =
    typeof createPayload.uri === 'string' ? createPayload.uri.trim() : '';

  if (!containerId || !uploadUri) {
    throw new Error(
      'Meta Graph API tidak mengembalikan container ID atau upload URI untuk Instagram Reels.'
    );
  }

  // Step 2: Upload binary video to rupload.facebook.com
  throwIfAborted(signal, 'Upload Instagram Reels via Meta API dibatalkan.');
  onProgress({
    step: `Membaca file video ${fileName}`,
    progressPercent: 25,
    log: `Membaca file ${fileName} dari disk untuk diunggah ke container Instagram (${containerId}).`,
    level: 'info',
  });

  const videoBuffer = await fs.promises.readFile(videoPath);
  throwIfAborted(signal, 'Upload Instagram Reels via Meta API dibatalkan.');

  onProgress({
    step: 'Mengunggah video ke server Meta (rupload)',
    progressPercent: 40,
    log: `Mengirim biner video (${videoBuffer.length} byte) ke server rupload Instagram.`,
    level: 'info',
  });

  const uploadRes = await fetch(uploadUri, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      offset: '0',
      file_size: String(videoBuffer.length),
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(videoBuffer),
    signal,
  });

  const uploadPayload = (await parseJsonSafe(uploadRes)) as {
    success?: boolean;
  } & MetaGraphErrorPayload;

  if (!uploadRes.ok || uploadPayload.error || uploadPayload.success === false) {
    const detail = extractMetaErrorMessage(
      uploadPayload,
      `HTTP ${uploadRes.status}`
    );
    throw new Error(
      `Gagal mengunggah biner video Instagram Reels ke server Meta: ${detail}`
    );
  }

  onProgress({
    step: 'Video selesai diunggah ke container Meta',
    progressPercent: 60,
    log: `Upload biner ke container ${containerId} selesai. Menunggu pemrosesan di server Meta...`,
    level: 'info',
  });

  // Step 3: Poll container status until FINISHED
  let containerFinished = false;

  for (let attempt = 1; attempt <= IG_POLL_MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal, 'Upload Instagram Reels via Meta API dibatalkan.');

    const statusUrl = new URL(
      `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(containerId)}`
    );
    statusUrl.searchParams.set('fields', 'status_code,status');
    statusUrl.searchParams.set('access_token', token);

    const statusRes = await fetch(statusUrl.toString(), {
      method: 'GET',
      signal,
    });

    const statusPayload = (await parseJsonSafe(statusRes)) as {
      status_code?: string;
      status?: string;
    } & MetaGraphErrorPayload;

    if (!statusRes.ok || statusPayload.error) {
      const detail = extractMetaErrorMessage(
        statusPayload,
        `HTTP ${statusRes.status}`
      );
      throw new Error(
        `Gagal memeriksa status pemrosesan container Instagram Reels: ${detail}`
      );
    }

    const statusCode =
      typeof statusPayload.status_code === 'string'
        ? statusPayload.status_code.trim().toUpperCase()
        : '';
    const statusText =
      typeof statusPayload.status === 'string' ? statusPayload.status.trim() : '';

    if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') {
      containerFinished = true;
      break;
    }

    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      const reason = statusText ? `: ${statusText}` : '';
      throw new Error(
        `Server Meta gagal memproses video Instagram Reels (status: ${statusCode}${reason}).`
      );
    }

    const pollProgress = Math.min(
      85,
      65 + Math.round(((attempt - 1) / Math.max(1, IG_POLL_MAX_ATTEMPTS - 1)) * 20)
    );
    onProgress({
      step: `Memproses video Instagram di server Meta (${statusCode || 'IN_PROGRESS'})`,
      progressPercent: pollProgress,
      log:
        attempt === 1 || attempt % 5 === 0
          ? `Status container Instagram: ${statusCode || 'IN_PROGRESS'} (pengecekan ${attempt}/${IG_POLL_MAX_ATTEMPTS}).`
          : undefined,
      level: 'info',
    });

    if (attempt < IG_POLL_MAX_ATTEMPTS) {
      await sleepWithAbort(IG_POLL_INTERVAL_MS, signal);
    }
  }

  if (!containerFinished) {
    throw new Error(
      'Pemrosesan video Instagram Reels di server Meta melebihi batas waktu tunggu.'
    );
  }

  onProgress({
    step: 'Container Instagram Reels siap diterbitkan',
    progressPercent: 85,
    log: `Pemrosesan container Instagram Reels (${containerId}) selesai (FINISHED).`,
    level: 'success',
  });

  // Step 4: Review mode vs Publish mode
  if (mode === 'review') {
    return {
      status: 'awaiting_review',
      publishedUrl: null,
      pendingIgContainerId: containerId,
      summary:
        'Container Instagram Reels sudah selesai diproses di server Meta. Klik Tandai Sudah Publish untuk menerbitkan sekarang.',
    };
  }

  onProgress({
    step: 'Menerbitkan Instagram Reels',
    progressPercent: 92,
    log: `Menerbitkan container ${containerId} ke Instagram Reels via media_publish...`,
    level: 'info',
  });

  const { mediaId, permalink } = await publishInstagramContainerNow(
    containerId,
    signal,
    workspace?.id
  );

  onProgress({
    step: 'Instagram Reels berhasil diterbitkan',
    progressPercent: 100,
    log: permalink
      ? `Instagram Reels telah tayang di ${permalink}.`
      : `Instagram Reels telah tayang (Media ID: ${mediaId}).`,
    level: 'success',
  });

  return {
    status: 'completed',
    publishedUrl: permalink,
    summary: permalink
      ? `Berhasil publish Instagram Reels via Meta Graph API: ${permalink}`
      : `Berhasil publish Instagram Reels via Meta Graph API (Media ID: ${mediaId}).`,
  };
}
