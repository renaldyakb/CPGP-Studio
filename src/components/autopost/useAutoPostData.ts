import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutoPostBrowserSessionStatus,
  AutoPostCapabilities,
  AutoPostJob,
  AutoPostMode,
  AutoPostSettings,
  MetaConnectionTestResult,
  MetaDiscoveredPage,
  MetaTokenExchangeResult,
} from '@/types/autopost';
import type { ContentPlannerItem, PlatformKey } from '@/types/planner';

export type AutoPostPage =
  | 'dashboard'
  | 'history'
  | 'studio'
  | 'meta'
  | 'youtube';

export type ToastKind = 'success' | 'info' | 'error';

export interface AutoPostSettingsPatch {
  defaultMode?: AutoPostMode;
  browser?: {
    channel?: 'chrome' | 'msedge';
    keepTabOpenOnReview?: boolean;
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
    pageId?: string;
    pageName?: string | null;
    igUserId?: string;
    igUsername?: string | null;
    shareToFeed?: boolean;
    igThumbOffsetMs?: number;
  };
  youtubeApi?: {
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    clearClientSecret?: boolean;
    redirectUri?: string;
  };
}

const EMPTY_CAPABILITIES: AutoPostCapabilities = {
  chromeAvailable: false,
  edgeAvailable: false,
  preferredChannel: null,
  profileInitialized: false,
  youtubeApiReady: false,
  metaFbApiReady: false,
  metaIgApiReady: false,
  browserSession: {
    isOpen: false,
    channel: null,
    openTabsCount: 0,
  },
};

const EMPTY_SETTINGS: AutoPostSettings = {
  schemaVersion: '1.0.0',
  defaultMode: 'review',
  browser: {
    channel: 'chrome',
    profileDir: 'data/browser-profile',
    keepTabOpenOnReview: true,
  },
  youtubeApi: {
    enabled: false,
    clientId: '',
    clientSecretConfigured: false,
    redirectUri: 'http://localhost:5173/api/autopost/youtube/callback',
    connected: false,
    channelTitle: null,
    connectedAt: null,
  },
  metaApi: {
    enabled: false,
    appId: '',
    appSecretConfigured: false,
    redirectUri: 'http://localhost:5173/api/autopost/meta/callback',
    graphApiVersion: 'v25.0',
    accessTokenConfigured: false,
    pageAccessTokenConfigured: false,
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

const EMPTY_SESSION: AutoPostBrowserSessionStatus = {
  isOpen: false,
  channel: null,
  openTabsCount: 0,
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const payload = parsed as { error?: string; message?: string } | null;
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Permintaan gagal (HTTP ${res.status}).`
    );
  }

  return (parsed ?? {}) as T;
}

export interface UseAutoPostDataOptions {
  isOpen: boolean;
  onToast?: (message: string, type?: ToastKind) => void;
  onPlannerSync?: () => void;
}

export interface UseAutoPostDataResult {
  capabilities: AutoPostCapabilities;
  settings: AutoPostSettings;
  jobs: AutoPostJob[];
  browserSession: AutoPostBrowserSessionStatus;
  isLoading: boolean;
  isRefreshing: boolean;
  busyKey: string | null;
  refresh: () => Promise<void>;
  saveSettings: (patch: AutoPostSettingsPatch) => Promise<boolean>;
  triggerPost: (
    itemId: string,
    platforms: PlatformKey[],
    mode: AutoPostMode
  ) => Promise<boolean>;
  cancelJob: (jobId: string) => Promise<void>;
  confirmJob: (jobId: string, publishedUrl?: string) => Promise<void>;
  openProfile: (platforms?: PlatformKey[]) => Promise<void>;
  closeProfile: () => Promise<void>;
  discoverMeta: (accessToken?: string) => Promise<MetaDiscoveredPage[] | null>;
  exchangeMetaToken: (input: {
    appId?: string;
    appSecret?: string;
    shortLivedToken: string;
  }) => Promise<MetaTokenExchangeResult | null>;
  testMetaConnection: () => Promise<MetaConnectionTestResult | null>;
  getMetaAuthUrl: () => Promise<string | null>;
  disconnectMeta: () => Promise<void>;
  getYouTubeAuthUrl: () => Promise<string | null>;
  disconnectYouTube: () => Promise<void>;
}

export function useAutoPostData(
  options: UseAutoPostDataOptions
): UseAutoPostDataResult {
  const { isOpen, onToast, onPlannerSync } = options;

  const [capabilities, setCapabilities] =
    useState<AutoPostCapabilities>(EMPTY_CAPABILITIES);
  const [settings, setSettings] = useState<AutoPostSettings>(EMPTY_SETTINGS);
  const [jobs, setJobs] = useState<AutoPostJob[]>([]);
  const [browserSession, setBrowserSession] =
    useState<AutoPostBrowserSessionStatus>(EMPTY_SESSION);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const syncedCompletedJobs = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [capRes, setRes, jobsRes] = await Promise.allSettled([
        requestJson<AutoPostCapabilities>('/api/autopost/capabilities'),
        requestJson<AutoPostSettings>('/api/autopost/settings'),
        requestJson<{ jobs?: AutoPostJob[] }>('/api/autopost/jobs'),
      ]);

      if (capRes.status === 'fulfilled') {
        setCapabilities(capRes.value);
        if (capRes.value.browserSession) {
          setBrowserSession(capRes.value.browserSession);
        }
      }
      if (setRes.status === 'fulfilled') {
        setSettings(setRes.value);
      }
      if (jobsRes.status === 'fulfilled' && Array.isArray(jobsRes.value.jobs)) {
        for (const job of jobsRes.value.jobs) {
          if (job.status === 'completed') {
            syncedCompletedJobs.current.add(job.jobId);
          }
        }
        setJobs(jobsRes.value.jobs);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) return;

    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/autopost/events');
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            jobs?: AutoPostJob[];
            job?: AutoPostJob;
            browserSession?: AutoPostBrowserSessionStatus;
          };

          if (payload.browserSession) {
            setBrowserSession(payload.browserSession);
          }

          if (Array.isArray(payload.jobs)) {
            let completedNow = false;
            for (const job of payload.jobs) {
              if (
                job.status === 'completed' &&
                !syncedCompletedJobs.current.has(job.jobId)
              ) {
                syncedCompletedJobs.current.add(job.jobId);
                completedNow = true;
              }
            }
            setJobs(payload.jobs);
            if (completedNow) onPlannerSync?.();
          } else if (payload.job) {
            const incoming = payload.job;
            setJobs((prev) => {
              const exists = prev.some((j) => j.jobId === incoming.jobId);
              return exists
                ? prev.map((j) => (j.jobId === incoming.jobId ? incoming : j))
                : [incoming, ...prev];
            });
            if (
              incoming.status === 'completed' &&
              !syncedCompletedJobs.current.has(incoming.jobId)
            ) {
              syncedCompletedJobs.current.add(incoming.jobId);
              onPlannerSync?.();
            }
          }
        } catch {
          // ignore heartbeat / malformed frames
        }
      };
    } catch {
      // EventSource unavailable
    }

    return () => {
      source?.close();
    };
  }, [isOpen, onPlannerSync]);

  const saveSettings = useCallback(
    async (patch: AutoPostSettingsPatch): Promise<boolean> => {
      setBusyKey('settings');
      try {
        const res = await requestJson<{
          settings?: AutoPostSettings;
          capabilities?: AutoPostCapabilities;
        }>('/api/autopost/settings', {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        if (res.settings) setSettings(res.settings);
        if (res.capabilities) {
          setCapabilities(res.capabilities);
          if (res.capabilities.browserSession) {
            setBrowserSession(res.capabilities.browserSession);
          }
        }
        return true;
      } catch (error) {
        onToast?.(
          error instanceof Error ? error.message : 'Gagal menyimpan pengaturan.',
          'error'
        );
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [onToast]
  );

  const triggerPost = useCallback(
    async (
      itemId: string,
      platforms: PlatformKey[],
      mode: AutoPostMode
    ): Promise<boolean> => {
      if (platforms.length === 0) return false;
      setBusyKey(`trigger:${itemId}`);
      try {
        const res = await requestJson<{ jobs?: AutoPostJob[] }>(
          '/api/autopost/trigger',
          {
            method: 'POST',
            body: JSON.stringify({ itemId, platforms, mode }),
          }
        );
        if (Array.isArray(res.jobs)) {
          setJobs((prev) => {
            const byId = new Map(prev.map((job) => [job.jobId, job]));
            for (const job of res.jobs ?? []) byId.set(job.jobId, job);
            return Array.from(byId.values());
          });
        }
        onToast?.(
          `${platforms.length} proses Auto-Post dimasukkan ke antrean.`,
          'success'
        );
        return true;
      } catch (error) {
        onToast?.(
          error instanceof Error ? error.message : 'Gagal memulai Auto-Post.',
          'error'
        );
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [onToast]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      setBusyKey(`job:${jobId}`);
      try {
        await requestJson(`/api/autopost/jobs/${encodeURIComponent(jobId)}/cancel`, {
          method: 'POST',
        });
        onToast?.('Proses Auto-Post dibatalkan.', 'info');
      } catch (error) {
        onToast?.(
          error instanceof Error ? error.message : 'Gagal membatalkan proses.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    [onToast]
  );

  const confirmJob = useCallback(
    async (jobId: string, publishedUrl?: string) => {
      setBusyKey(`job:${jobId}`);
      try {
        const res = await requestJson<{ job?: AutoPostJob }>(
          `/api/autopost/jobs/${encodeURIComponent(jobId)}/confirm-published`,
          {
            method: 'POST',
            body: JSON.stringify({ publishedUrl }),
          }
        );
        if (res.job) {
          const updated = res.job;
          syncedCompletedJobs.current.add(updated.jobId);
          setJobs((prev) =>
            prev.map((job) => (job.jobId === updated.jobId ? updated : job))
          );
        }
        onToast?.('Status publish dikonfirmasi.', 'success');
        onPlannerSync?.();
      } catch (error) {
        onToast?.(
          error instanceof Error ? error.message : 'Gagal konfirmasi publish.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    [onToast, onPlannerSync]
  );

  const openProfile = useCallback(
    async (platforms?: PlatformKey[]) => {
      setBusyKey('open-profile');
      try {
        const res = await requestJson<{
          openedUrls?: string[];
          browserSession?: AutoPostBrowserSessionStatus;
          capabilities?: AutoPostCapabilities;
        }>('/api/autopost/open-profile', {
          method: 'POST',
          body: JSON.stringify(platforms ? { platforms } : {}),
        });
        if (res.browserSession) setBrowserSession(res.browserSession);
        if (res.capabilities) setCapabilities(res.capabilities);
        onToast?.(
          `Browser dibuka (${res.openedUrls?.length ?? platforms?.length ?? 4} tab studio).`,
          'info'
        );
      } catch (error) {
        onToast?.(
          error instanceof Error ? error.message : 'Gagal membuka browser.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    [onToast]
  );

  const closeProfile = useCallback(async () => {
    setBusyKey('close-profile');
    try {
      const res = await requestJson<{
        browserSession?: AutoPostBrowserSessionStatus;
        capabilities?: AutoPostCapabilities;
      }>('/api/autopost/close-profile', { method: 'POST' });
      setBrowserSession(res.browserSession ?? EMPTY_SESSION);
      if (res.capabilities) setCapabilities(res.capabilities);
      onToast?.('Sesi browser ditutup.', 'info');
    } catch (error) {
      onToast?.(
        error instanceof Error ? error.message : 'Gagal menutup browser.',
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  }, [onToast]);

  const discoverMeta = useCallback(
    async (
      accessToken?: string
    ): Promise<MetaDiscoveredPage[] | null> => {
      setBusyKey('meta-discover');
      try {
        const res = await requestJson<{
          pages?: MetaDiscoveredPage[];
        }>('/api/autopost/meta/discover', {
          method: 'POST',
          body: JSON.stringify({
            accessToken: accessToken?.trim() || undefined,
            graphApiVersion: settings.metaApi.graphApiVersion,
          }),
        });
        const pages = Array.isArray(res.pages) ? res.pages : [];
        onToast?.(
          pages.length > 0
            ? `${pages.length} akun Meta ditemukan.`
            : 'Tidak ada akun Meta yang ditemukan.',
          pages.length > 0 ? 'success' : 'info'
        );
        return pages;
      } catch (error) {
        onToast?.(
          error instanceof Error ? error.message : 'Gagal mendeteksi akun Meta.',
          'error'
        );
        return null;
      } finally {
        setBusyKey(null);
      }
    },
    [onToast, settings.metaApi.graphApiVersion]
  );

  const exchangeMetaToken = useCallback(
    async (input: {
      appId?: string;
      appSecret?: string;
      shortLivedToken: string;
    }): Promise<MetaTokenExchangeResult | null> => {
      setBusyKey('meta-exchange');
      try {
        const res = await requestJson<MetaTokenExchangeResult>(
          '/api/autopost/meta/exchange-token',
          {
            method: 'POST',
            body: JSON.stringify({
              appId: input.appId?.trim() || undefined,
              appSecret: input.appSecret?.trim() || undefined,
              shortLivedToken: input.shortLivedToken.trim(),
              graphApiVersion: settings.metaApi.graphApiVersion,
            }),
          }
        );

        if (res.settings) setSettings(res.settings);
        if (res.capabilities) {
          setCapabilities(res.capabilities);
          if (res.capabilities.browserSession) {
            setBrowserSession(res.capabilities.browserSession);
          }
        }

        const pageCount = Array.isArray(res.pages) ? res.pages.length : 0;
        if (res.autoSelectedPage) {
          onToast?.(
            `Token ditukar ke Long-Lived dan Page "${res.autoSelectedPage.pageName}" siap dipakai.`,
            'success'
          );
        } else if (pageCount > 0) {
          onToast?.(
            `Token ditukar ke Long-Lived. ${pageCount} Page ditemukan, silakan pilih satu.`,
            'success'
          );
        } else {
          onToast?.(
            'Token ditukar ke Long-Lived, namun belum ada Facebook Page ditemukan.',
            'info'
          );
        }

        return res;
      } catch (error) {
        onToast?.(
          error instanceof Error
            ? error.message
            : 'Gagal menukar token ke Long-Lived.',
          'error'
        );
        return null;
      } finally {
        setBusyKey(null);
      }
    },
    [onToast, settings.metaApi.graphApiVersion]
  );

  const testMetaConnection = useCallback(async (): Promise<MetaConnectionTestResult | null> => {
    setBusyKey('meta-test');
    try {
      const res = await requestJson<MetaConnectionTestResult>(
        '/api/autopost/meta/test-connection',
        { method: 'POST' }
      );

      if (res.fbPage.ok && res.igAccount.ok) {
        onToast?.(
          'Tes koneksi berhasil: Facebook Page dan Instagram Business aktif.',
          'success'
        );
      } else if (res.fbPage.ok) {
        onToast?.(
          'Facebook Page terhubung, namun Instagram Business belum siap.',
          'info'
        );
      } else if (res.igAccount.ok) {
        onToast?.(
          'Instagram Business terhubung, namun Facebook Page gagal diperiksa.',
          'info'
        );
      } else {
        onToast?.(
          'Tes koneksi Meta belum berhasil. Periksa detail diagnostik.',
          'error'
        );
      }

      return res;
    } catch (error) {
      onToast?.(
        error instanceof Error
          ? error.message
          : 'Gagal menjalankan tes koneksi Meta.',
        'error'
      );
      return null;
    } finally {
      setBusyKey(null);
    }
  }, [onToast]);

  const getMetaAuthUrl = useCallback(async (): Promise<string | null> => {
    setBusyKey('meta-auth');
    try {
      const res = await requestJson<{ ok?: boolean; url?: string; authUrl?: string }>(
        '/api/autopost/meta/auth-url'
      );
      const url = res.url || res.authUrl || null;
      if (!url) throw new Error('URL OAuth Meta tidak tersedia.');
      return url;
    } catch (error) {
      onToast?.(
        error instanceof Error ? error.message : 'Gagal membuka OAuth Meta.',
        'error'
      );
      return null;
    } finally {
      setBusyKey(null);
    }
  }, [onToast]);

  const disconnectMeta = useCallback(async () => {
    setBusyKey('meta-disconnect');
    try {
      const res = await requestJson<{
        settings?: AutoPostSettings;
        capabilities?: AutoPostCapabilities;
      }>('/api/autopost/meta/disconnect', { method: 'POST' });
      if (res.settings) setSettings(res.settings);
      if (res.capabilities) setCapabilities(res.capabilities);
      onToast?.('Token Meta dihapus.', 'info');
    } catch (error) {
      onToast?.(
        error instanceof Error ? error.message : 'Gagal memutuskan Meta API.',
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  }, [onToast]);

  const getYouTubeAuthUrl = useCallback(async (): Promise<string | null> => {
    setBusyKey('youtube-auth');
    try {
      const res = await requestJson<{ url?: string; authUrl?: string }>(
        '/api/autopost/youtube/auth-url'
      );
      const url = res.url || res.authUrl || null;
      if (!url) throw new Error('URL otorisasi YouTube tidak tersedia.');
      return url;
    } catch (error) {
      onToast?.(
        error instanceof Error ? error.message : 'Gagal membuka OAuth YouTube.',
        'error'
      );
      return null;
    } finally {
      setBusyKey(null);
    }
  }, [onToast]);

  const disconnectYouTube = useCallback(async () => {
    setBusyKey('youtube-disconnect');
    try {
      const res = await requestJson<{
        settings?: AutoPostSettings;
        capabilities?: AutoPostCapabilities;
      }>('/api/autopost/youtube/disconnect', { method: 'POST' });
      if (res.settings) setSettings(res.settings);
      if (res.capabilities) setCapabilities(res.capabilities);
      onToast?.('Koneksi YouTube diputuskan.', 'info');
    } catch (error) {
      onToast?.(
        error instanceof Error ? error.message : 'Gagal memutus YouTube API.',
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  }, [onToast]);

  return {
    capabilities,
    settings,
    jobs,
    browserSession,
    isLoading,
    isRefreshing,
    busyKey,
    refresh,
    saveSettings,
    triggerPost,
    cancelJob,
    confirmJob,
    openProfile,
    closeProfile,
    discoverMeta,
    exchangeMetaToken,
    testMetaConnection,
    getMetaAuthUrl,
    disconnectMeta,
    getYouTubeAuthUrl,
    disconnectYouTube,
  };
}

export interface PlatformEngineInfo {
  label: string;
  variant: 'info' | 'muted' | 'warning';
}

export function resolvePlatformEngine(
  platform: PlatformKey,
  capabilities: AutoPostCapabilities
): PlatformEngineInfo {
  if (platform === 'yt_shorts' && capabilities.youtubeApiReady) {
    return { label: 'YouTube API', variant: 'info' };
  }
  if (
    platform === 'fb_reels' &&
    capabilities.metaFbApiReady
  ) {
    return { label: 'Meta API', variant: 'info' };
  }
  if (
    platform === 'ig_reels' &&
    capabilities.metaIgApiReady
  ) {
    return { label: 'Meta API', variant: 'info' };
  }
  return {
    label:
      capabilities.preferredChannel === 'msedge'
        ? 'Edge Profil Lokal'
        : 'Chrome Profil Lokal',
    variant: 'muted',
  };
}

export function pickNextContent(
  items: ContentPlannerItem[]
): ContentPlannerItem | null {
  const ready = items
    .filter((item) => item.autoMetadata.readiness.hasWmFinal)
    .sort((a, b) => {
      const byDate = a.schedule.isoDate.localeCompare(b.schedule.isoDate);
      if (byDate !== 0) return byDate;
      return a.folderCode.localeCompare(b.folderCode);
    });

  const withPending = ready.find((item) =>
    Object.values(item.userProperties.platforms).some(
      (platform) => platform.status !== 'published'
    )
  );

  return withPending ?? ready[0] ?? null;
}

export function countPendingPlatforms(item: ContentPlannerItem | null): number {
  if (!item) return 0;
  return Object.values(item.userProperties.platforms).filter(
    (platform) => platform.status !== 'published'
  ).length;
}

export function countPublishedPlatforms(item: ContentPlannerItem | null): number {
  if (!item) return 0;
  return Object.values(item.userProperties.platforms).filter(
    (platform) => platform.status === 'published'
  ).length;
}

export function useDerivedStats(
  items: ContentPlannerItem[],
  jobs: AutoPostJob[]
) {
  return useMemo(() => {
    const readyToPost = items.filter(
      (item) =>
        item.autoMetadata.readiness.hasWmFinal &&
        Object.values(item.userProperties.platforms).some(
          (platform) => platform.status !== 'published'
        )
    ).length;

    const needsWatermark = items.filter(
      (item) => !item.autoMetadata.readiness.hasWmFinal
    ).length;

    const runningJobs = jobs.filter(
      (job) => job.status === 'queued' || job.status === 'running'
    ).length;

    const publishedTotal = items.reduce(
      (acc, item) =>
        acc +
        Object.values(item.userProperties.platforms).filter(
          (platform) => platform.status === 'published'
        ).length,
      0
    );

    return {
      totalItems: items.length,
      readyToPost,
      needsWatermark,
      runningJobs,
      publishedTotal,
    };
  }, [items, jobs]);
}