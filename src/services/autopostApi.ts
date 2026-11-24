import type {
  AutoPostBrowserConfig,
  AutoPostCapabilities,
  AutoPostJob,
  AutoPostMode,
  AutoPostSettings,
  MetaDiscoveredPage,
  TriggerAutoPostPayload,
} from '../types/autopost';
import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
  WorkspaceStats,
} from '../types/planner';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // Ignore JSON parse errors on non-JSON error responses
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export interface UpdateAutoPostSettingsInput {
  defaultMode?: AutoPostMode;
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
    graphApiVersion?: string;
    accessToken?: string;
    clearAccessToken?: boolean;
    pageAccessToken?: string;
    clearPageAccessToken?: boolean;
    pageId?: string;
    pageName?: string | null;
    igUserId?: string;
    igUsername?: string | null;
    shareToFeed?: boolean;
    igThumbOffsetMs?: number;
  };
}

export interface DiscoverMetaAccountsInput {
  accessToken?: string;
  graphApiVersion?: string;
}

export interface DiscoverMetaAccountsResponse {
  ok: boolean;
  pages: MetaDiscoveredPage[];
  tokenType: 'user_or_system' | 'page';
  graphApiVersion: string;
}

export interface UpdateAutoPostSettingsResponse {
  ok: boolean;
  settings: AutoPostSettings;
  capabilities: AutoPostCapabilities;
}

export interface OpenBrowserProfileResponse {
  ok: boolean;
  openedUrls: string[];
  channel: string;
  profileDir: string;
  capabilities: AutoPostCapabilities;
}

export interface CloseBrowserProfileResponse {
  ok: boolean;
}

export interface YouTubeAuthUrlResponse {
  ok: boolean;
  authUrl: string;
}

export interface TriggerAutoPostResponse {
  ok: boolean;
  jobs: AutoPostJob[];
}

export interface CancelAutoPostJobResponse {
  ok: boolean;
  job: AutoPostJob;
}

export interface ConfirmPublishedJobResponse {
  ok: boolean;
  job: AutoPostJob;
  item: ContentPlannerItem;
  stats: WorkspaceStats;
  database: PlannerDatabase;
}

export type AutoPostSseEvent =
  | {
      type: 'jobs-snapshot';
      jobs: AutoPostJob[];
      timestamp: string;
    }
  | {
      type: 'job-updated';
      job: AutoPostJob;
      jobs: AutoPostJob[];
      timestamp: string;
    };

export const autopostApi = {
  async getCapabilities(): Promise<AutoPostCapabilities> {
    const res = await fetch('/api/autopost/capabilities');
    return handleResponse<AutoPostCapabilities>(res);
  },

  async getSettings(): Promise<AutoPostSettings> {
    const res = await fetch('/api/autopost/settings');
    return handleResponse<AutoPostSettings>(res);
  },

  async updateSettings(
    patch: UpdateAutoPostSettingsInput
  ): Promise<UpdateAutoPostSettingsResponse> {
    const res = await fetch('/api/autopost/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return handleResponse<UpdateAutoPostSettingsResponse>(res);
  },

  async openProfile(
    platforms?: PlatformKey[]
  ): Promise<OpenBrowserProfileResponse> {
    const res = await fetch('/api/autopost/open-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(platforms ? { platforms } : {}),
    });
    return handleResponse<OpenBrowserProfileResponse>(res);
  },

  async closeProfile(): Promise<CloseBrowserProfileResponse> {
    const res = await fetch('/api/autopost/close-profile', {
      method: 'POST',
    });
    return handleResponse<CloseBrowserProfileResponse>(res);
  },

  async getYouTubeAuthUrl(): Promise<YouTubeAuthUrlResponse> {
    const res = await fetch('/api/autopost/youtube/auth-url');
    return handleResponse<YouTubeAuthUrlResponse>(res);
  },

  async disconnectYouTube(): Promise<UpdateAutoPostSettingsResponse> {
    const res = await fetch('/api/autopost/youtube/disconnect', {
      method: 'POST',
    });
    return handleResponse<UpdateAutoPostSettingsResponse>(res);
  },

  async discoverMetaAccounts(
    input?: DiscoverMetaAccountsInput
  ): Promise<DiscoverMetaAccountsResponse> {
    const res = await fetch('/api/autopost/meta/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
    return handleResponse<DiscoverMetaAccountsResponse>(res);
  },

  async disconnectMeta(): Promise<UpdateAutoPostSettingsResponse> {
    const res = await fetch('/api/autopost/meta/disconnect', {
      method: 'POST',
    });
    return handleResponse<UpdateAutoPostSettingsResponse>(res);
  },

  async getJobs(): Promise<AutoPostJob[]> {
    const res = await fetch('/api/autopost/jobs');
    const data = await handleResponse<{ jobs: AutoPostJob[] }>(res);
    return data.jobs;
  },

  async trigger(
    payload: TriggerAutoPostPayload
  ): Promise<TriggerAutoPostResponse> {
    const res = await fetch('/api/autopost/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<TriggerAutoPostResponse>(res);
  },

  async cancelJob(jobId: string): Promise<CancelAutoPostJobResponse> {
    const res = await fetch(
      `/api/autopost/jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: 'POST',
      }
    );
    return handleResponse<CancelAutoPostJobResponse>(res);
  },

  async confirmPublished(
    jobId: string,
    publishedUrl?: string
  ): Promise<ConfirmPublishedJobResponse> {
    const res = await fetch(
      `/api/autopost/jobs/${encodeURIComponent(jobId)}/confirm-published`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          publishedUrl !== undefined ? { publishedUrl } : {}
        ),
      }
    );
    return handleResponse<ConfirmPublishedJobResponse>(res);
  },

  subscribeEvents(
    onEvent: (event: AutoPostSseEvent) => void,
    onError?: (err: Event) => void
  ): () => void {
    const source = new EventSource('/api/autopost/events');

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as AutoPostSseEvent;
        if (
          parsed &&
          (parsed.type === 'jobs-snapshot' || parsed.type === 'job-updated')
        ) {
          onEvent(parsed);
        }
      } catch {
        // Ignore malformed SSE frames
      }
    };

    if (onError) {
      source.onerror = onError;
    }

    return () => {
      source.close();
    };
  },
};
