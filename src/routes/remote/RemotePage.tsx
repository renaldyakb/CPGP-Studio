import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Droplets,
  LogOut,
  Moon,
  RefreshCw,
  Send,
  Settings,
  Smartphone,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAppTheme } from '@/components/shell/useAppTheme';
import { openManagedEventSource } from '@/lib/managedEventSource';
import {
  isAudioUnlocked,
  isNotifSoundEnabled,
  isNotifVibrateEnabled,
  playCpgpNotifSound,
  setNotifSoundEnabled,
  setNotifVibrateEnabled,
  unlockNotifAudio,
} from '@/lib/notifSound';
import {
  watermarkApi,
  type WatermarkOutputMode,
} from '@/services/watermarkApi';
import type {
  AutoPostCapabilities,
  AutoPostJob,
  AutoPostMode,
  AutoPostSettings,
} from '@/types/autopost';
import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
} from '@/types/planner';
import type {
  WatermarkCapabilities,
  WatermarkEncoderMode,
  WatermarkPresetStore,
  WatermarkRenderJob,
} from '@/types/watermark';
import { RemoteAuthGate } from './RemoteAuthGate';
import { RemoteMonitorTab } from './RemoteMonitorTab';
import { RemotePublishTab } from './RemotePublishTab';
import { RemoteWatermarkTab } from './RemoteWatermarkTab';

type RemoteTabKey = 'publish' | 'watermark' | 'monitor' | 'settings';

interface RemoteSessionResponse {
  enabled: boolean;
  authenticated: boolean;
  isLoopback: boolean;
  soundOnDesktop: boolean;
  activeWorkspace: {
    id: string;
    name: string;
    handle: string;
  } | null;
}

const EMPTY_CAPABILITIES: AutoPostCapabilities = {
  chromeAvailable: false,
  edgeAvailable: false,
  preferredChannel: null,
  profileInitialized: false,
  youtubeApiReady: false,
  metaFbApiReady: false,
  metaIgApiReady: false,
};

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

export function RemotePage() {
  const { theme, toggleTheme } = useAppTheme();

  const [activeTab, setActiveTab] = useState<RemoteTabKey>('publish');
  const [sessionLoaded, setSessionLoaded] = useState<boolean>(false);
  const [remoteEnabled, setRemoteEnabled] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [isLoopback, setIsLoopback] = useState<boolean>(false);
  const [isExchangingToken, setIsExchangingToken] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceMeta, setWorkspaceMeta] = useState<{
    id: string;
    name: string;
    handle: string;
  } | null>(null);

  // Live data
  const [items, setItems] = useState<ContentPlannerItem[]>([]);
  const [apCapabilities, setApCapabilities] =
    useState<AutoPostCapabilities>(EMPTY_CAPABILITIES);
  const [apSettings, setApSettings] = useState<AutoPostSettings | null>(null);
  const [apJobs, setApJobs] = useState<AutoPostJob[]>([]);
  const [wmJobs, setWmJobs] = useState<WatermarkRenderJob[]>([]);
  const [wmPresets, setWmPresets] = useState<WatermarkPresetStore | null>(null);
  const [wmCaps, setWmCaps] = useState<WatermarkCapabilities | null>(null);

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isTriggeringPost, setIsTriggeringPost] = useState<boolean>(false);
  const [isStartingWm, setIsStartingWm] = useState<boolean>(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  // Audio & WakeLock state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    isNotifSoundEnabled()
  );
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(() =>
    isNotifVibrateEnabled()
  );
  const [soundReady, setSoundReady] = useState<boolean>(() => isAudioUnlocked());
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const seenApTerminalRef = useRef<Set<string>>(new Set());
  const seenWmTerminalRef = useRef<Set<string>>(new Set());

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      setToast({ message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      if (!nav.wakeLock) return false;
      const sentinel = await nav.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // ignore release errors
    } finally {
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const handleEnableSoundAndWakeLock = async () => {
    const ok = await unlockNotifAudio(true);
    setSoundReady(ok);
    setSoundEnabled(true);
    setNotifSoundEnabled(true);
    const locked = await acquireWakeLock();
    showToast(
      locked
        ? 'Suara notifikasi & jaga layar aktif.'
        : 'Suara notifikasi cpgp-notif.mp3 aktif.',
      'success'
    );
  };

  const checkSession = useCallback(async () => {
    setAuthError(null);
    try {
      const res = await fetch('/api/remote/session');
      if (res.status === 403) {
        setRemoteEnabled(false);
        setAuthenticated(false);
        setSessionLoaded(true);
        return;
      }
      if (!res.ok) {
        setSessionLoaded(true);
        return;
      }
      const data = (await res.json()) as RemoteSessionResponse;
      setRemoteEnabled(data.enabled || data.isLoopback);
      setAuthenticated(data.authenticated);
      setIsLoopback(data.isLoopback);
      setWorkspaceMeta(data.activeWorkspace);

      // Auto-exchange QR pairing ?token= if present and not yet authenticated
      const url = new URL(window.location.href);
      const qrToken = url.searchParams.get('token')?.trim() || '';
      if (qrToken && !data.authenticated && (data.enabled || data.isLoopback)) {
        setIsExchangingToken(true);
        try {
          const authRes = await fetch('/api/remote/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: qrToken }),
          });
          const authBody = (await authRes.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };
          if (authRes.ok && authBody.ok) {
            url.searchParams.delete('token');
            window.history.replaceState({}, '', url.pathname + url.search);
            setAuthenticated(true);
          } else {
            setAuthError(
              authBody.error || 'Token QR sudah kedaluwarsa. Masukkan PIN 6 digit.'
            );
          }
        } finally {
          setIsExchangingToken(false);
        }
      }
    } catch {
      setAuthError('Gagal menghubungi server CPGP di PC.');
    } finally {
      setSessionLoaded(true);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleSubmitPin = async (pin: string) => {
    const res = await fetch('/api/remote/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'PIN tidak valid.');
    }
    setAuthenticated(true);
    setAuthError(null);
    void unlockNotifAudio(false).then((ok) => {
      if (ok) setSoundReady(true);
    });
  };

  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [plannerRes, capRes, setRes, apJobsRes, wmPresetsRes, wmCapsRes, wmJobsRes] =
        await Promise.allSettled([
          fetch('/api/planner').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/autopost/capabilities').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/autopost/settings').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/autopost/jobs').then((r) => (r.ok ? r.json() : null)),
          watermarkApi.getPresets(),
          watermarkApi.getCapabilities(),
          watermarkApi.getJobs(),
        ]);

      if (plannerRes.status === 'fulfilled' && plannerRes.value) {
        const db = plannerRes.value as PlannerDatabase;
        setItems(Object.values(db.items ?? {}));
      }
      if (capRes.status === 'fulfilled' && capRes.value) {
        setApCapabilities(capRes.value as AutoPostCapabilities);
      }
      if (setRes.status === 'fulfilled' && setRes.value) {
        setApSettings(setRes.value as AutoPostSettings);
      }
      if (apJobsRes.status === 'fulfilled' && Array.isArray(apJobsRes.value?.jobs)) {
        const list = apJobsRes.value.jobs as AutoPostJob[];
        for (const j of list) {
          if (
            j.status === 'completed' ||
            j.status === 'awaiting_review' ||
            j.status === 'failed'
          ) {
            seenApTerminalRef.current.add(`${j.jobId}:${j.status}`);
          }
        }
        setApJobs(list);
      }
      if (wmPresetsRes.status === 'fulfilled') {
        setWmPresets(wmPresetsRes.value);
      }
      if (wmCapsRes.status === 'fulfilled') {
        setWmCaps(wmCapsRes.value);
      }
      if (wmJobsRes.status === 'fulfilled' && Array.isArray(wmJobsRes.value)) {
        for (const j of wmJobsRes.value) {
          if (j.status === 'completed' || j.status === 'failed') {
            seenWmTerminalRef.current.add(`${j.jobId}:${j.status}`);
          }
        }
        setWmJobs(wmJobsRes.value);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void refreshAllData();
  }, [authenticated, refreshAllData]);

  // Live SSE streams for Planner, Auto-Post & Watermark with cpgp-notif.mp3 alerts
  useEffect(() => {
    if (!authenticated) return;

    const plannerSse = openManagedEventSource('/api/events');
    const apSse = openManagedEventSource('/api/autopost/events');
    const wmSse = openManagedEventSource('/api/watermark/events');
    let plannerTimer: number | null = null;

    const schedulePlannerReload = () => {
      if (plannerTimer !== null) window.clearTimeout(plannerTimer);
      plannerTimer = window.setTimeout(() => {
        plannerTimer = null;
        fetch('/api/planner')
          .then((r) => (r.ok ? r.json() : null))
          .then((db: PlannerDatabase | null) => {
            if (db?.items) setItems(Object.values(db.items));
          })
          .catch(() => {});
      }, 350);
    };

    plannerSse.source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          workspace?: { id: string; name: string; handle: string };
        };
        if (payload.workspace) {
          setWorkspaceMeta(payload.workspace);
        }
        if (
          payload.type === 'planner-updated' ||
          payload.type === 'workspace-switched' ||
          payload.type === 'scan_complete'
        ) {
          schedulePlannerReload();
        }
      } catch {
        // ignore heartbeat
      }
    };

    apSse.source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          jobs?: AutoPostJob[];
          job?: AutoPostJob;
        };
        const isSnapshot = payload.type === 'jobs-snapshot';
        const list = Array.isArray(payload.jobs)
          ? payload.jobs
          : payload.job
            ? [payload.job]
            : [];

        if (Array.isArray(payload.jobs)) {
          setApJobs(payload.jobs);
        } else if (payload.job) {
          const inc = payload.job;
          setApJobs((prev) =>
            prev.some((j) => j.jobId === inc.jobId)
              ? prev.map((j) => (j.jobId === inc.jobId ? inc : j))
              : [inc, ...prev]
          );
        }

        let chimeNow = false;
        let lastToast: { message: string; type: 'success' | 'info' | 'error' } | null = null;
        for (const job of list) {
          const key = `${job.jobId}:${job.status}`;
          if (seenApTerminalRef.current.has(key)) continue;
          if (job.status === 'completed') {
            seenApTerminalRef.current.add(key);
            if (!isSnapshot) {
              chimeNow = true;
              lastToast = {
                message: `Selesai: ${job.folderCode} (${job.platform})`,
                type: 'success',
              };
              schedulePlannerReload();
            }
          } else if (job.status === 'awaiting_review') {
            seenApTerminalRef.current.add(key);
            if (!isSnapshot) {
              chimeNow = true;
              lastToast = {
                message: `Menunggu tinjau: ${job.folderCode} (${job.platform})`,
                type: 'info',
              };
            }
          } else if (job.status === 'failed') {
            seenApTerminalRef.current.add(key);
            if (!isSnapshot) {
              chimeNow = true;
              lastToast = {
                message: `Gagal (${job.folderCode}): ${job.error || job.step}`,
                type: 'error',
              };
            }
          }
        }
        if (chimeNow) {
          void playCpgpNotifSound();
        }
        if (lastToast) {
          showToast(lastToast.message, lastToast.type);
        }
      } catch {
        // ignore heartbeat
      }
    };

    wmSse.source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          jobs?: WatermarkRenderJob[];
        };
        const isSnapshot = payload.type === 'jobs-snapshot';
        if (Array.isArray(payload.jobs)) {
          setWmJobs(payload.jobs);
          let chimeNow = false;
          let lastToast: { message: string; type: 'success' | 'error' } | null = null;
          for (const job of payload.jobs) {
            const key = `${job.jobId}:${job.status}`;
            if (seenWmTerminalRef.current.has(key)) continue;
            if (job.status === 'completed') {
              seenWmTerminalRef.current.add(key);
              if (!isSnapshot) {
                chimeNow = true;
                lastToast = {
                  message: `Watermark selesai: ${job.folderCode}`,
                  type: 'success',
                };
                schedulePlannerReload();
              }
            } else if (job.status === 'failed') {
              seenWmTerminalRef.current.add(key);
              if (!isSnapshot) {
                chimeNow = true;
                lastToast = {
                  message: `Watermark gagal (${job.folderCode})`,
                  type: 'error',
                };
              }
            }
          }
          if (chimeNow) {
            void playCpgpNotifSound();
          }
          if (lastToast) {
            showToast(lastToast.message, lastToast.type);
          }
        }
      } catch {
        // ignore heartbeat
      }
    };

    return () => {
      if (plannerTimer !== null) window.clearTimeout(plannerTimer);
      plannerSse.close();
      apSse.close();
      wmSse.close();
    };
  }, [authenticated, showToast]);

  const handleTriggerPost = async (params: {
    item: ContentPlannerItem;
    platforms: PlatformKey[];
    mode: AutoPostMode;
    scheduledAt: string | null;
    aiGenerated?: boolean;
  }) => {
    setIsTriggeringPost(true);
    try {
      if (!soundReady) {
        const ok = await unlockNotifAudio(false);
        if (ok) setSoundReady(true);
      }
      const res = await fetch('/api/autopost/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: params.item.id,
          platforms: params.platforms,
          mode: params.mode,
          scheduledAt: params.scheduledAt,
          aiGenerated: params.aiGenerated,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Gagal memulai Auto-Post (${res.status})`);
      }
      showToast(
        `Antrean Auto-Post dimulai (${params.item.folderCode} · ${params.platforms.length} platform).`,
        'success'
      );
      setActiveTab('monitor');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memulai Auto-Post.',
        'error'
      );
    } finally {
      setIsTriggeringPost(false);
    }
  };

  const handleStartWatermark = async (params: {
    itemIds: string[];
    presetId?: string;
    encoder: WatermarkEncoderMode;
    outputMode: WatermarkOutputMode;
  }) => {
    setIsStartingWm(true);
    try {
      if (!soundReady) {
        const ok = await unlockNotifAudio(false);
        if (ok) setSoundReady(true);
      }
      await watermarkApi.startRender({
        itemIds: params.itemIds,
        presetId: params.presetId,
        encoder: params.encoder,
        outputMode: params.outputMode,
        speedMode: 'fast',
      });
      showToast(
        `Render watermark dimulai untuk ${params.itemIds.length} konten.`,
        'success'
      );
      setActiveTab('monitor');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memulai render watermark.',
        'error'
      );
    } finally {
      setIsStartingWm(false);
    }
  };

  const handleCancelAutoPost = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      await fetch(`/api/autopost/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
      });
      showToast('Job Auto-Post dibatalkan.', 'info');
    } finally {
      setBusyJobId(null);
    }
  };

  const handleConfirmAutoPost = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      const res = await fetch(
        `/api/autopost/jobs/${encodeURIComponent(jobId)}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Gagal konfirmasi job.');
      }
      showToast('Status postingan diperbarui selesai.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal mengonfirmasi job.',
        'error'
      );
    } finally {
      setBusyJobId(null);
    }
  };

  const handleRetryAutoPost = async (job: AutoPostJob) => {
    const targetItem = items.find((i) => i.id === job.itemId);
    if (!targetItem) {
      showToast('Konten tidak ditemukan di workspace aktif.', 'error');
      return;
    }
    await handleTriggerPost({
      item: targetItem,
      platforms: [job.platform],
      mode: job.mode,
      scheduledAt: job.scheduledAt ?? null,
      aiGenerated: Boolean(job.aiGenerated),
    });
  };

  const handleCancelWatermark = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      await watermarkApi.cancelJob(jobId);
      showToast('Render watermark dibatalkan.', 'info');
    } finally {
      setBusyJobId(null);
    }
  };

  const handleRescanDisk = async () => {
    setIsRefreshing(true);
    try {
      await fetch('/api/scan', { method: 'POST' });
      await refreshAllData();
      showToast('Folder konten PC berhasil dipindai ulang.', 'success');
    } catch {
      showToast('Gagal memindai folder konten.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/remote/logout', { method: 'POST' }).catch(() => {});
    void releaseWakeLock();
    setAuthenticated(false);
  };

  const activeJobsBadgeCount = useMemo(() => {
    const apActive = apJobs.filter(
      (j) =>
        j.status === 'running' ||
        j.status === 'queued' ||
        j.status === 'awaiting_review'
    ).length;
    const wmActive = wmJobs.filter(
      (j) => j.status === 'rendering' || j.status === 'queued'
    ).length;
    return apActive + wmActive;
  }, [apJobs, wmJobs]);

  if (!sessionLoaded) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-xs text-muted-foreground"
      >
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Menghubungkan ke CPGP Studio PC...</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <RemoteAuthGate
        remoteDisabled={!remoteEnabled}
        isExchangingToken={isExchangingToken}
        initialError={authError}
        onSubmitPin={handleSubmitPin}
        onRetryStatus={() => void checkSession()}
      />
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      {/* Compact mobile header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-3.5 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-burgundy)] font-mono text-xs font-bold text-white">
              CP
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-sm font-bold text-foreground">
                  CPGP Remote
                </h1>
                <Badge variant="success" size="xs">
                  Wi-Fi
                </Badge>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {workspaceMeta
                  ? `${workspaceMeta.name} (${workspaceMeta.handle})`
                  : 'Terhubung ke PC'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Muat ulang data dari PC"
              disabled={isRefreshing}
              onClick={() => void refreshAllData()}
              className="min-h-10 min-w-10"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              onClick={toggleTheme}
              className="min-h-10 min-w-10"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content area with bottom-nav safe padding */}
      <main className="mx-auto w-full max-w-lg flex-1 space-y-3.5 px-3.5 pt-3.5 pb-24">
        {/* 1-tap audio unlock + wake-lock banner */}
        {!soundReady && soundEnabled ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#7F1D1D]/30 bg-[#FCE7EB]/50 px-3 py-2.5 dark:border-[#9F1239]/50 dark:bg-[#4C0519]/35">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <Volume2
                className="h-4 w-4 shrink-0 text-[#651220] dark:text-[#FECDD3]"
                aria-hidden="true"
              />
              <span className="font-medium text-foreground">
                Ketuk sekali agar suara notifikasi &amp; layar aktif di HP.
              </span>
            </div>
            <Button
              type="button"
              size="xs"
              variant="editorial"
              onClick={() => void handleEnableSoundAndWakeLock()}
              className="min-h-10 shrink-0"
            >
              Aktifkan
            </Button>
          </div>
        ) : null}

        {activeTab === 'publish' ? (
          <RemotePublishTab
            items={items}
            capabilities={apCapabilities}
            defaultMode={apSettings?.defaultMode ?? 'review'}
            defaultAiDisclosure={apSettings?.aiContentDisclosure ?? 'ask'}
            isSubmitting={isTriggeringPost}
            onTriggerPost={handleTriggerPost}
            onGoToWatermark={() => setActiveTab('watermark')}
          />
        ) : activeTab === 'watermark' ? (
          <RemoteWatermarkTab
            items={items}
            presetStore={wmPresets}
            capabilities={wmCaps}
            isStarting={isStartingWm}
            onStartRender={handleStartWatermark}
          />
        ) : activeTab === 'monitor' ? (
          <RemoteMonitorTab
            autoPostJobs={apJobs}
            watermarkJobs={wmJobs}
            busyJobId={busyJobId}
            onCancelAutoPost={handleCancelAutoPost}
            onConfirmAutoPost={handleConfirmAutoPost}
            onRetryAutoPost={handleRetryAutoPost}
            onCancelWatermark={handleCancelWatermark}
          />
        ) : (
          <div className="space-y-3">
            <Card>
              <CardContent className="divide-y divide-border p-0">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div className="space-y-0.5">
                    <label
                      htmlFor="remote-sound-switch"
                      className="cursor-pointer text-xs font-semibold text-foreground"
                    >
                      Suara Notifikasi (cpgp-notif.mp3)
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Bunyi otomatis saat Auto-Post atau Watermark selesai.
                    </p>
                  </div>
                  <Switch
                    id="remote-sound-switch"
                    checked={soundEnabled}
                    onCheckedChange={(checked) => {
                      setSoundEnabled(checked);
                      setNotifSoundEnabled(checked);
                      if (checked) {
                        void unlockNotifAudio(true).then((ok) =>
                          setSoundReady(ok)
                        );
                      }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div className="space-y-0.5">
                    <label
                      htmlFor="remote-vibrate-switch"
                      className="cursor-pointer text-xs font-semibold text-foreground"
                    >
                      Getar HP Saat Selesai
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Getaran singkat pada perangkat Android yang mendukung.
                    </p>
                  </div>
                  <Switch
                    id="remote-vibrate-switch"
                    checked={vibrateEnabled}
                    onCheckedChange={(checked) => {
                      setVibrateEnabled(checked);
                      setNotifVibrateEnabled(checked);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div className="space-y-0.5">
                    <label
                      htmlFor="remote-wakelock-switch"
                      className="cursor-pointer text-xs font-semibold text-foreground"
                    >
                      Jaga Layar Tetap Menyala
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Mencegah layar HP tidur saat memantau proses upload.
                    </p>
                  </div>
                  <Switch
                    id="remote-wakelock-switch"
                    checked={wakeLockActive}
                    onCheckedChange={(checked) => {
                      if (checked) void acquireWakeLock();
                      else void releaseWakeLock();
                    }}
                  />
                </div>

                <div className="p-3.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void playCpgpNotifSound({ force: true, vibrate: true }).then(
                        (ok) => {
                          setSoundReady(ok);
                          showToast(
                            ok
                              ? 'Suara cpgp-notif.mp3 diputar.'
                              : 'Browser menahan audio, coba ketuk sekali lagi.',
                            ok ? 'success' : 'error'
                          );
                        }
                      )
                    }
                    className="min-h-11 w-full text-xs font-medium"
                  >
                    {soundEnabled ? (
                      <Volume2 className="size-4" aria-hidden="true" />
                    ) : (
                      <VolumeX className="size-4" aria-hidden="true" />
                    )}
                    <span>Tes Suara &amp; Getar Notifikasi</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2.5 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Smartphone className="size-4" aria-hidden="true" />
                  <span>Aksi PC &amp; Sesi</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRefreshing}
                  onClick={() => void handleRescanDisk()}
                  className="min-h-11 w-full text-xs"
                >
                  <RefreshCw
                    className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Scan Ulang Folder KONTEN di PC</span>
                </Button>
                {!isLoopback ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleLogout()}
                    className="min-h-11 w-full text-xs text-[#991b1b] dark:text-[#fca5a5]"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    <span>Keluar dari Sesi Remote</span>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Toast feedback */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-medium text-foreground shadow-md"
        >
          {toast.type === 'error' ? (
            <AlertCircle
              className="h-4 w-4 shrink-0 text-[#991b1b] dark:text-[#fca5a5]"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-[#166534] dark:text-[#86efac]"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1">{toast.message}</span>
        </div>
      ) : null}

      {/* Mobile Bottom Navigation (4 tabs, 48px+ tap targets) */}
      <nav
        aria-label="Navigasi Remote Control"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-1.5">
          {(
            [
              { key: 'publish', label: 'Publish', icon: Send, badge: 0 },
              { key: 'watermark', label: 'Watermark', icon: Droplets, badge: 0 },
              {
                key: 'monitor',
                label: 'Monitor',
                icon: Activity,
                badge: activeJobsBadgeCount,
              },
              { key: 'settings', label: 'Atur', icon: Settings, badge: 0 },
            ] as const
          ).map((item) => {
            const active = activeTab === item.key;
            const TabIcon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(item.key)}
                className={
                  active
                    ? 'relative flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg bg-[#FCE7EB] px-1 text-[#651220] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#4C0519] dark:text-[#FECDD3]'
                    : 'relative flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                }
              >
                <span className="relative">
                  <TabIcon className="h-4 w-4" aria-hidden="true" />
                  {item.badge > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#7F1D1D] px-1 font-mono text-[10px] font-bold text-white dark:bg-[#9F1239]">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
