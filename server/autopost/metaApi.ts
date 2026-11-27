import fs from 'node:fs';
import { Readable } from 'node:stream';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type {
  AutoPostMode,
  MetaConnectionTestResult,
  MetaDiscoveredPage,
  MetaTokenExchangeResult,
} from '../../src/types/autopost.ts';
import type { ContentPlannerItem } from '../../src/types/planner.ts';
import { getActiveWorkspace } from '../workspaces/registry.ts';
import {
  detectAutoPostCapabilities,
  getInternalAutoPostConfig,
  onMetaConfigCleared,
  updateAutoPostSettings,
  type UpdateAutoPostSettingsPatch,
} from './config.ts';
import { resolveUploadVideoForItem } from './contentHelpers.ts';

const META_GRAPH_BASE = 'https://graph.facebook.com';
const META_OAUTH_DIALOG_BASE = 'https://www.facebook.com';
const META_RUPLOAD_BASE = 'https://rupload.facebook.com';
const DEFAULT_GRAPH_VERSION = 'v25.0';
const IG_POLL_INTERVAL_MS = 3000;
const IG_POLL_MAX_ATTEMPTS = 50;

export const META_REQUIRED_IG_PERMISSIONS = [
  'instagram_basic',
  'instagram_content_publish',
] as const;

export const META_REQUIRED_FB_PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'publish_video',
] as const;

export const META_OAUTH_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'publish_video',
] as const;

const discoveredPageTokens = new Map<string, string>();

function resolveMetaWorkspaceId(workspaceId?: string): string {
  const trimmed = workspaceId?.trim();
  if (trimmed) return trimmed;
  return getActiveWorkspace().id;
}

function buildPageTokenCacheKey(pageId: string, workspaceId?: string): string {
  return `${resolveMetaWorkspaceId(workspaceId)}::${pageId.trim()}`;
}

export function clearCachedPageTokens(workspaceId?: string): void {
  const prefix = `${resolveMetaWorkspaceId(workspaceId)}::`;
  for (const key of Array.from(discoveredPageTokens.keys())) {
    if (key.startsWith(prefix)) {
      discoveredPageTokens.delete(key);
    }
  }
}

onMetaConfigCleared((workspaceId) => {
  clearCachedPageTokens(workspaceId);
});

export interface MetaApiProgressUpdate {
  step: string;
  progressPercent: number;
  log?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
}

export interface MetaApiPublishParams {
  item: ContentPlannerItem;
  mode: AutoPostMode;
  scheduledAt?: string | null;
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

export function getCachedPageToken(
  pageId: string,
  workspaceId?: string
): string | null {
  const key = pageId.trim();
  if (!key) return null;
  return discoveredPageTokens.get(buildPageTokenCacheKey(key, workspaceId)) ?? null;
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

function resolveMetaRedirectUri(configuredUri: string, origin?: string): string {
  if (configuredUri.trim()) {
    return configuredUri.trim();
  }
  const normalizedOrigin = (origin || 'http://localhost:5173').replace(
    /\/+$/,
    ''
  );
  return `${normalizedOrigin}/api/autopost/meta/callback`;
}

async function fetchPageInstagramBusinessAccount(
  pageId: string,
  pageToken: string,
  ver: string
): Promise<{ id?: string; username?: string } | null> {
  if (!pageId || !pageToken) return null;
  try {
    const pageUrl = new URL(
      `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(pageId)}`
    );
    pageUrl.searchParams.set('fields', 'instagram_business_account{id,username}');
    pageUrl.searchParams.set('access_token', pageToken);

    const res = await fetch(pageUrl.toString(), { method: 'GET' });
    const payload = (await parseJsonSafe(res)) as RawMetaPageNode &
      MetaGraphErrorPayload;

    if (
      res.ok &&
      !payload.error &&
      payload.instagram_business_account &&
      payload.instagram_business_account.id
    ) {
      return payload.instagram_business_account;
    }
  } catch {
    // Fallback lookup is best-effort
  }
  return null;
}

export async function discoverMetaAccounts(
  inputToken?: string,
  graphVersion?: string,
  workspaceId?: string
): Promise<DiscoverMetaAccountsResult> {
  const config = getInternalAutoPostConfig(workspaceId);
  const resolvedWorkspaceId = resolveMetaWorkspaceId(workspaceId);
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
        const enrichedNodes = await Promise.all(
          validNodes.map(async (node) => {
            const pageId = String(node.id).trim();
            const pageToken =
              typeof node.access_token === 'string' && node.access_token.trim()
                ? node.access_token.trim()
                : token;
            if (typeof node.access_token === 'string' && node.access_token.trim()) {
              discoveredPageTokens.set(
                buildPageTokenCacheKey(pageId, resolvedWorkspaceId),
                node.access_token.trim()
              );
            }

            if (!node.instagram_business_account?.id) {
              const fallbackIg = await fetchPageInstagramBusinessAccount(
                pageId,
                pageToken,
                ver
              );
              if (fallbackIg) {
                return {
                  ...node,
                  instagram_business_account: fallbackIg,
                };
              }
            }
            return node;
          })
        );

        const pages = enrichedNodes.map((node) =>
          toMetaDiscoveredPage(node, false)
        );

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
    discoveredPageTokens.set(
      buildPageTokenCacheKey(pageId, resolvedWorkspaceId),
      token
    );

    let enrichedMeNode: RawMetaPageNode = mePayload;
    if (!mePayload.instagram_business_account?.id) {
      const fallbackIg = await fetchPageInstagramBusinessAccount(
        pageId,
        token,
        ver
      );
      if (fallbackIg) {
        enrichedMeNode = {
          ...mePayload,
          instagram_business_account: fallbackIg,
        };
      }
    }

    return {
      pages: [toMetaDiscoveredPage(enrichedMeNode, true)],
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

export async function exchangeShortLivedMetaToken(params: {
  appId?: string;
  appSecret?: string;
  shortLivedToken: string;
  graphApiVersion?: string;
}): Promise<MetaTokenExchangeResult> {
  const config = getInternalAutoPostConfig();
  const appId = (params.appId ?? '').trim() || config.metaApi.appId.trim();
  const appSecret =
    (params.appSecret ?? '').trim() || config.metaApi.appSecret.trim();
  const shortLivedToken = (params.shortLivedToken ?? '').trim();
  const ver = normalizeGraphVersion(
    params.graphApiVersion || config.metaApi.graphApiVersion
  );

  if (!appId) {
    throw new Error(
      'App ID Meta belum diisi. Masukkan App ID dari Meta for Developers terlebih dahulu.'
    );
  }
  if (!appSecret) {
    throw new Error(
      'App Secret Meta belum diisi. Masukkan App Secret di pengaturan backend terlebih dahulu.'
    );
  }
  if (!shortLivedToken) {
    throw new Error(
      'Short-Lived Access Token wajib diisi untuk ditukar menjadi Long-Lived Token.'
    );
  }

  // Step 6A: Exchange Short-Lived Token -> Long-Lived User Token (~60 days)
  const exchangeUrl = new URL(`${META_GRAPH_BASE}/${ver}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', appId);
  exchangeUrl.searchParams.set('client_secret', appSecret);
  exchangeUrl.searchParams.set('fb_exchange_token', shortLivedToken);

  const exchangeRes = await fetch(exchangeUrl.toString(), { method: 'GET' });
  const exchangePayload = (await parseJsonSafe(exchangeRes)) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number | string;
  } & MetaGraphErrorPayload;

  if (!exchangeRes.ok || exchangePayload.error) {
    const detail = extractMetaErrorMessage(
      exchangePayload,
      `HTTP ${exchangeRes.status}`
    );
    throw new Error(
      `Gagal menukar Short-Lived Token menjadi Long-Lived Token: ${detail}`
    );
  }

  const longLivedToken =
    typeof exchangePayload.access_token === 'string'
      ? exchangePayload.access_token.trim()
      : '';
  if (!longLivedToken) {
    throw new Error(
      'Meta Graph API tidak mengembalikan access_token baru saat proses tukar token.'
    );
  }

  const rawExpiresIn =
    typeof exchangePayload.expires_in === 'number'
      ? exchangePayload.expires_in
      : typeof exchangePayload.expires_in === 'string'
        ? Number(exchangePayload.expires_in)
        : NaN;

  let longLivedTokenExpiresAt: string | null = null;
  let expiresInDays: number | null = null;
  if (Number.isFinite(rawExpiresIn) && rawExpiresIn > 0) {
    longLivedTokenExpiresAt = new Date(
      Date.now() + rawExpiresIn * 1000
    ).toISOString();
    expiresInDays = Math.max(1, Math.round(rawExpiresIn / 86400));
  }

  // Step 6B: Discover Pages & Permanent Page Tokens using the new Long-Lived Token
  let pages: MetaDiscoveredPage[] = [];
  try {
    const discovered = await discoverMetaAccounts(longLivedToken, ver);
    pages = discovered.pages;
  } catch {
    pages = [];
  }

  const currentPageId = config.metaApi.pageId.trim();
  const matchedExistingPage = currentPageId
    ? pages.find((page) => page.pageId === currentPageId) ?? null
    : null;
  const autoSelectedPage =
    pages.length === 1 ? pages[0] : matchedExistingPage;

  const metaPatch: NonNullable<UpdateAutoPostSettingsPatch['metaApi']> = {
    appId,
    appSecret,
    graphApiVersion: ver,
    accessToken: longLivedToken,
    tokenType: pages.length > 0 ? 'page_permanent' : 'long_lived',
    tokenExpiresAt: longLivedTokenExpiresAt,
  };

  if (autoSelectedPage) {
    const permanentPageToken = getCachedPageToken(autoSelectedPage.pageId);
    metaPatch.pageId = autoSelectedPage.pageId;
    metaPatch.pageName = autoSelectedPage.pageName;
    if (permanentPageToken) {
      metaPatch.pageAccessToken = permanentPageToken;
    }
    metaPatch.igUserId = autoSelectedPage.igUserId ?? '';
    metaPatch.igUsername = autoSelectedPage.igUsername ?? null;
    metaPatch.enabled = true;
  }

  const settings = updateAutoPostSettings({ metaApi: metaPatch });
  const capabilities = detectAutoPostCapabilities();

  return {
    ok: true,
    longLivedTokenExpiresAt,
    expiresInDays,
    pages,
    autoSelectedPage,
    settings,
    capabilities,
  };
}

export function createMetaOAuthUrl(origin: string): string {
  const config = getInternalAutoPostConfig();
  const appId = config.metaApi.appId.trim();
  const appSecret = config.metaApi.appSecret.trim();

  if (!appId || !appSecret) {
    throw new Error(
      'Meta App ID dan App Secret belum dikonfigurasi di pengaturan Auto-Post.'
    );
  }

  const ver = normalizeGraphVersion(config.metaApi.graphApiVersion);
  const redirectUri = resolveMetaRedirectUri(config.metaApi.redirectUri, origin);

  const authUrl = new URL(`${META_OAUTH_DIALOG_BASE}/${ver}/dialog/oauth`);
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', META_OAUTH_SCOPES.join(','));

  return authUrl.toString();
}

export async function exchangeMetaOAuthCode(
  code: string,
  origin: string
): Promise<MetaTokenExchangeResult> {
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new Error('Parameter code dari Meta OAuth tidak valid.');
  }

  const config = getInternalAutoPostConfig();
  const appId = config.metaApi.appId.trim();
  const appSecret = config.metaApi.appSecret.trim();

  if (!appId || !appSecret) {
    throw new Error(
      'Meta App ID dan App Secret belum dikonfigurasi di pengaturan Auto-Post.'
    );
  }

  const ver = normalizeGraphVersion(config.metaApi.graphApiVersion);
  const redirectUri = resolveMetaRedirectUri(config.metaApi.redirectUri, origin);

  const tokenUrl = new URL(`${META_GRAPH_BASE}/${ver}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);
  tokenUrl.searchParams.set('code', cleanCode);

  const tokenRes = await fetch(tokenUrl.toString(), { method: 'GET' });
  const tokenPayload = (await parseJsonSafe(tokenRes)) as {
    access_token?: string;
  } & MetaGraphErrorPayload;

  if (!tokenRes.ok || tokenPayload.error) {
    const detail = extractMetaErrorMessage(
      tokenPayload,
      `HTTP ${tokenRes.status}`
    );
    throw new Error(`Gagal menukar kode Meta OAuth menjadi token: ${detail}`);
  }

  const shortLivedToken =
    typeof tokenPayload.access_token === 'string'
      ? tokenPayload.access_token.trim()
      : '';
  if (!shortLivedToken) {
    throw new Error(
      'Meta OAuth tidak mengembalikan access_token yang valid.'
    );
  }

  return exchangeShortLivedMetaToken({
    appId,
    appSecret,
    shortLivedToken,
    graphApiVersion: ver,
  });
}

interface DebugTokenPayload {
  data?: {
    is_valid?: boolean;
    type?: string;
    expires_at?: number;
    scopes?: string[];
  };
}

async function fetchGrantedPermissionsViaMePermissions(
  ver: string,
  token: string
): Promise<string[]> {
  if (!token) return [];
  try {
    const permUrl = new URL(`${META_GRAPH_BASE}/${ver}/me/permissions`);
    permUrl.searchParams.set('access_token', token);
    const res = await fetch(permUrl.toString(), { method: 'GET' });
    const payload = (await parseJsonSafe(res)) as {
      data?: Array<{ permission?: string; status?: string }>;
    } & MetaGraphErrorPayload;

    if (res.ok && !payload.error && Array.isArray(payload.data)) {
      return payload.data
        .filter(
          (entry) =>
            entry &&
            entry.status === 'granted' &&
            typeof entry.permission === 'string' &&
            entry.permission.trim().length > 0
        )
        .map((entry) => String(entry.permission).trim());
    }
  } catch {
    // Best-effort permissions lookup
  }
  return [];
}

export async function testMetaConnection(): Promise<MetaConnectionTestResult> {
  const config = getInternalAutoPostConfig();
  const ver = normalizeGraphVersion(config.metaApi.graphApiVersion);
  const checkedAt = new Date().toISOString();

  const appId = config.metaApi.appId.trim();
  const appSecret = config.metaApi.appSecret.trim();
  const userToken = config.metaApi.accessToken.trim();
  const storedPageToken = config.metaApi.pageAccessToken.trim();
  const pageToken = storedPageToken || userToken;
  const igToken = userToken || storedPageToken;
  const pageId = config.metaApi.pageId.trim();
  const igUserId = config.metaApi.igUserId.trim();

  const checkFbPage = async (): Promise<MetaConnectionTestResult['fbPage']> => {
    if (!pageId) {
      return {
        ok: false,
        pageId: '',
        pageName: null,
        error: 'Facebook Page ID belum diisi.',
      };
    }
    if (!pageToken) {
      return {
        ok: false,
        pageId,
        pageName: config.metaApi.pageName,
        error: 'Access Token Meta belum diisi.',
      };
    }

    try {
      const pageUrl = new URL(
        `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(pageId)}`
      );
      pageUrl.searchParams.set(
        'fields',
        'id,name,instagram_business_account{id,username}'
      );
      pageUrl.searchParams.set('access_token', pageToken);

      const res = await fetch(pageUrl.toString(), { method: 'GET' });
      const payload = (await parseJsonSafe(res)) as RawMetaPageNode &
        MetaGraphErrorPayload;

      if (res.ok && !payload.error && typeof payload.id === 'string' && payload.id.trim()) {
        const resolvedName =
          typeof payload.name === 'string' && payload.name.trim()
            ? payload.name.trim()
            : config.metaApi.pageName;
        return {
          ok: true,
          pageId: payload.id.trim(),
          pageName: resolvedName,
          error: null,
        };
      }

      return {
        ok: false,
        pageId,
        pageName: config.metaApi.pageName,
        error: extractMetaErrorMessage(payload, `HTTP ${res.status}`),
      };
    } catch (err) {
      return {
        ok: false,
        pageId,
        pageName: config.metaApi.pageName,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const checkIgAccount = async (): Promise<
    MetaConnectionTestResult['igAccount']
  > => {
    if (!igUserId) {
      return {
        ok: false,
        igUserId: '',
        username: null,
        mediaCount: null,
        error: 'Instagram Business User ID belum diisi.',
      };
    }
    if (!igToken) {
      return {
        ok: false,
        igUserId,
        username: config.metaApi.igUsername,
        mediaCount: null,
        error: 'Access Token Meta belum diisi.',
      };
    }

    try {
      const igUrl = new URL(
        `${META_GRAPH_BASE}/${ver}/${encodeURIComponent(igUserId)}`
      );
      igUrl.searchParams.set('fields', 'id,username,media_count');
      igUrl.searchParams.set('access_token', igToken);

      const res = await fetch(igUrl.toString(), { method: 'GET' });
      const payload = (await parseJsonSafe(res)) as {
        id?: string;
        username?: string;
        media_count?: number;
      } & MetaGraphErrorPayload;

      if (res.ok && !payload.error && typeof payload.id === 'string' && payload.id.trim()) {
        const username =
          typeof payload.username === 'string' && payload.username.trim()
            ? payload.username.trim()
            : config.metaApi.igUsername;
        const mediaCount =
          typeof payload.media_count === 'number' &&
          Number.isFinite(payload.media_count)
            ? payload.media_count
            : null;
        return {
          ok: true,
          igUserId: payload.id.trim(),
          username,
          mediaCount,
          error: null,
        };
      }

      return {
        ok: false,
        igUserId,
        username: config.metaApi.igUsername,
        mediaCount: null,
        error: extractMetaErrorMessage(payload, `HTTP ${res.status}`),
      };
    } catch (err) {
      return {
        ok: false,
        igUserId,
        username: config.metaApi.igUsername,
        mediaCount: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const checkPermissions = async (): Promise<
    MetaConnectionTestResult['permissions']
  > => {
    let granted: string[] = [];
    let tokenExpiresAt: string | null = config.metaApi.tokenExpiresAt;
    let isNeverExpiring =
      config.metaApi.tokenType === 'page_permanent' && Boolean(storedPageToken);

    const tokenToInspect = storedPageToken || userToken;

    if (appId && appSecret && tokenToInspect) {
      try {
        const debugUrl = new URL(`${META_GRAPH_BASE}/${ver}/debug_token`);
        debugUrl.searchParams.set('input_token', tokenToInspect);
        debugUrl.searchParams.set('access_token', `${appId}|${appSecret}`);

        const res = await fetch(debugUrl.toString(), { method: 'GET' });
        const payload = (await parseJsonSafe(res)) as DebugTokenPayload &
          MetaGraphErrorPayload;

        if (res.ok && !payload.error && payload.data) {
          if (Array.isArray(payload.data.scopes)) {
            granted = payload.data.scopes
              .filter(
                (scope): scope is string =>
                  typeof scope === 'string' && scope.trim().length > 0
              )
              .map((scope) => scope.trim());
          }

          if (
            typeof payload.data.expires_at === 'number' &&
            Number.isFinite(payload.data.expires_at)
          ) {
            if (payload.data.expires_at === 0) {
              isNeverExpiring = true;
              tokenExpiresAt = null;
            } else if (payload.data.expires_at > 0) {
              isNeverExpiring = false;
              tokenExpiresAt = new Date(
                payload.data.expires_at * 1000
              ).toISOString();
            }
          }
        }
      } catch {
        // Fallback to /me/permissions below
      }
    }

    if (granted.length === 0 && (userToken || storedPageToken)) {
      granted = await fetchGrantedPermissionsViaMePermissions(
        ver,
        userToken || storedPageToken
      );
    }

    const uniqueGranted = Array.from(new Set(granted));
    const grantedSet = new Set(uniqueGranted);

    const missingIg = META_REQUIRED_IG_PERMISSIONS.filter(
      (perm) => !grantedSet.has(perm)
    );
    const missingFb = META_REQUIRED_FB_PERMISSIONS.filter(
      (perm) => !grantedSet.has(perm)
    );

    return {
      granted: uniqueGranted,
      missingIg,
      missingFb,
      tokenExpiresAt,
      isNeverExpiring,
    };
  };

  const [fbPage, igAccount, permissions] = await Promise.all([
    checkFbPage(),
    checkIgAccount(),
    checkPermissions(),
  ]);

  const ok =
    (fbPage.ok || igAccount.ok) &&
    (!pageId || fbPage.ok) &&
    (!igUserId || igAccount.ok);

  return {
    ok,
    checkedAt,
    graphApiVersion: ver,
    fbPage,
    igAccount,
    permissions,
  };
}

const META_REELS_MIN_SCHEDULE_MS = 10 * 60 * 1000;
const META_REELS_MAX_SCHEDULE_MS = 29 * 24 * 60 * 60 * 1000;

interface ParsedMetaSchedule {
  unixSeconds: number;
  displayLabel: string;
}

function parseMetaScheduledPublishTime(
  scheduledAt?: string | null
): ParsedMetaSchedule | null {
  if (typeof scheduledAt !== 'string' || !scheduledAt.trim()) {
    return null;
  }

  const cleaned = scheduledAt.trim();
  let date: Date;

  // Prefer wall-clock YYYY-MM-DDTHH:mm in local timezone so UI schedules don't shift by UTC offset
  const localMatch = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    const second = localMatch[6] ? Number(localMatch[6]) : 0;
    date = new Date(year, month - 1, day, hour, minute, second, 0);
  } else {
    date = new Date(cleaned);
  }

  if (!Number.isFinite(date.getTime())) {
    throw new Error(
      `Format waktu jadwal Facebook Reels tidak valid: "${cleaned}".`
    );
  }

  const diffMs = date.getTime() - Date.now();
  if (
    diffMs < META_REELS_MIN_SCHEDULE_MS ||
    diffMs > META_REELS_MAX_SCHEDULE_MS
  ) {
    throw new Error(
      'Waktu jadwal Facebook Reels via Meta Graph API harus antara 10 menit hingga 29 hari dari sekarang.'
    );
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return {
    unixSeconds: Math.floor(date.getTime() / 1000),
    displayLabel: `${yyyy}-${mm}-${dd} ${hh}:${min}`,
  };
}

async function uploadVideoFileToMetaRupload(params: {
  uploadUrl: string;
  videoPath: string;
  fileSize: number;
  token: string;
  signal: AbortSignal;
}): Promise<Response> {
  const { uploadUrl, videoPath, fileSize, token, signal } = params;
  const fileStream = fs.createReadStream(videoPath);

  const onAbort = () => {
    fileStream.destroy();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    const webStream = Readable.toWeb(fileStream) as unknown as BodyInit;
    const requestInit: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        offset: '0',
        file_size: String(fileSize),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileSize),
      },
      body: webStream,
      duplex: 'half',
      signal,
    };

    return await fetch(uploadUrl, requestInit);
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!fileStream.destroyed) {
      fileStream.destroy();
    }
  }
}

export async function publishFacebookReelViaMetaApi(
  params: MetaApiPublishParams
): Promise<MetaApiPublishResult> {
  const { item, mode, scheduledAt, signal, onProgress, workspace } = params;
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

  const parsedSchedule =
    mode === 'publish' ? parseMetaScheduledPublishTime(scheduledAt) : null;

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

  // Step 2: Stream binary video to rupload.facebook.com without buffering full video in RAM
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');
  onProgress({
    step: `Menyiapkan stream file video ${fileName}`,
    progressPercent: 25,
    log: `Menyiapkan stream file ${fileName} dari disk untuk diunggah ke server Meta.`,
    level: 'info',
  });

  const fileStat = await fs.promises.stat(videoPath);
  const fileSize = fileStat.size;
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');

  onProgress({
    step: 'Mengunggah video ke server Meta (rupload)',
    progressPercent: 45,
    log: `Mengirim stream biner video (${fileSize} byte) ke server rupload Meta.`,
    level: 'info',
  });

  const uploadRes = await uploadVideoFileToMetaRupload({
    uploadUrl,
    videoPath,
    fileSize,
    token,
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

  // Step 3: Finish upload & set state (PUBLISHED, SCHEDULED, or DRAFT)
  throwIfAborted(signal, 'Upload Facebook Reels via Meta API dibatalkan.');
  const isScheduled = Boolean(mode === 'publish' && parsedSchedule);
  const videoState =
    mode !== 'publish' ? 'DRAFT' : isScheduled ? 'SCHEDULED' : 'PUBLISHED';

  onProgress({
    step: isScheduled
      ? `Menjadwalkan Facebook Reels (${parsedSchedule!.displayLabel})`
      : mode === 'publish'
        ? 'Menerbitkan Facebook Reels'
        : 'Menyimpan draft Facebook Reels',
    progressPercent: 85,
    log: isScheduled
      ? `Menyelesaikan penjadwalan Facebook Reels untuk ${parsedSchedule!.displayLabel} (status ${videoState}).`
      : `Menyelesaikan publikasi Facebook Reels dengan status ${videoState}.`,
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

  if (isScheduled && parsedSchedule) {
    finishBody.set('scheduled_publish_time', String(parsedSchedule.unixSeconds));
  }

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
    step: isScheduled
      ? `Facebook Reels dijadwalkan (${parsedSchedule!.displayLabel})`
      : mode === 'publish'
        ? 'Facebook Reels berhasil diterbitkan'
        : 'Draft Facebook Reels berhasil disimpan',
    progressPercent: mode === 'publish' ? 100 : 95,
    log: isScheduled
      ? `Facebook Reels berhasil dijadwalkan untuk ${parsedSchedule!.displayLabel} (${publishedUrl}).`
      : mode === 'publish'
        ? `Facebook Reels telah tayang di ${publishedUrl}.`
        : `Draft Facebook Reels tersimpan (${publishedUrl}).`,
    level: 'success',
  });

  return {
    status: mode === 'publish' ? 'completed' : 'awaiting_review',
    publishedUrl,
    summary: isScheduled
      ? `Berhasil menjadwalkan Facebook Reels (${parsedSchedule!.displayLabel}) via Meta Graph API: ${publishedUrl}`
      : mode === 'publish'
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

  // Step 2: Stream binary video to rupload.facebook.com without buffering full video in RAM
  throwIfAborted(signal, 'Upload Instagram Reels via Meta API dibatalkan.');
  onProgress({
    step: `Menyiapkan stream file video ${fileName}`,
    progressPercent: 25,
    log: `Menyiapkan stream file ${fileName} dari disk untuk diunggah ke container Instagram (${containerId}).`,
    level: 'info',
  });

  const fileStat = await fs.promises.stat(videoPath);
  const fileSize = fileStat.size;
  throwIfAborted(signal, 'Upload Instagram Reels via Meta API dibatalkan.');

  onProgress({
    step: 'Mengunggah video ke server Meta (rupload)',
    progressPercent: 40,
    log: `Mengirim stream biner video (${fileSize} byte) ke server rupload Instagram.`,
    level: 'info',
  });

  const uploadRes = await uploadVideoFileToMetaRupload({
    uploadUrl: uploadUri,
    videoPath,
    fileSize,
    token,
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
