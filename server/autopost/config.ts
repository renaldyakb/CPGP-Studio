import fs from 'node:fs';
import path from 'node:path';
import type {
  AiContentDisclosureMode,
  AutoPostBrowserConfig,
  AutoPostCapabilities,
  AutoPostMetaApiConfig,
  AutoPostMode,
  AutoPostSettings,
} from '../../src/types/autopost.ts';
import { DATA_DIR } from '../storage.ts';
import {
  getActiveWorkspace,
  getWorkspaceById,
  getWorkspacePaths,
} from '../workspaces/registry.ts';

export const AUTOPOST_CONFIG_FILE_PATH = path.join(
  DATA_DIR,
  'autopost-config.json'
);

export const DEFAULT_SHARED_BROWSER_PROFILE_DIR = path.join(
  DATA_DIR,
  'browser-profile'
);

export const DEFAULT_BROWSER_PROFILE_DIR = DEFAULT_SHARED_BROWSER_PROFILE_DIR;

function getActiveAutoPostFilePath(workspaceId?: string): string {
  return getWorkspacePaths(workspaceId).autopostFile;
}

export function getExpectedBrowserProfileDir(workspaceId?: string): string {
  const ws = workspaceId
    ? getWorkspaceById(workspaceId) ?? getActiveWorkspace()
    : getActiveWorkspace();
  if (ws.browserProfileMode === 'shared') {
    return path.resolve(DEFAULT_SHARED_BROWSER_PROFILE_DIR);
  }
  return path.resolve(getWorkspacePaths(ws.id).browserProfileDir);
}

function isPathInsideDataDir(targetPath: string): boolean {
  const resolvedDataDir = path.resolve(DATA_DIR);
  const resolvedTarget = path.resolve(targetPath);
  const normBase =
    process.platform === 'win32'
      ? resolvedDataDir.toLowerCase()
      : resolvedDataDir;
  const normTarget =
    process.platform === 'win32'
      ? resolvedTarget.toLowerCase()
      : resolvedTarget;
  const rel = path.relative(normBase, normTarget);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function resolveEffectiveBrowserProfileDir(
  storedProfileDir: string | undefined,
  expectedProfileDir: string
): string {
  if (typeof storedProfileDir !== 'string' || !storedProfileDir.trim()) {
    return expectedProfileDir;
  }
  const resolvedStored = path.resolve(storedProfileDir.trim());
  if (isPathInsideDataDir(resolvedStored)) {
    return expectedProfileDir;
  }
  return resolvedStored;
}

const SCHEMA_VERSION = '1.0.0';

export interface InternalAutoPostYouTubeApiConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
  channelTitle: string | null;
  connectedAt: string | null;
}

export type MetaTokenType = AutoPostMetaApiConfig['tokenType'];

export interface InternalAutoPostMetaApiConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphApiVersion: string;
  accessToken: string;
  pageAccessToken: string;
  tokenType: MetaTokenType;
  tokenExpiresAt: string | null;
  pageId: string;
  pageName: string | null;
  igUserId: string;
  igUsername: string | null;
  shareToFeed: boolean;
  igThumbOffsetMs: number;
  connectedAt: string | null;
}

export interface InternalAutoPostConfig {
  schemaVersion: string;
  defaultMode: AutoPostMode;
  aiContentDisclosure: AiContentDisclosureMode;
  browser: AutoPostBrowserConfig;
  youtubeApi: InternalAutoPostYouTubeApiConfig;
  metaApi: InternalAutoPostMetaApiConfig;
}

export interface UpdateAutoPostSettingsPatch {
  defaultMode?: AutoPostMode;
  aiContentDisclosure?: AiContentDisclosureMode;
  browser?: Partial<AutoPostBrowserConfig>;
  youtubeApi?: {
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    clearClientSecret?: boolean;
    redirectUri?: string;
  };
  metaApi?: {
    enabled?: boolean;
    appId?: string;
    appSecret?: string;
    clearAppSecret?: boolean;
    redirectUri?: string;
    graphApiVersion?: string;
    accessToken?: string;
    clearAccessToken?: boolean;
    pageAccessToken?: string;
    clearPageAccessToken?: boolean;
    tokenType?: MetaTokenType;
    tokenExpiresAt?: string | null;
    pageId?: string;
    pageName?: string | null;
    igUserId?: string;
    igUsername?: string | null;
    shareToFeed?: boolean;
    igThumbOffsetMs?: number;
  };
}

export interface SaveYouTubeTokensInput {
  refreshToken?: string | null;
  accessToken?: string | null;
  expiryDate?: number | null;
  channelTitle?: string | null;
}

function getChromeCandidatePaths(): string[] {
  const candidates = new Set<string>();
  const envRoots = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ];

  for (const root of envRoots) {
    if (root) {
      candidates.add(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')
      );
    }
  }

  candidates.add('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  candidates.add(
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  );

  return Array.from(candidates);
}

function getEdgeCandidatePaths(): string[] {
  const candidates = new Set<string>();
  const envRoots = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA,
  ];

  for (const root of envRoots) {
    if (root) {
      candidates.add(
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      );
    }
  }

  candidates.add(
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  );
  candidates.add(
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  );

  return Array.from(candidates);
}

function hasAnyExistingPath(paths: string[]): boolean {
  return paths.some((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function normalizeMetaTokenType(
  raw: unknown,
  fallback: MetaTokenType = 'unknown'
): MetaTokenType {
  if (
    raw === 'short_lived' ||
    raw === 'long_lived' ||
    raw === 'page_permanent' ||
    raw === 'unknown'
  ) {
    return raw;
  }
  return fallback;
}

function createDefaultInternalConfig(
  workspaceId?: string
): InternalAutoPostConfig {
  const chromeAvailable = hasAnyExistingPath(getChromeCandidatePaths());
  const edgeAvailable = hasAnyExistingPath(getEdgeCandidatePaths());
  const defaultChannel: 'chrome' | 'msedge' = chromeAvailable
    ? 'chrome'
    : edgeAvailable
      ? 'msedge'
      : 'chrome';

  return {
    schemaVersion: SCHEMA_VERSION,
    defaultMode: 'review',
    aiContentDisclosure: 'ask',
    browser: {
      channel: defaultChannel,
      profileDir: getExpectedBrowserProfileDir(workspaceId),
      keepTabOpenOnReview: true,
    },
    youtubeApi: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: 'http://localhost:5173/api/autopost/youtube/callback',
      refreshToken: null,
      accessToken: null,
      expiryDate: null,
      channelTitle: null,
      connectedAt: null,
    },
    metaApi: {
      enabled: false,
      appId: '',
      appSecret: '',
      redirectUri: 'http://localhost:5173/api/autopost/meta/callback',
      graphApiVersion: 'v25.0',
      accessToken: '',
      pageAccessToken: '',
      tokenType: 'unknown',
      tokenExpiresAt: null,
      pageId: '',
      pageName: null,
      igUserId: '',
      igUsername: null,
      shareToFeed: true,
      igThumbOffsetMs: 1000,
      connectedAt: null,
    },
  };
}

function normalizeInternalConfig(
  raw: Partial<InternalAutoPostConfig> | null | undefined,
  workspaceId?: string
): InternalAutoPostConfig {
  const defaults = createDefaultInternalConfig(workspaceId);
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const defaultMode: AutoPostMode =
    raw.defaultMode === 'publish' || raw.defaultMode === 'review'
      ? raw.defaultMode
      : defaults.defaultMode;

  const aiContentDisclosure: AiContentDisclosureMode =
    raw.aiContentDisclosure === 'ask' ||
    raw.aiContentDisclosure === 'always_ai' ||
    raw.aiContentDisclosure === 'always_non_ai'
      ? raw.aiContentDisclosure
      : defaults.aiContentDisclosure;

  const rawBrowser: Partial<AutoPostBrowserConfig> =
    raw.browser && typeof raw.browser === 'object' ? raw.browser : {};
  const channel: 'chrome' | 'msedge' =
    rawBrowser.channel === 'chrome' || rawBrowser.channel === 'msedge'
      ? rawBrowser.channel
      : defaults.browser.channel;
  const expectedProfileDir = getExpectedBrowserProfileDir(workspaceId);
  const profileDir = resolveEffectiveBrowserProfileDir(
    rawBrowser.profileDir,
    expectedProfileDir
  );
  const keepTabOpenOnReview =
    typeof rawBrowser.keepTabOpenOnReview === 'boolean'
      ? rawBrowser.keepTabOpenOnReview
      : defaults.browser.keepTabOpenOnReview;

  const rawYt: Partial<InternalAutoPostYouTubeApiConfig> =
    raw.youtubeApi && typeof raw.youtubeApi === 'object' ? raw.youtubeApi : {};

  const rawMeta: Partial<InternalAutoPostMetaApiConfig> =
    raw.metaApi && typeof raw.metaApi === 'object' ? raw.metaApi : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    defaultMode,
    aiContentDisclosure,
    browser: {
      channel,
      profileDir,
      keepTabOpenOnReview,
    },
    youtubeApi: {
      enabled: Boolean(rawYt.enabled),
      clientId: typeof rawYt.clientId === 'string' ? rawYt.clientId.trim() : '',
      clientSecret:
        typeof rawYt.clientSecret === 'string' ? rawYt.clientSecret.trim() : '',
      redirectUri:
        typeof rawYt.redirectUri === 'string' && rawYt.redirectUri.trim()
          ? rawYt.redirectUri.trim()
          : defaults.youtubeApi.redirectUri,
      refreshToken:
        typeof rawYt.refreshToken === 'string' && rawYt.refreshToken.trim()
          ? rawYt.refreshToken.trim()
          : null,
      accessToken:
        typeof rawYt.accessToken === 'string' && rawYt.accessToken.trim()
          ? rawYt.accessToken.trim()
          : null,
      expiryDate:
        typeof rawYt.expiryDate === 'number' && Number.isFinite(rawYt.expiryDate)
          ? rawYt.expiryDate
          : null,
      channelTitle:
        typeof rawYt.channelTitle === 'string' && rawYt.channelTitle.trim()
          ? rawYt.channelTitle.trim()
          : null,
      connectedAt:
        typeof rawYt.connectedAt === 'string' && rawYt.connectedAt.trim()
          ? rawYt.connectedAt.trim()
          : null,
    },
    metaApi: {
      enabled: Boolean(rawMeta.enabled),
      appId: typeof rawMeta.appId === 'string' ? rawMeta.appId.trim() : '',
      appSecret:
        typeof rawMeta.appSecret === 'string' ? rawMeta.appSecret.trim() : '',
      redirectUri:
        typeof rawMeta.redirectUri === 'string' && rawMeta.redirectUri.trim()
          ? rawMeta.redirectUri.trim()
          : defaults.metaApi.redirectUri,
      graphApiVersion:
        typeof rawMeta.graphApiVersion === 'string' &&
        rawMeta.graphApiVersion.trim()
          ? rawMeta.graphApiVersion.trim()
          : defaults.metaApi.graphApiVersion,
      accessToken:
        typeof rawMeta.accessToken === 'string'
          ? rawMeta.accessToken.trim()
          : '',
      pageAccessToken:
        typeof rawMeta.pageAccessToken === 'string'
          ? rawMeta.pageAccessToken.trim()
          : '',
      tokenType: normalizeMetaTokenType(
        rawMeta.tokenType,
        defaults.metaApi.tokenType
      ),
      tokenExpiresAt:
        typeof rawMeta.tokenExpiresAt === 'string' &&
        rawMeta.tokenExpiresAt.trim()
          ? rawMeta.tokenExpiresAt.trim()
          : null,
      pageId: typeof rawMeta.pageId === 'string' ? rawMeta.pageId.trim() : '',
      pageName:
        typeof rawMeta.pageName === 'string' && rawMeta.pageName.trim()
          ? rawMeta.pageName.trim()
          : null,
      igUserId:
        typeof rawMeta.igUserId === 'string' ? rawMeta.igUserId.trim() : '',
      igUsername:
        typeof rawMeta.igUsername === 'string' && rawMeta.igUsername.trim()
          ? rawMeta.igUsername.trim()
          : null,
      shareToFeed:
        typeof rawMeta.shareToFeed === 'boolean'
          ? rawMeta.shareToFeed
          : defaults.metaApi.shareToFeed,
      igThumbOffsetMs:
        typeof rawMeta.igThumbOffsetMs === 'number' &&
        Number.isFinite(rawMeta.igThumbOffsetMs)
          ? Math.max(0, Math.round(rawMeta.igThumbOffsetMs))
          : defaults.metaApi.igThumbOffsetMs,
      connectedAt:
        typeof rawMeta.connectedAt === 'string' && rawMeta.connectedAt.trim()
          ? rawMeta.connectedAt.trim()
          : null,
    },
  };
}

function saveInternalConfig(
  config: InternalAutoPostConfig,
  workspaceId?: string
): InternalAutoPostConfig {
  const filePath = getActiveAutoPostFilePath(workspaceId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    filePath,
    JSON.stringify(config, null, 2) + '\n',
    'utf-8'
  );
  return config;
}

export function getInternalAutoPostConfig(
  workspaceId?: string
): InternalAutoPostConfig {
  const filePath = getActiveAutoPostFilePath(workspaceId);
  if (!fs.existsSync(filePath)) {
    return saveInternalConfig(
      createDefaultInternalConfig(workspaceId),
      workspaceId
    );
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<InternalAutoPostConfig>;
    return normalizeInternalConfig(parsed, workspaceId);
  } catch {
    return saveInternalConfig(
      createDefaultInternalConfig(workspaceId),
      workspaceId
    );
  }
}

export function toPublicAutoPostSettings(
  config: InternalAutoPostConfig
): AutoPostSettings {
  return {
    schemaVersion: config.schemaVersion,
    defaultMode: config.defaultMode,
    aiContentDisclosure: config.aiContentDisclosure,
    browser: {
      channel: config.browser.channel,
      profileDir: config.browser.profileDir,
      keepTabOpenOnReview: config.browser.keepTabOpenOnReview,
    },
    youtubeApi: {
      enabled: config.youtubeApi.enabled,
      clientId: config.youtubeApi.clientId,
      clientSecretConfigured: Boolean(config.youtubeApi.clientSecret.trim()),
      redirectUri: config.youtubeApi.redirectUri,
      connected: Boolean(config.youtubeApi.refreshToken?.trim()),
      channelTitle: config.youtubeApi.channelTitle,
      connectedAt: config.youtubeApi.connectedAt,
    },
    metaApi: {
      enabled: config.metaApi.enabled,
      appId: config.metaApi.appId,
      appSecretConfigured: Boolean(config.metaApi.appSecret.trim()),
      redirectUri: config.metaApi.redirectUri,
      graphApiVersion: config.metaApi.graphApiVersion,
      accessTokenConfigured: Boolean(
        config.metaApi.accessToken.trim() ||
          config.metaApi.pageAccessToken.trim()
      ),
      pageAccessTokenConfigured: Boolean(config.metaApi.pageAccessToken.trim()),
      tokenType: config.metaApi.tokenType,
      tokenExpiresAt: config.metaApi.tokenExpiresAt,
      pageId: config.metaApi.pageId,
      pageName: config.metaApi.pageName,
      igUserId: config.metaApi.igUserId,
      igUsername: config.metaApi.igUsername,
      shareToFeed: config.metaApi.shareToFeed,
      igThumbOffsetMs: config.metaApi.igThumbOffsetMs,
      connectedAt: config.metaApi.connectedAt,
    },
  };
}

export function getPublicAutoPostSettings(): AutoPostSettings {
  return toPublicAutoPostSettings(getInternalAutoPostConfig());
}

export function updateAutoPostSettings(
  patch: UpdateAutoPostSettingsPatch
): AutoPostSettings {
  const current = getInternalAutoPostConfig();

  const nextDefaultMode: AutoPostMode =
    patch.defaultMode === 'publish' || patch.defaultMode === 'review'
      ? patch.defaultMode
      : current.defaultMode;

  const nextAiContentDisclosure: AiContentDisclosureMode =
    patch.aiContentDisclosure === 'ask' ||
    patch.aiContentDisclosure === 'always_ai' ||
    patch.aiContentDisclosure === 'always_non_ai'
      ? patch.aiContentDisclosure
      : current.aiContentDisclosure;

  const expectedProfileDir = getExpectedBrowserProfileDir();
  const nextBrowser: AutoPostBrowserConfig = {
    channel:
      patch.browser?.channel === 'chrome' || patch.browser?.channel === 'msedge'
        ? patch.browser.channel
        : current.browser.channel,
    profileDir:
      typeof patch.browser?.profileDir === 'string' &&
      patch.browser.profileDir.trim()
        ? resolveEffectiveBrowserProfileDir(
            patch.browser.profileDir,
            expectedProfileDir
          )
        : current.browser.profileDir,
    keepTabOpenOnReview:
      typeof patch.browser?.keepTabOpenOnReview === 'boolean'
        ? patch.browser.keepTabOpenOnReview
        : current.browser.keepTabOpenOnReview,
  };

  let nextClientSecret = current.youtubeApi.clientSecret;
  if (patch.youtubeApi?.clearClientSecret) {
    nextClientSecret = '';
  } else if (
    typeof patch.youtubeApi?.clientSecret === 'string' &&
    patch.youtubeApi.clientSecret.trim()
  ) {
    nextClientSecret = patch.youtubeApi.clientSecret.trim();
  }

  const nextYouTubeApi: InternalAutoPostYouTubeApiConfig = {
    ...current.youtubeApi,
    enabled:
      typeof patch.youtubeApi?.enabled === 'boolean'
        ? patch.youtubeApi.enabled
        : current.youtubeApi.enabled,
    clientId:
      typeof patch.youtubeApi?.clientId === 'string'
        ? patch.youtubeApi.clientId.trim()
        : current.youtubeApi.clientId,
    clientSecret: nextClientSecret,
    redirectUri:
      typeof patch.youtubeApi?.redirectUri === 'string' &&
      patch.youtubeApi.redirectUri.trim()
        ? patch.youtubeApi.redirectUri.trim()
        : current.youtubeApi.redirectUri,
  };

  let nextMetaAppSecret = current.metaApi.appSecret;
  if (patch.metaApi?.clearAppSecret) {
    nextMetaAppSecret = '';
  } else if (
    typeof patch.metaApi?.appSecret === 'string' &&
    patch.metaApi.appSecret.trim()
  ) {
    nextMetaAppSecret = patch.metaApi.appSecret.trim();
  }

  let nextMetaAccessToken = current.metaApi.accessToken;
  let tokenUpdated = false;
  if (patch.metaApi?.clearAccessToken) {
    nextMetaAccessToken = '';
  } else if (
    typeof patch.metaApi?.accessToken === 'string' &&
    patch.metaApi.accessToken.trim()
  ) {
    nextMetaAccessToken = patch.metaApi.accessToken.trim();
    tokenUpdated = true;
  }

  const nextMetaPageId =
    typeof patch.metaApi?.pageId === 'string'
      ? patch.metaApi.pageId.trim()
      : current.metaApi.pageId;

  let nextMetaPageAccessToken = current.metaApi.pageAccessToken;
  if (patch.metaApi?.clearPageAccessToken) {
    nextMetaPageAccessToken = '';
  } else if (
    typeof patch.metaApi?.pageAccessToken === 'string' &&
    patch.metaApi.pageAccessToken.trim()
  ) {
    nextMetaPageAccessToken = patch.metaApi.pageAccessToken.trim();
    tokenUpdated = true;
  } else if (
    typeof patch.metaApi?.pageId === 'string' &&
    nextMetaPageId !== current.metaApi.pageId
  ) {
    // Avoid reusing a page access token belonging to a previously selected page
    nextMetaPageAccessToken = '';
  }

  const hasAnyMetaToken = Boolean(
    nextMetaAccessToken.trim() || nextMetaPageAccessToken.trim()
  );

  const nextMetaTokenType: MetaTokenType =
    patch.metaApi?.tokenType !== undefined
      ? normalizeMetaTokenType(patch.metaApi.tokenType, current.metaApi.tokenType)
      : hasAnyMetaToken
        ? current.metaApi.tokenType
        : 'unknown';

  const nextMetaTokenExpiresAt: string | null =
    patch.metaApi?.tokenExpiresAt === null
      ? null
      : typeof patch.metaApi?.tokenExpiresAt === 'string'
        ? patch.metaApi.tokenExpiresAt.trim() || null
        : hasAnyMetaToken
          ? current.metaApi.tokenExpiresAt
          : null;

  const nextMetaConnectedAt = hasAnyMetaToken
    ? tokenUpdated
      ? new Date().toISOString()
      : current.metaApi.connectedAt ?? new Date().toISOString()
    : null;

  const nextMetaApi: InternalAutoPostMetaApiConfig = {
    ...current.metaApi,
    enabled:
      typeof patch.metaApi?.enabled === 'boolean'
        ? patch.metaApi.enabled
        : current.metaApi.enabled,
    appId:
      typeof patch.metaApi?.appId === 'string'
        ? patch.metaApi.appId.trim()
        : current.metaApi.appId,
    appSecret: nextMetaAppSecret,
    redirectUri:
      typeof patch.metaApi?.redirectUri === 'string' &&
      patch.metaApi.redirectUri.trim()
        ? patch.metaApi.redirectUri.trim()
        : current.metaApi.redirectUri,
    graphApiVersion:
      typeof patch.metaApi?.graphApiVersion === 'string' &&
      patch.metaApi.graphApiVersion.trim()
        ? patch.metaApi.graphApiVersion.trim()
        : current.metaApi.graphApiVersion,
    accessToken: nextMetaAccessToken,
    pageAccessToken: nextMetaPageAccessToken,
    tokenType: nextMetaTokenType,
    tokenExpiresAt: nextMetaTokenExpiresAt,
    pageId: nextMetaPageId,
    pageName:
      patch.metaApi?.pageName === null
        ? null
        : typeof patch.metaApi?.pageName === 'string'
          ? patch.metaApi.pageName.trim() || null
          : current.metaApi.pageName,
    igUserId:
      typeof patch.metaApi?.igUserId === 'string'
        ? patch.metaApi.igUserId.trim()
        : current.metaApi.igUserId,
    igUsername:
      patch.metaApi?.igUsername === null
        ? null
        : typeof patch.metaApi?.igUsername === 'string'
          ? patch.metaApi.igUsername.trim() || null
          : current.metaApi.igUsername,
    shareToFeed:
      typeof patch.metaApi?.shareToFeed === 'boolean'
        ? patch.metaApi.shareToFeed
        : current.metaApi.shareToFeed,
    igThumbOffsetMs:
      typeof patch.metaApi?.igThumbOffsetMs === 'number' &&
      Number.isFinite(patch.metaApi.igThumbOffsetMs)
        ? Math.max(0, Math.round(patch.metaApi.igThumbOffsetMs))
        : current.metaApi.igThumbOffsetMs,
    connectedAt: nextMetaConnectedAt,
  };

  const saved = saveInternalConfig({
    schemaVersion: SCHEMA_VERSION,
    defaultMode: nextDefaultMode,
    aiContentDisclosure: nextAiContentDisclosure,
    browser: nextBrowser,
    youtubeApi: nextYouTubeApi,
    metaApi: nextMetaApi,
  });

  return toPublicAutoPostSettings(saved);
}

export function saveYouTubeTokens(
  tokens: SaveYouTubeTokensInput,
  workspaceId?: string
): InternalAutoPostConfig {
  const current = getInternalAutoPostConfig(workspaceId);
  const nextRefreshToken =
    tokens.refreshToken && tokens.refreshToken.trim()
      ? tokens.refreshToken.trim()
      : current.youtubeApi.refreshToken;

  const nextConfig: InternalAutoPostConfig = {
    ...current,
    youtubeApi: {
      ...current.youtubeApi,
      enabled: nextRefreshToken ? true : current.youtubeApi.enabled,
      refreshToken: nextRefreshToken,
      accessToken:
        tokens.accessToken !== undefined
          ? tokens.accessToken
          : current.youtubeApi.accessToken,
      expiryDate:
        tokens.expiryDate !== undefined
          ? tokens.expiryDate
          : current.youtubeApi.expiryDate,
      channelTitle:
        tokens.channelTitle !== undefined
          ? tokens.channelTitle
          : current.youtubeApi.channelTitle,
      connectedAt: new Date().toISOString(),
    },
  };

  return saveInternalConfig(nextConfig, workspaceId);
}

export function clearYouTubeTokens(): AutoPostSettings {
  const current = getInternalAutoPostConfig();
  const saved = saveInternalConfig({
    ...current,
    youtubeApi: {
      ...current.youtubeApi,
      refreshToken: null,
      accessToken: null,
      expiryDate: null,
      channelTitle: null,
      connectedAt: null,
    },
  });
  return toPublicAutoPostSettings(saved);
}

export function clearMetaConfig(): AutoPostSettings {
  const current = getInternalAutoPostConfig();
  const saved = saveInternalConfig({
    ...current,
    metaApi: {
      ...current.metaApi,
      enabled: false,
      accessToken: '',
      pageAccessToken: '',
      tokenType: 'unknown',
      tokenExpiresAt: null,
      pageId: '',
      pageName: null,
      igUserId: '',
      igUsername: null,
      connectedAt: null,
    },
  });
  return toPublicAutoPostSettings(saved);
}

export function detectAutoPostCapabilities(
  workspaceId?: string
): AutoPostCapabilities {
  const config = getInternalAutoPostConfig(workspaceId);
  const chromeAvailable = hasAnyExistingPath(getChromeCandidatePaths());
  const edgeAvailable = hasAnyExistingPath(getEdgeCandidatePaths());

  let preferredChannel: 'chrome' | 'msedge' | null = null;
  if (config.browser.channel === 'chrome' && chromeAvailable) {
    preferredChannel = 'chrome';
  } else if (config.browser.channel === 'msedge' && edgeAvailable) {
    preferredChannel = 'msedge';
  } else if (chromeAvailable) {
    preferredChannel = 'chrome';
  } else if (edgeAvailable) {
    preferredChannel = 'msedge';
  }

  let profileInitialized = false;
  try {
    if (fs.existsSync(config.browser.profileDir)) {
      const entries = fs.readdirSync(config.browser.profileDir);
      profileInitialized = entries.length > 0;
    }
  } catch {
    profileInitialized = false;
  }

  const youtubeApiReady = Boolean(
    config.youtubeApi.enabled &&
      config.youtubeApi.clientId.trim() &&
      config.youtubeApi.clientSecret.trim() &&
      config.youtubeApi.refreshToken?.trim()
  );

  const metaFbApiReady = Boolean(
    config.metaApi.enabled &&
      (config.metaApi.pageAccessToken.trim() ||
        config.metaApi.accessToken.trim()) &&
      config.metaApi.pageId.trim()
  );

  const metaIgApiReady = Boolean(
    config.metaApi.enabled &&
      (config.metaApi.accessToken.trim() ||
        config.metaApi.pageAccessToken.trim()) &&
      config.metaApi.igUserId.trim()
  );

  return {
    chromeAvailable,
    edgeAvailable,
    preferredChannel,
    profileInitialized,
    youtubeApiReady,
    metaFbApiReady,
    metaIgApiReady,
  };
}
