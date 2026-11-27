import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Globe,
  LayoutDashboard,
  RefreshCw,
  Share2,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AppShell } from '@/components/shell/AppShell';
import { useAppTheme } from '@/components/shell/useAppTheme';
import { usePlannerItems } from '@/hooks/usePlannerItems';
import { plannerApi } from '@/services/apiClient';
import {
  WorkspaceModal,
  type WorkspaceModalMode,
} from '@/components/workspace/WorkspaceModal';
import { QuickGuideModal } from '@/components/workspace/QuickGuideModal';
import {
  CreateContentModal,
  type CreateContentTab,
} from '@/components/planner/CreateContentModal';
import {
  ContentDetailModal,
  type DetailWorkTab,
} from '@/components/ContentDetailModal';
import { IconActionButton } from './parts/IconActionButton';
import { AutoPostProvider } from './AutoPostContext';
import { useAutoPostData, type ToastKind } from './useAutoPostData';
import type { AutoPostPageContext } from './pageProps';
import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
  PlatformPublishState,
  PlatformUploadStatus,
  UserContentProperties,
  WorkflowStatus,
} from '@/types/planner';
import type {
  WorkspaceMetadata,
  WorkspacesRegistry,
} from '@/types/workspace';

type NavTo =
  | '/auto-post'
  | '/auto-post/history'
  | '/auto-post/studio'
  | '/auto-post/meta'
  | '/auto-post/youtube';

const ROUTE_HEADER_META: Record<
  NavTo,
  { title: string; subtitle: string }
> = {
  '/auto-post': {
    title: 'Dasbor Auto-Post',
    subtitle:
      'Kirim konten ke YouTube Shorts, TikTok, Instagram Reels, dan Facebook Reels dari satu tempat',
  },
  '/auto-post/history': {
    title: 'Riwayat & Antrean',
    subtitle: 'Semua proses Auto-Post yang pernah dijalankan di mesin ini',
  },
  '/auto-post/studio': {
    title: 'Sesi Browser Studio',
    subtitle:
      'Login sekali per platform dan simpan sesi di profil browser khusus',
  },
  '/auto-post/meta': {
    title: 'Meta Graph API',
    subtitle:
      'Unggah Facebook Reels dan Instagram Reels langsung dari file lokal',
  },
  '/auto-post/youtube': {
    title: 'YouTube Data API',
    subtitle:
      'Unggah YouTube Shorts di latar belakang tanpa membuka browser',
  },
};

function normalizePath(pathname: string): NavTo {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === '/auto-post/history') return '/auto-post/history';
  if (trimmed === '/auto-post/studio') return '/auto-post/studio';
  if (trimmed === '/auto-post/meta') return '/auto-post/meta';
  if (trimmed === '/auto-post/youtube') return '/auto-post/youtube';
  return '/auto-post';
}

function toRoute(page: string): NavTo {
  if (page === 'history') return '/auto-post/history';
  if (page === 'studio') return '/auto-post/studio';
  if (page === 'meta') return '/auto-post/meta';
  if (page === 'youtube') return '/auto-post/youtube';
  return '/auto-post';
}

export function AutoPostLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = useSearch({ from: '/auto-post' });
  const { theme, toggleTheme } = useAppTheme();

  const [workspacesRegistry, setWorkspacesRegistry] =
    useState<WorkspacesRegistry | null>(null);
  const [workspacesLoaded, setWorkspacesLoaded] = useState<boolean>(false);
  const [workspaceModalState, setWorkspaceModalState] = useState<{
    open: boolean;
    mode: WorkspaceModalMode;
  }>({ open: false, mode: 'edit' });
  const [createContentState, setCreateContentState] = useState<{
    open: boolean;
    tab: CreateContentTab;
  }>({ open: false, tab: 'single' });
  const [isQuickGuideOpen, setIsQuickGuideOpen] = useState<boolean>(false);
  const [detailModalState, setDetailModalState] = useState<{
    itemId: string | null;
    initialTab: DetailWorkTab;
  }>({ itemId: null, initialTab: 'publish' });

  const [toast, setToast] = useState<{
    message: string;
    type: ToastKind;
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: ToastKind = 'success') => {
      setToast({ message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dataRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const clearFocusSearchParams = useCallback(() => {
    if (!search.item && !search.platform) return;
    void navigate({
      to: normalizePath(location.pathname),
      search: {},
      replace: true,
    });
  }, [location.pathname, navigate, search.item, search.platform]);

  const clearFocusSearchParamsRef = useRef(clearFocusSearchParams);
  clearFocusSearchParamsRef.current = clearFocusSearchParams;

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) return;
      const raw = (await res.json()) as
        | WorkspacesRegistry
        | { registry?: WorkspacesRegistry };
      const reg =
        raw && 'registry' in raw && raw.registry
          ? raw.registry
          : (raw as WorkspacesRegistry);
      if (reg && reg.workspaces && typeof reg.workspaces === 'object') {
        setWorkspacesRegistry(reg);
        if (
          !reg.onboardingCompleted ||
          Object.keys(reg.workspaces).length === 0
        ) {
          void navigate({ to: '/', replace: true });
        }
      }
    } catch {
      // ignore if workspace endpoint is unavailable
    } finally {
      setWorkspacesLoaded(true);
    }
  }, [navigate]);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const needsOnboarding =
    workspacesLoaded &&
    workspacesRegistry !== null &&
    (!workspacesRegistry.onboardingCompleted ||
      Object.keys(workspacesRegistry.workspaces).length === 0);
  const isAutoPostReady = workspacesLoaded && !needsOnboarding;

  const handleWorkspaceSwitchFromSse = useCallback(() => {
    clearFocusSearchParamsRef.current();
    void fetchWorkspaces();
    void dataRefreshRef.current?.();
  }, [fetchWorkspaces]);

  const {
    database,
    items,
    isLiveSyncActive,
    refresh: refreshItems,
  } = usePlannerItems({
    enabled: isAutoPostReady,
    onWorkspaceSwitch: handleWorkspaceSwitchFromSse,
  });

  const activeWorkspace = useMemo<WorkspaceMetadata | null>(() => {
    if (!workspacesRegistry || !workspacesRegistry.workspaces) return null;
    const activeId = workspacesRegistry.activeWorkspaceId;
    return (
      (activeId ? workspacesRegistry.workspaces[activeId] : undefined) ??
      Object.values(workspacesRegistry.workspaces)[0] ??
      null
    );
  }, [workspacesRegistry]);

  const handlePlannerSync = useCallback(() => {
    void refreshItems();
  }, [refreshItems]);

  const data = useAutoPostData({
    isOpen: isAutoPostReady,
    workspaceId: activeWorkspace?.id,
    onToast: showToast,
    onPlannerSync: handlePlannerSync,
  });

  useEffect(() => {
    dataRefreshRef.current = data.refresh;
  }, [data.refresh]);

  const contentRootPath =
    activeWorkspace?.contentRootPath ??
    database?.workspaceConfig.contentRootPath ??
    '';

  const availableMonths = useMemo<string[]>(() => {
    const months = new Set<string>();
    for (const item of items) {
      if (item.monthFolder) months.add(item.monthFolder);
    }
    return Array.from(months);
  }, [items]);

  const handleSwitchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId || workspaceId === activeWorkspace?.id) return;
      try {
        const res = await fetch(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/activate`,
          { method: 'POST' }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err?.error || `Gagal mengaktifkan workspace (${res.status})`
          );
        }
        const payload = (await res.json()) as {
          ok: boolean;
          workspace: WorkspaceMetadata;
          registry: WorkspacesRegistry;
          database: PlannerDatabase;
        };
        if (payload.registry) {
          setWorkspacesRegistry(payload.registry);
        }
        clearFocusSearchParams();
        await Promise.all([refreshItems(), data.refresh()]);
        showToast(
          `Workspace aktif: ${payload.workspace.name} (${payload.workspace.handle})`
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal berpindah workspace.',
          'error'
        );
      }
    },
    [
      activeWorkspace?.id,
      clearFocusSearchParams,
      refreshItems,
      data.refresh,
      showToast,
    ]
  );

  const handleOpenExplorerRoot = useCallback(async () => {
    if (!contentRootPath) return;
    try {
      await plannerApi.openInExplorer(contentRootPath, false);
      showToast('Membuka lokasi di Windows Explorer.', 'info');
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Gagal membuka Windows Explorer.',
        'error'
      );
    }
  }, [contentRootPath, showToast]);

  const openContentDetail = useCallback((item: ContentPlannerItem) => {
    setDetailModalState({ itemId: item.id, initialTab: 'publish' });
  }, []);

  const editCaption = useCallback((item: ContentPlannerItem) => {
    setDetailModalState({ itemId: item.id, initialTab: 'caption' });
  }, []);

  const openWatermark = useCallback(
    (item: ContentPlannerItem) => {
      void navigate({ to: '/watermark', search: { item: item.id } });
    },
    [navigate]
  );

  const selectedDetailItem = useMemo(() => {
    if (!detailModalState.itemId) return null;
    return items.find((entry) => entry.id === detailModalState.itemId) ?? null;
  }, [detailModalState.itemId, items]);

  const handleDetailUpdateProperties = useCallback(
    async (itemId: string, patch: Partial<UserContentProperties>) => {
      try {
        await plannerApi.updateItemProperties(itemId, patch);
        await refreshItems();
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal memperbarui properti konten.',
          'error'
        );
      }
    },
    [refreshItems, showToast]
  );

  const handleDetailUpdateStatus = useCallback(
    async (itemId: string, status: WorkflowStatus, lockManually = true) => {
      try {
        await plannerApi.updateItemProperties(itemId, {
          workflowStatus: status,
          statusLockedManually: lockManually,
        });
        await refreshItems();
        showToast('Status konten diperbarui.');
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal memperbarui status konten.',
          'error'
        );
      }
    },
    [refreshItems, showToast]
  );

  const handleDetailUpdatePlatform = useCallback(
    async (
      itemId: string,
      platform: PlatformKey,
      patch: Partial<PlatformPublishState>
    ) => {
      try {
        await plannerApi.updatePlatformStatus(itemId, platform, patch);
        await refreshItems();
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal memperbarui status platform.',
          'error'
        );
      }
    },
    [refreshItems, showToast]
  );

  const handleDetailBatchUpdatePlatforms = useCallback(
    async (itemId: string, status: PlatformUploadStatus) => {
      try {
        await plannerApi.batchUpdatePlatforms(itemId, status);
        await refreshItems();
        showToast('Status seluruh platform diperbarui.');
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Gagal memperbarui status batch platform.',
          'error'
        );
      }
    },
    [refreshItems, showToast]
  );

  const handleDetailSaveCaption = useCallback(
    async (itemId: string, newText: string) => {
      try {
        await plannerApi.saveCaptionToFile(itemId, newText);
        await refreshItems();
        showToast('caption.txt berhasil disimpan.');
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal menyimpan caption.txt.',
          'error'
        );
      }
    },
    [refreshItems, showToast]
  );

  const handleDetailOpenExplorer = useCallback(
    async (targetPath: string, selectFile = false) => {
      try {
        await plannerApi.openInExplorer(targetPath, selectFile);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Gagal membuka lokasi file di Explorer.',
          'error'
        );
      }
    },
    [showToast]
  );

  const ctx = useMemo<AutoPostPageContext>(
    () => ({
      items,
      data,
      initialItemId: search.item ?? null,
      initialPlatform: search.platform ?? null,
      onNavigate: (page) => {
        void navigate({ to: toRoute(page) });
      },
      onOpenContentDetail: openContentDetail,
      onEditCaption: editCaption,
      onOpenWatermark: openWatermark,
      onCloseDashboard: () => {
        void navigate({ to: '/' });
      },
    }),
    [
      items,
      data,
      search.item,
      search.platform,
      navigate,
      openContentDetail,
      editCaption,
      openWatermark,
    ]
  );

  const runningCount = data.jobs.filter(
    (job) => job.status === 'queued' || job.status === 'running'
  ).length;
  const reviewCount = data.jobs.filter(
    (job) => job.status === 'awaiting_review'
  ).length;

  const counts = useMemo(() => {
    const ready = items.filter(
      (item) => item.autoMetadata.readiness.isUploadReady
    ).length;
    const needsWm = items.filter(
      (item) =>
        !item.autoMetadata.readiness.hasWmFinal &&
        item.autoMetadata.readiness.hasRawVideo &&
        item.autoMetadata.readiness.hasCover &&
        item.autoMetadata.readiness.hasCaption
    ).length;
    return {
      total: items.length,
      ready,
      needsWm,
      runningJobs: runningCount,
      reviewJobs: reviewCount,
    };
  }, [items, runningCount, reviewCount]);

  const activeRoute = normalizePath(location.pathname);
  const headerMeta = ROUTE_HEADER_META[activeRoute];

  const focusCode = search.item
    ? items.find((entry) => entry.id === search.item)?.folderCode ??
      (items.length === 0 ? search.item : null)
    : null;

  if (!workspacesLoaded || needsOnboarding) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background p-6"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Memuat workspace Auto-Post...</span>
        </div>
      </div>
    );
  }

  return (
    <AutoPostProvider value={ctx}>
      <AppShell
        title={headerMeta.title}
        subtitle={headerMeta.subtitle}
        theme={theme}
        onToggleTheme={toggleTheme}
        isLiveSyncActive={isLiveSyncActive}
        counts={counts}
        workspacesRegistry={workspacesRegistry}
        activeWorkspace={activeWorkspace}
        onSwitchWorkspace={(id) => void handleSwitchWorkspace(id)}
        onOpenCreateWorkspace={() =>
          setWorkspaceModalState({ open: true, mode: 'create' })
        }
        onOpenWorkspaceSettings={() =>
          setWorkspaceModalState({ open: true, mode: 'edit' })
        }
        onOpenQuickGuide={() => setIsQuickGuideOpen(true)}
        onOpenCreateContent={() =>
          setCreateContentState({ open: true, tab: 'single' })
        }
        actions={
          <>
            {runningCount > 0 ? (
              <Badge variant="info" size="xs">
                {runningCount} berjalan
              </Badge>
            ) : null}
            {reviewCount > 0 ? (
              <Badge variant="warning" size="xs">
                {reviewCount} meninjau
              </Badge>
            ) : null}
            {focusCode ? (
              <Badge variant="outline" size="xs" className="font-mono">
                {focusCode}
              </Badge>
            ) : null}
            <IconActionButton
              icon={RefreshCw}
              label="Muat ulang data Auto-Post"
              side="bottom"
              onClick={() => void data.refresh()}
              disabled={data.isRefreshing}
              iconClassName={data.isRefreshing ? 'animate-spin' : undefined}
            />
          </>
        }
      >
        <nav
          aria-label="Navigasi Auto-Post"
          className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-border pb-3"
        >
          {(
            [
              {
                to: '/auto-post',
                label: 'Dasbor',
                icon: LayoutDashboard,
                badge: runningCount > 0 ? String(runningCount) : null,
                badgeVariant: 'info' as const,
                connected: false,
              },
              {
                to: '/auto-post/history',
                label: 'Riwayat & Log',
                icon: Clock,
                badge:
                  data.jobs.filter((j) => j.status === 'failed').length > 0
                    ? String(
                        data.jobs.filter((j) => j.status === 'failed').length
                      )
                    : data.jobs.length > 0
                      ? String(data.jobs.length)
                      : null,
                badgeVariant:
                  data.jobs.filter((j) => j.status === 'failed').length > 0
                    ? ('destructive' as const)
                    : ('muted' as const),
                connected: false,
              },
              {
                to: '/auto-post/studio',
                label: data.settings.browser.cdpUrl?.trim()
                  ? 'Browser (CDP)'
                  : 'Browser Studio',
                icon: Globe,
                badge: null,
                badgeVariant: 'muted' as const,
                connected: Boolean(
                  data.browserSession.isOpen ||
                    data.settings.browser.cdpUrl?.trim()
                ),
              },
              {
                to: '/auto-post/meta',
                label: 'Meta API',
                icon: Share2,
                badge: null,
                badgeVariant: 'muted' as const,
                connected: Boolean(
                  data.capabilities.metaFbApiReady ||
                    data.capabilities.metaIgApiReady
                ),
              },
              {
                to: '/auto-post/youtube',
                label: 'YouTube API',
                icon: Video,
                badge: null,
                badgeVariant: 'muted' as const,
                connected: Boolean(data.capabilities.youtubeApiReady),
              },
            ] as const
          ).map((tab) => {
            const isActive = activeRoute === tab.to;
            const TabIcon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'inline-flex min-h-10 sm:min-h-9 cursor-pointer items-center gap-2 rounded-md border border-[#7F1D1D]/30 bg-[#FCE7EB] px-3 py-1.5 text-xs font-semibold text-[#651220] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#9F1239]/40 dark:bg-[#4C0519] dark:text-[#FECDD3]'
                    : 'inline-flex min-h-10 sm:min-h-9 cursor-pointer items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                }
              >
                <TabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.connected ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[#166534] dark:bg-[#86efac]"
                    aria-label="Terhubung"
                    title="Terhubung"
                  />
                ) : null}
                {tab.badge ? (
                  <Badge variant={tab.badgeVariant} size="xs" className="font-mono">
                    {tab.badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {data.isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card py-24 text-center"
          >
            <RefreshCw
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold">
              Memuat pengaturan dan antrean Auto-Post
            </p>
            <p className="text-xs text-muted-foreground">
              Membaca konfigurasi lokal dan status job.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </AppShell>

      {selectedDetailItem ? (
        <ContentDetailModal
          item={selectedDetailItem}
          isOpen={Boolean(selectedDetailItem)}
          initialTab={detailModalState.initialTab}
          allItems={items}
          onClose={() =>
            setDetailModalState((prev) => ({ ...prev, itemId: null }))
          }
          onSelectItem={(nextItem) =>
            setDetailModalState((prev) => ({ ...prev, itemId: nextItem.id }))
          }
          onNavigate={(nextItemId) =>
            setDetailModalState((prev) => ({ ...prev, itemId: nextItemId }))
          }
          onUpdateProperties={handleDetailUpdateProperties}
          onUpdateStatus={handleDetailUpdateStatus}
          onUpdatePlatform={handleDetailUpdatePlatform}
          onBatchUpdatePlatforms={handleDetailBatchUpdatePlatforms}
          onSaveCaption={handleDetailSaveCaption}
          onOpenWatermark={(target) => {
            setDetailModalState((prev) => ({ ...prev, itemId: null }));
            openWatermark(target);
          }}
          onOpenAutoPost={(target, platform) => {
            setDetailModalState((prev) => ({ ...prev, itemId: null }));
            void navigate({
              to: '/auto-post',
              search: {
                item: target.id,
                ...(platform ? { platform } : {}),
              },
              replace: true,
            });
          }}
          onOpenExplorer={handleDetailOpenExplorer}
        />
      ) : null}

      {workspaceModalState.open ? (
        <WorkspaceModal
          isOpen={workspaceModalState.open}
          mode={workspaceModalState.mode}
          registry={workspacesRegistry}
          activeWorkspace={activeWorkspace}
          onClose={() =>
            setWorkspaceModalState((prev) => ({ ...prev, open: false }))
          }
          onSaved={(payload) => {
            setWorkspacesRegistry(payload.registry);
            void refreshItems();
            void data.refresh();
          }}
          onToast={showToast}
        />
      ) : null}

      {createContentState.open ? (
        <CreateContentModal
          isOpen={createContentState.open}
          initialTab={createContentState.tab}
          activeWorkspace={activeWorkspace}
          contentRootPath={contentRootPath}
          availableMonths={availableMonths}
          onClose={() =>
            setCreateContentState((prev) => ({ ...prev, open: false }))
          }
          onCreatedSingle={() => {
            void refreshItems();
          }}
          onCreatedBatch={() => {
            void refreshItems();
          }}
          onToast={showToast}
        />
      ) : null}

      {isQuickGuideOpen ? (
        <QuickGuideModal
          isOpen={isQuickGuideOpen}
          activeWorkspace={activeWorkspace}
          contentRootPath={contentRootPath}
          onClose={() => setIsQuickGuideOpen(false)}
          onOpenCreateContent={() =>
            setCreateContentState({ open: true, tab: 'single' })
          }
          onOpenExplorerRoot={() => void handleOpenExplorerRoot()}
          onOpenWorkspaceSettings={() =>
            setWorkspaceModalState({ open: true, mode: 'edit' })
          }
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-xs font-medium text-foreground shadow-md"
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
          <span>{toast.message}</span>
        </div>
      ) : null}
    </AutoPostProvider>
  );
}
