import type { PlatformKey } from './planner';

export type AutoPostMode = 'review' | 'publish';

export type AiContentDisclosureMode = 'ask' | 'always_ai' | 'always_non_ai';

export type AutoPostEngine = 'browser' | 'youtube_api' | 'meta_api';

export type AutoPostJobStatus =
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AutoPostBrowserConfig {
  channel: 'chrome' | 'msedge';
  profileDir: string;
  keepTabOpenOnReview: boolean;
  cdpUrl?: string;
}

export interface AutoPostYouTubeApiConfig {
  enabled: boolean;
  clientId: string;
  clientSecretConfigured: boolean;
  redirectUri: string;
  connected: boolean;
  channelTitle: string | null;
  connectedAt: string | null;
}

export interface MetaDiscoveredPage {
  pageId: string;
  pageName: string;
  hasPageToken: boolean;
  igUserId: string | null;
  igUsername: string | null;
}

export interface AutoPostMetaApiConfig {
  enabled: boolean;
  appId: string;
  appSecretConfigured: boolean;
  redirectUri: string;
  graphApiVersion: string;
  accessTokenConfigured: boolean;
  pageAccessTokenConfigured: boolean;
  tokenType: 'short_lived' | 'long_lived' | 'page_permanent' | 'unknown';
  tokenExpiresAt: string | null;
  pageId: string;
  pageName: string | null;
  igUserId: string;
  igUsername: string | null;
  shareToFeed: boolean;
  igThumbOffsetMs: number;
  connectedAt: string | null;
}

export interface MetaTokenExchangeResult {
  ok: boolean;
  longLivedTokenExpiresAt: string | null;
  expiresInDays: number | null;
  pages: MetaDiscoveredPage[];
  autoSelectedPage: MetaDiscoveredPage | null;
  settings: AutoPostSettings;
  capabilities: AutoPostCapabilities;
}

export interface MetaConnectionTestResult {
  ok: boolean;
  checkedAt: string;
  graphApiVersion: string;
  fbPage: {
    ok: boolean;
    pageId: string;
    pageName: string | null;
    error: string | null;
  };
  igAccount: {
    ok: boolean;
    igUserId: string;
    username: string | null;
    mediaCount: number | null;
    error: string | null;
  };
  permissions: {
    granted: string[];
    missingIg: string[];
    missingFb: string[];
    tokenExpiresAt: string | null;
    isNeverExpiring: boolean;
  };
}

export interface AutoPostSettings {
  schemaVersion: string;
  defaultMode: AutoPostMode;
  aiContentDisclosure: AiContentDisclosureMode;
  browser: AutoPostBrowserConfig;
  youtubeApi: AutoPostYouTubeApiConfig;
  metaApi: AutoPostMetaApiConfig;
}

export interface AutoPostStepLog {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export interface AutoPostJob {
  jobId: string;
  batchId: string;
  workspaceId?: string;
  itemId: string;
  folderCode: string;
  platform: PlatformKey;
  engine: AutoPostEngine;
  mode: AutoPostMode;
  scheduledAt?: string | null;
  aiGenerated?: boolean | null;
  status: AutoPostJobStatus;
  step: string;
  progressPercent: number;
  publishedUrl: string | null;
  error: string | null;
  logs: AutoPostStepLog[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AutoPostBrowserSessionStatus {
  isOpen: boolean;
  channel: 'chrome' | 'msedge' | null;
  openTabsCount: number;
}

export interface AutoPostCapabilities {
  chromeAvailable: boolean;
  edgeAvailable: boolean;
  preferredChannel: 'chrome' | 'msedge' | null;
  profileInitialized: boolean;
  youtubeApiReady: boolean;
  metaFbApiReady: boolean;
  metaIgApiReady: boolean;
  browserSession?: AutoPostBrowserSessionStatus;
}

export interface TriggerAutoPostPayload {
  itemId: string;
  platforms: PlatformKey[];
  mode?: AutoPostMode;
  youtubePrivacy?: 'public' | 'unlisted' | 'private';
}
