import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openManagedEventSource } from '@/lib/managedEventSource';
import { playCpgpNotifSound } from '@/lib/notifSound';
import type {
  AiContentDisclosureMode,
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

export type PlatformSessionState = 'logged_in' | 'logged_out' | 'unknown';

export interface PlatformSessionCheckResult {
  platform: PlatformKey;
  state: PlatformSessionState;
  detail: string;
  checkedAt: string;
}

const SESSION_CHECKS_STORAGE_PREFIX = 'autopost.studio.sessionChecks.v1';

function getSessionChecksStorageKey(workspaceId: string): string {
  return `${SESSION_CHECKS_STORAGE_PREFIX}:${workspaceId || 'default'}`;
}

function loadStoredSessionChecks(
  workspaceId: string
): Partial<Record<PlatformKey, PlatformSessionCheckResult>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(
      getSessionChecksStorageKey(workspaceId)
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<Record<PlatformKey, PlatformSessionCheckResult>>;
  } catch {
    return {};
  }
}

function persistSessionChecks(
  workspaceId: string,
  checks: Partial<Record<PlatformKey, PlatformSessionCheckResult>>
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      getSessionChecksStorageKey(workspaceId),
      JSON.stringify(checks)
    );
  } catch {
    // ignore storage quota or privacy mode errors
  }
}

export interface AutoPostSettingsPatch {
  defaultMode?: AutoPostMode;
  aiContentDisclosure?: AiContentDisclosureMode;
  browser?: {
    channel?: 'chrome' | 'msedge';
    keepTabOpenOnReview?: boolean;
    cdpUrl?: string;
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
  aiContentDisclosure: 'ask',
  browser: {
    channel: 'chrome',
    profileDir: 'data/browser-profile',
    keepTabOpenOnReview: true,
    cdpUrl: '',
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
  workspaceId?: string;
  onToast?: (message: string, type?: ToastKind) => void;
  onPlannerSync?: () => void;
}

export interface UseAutoPostDataResult {
  capabilities: AutoPostCapabilities;
  settings: AutoPostSettings;
  jobs: AutoPostJob[];
  browserSession: AutoPostBrowserSessionStatus;
  sessionChecks: Partial<Record<PlatformKey, PlatformSessionCheckResult>>;
  isLoading: boolean;
  isRefreshing: boolean;
  busyKey: string | null;
  refresh: () => Promise<void>;
  saveSettings: (patch: AutoPostSettingsPatch) => Promise<boolean>;
  triggerPost: (
    itemId: string,
    platforms: PlatformKey[],
    mode: AutoPostMode,
    scheduledAt?: string | null,
    aiGenerated?: boolean
  ) => Promise<boolean>;
  cancelJob: (jobId: string) => Promise<void>;
  confirmJob: (jobId: string, publishedUrl?: string) => Promise<void>;
  openProfile: (platforms?: PlatformKey[]) => Promise<void>;
  closeProfile: () => Promise<void>;
  checkStudioSessions: (platforms?: PlatformKey[]) => Promise<void>;
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
  const { isOpen, workspaceId, onToast, onPlannerSync } = options;
  const activeWorkspaceKey = workspaceId || 'default';

  const onToastRef = useRef(onToast);
  const onPlannerSyncRef = useRef(onPlannerSync);
  const workspaceKeyRef = useRef(activeWorkspaceKey);
  workspaceKeyRef.current = activeWorkspaceKey;

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    onPlannerSyncRef.current = onPlannerSync;
  }, [onPlannerSync]);

  const [capabilities, setCapabilities] =
    useState<AutoPostCapabilities>(EMPTY_CAPABILITIES);
  const [settings, setSettings] = useState<AutoPostSettings>(EMPTY_SETTINGS);
  const [jobs, setJobs] = useState<AutoPostJob[]>([]);
  const [browserSession, setBrowserSession] =
    useState<AutoPostBrowserSessionStatus>(EMPTY_SESSION);
  const [sessionChecks, setSessionChecks] = useState<
    Partial<Record<PlatformKey, PlatformSessionCheckResult>>
  >(() => loadStoredSessionChecks(activeWorkspaceKey));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const syncedCompletedJobs = useRef<Set<string>>(new Set());
  const notifiedReviewJobs = useRef<Set<string>>(new Set());
  const notifiedFailedJobs = useRef<Set<string>>(new Set());
  const prevWorkspaceIdRef = useRef<string | undefined>(workspaceId);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const prev = prevWorkspaceIdRef.current;
    const next = workspaceId;
    if (prev && next && prev !== next) {
      syncedCompletedJobs.current.clear();
      notifiedReviewJobs.current.clear();
      notifiedFailedJobs.current.clear();
    }
    setSessionChecks(loadStoredSessionChecks(activeWorkspaceKey));
    prevWorkspaceIdRef.current = next;
  }, [workspaceId, activeWorkspaceKey]);

  const refresh = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    let run: Promise<void> | null = null;
    run = (async () => {
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
        if (
          jobsRes.status === 'fulfilled' &&
          Array.isArray(jobsRes.value.jobs)
        ) {
          for (const job of jobsRes.value.jobs) {
            if (job.status === 'completed') {
              syncedCompletedJobs.current.add(job.jobId);
            } else if (job.status === 'awaiting_review') {
              notifiedReviewJobs.current.add(job.jobId);
            } else if (job.status === 'failed') {
              notifiedFailedJobs.current.add(job.jobId);
            }
          }
          setJobs(jobsRes.value.jobs);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        if (inFlightRefreshRef.current === run) {
          inFlightRefreshRef.current = null;
        }
      }
    })();

    inFlightRefreshRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) return;

    let managed: { source: EventSource; close: () => void } | null = null;
    try {
      managed = openManagedEventSource('/api/autopost/events');
      const { source } = managed;
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

          const isSnapshot = payload.type === 'jobs-snapshot';
          if (Array.isArray(payload.jobs)) {
            let completedNow = false;
            let shouldChime = false;
            for (const job of payload.jobs) {
              if (
                job.status === 'completed' &&
                !syncedCompletedJobs.current.has(job.jobId)
              ) {
                syncedCompletedJobs.current.add(job.jobId);
                if (!isSnapshot) {
                  completedNow = true;
                  shouldChime = true;
                }
              } else if (
                job.status === 'awaiting_review' &&
                !notifiedReviewJobs.current.has(job.jobId)
              ) {
                notifiedReviewJobs.current.add(job.jobId);
                if (!isSnapshot) {
                  shouldChime = true;
                }
              } else if (
                job.status === 'failed' &&
                !notifiedFailedJobs.current.has(job.jobId)
              ) {
                notifiedFailedJobs.current.add(job.jobId);
                if (!isSnapshot) {
                  shouldChime = true;
                  onToastRef.current?.(
                    `Auto-Post ${job.platform} gagal: ${job.error || job.step}`,
                    'error'
                  );
                }
              }
            }
            setJobs(payload.jobs);
            if (completedNow) onPlannerSyncRef.current?.();
            if (shouldChime) void playCpgpNotifSound();
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
              onPlannerSyncRef.current?.();
              void playCpgpNotifSound();
            } else if (
              incoming.status === 'awaiting_review' &&
              !notifiedReviewJobs.current.has(incoming.jobId)
            ) {
              notifiedReviewJobs.current.add(incoming.jobId);
              void playCpgpNotifSound();
            } else if (
              incoming.status === 'failed' &&
              !notifiedFailedJobs.current.has(incoming.jobId)
            ) {
              notifiedFailedJobs.current.add(incoming.jobId);
              void playCpgpNotifSound();
              onToastRef.current?.(
                `Auto-Post ${incoming.platform} gagal: ${incoming.error || incoming.step}`,
                'error'
              );
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
      managed?.close();
    };
  }, [isOpen]);

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
        if (patch.browser && typeof patch.browser.cdpUrl === 'string') {
          onToastRef.current?.(
            patch.browser.cdpUrl.trim()
              ? 'URL CDP browser tersimpan.'
              : 'URL CDP browser dikosongkan.',
            'success'
          );
        }
        return true;
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error ? error.message : 'Gagal menyimpan pengaturan.',
          'error'
        );
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    []
  );

  const triggerPost = useCallback(
    async (
      itemId: string,
      platforms: PlatformKey[],
      mode: AutoPostMode,
      scheduledAt?: string | null,
      aiGenerated?: boolean
    ): Promise<boolean> => {
      if (platforms.length === 0) return false;
      setBusyKey(`trigger:${itemId}`);
      try {
        const payload: {
          itemId: string;
          platforms: PlatformKey[];
          mode: AutoPostMode;
          scheduledAt?: string;
          aiGenerated?: boolean;
        } = { itemId, platforms, mode };
        if (scheduledAt && scheduledAt.trim()) {
          payload.scheduledAt = scheduledAt.trim();
        }
        if (typeof aiGenerated === 'boolean') {
          payload.aiGenerated = aiGenerated;
        }
        const res = await requestJson<{ jobs?: AutoPostJob[] }>(
          '/api/autopost/trigger',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (Array.isArray(res.jobs)) {
          setJobs((prev) => {
            const byId = new Map(prev.map((job) => [job.jobId, job]));
            for (const job of res.jobs ?? []) byId.set(job.jobId, job);
            return Array.from(byId.values());
          });
        }
        const aiSuffix =
          payload.aiGenerated === true ? ' (Label AI aktif)' : '';
        onToastRef.current?.(
          payload.scheduledAt
            ? `${platforms.length} jadwal Auto-Post (${payload.scheduledAt.replace('T', ' ')})${aiSuffix} dimasukkan ke antrean.`
            : `${platforms.length} proses Auto-Post${aiSuffix} dimasukkan ke antrean.`,
          'success'
        );
        return true;
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error ? error.message : 'Gagal memulai Auto-Post.',
          'error'
        );
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    []
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      setBusyKey(`job:${jobId}`);
      try {
        await requestJson(`/api/autopost/jobs/${encodeURIComponent(jobId)}/cancel`, {
          method: 'POST',
        });
        onToastRef.current?.('Proses Auto-Post dibatalkan.', 'info');
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error ? error.message : 'Gagal membatalkan proses.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    []
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
        onToastRef.current?.('Status publish dikonfirmasi.', 'success');
        onPlannerSyncRef.current?.();
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error ? error.message : 'Gagal konfirmasi publish.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    []
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
        onToastRef.current?.(
          `Browser dibuka (${res.openedUrls?.length ?? platforms?.length ?? 4} tab studio).`,
          'info'
        );
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error ? error.message : 'Gagal membuka browser.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    []
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
      onToastRef.current?.('Sesi browser ditutup.', 'info');
    } catch (error) {
      onToastRef.current?.(
        error instanceof Error ? error.message : 'Gagal menutup browser.',
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  }, []);

  const checkStudioSessions = useCallback(
    async (platforms?: PlatformKey[]) => {
      const capturedWorkspaceKey = workspaceKeyRef.current;
      const isMetaPair =
        platforms &&
        platforms.length === 2 &&
        platforms.includes('fb_reels') &&
        platforms.includes('ig_reels');
      const targetBusyKey = isMetaPair
        ? 'check-sessions:meta'
        : platforms && platforms.length === 1
          ? `check-sessions:${platforms[0]}`
          : 'check-sessions';
      setBusyKey(targetBusyKey);
      try {
        const res = await requestJson<{
          ok?: boolean;
          sessions?: Partial<Record<PlatformKey, PlatformSessionCheckResult>>;
          browserSession?: AutoPostBrowserSessionStatus;
          capabilities?: AutoPostCapabilities;
        }>('/api/autopost/check-sessions', {
          method: 'POST',
          body: JSON.stringify(platforms ? { platforms } : {}),
        });

        const incoming = res.sessions ?? {};
        const targetList =
          platforms && platforms.length > 0
            ? platforms
            : (['yt_shorts', 'tiktok', 'ig_reels', 'fb_reels'] as PlatformKey[]);

        const isSameWorkspace =
          workspaceKeyRef.current === capturedWorkspaceKey;

        if (isSameWorkspace) {
          if (res.browserSession) setBrowserSession(res.browserSession);
          if (res.capabilities) setCapabilities(res.capabilities);
          setSessionChecks((prev) => {
            const next = { ...prev };
            for (const key of targetList) {
              if (incoming[key]) {
                next[key] = incoming[key];
              }
            }
            persistSessionChecks(capturedWorkspaceKey, next);
            return next;
          });
        } else {
          const stored = loadStoredSessionChecks(capturedWorkspaceKey);
          const merged = { ...stored };
          for (const key of targetList) {
            if (incoming[key]) {
              merged[key] = incoming[key];
            }
          }
          persistSessionChecks(capturedWorkspaceKey, merged);
          return;
        }

        const checkedEntries = targetList
          .map((key) => incoming[key])
          .filter((entry): entry is PlatformSessionCheckResult =>
            Boolean(entry)
          );
        const loggedInCount = checkedEntries.filter(
          (entry) => entry.state === 'logged_in'
        ).length;

        if (isMetaPair) {
          const metaOk = checkedEntries.some(
            (entry) => entry.state === 'logged_in'
          );
          onToastRef.current?.(
            metaOk
              ? 'Sesi Meta Business Suite (FB & IG) aktif.'
              : 'Sesi Meta Business Suite (FB & IG) belum login.',
            metaOk ? 'success' : 'info'
          );
        } else if (checkedEntries.length > 0) {
          onToastRef.current?.(
            `Cek sesi selesai: ${loggedInCount} dari ${checkedEntries.length} platform sudah login.`,
            loggedInCount === checkedEntries.length ? 'success' : 'info'
          );
        } else {
          onToastRef.current?.('Tidak ada sesi platform yang diperiksa.', 'info');
        }
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error
            ? error.message
            : 'Gagal memeriksa sesi studio.',
          'error'
        );
      } finally {
        setBusyKey(null);
      }
    },
    []
  );

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
        onToastRef.current?.(
          pages.length > 0
            ? `${pages.length} akun Meta ditemukan.`
            : 'Tidak ada akun Meta yang ditemukan.',
          pages.length > 0 ? 'success' : 'info'
        );
        return pages;
      } catch (error) {
        onToastRef.current?.(
          error instanceof Error ? error.message : 'Gagal mendeteksi akun Meta.',
          'error'
        );
        return null;
      } finally {
        setBusyKey(null);
      }
    },
    [settings.metaApi.graphApiVersion]
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
          onToastRef.current?.(
            `Token ditukar ke Long-Lived dan Page "${res.autoSelectedPage.pageName}" siap dipakai.`,
            'success'
          );
        } else if (pageCount > 0) {
          onToastRef.current?.(
            `Token ditukar ke Long-Lived. ${pageCount} Page ditemukan, silakan pilih satu.`,
            'success'
          );
        } else {
          onToastRef.current?.(
            'Token ditukar ke Long-Lived, namun belum ada Facebook Page ditemukan.',
            'info'
          );
        }

        return res;
      } catch (error) {
        onToastRef.current?.(
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
    [settings.metaApi.graphApiVersion]
  );

  const testMetaConnection = useCallback(async (): Promise<MetaConnectionTestResult | null> => {
    setBusyKey('meta-test');
    try {
      const res = await requestJson<MetaConnectionTestResult>(
        '/api/autopost/meta/test-connection',
        { method: 'POST' }
      );

      if (res.fbPage.ok && res.igAccount.ok) {
        onToastRef.current?.(
          'Tes koneksi berhasil: Facebook Page dan Instagram Business aktif.',
          'success'
        );
      } else if (res.fbPage.ok) {
        onToastRef.current?.(
          'Facebook Page terhubung, namun Instagram Business belum siap.',
          'info'
        );
      } else if (res.igAccount.ok) {
        onToastRef.current?.(
          'Instagram Business terhubung, namun Facebook Page gagal diperiksa.',
          'info'
        );
      } else {
        onToastRef.current?.(
          'Tes koneksi Meta belum berhasil. Periksa detail diagnostik.',
          'error'
        );
      }

      return res;
    } catch (error) {
      onToastRef.current?.(
        error instanceof Error
          ? error.message
          : 'Gagal menjalankan tes koneksi Meta.',
        'error'
      );
      return null;
    } finally {
      setBusyKey(null);
    }
  }, []);

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
      onToastRef.current?.(
        error instanceof Error ? error.message : 'Gagal membuka OAuth Meta.',
        'error'
      );
      return null;
    } finally {
      setBusyKey(null);
    }
  }, []);

  const disconnectMeta = useCallback(async () => {
    setBusyKey('meta-disconnect');
    try {
      const res = await requestJson<{
        settings?: AutoPostSettings;
        capabilities?: AutoPostCapabilities;
      }>('/api/autopost/meta/disconnect', { method: 'POST' });
      if (res.settings) setSettings(res.settings);
      if (res.capabilities) setCapabilities(res.capabilities);
      onToastRef.current?.('Token Meta dihapus.', 'info');
    } catch (error) {
      onToastRef.current?.(
        error instanceof Error ? error.message : 'Gagal memutuskan Meta API.',
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  }, []);

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
      onToastRef.current?.(
        error instanceof Error ? error.message : 'Gagal membuka OAuth YouTube.',
        'error'
      );
      return null;
    } finally {
      setBusyKey(null);
    }
  }, []);

  const disconnectYouTube = useCallback(async () => {
    setBusyKey('youtube-disconnect');
    try {
      const res = await requestJson<{
        settings?: AutoPostSettings;
        capabilities?: AutoPostCapabilities;
      }>('/api/autopost/youtube/disconnect', { method: 'POST' });
      if (res.settings) setSettings(res.settings);
      if (res.capabilities) setCapabilities(res.capabilities);
      onToastRef.current?.('Koneksi YouTube diputuskan.', 'info');
    } catch (error) {
      onToastRef.current?.(
        error instanceof Error ? error.message : 'Gagal memutus YouTube API.',
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  }, []);

  return useMemo(
    () => ({
      capabilities,
      settings,
      jobs,
      browserSession,
      sessionChecks,
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
      checkStudioSessions,
      discoverMeta,
      exchangeMetaToken,
      testMetaConnection,
      getMetaAuthUrl,
      disconnectMeta,
      getYouTubeAuthUrl,
      disconnectYouTube,
    }),
    [
      capabilities,
      settings,
      jobs,
      browserSession,
      sessionChecks,
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
      checkStudioSessions,
      discoverMeta,
      exchangeMetaToken,
      testMetaConnection,
      getMetaAuthUrl,
      disconnectMeta,
      getYouTubeAuthUrl,
      disconnectYouTube,
    ]
  );
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