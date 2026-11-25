import type { NextSuggestedSlot } from '@/types/workspace';
import type {
  MotionProvitCacheStats,
  MotionProvitConfigPublic,
  MotionProvitImportProgress,
  MotionProvitImportRequest,
  MotionProvitJobSummary,
} from '@/types/motionprovit';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data;
}

export interface MotionProvitStatusResponse {
  ok: boolean;
  config: MotionProvitConfigPublic;
  jobs: MotionProvitJobSummary[];
  nextSlot: NextSuggestedSlot;
  cacheStats?: MotionProvitCacheStats;
  importProgress: MotionProvitImportProgress | null;
}

export const motionprovitApi = {
  getStatus(): Promise<MotionProvitStatusResponse> {
    return requestJson<MotionProvitStatusResponse>(
      '/api/addons/motionprovit/status'
    );
  },

  login(input: { email: string; password: string }): Promise<{
    ok: boolean;
    message: string;
    config: MotionProvitConfigPublic;
  }> {
    return requestJson('/api/addons/motionprovit/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  openLoginBrowser(): Promise<{ ok: true; loginUrl: string }> {
    return requestJson('/api/addons/motionprovit/open-login', {
      method: 'POST',
    });
  },

  checkSession(): Promise<{
    ok: boolean;
    connected: boolean;
    message: string;
    config: MotionProvitConfigPublic;
  }> {
    return requestJson('/api/addons/motionprovit/check-session', {
      method: 'POST',
    });
  },

  disconnect(): Promise<{ ok: boolean; config: MotionProvitConfigPublic }> {
    return requestJson('/api/addons/motionprovit/disconnect', {
      method: 'POST',
    });
  },

  fetchJobs(mode: 'incremental' | 'full' = 'incremental'): Promise<{
    ok: boolean;
    config: MotionProvitConfigPublic;
    jobs: MotionProvitJobSummary[];
    nextSlot: NextSuggestedSlot;
    syncMode?: 'incremental' | 'full';
    newFoundCount?: number;
    pagesScanned?: number;
    cacheStats?: MotionProvitCacheStats;
  }> {
    return requestJson('/api/addons/motionprovit/jobs/fetch', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  },

  clearCache(): Promise<{ ok: boolean; cacheStats: MotionProvitCacheStats }> {
    return requestJson('/api/addons/motionprovit/cache/clear', {
      method: 'POST',
    });
  },

  startImport(payload: MotionProvitImportRequest): Promise<{
    ok: boolean;
    importProgress: MotionProvitImportProgress;
  }> {
    return requestJson('/api/addons/motionprovit/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getImportStatus(): Promise<{
    ok: boolean;
    importProgress: MotionProvitImportProgress | null;
  }> {
    return requestJson('/api/addons/motionprovit/import/status');
  },

  cancelImport(): Promise<{
    ok: boolean;
    cancelled: boolean;
    importProgress: MotionProvitImportProgress | null;
  }> {
    return requestJson('/api/addons/motionprovit/import/cancel', {
      method: 'POST',
    });
  },

  getThumbnailProxyUrl(rawUrl: string): string {
    return `/api/addons/motionprovit/thumb?url=${encodeURIComponent(rawUrl)}`;
  },
};
