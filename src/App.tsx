import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
} from 'lucide-react';
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
import { plannerApi } from '@/services/apiClient';
import { ContentDetailModal } from '@/components/ContentDetailModal';
import {
  WorkspaceModal,
  type WorkspaceModalMode,
} from '@/components/workspace/WorkspaceModal';
import { QuickGuideModal } from '@/components/workspace/QuickGuideModal';
import {
  CreateContentModal,
  type CreateContentTab,
} from '@/components/planner/CreateContentModal';
import { AppShell } from '@/components/shell/AppShell';
import { useAppTheme } from '@/components/shell/useAppTheme';
import {
  PlannerProvider,
  type PlannerPlatformFilter,
  type PlannerReadinessFilter,
  type PlannerSlotFilter,
  type PlannerToastKind,
  type PlannerWorkspace,
} from '@/components/planner/PlannerContext';
import { PlannerToolbar } from '@/components/planner/PlannerToolbar';
import { Button } from '@/components/ui/button';
import type { KanbanGroupBy } from '@/components/KanbanView';

const PLATFORM_CYCLE: Record<PlatformUploadStatus, PlatformUploadStatus> = {
  not_started: 'scheduled',
  uploaded_draft: 'scheduled',
  scheduled: 'published',
  published: 'not_started',
  issue: 'not_started',
};

const ROUTE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Ringkasan',
    subtitle: 'Kesiapan berkas, jadwal upload, dan progres publikasi',
  },
  '/kanban': {
    title: 'Kanban',
    subtitle: 'Alur kerja konten per status',
  },
  '/tabel': {
    title: 'Tabel',
    subtitle: 'Database konten dalam bentuk tabel',
  },
  '/kalender': {
    title: 'Kalender',
    subtitle: 'Sebaran jadwal upload per tanggal',
  },
  '/jadwal': {
    title: 'Jadwal Slot',
    subtitle: 'Matriks slot jam upload harian',
  },
  '/galeri': {
    title: 'Galeri',
    subtitle: 'Dinding video vertikal 9:16',
  },
  '/watermark': {
    title: 'Watermark',
    subtitle: 'Atur overlay dan render video',
  },
  '/addons/motionprovit': {
    title: 'MotionProvit',
    subtitle: 'Add-on impor video, cover, dan caption dari motion.clipprovit.com',
  },
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

export function App() {
  const { theme, toggleTheme } = useAppTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const routeSearch = useSearch({ from: '/planner-layout' });

  const [database, setDatabase] = useState<PlannerDatabase | null>(null);
  const [workspacesRegistry, setWorkspacesRegistry] =
    useState<WorkspacesRegistry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLiveSyncActive, setIsLiveSyncActive] = useState<boolean>(false);

  const [workspaceModalState, setWorkspaceModalState] = useState<{
    open: boolean;
    mode: WorkspaceModalMode;
  }>({ open: false, mode: 'edit' });
  const [createContentState, setCreateContentState] = useState<{
    open: boolean;
    tab: CreateContentTab;
  }>({ open: false, tab: 'single' });
  const [isQuickGuideOpen, setIsQuickGuideOpen] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [slotFilter, setSlotFilter] = useState<PlannerSlotFilter>('all');
  const [readinessFilter, setReadinessFilter] =
    useState<PlannerReadinessFilter>('all');
  const [platformFilter, setPlatformFilter] =
    useState<PlannerPlatformFilter>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<
    WorkflowStatus | 'all'
  >('all');

  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>(() => {
    const valid: KanbanGroupBy[] = ['status', 'slot', 'readiness'];
    try {
      const saved = window.localStorage.getItem(
        'jurnal-dunia-kanban-groupby'
      ) as KanbanGroupBy | null;
      if (saved && valid.includes(saved)) return saved;
    } catch {
      // ignore storage errors
    }
    return 'status';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('jurnal-dunia-kanban-groupby', kanbanGroupBy);
    } catch {
      // ignore storage errors
    }
  }, [kanbanGroupBy]);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<
    'publish' | 'caption' | 'assets'
  >('publish');

  const [toast, setToast] = useState<{
    message: string;
    type: PlannerToastKind;
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: PlannerToastKind = 'success') => {
      setToast({ message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
        if (!reg.onboardingCompleted) {
          setWorkspaceModalState({ open: true, mode: 'onboarding' });
        }
      }
    } catch {
      // ignore if workspace endpoint is not yet ready
    }
  }, []);

  const fetchPlanner = useCallback(async () => {
    try {
      setErrorMsg(null);
      const data = await plannerApi.getPlannerData();
      setDatabase(data);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memuat data planner dari server lokal.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkspaces();
    void fetchPlanner();
  }, [fetchWorkspaces, fetchPlanner]);

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/events');
      source.onopen = () => setIsLiveSyncActive(true);
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            database?: PlannerDatabase;
            reason?: string;
            type?: string;
          };
          if (payload.database) {
            setDatabase(payload.database);
            return;
          }
          const reason = payload.reason ?? '';
          if (
            reason.startsWith('platform:') ||
            reason.startsWith('platforms-batch:') ||
            reason.startsWith('item:') ||
            reason.startsWith('caption:')
          ) {
            return;
          }
          if (
            payload.type === 'scan_complete' ||
            payload.type === 'file_change' ||
            payload.type === 'planner-updated' ||
            payload.type === 'workspace-switched' ||
            payload.type === 'workspace-activated'
          ) {
            void fetchWorkspaces();
            void fetchPlanner();
          }
        } catch {
          // ignore heartbeat
        }
      };
      source.onerror = () => setIsLiveSyncActive(false);
    } catch {
      setIsLiveSyncActive(false);
    }
    return () => {
      source?.close();
    };
  }, [fetchPlanner, fetchWorkspaces]);

  const activeWorkspace = useMemo<WorkspaceMetadata | null>(() => {
    if (!workspacesRegistry || !workspacesRegistry.workspaces) return null;
    const activeId = workspacesRegistry.activeWorkspaceId;
    return (
      (activeId ? workspacesRegistry.workspaces[activeId] : undefined) ??
      Object.values(workspacesRegistry.workspaces)[0] ??
      null
    );
  }, [workspacesRegistry]);

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
        const data = (await res.json()) as {
          ok: boolean;
          workspace: WorkspaceMetadata;
          registry: WorkspacesRegistry;
          database: PlannerDatabase;
        };
        setWorkspacesRegistry(data.registry);
        setDatabase(data.database);
        showToast(`Workspace aktif: ${data.workspace.name} (${data.workspace.handle})`);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Gagal berpindah workspace.',
          'error'
        );
      }
    },
    [activeWorkspace?.id, showToast]
  );

  const openCreateContent = useCallback(
    (initialTab: CreateContentTab = 'single') => {
      setCreateContentState({ open: true, tab: initialTab });
    },
    []
  );

  const openWorkspaceModal = useCallback(
    (mode: WorkspaceModalMode = 'edit') => {
      setWorkspaceModalState({ open: true, mode });
    },
    []
  );

  const openQuickGuide = useCallback(() => {
    setIsQuickGuideOpen(true);
  }, []);

  const allItems = useMemo<ContentPlannerItem[]>(() => {
    if (!database?.items) return [];
    return Object.values(database.items).sort((a, b) => {
      const byDate = a.schedule.isoDate.localeCompare(b.schedule.isoDate);
      if (byDate !== 0) return byDate;
      return a.folderCode.localeCompare(b.folderCode);
    });
  }, [database]);

  const availableMonths = useMemo<string[]>(() => {
    const months = new Set<string>();
    for (const item of allItems) {
      if (item.monthFolder) months.add(item.monthFolder);
    }
    return Array.from(months);
  }, [allItems]);

  const filteredItems = useMemo<ContentPlannerItem[]>(() => {
    return allItems.filter((item) => {
      if (monthFilter !== 'all' && item.monthFolder !== monthFilter) {
        return false;
      }

      if (slotFilter !== 'all' && item.schedule.slotCode !== slotFilter) {
        return false;
      }

      if (
        readinessFilter === 'ready' &&
        !item.autoMetadata.readiness.isUploadReady
      ) {
        return false;
      }
      if (
        readinessFilter === 'needs_wm' &&
        (item.autoMetadata.readiness.hasWmFinal ||
          !item.autoMetadata.readiness.hasRawVideo)
      ) {
        return false;
      }
      if (
        readinessFilter === 'incomplete' &&
        (item.autoMetadata.readiness.isUploadReady ||
          (item.autoMetadata.readiness.hasRawVideo &&
            item.autoMetadata.readiness.hasCover &&
            item.autoMetadata.readiness.hasCaption))
      ) {
        return false;
      }

      if (
        workflowStatusFilter !== 'all' &&
        item.userProperties.workflowStatus !== workflowStatusFilter
      ) {
        return false;
      }

      if (platformFilter !== 'all') {
        const key = (
          platformFilter.startsWith('missing_')
            ? platformFilter.replace('missing_', '')
            : platformFilter
        ) as PlatformKey;
        if (item.userProperties.platforms[key]?.status === 'published') {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inCode = item.folderCode.toLowerCase().includes(query);
        const inMonth = item.monthFolder.toLowerCase().includes(query);
        const inTitle = (
          item.userProperties.customTitle ||
          item.autoMetadata.captionParsed.hookTitle ||
          ''
        )
          .toLowerCase()
          .includes(query);
        const inCaption = (item.autoMetadata.captionParsed.rawText || '')
          .toLowerCase()
          .includes(query);
        const inId = (item.autoMetadata.motionprovitId || '')
          .toLowerCase()
          .includes(query);
        const inTags = item.userProperties.categoryTags.some((tag) =>
          tag.toLowerCase().includes(query)
        );
        if (
          !inCode &&
          !inMonth &&
          !inTitle &&
          !inCaption &&
          !inId &&
          !inTags
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    allItems,
    monthFilter,
    slotFilter,
    readinessFilter,
    workflowStatusFilter,
    platformFilter,
    searchQuery,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (slotFilter !== 'all') count += 1;
    if (readinessFilter !== 'all') count += 1;
    if (platformFilter !== 'all') count += 1;
    if (monthFilter !== 'all') count += 1;
    if (workflowStatusFilter !== 'all') count += 1;
    if (searchQuery.trim()) count += 1;
    return count;
  }, [
    slotFilter,
    readinessFilter,
    platformFilter,
    monthFilter,
    workflowStatusFilter,
    searchQuery,
  ]);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSlotFilter('all');
    setReadinessFilter('all');
    setPlatformFilter('all');
    setMonthFilter('all');
    setWorkflowStatusFilter('all');
  }, []);

  const selectedItem = useMemo<ContentPlannerItem | null>(() => {
    if (!selectedItemId || !database?.items) return null;
    return database.items[selectedItemId] ?? null;
  }, [selectedItemId, database]);

  const handleRescan = useCallback(async () => {
    setIsScanning(true);
    try {
      const updated = await plannerApi.triggerScan();
      setDatabase(updated);
      showToast(
        `Scan selesai: ${updated.stats.totalItems} folder konten tersinkronisasi.`
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Gagal melakukan scan folder KONTEN.',
        'error'
      );
    } finally {
      setIsScanning(false);
    }
  }, [showToast]);

  const handleUpdateStatus = useCallback(
    async (item: ContentPlannerItem, newStatus: WorkflowStatus) => {
      const previous = database;
      setDatabase((prev) => {
        if (!prev?.items[item.id]) return prev;
        const target = prev.items[item.id];
        return {
          ...prev,
          items: {
            ...prev.items,
            [item.id]: {
              ...target,
              userProperties: {
                ...target.userProperties,
                workflowStatus: newStatus,
                statusLockedManually: true,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        };
      });

      try {
        const res = await plannerApi.updateItemProperties(item.id, {
          workflowStatus: newStatus,
          statusLockedManually: true,
        });
        setDatabase(res.database);
        showToast(`Status ${item.folderCode} diubah ke "${newStatus}".`);
      } catch (err) {
        if (previous) setDatabase(previous);
        showToast(
          err instanceof Error ? err.message : 'Gagal memperbarui status.',
          'error'
        );
      }
    },
    [database, showToast]
  );

  const handleTogglePlatform = useCallback(
    async (item: ContentPlannerItem, platformKey: PlatformKey) => {
      const currentStatus =
        item.userProperties.platforms[platformKey]?.status ?? 'not_started';
      const nextStatus = PLATFORM_CYCLE[currentStatus] ?? 'not_started';
      const previous = database;

      setDatabase((prev) => {
        if (!prev?.items[item.id]) return prev;
        const target = prev.items[item.id];
        return {
          ...prev,
          items: {
            ...prev.items,
            [item.id]: {
              ...target,
              userProperties: {
                ...target.userProperties,
                platforms: {
                  ...target.userProperties.platforms,
                  [platformKey]: {
                    ...target.userProperties.platforms[platformKey],
                    status: nextStatus,
                    updatedAt: new Date().toISOString(),
                  },
                },
              },
            },
          },
        };
      });

      try {
        const res = await plannerApi.updatePlatformStatus(
          item.id,
          platformKey,
          { status: nextStatus }
        );
        setDatabase(res.database);
        showToast(
          `${item.folderCode} (${platformKey.toUpperCase()}): ${nextStatus}.`
        );
      } catch (err) {
        if (previous) setDatabase(previous);
        showToast(
          err instanceof Error
            ? err.message
            : 'Gagal memperbarui status platform.',
          'error'
        );
      }
    },
    [database, showToast]
  );

  const handleUpdateProperties = useCallback(
    async (itemId: string, patch: Partial<UserContentProperties>) => {
      try {
        const res = await plannerApi.updateItemProperties(itemId, patch);
        setDatabase(res.database);
        showToast('Properti konten disimpan.');
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal menyimpan properti.',
          'error'
        );
      }
    },
    [showToast]
  );

  const handleUpdatePlatformDetail = useCallback(
    async (
      itemId: string,
      platform: PlatformKey,
      patch: Partial<PlatformPublishState>
    ) => {
      try {
        const res = await plannerApi.updatePlatformStatus(
          itemId,
          platform,
          patch
        );
        setDatabase(res.database);
        showToast(`Platform ${platform} diperbarui.`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal menyimpan platform.',
          'error'
        );
      }
    },
    [showToast]
  );

  const handleBatchUpdatePlatforms = useCallback(
    async (itemId: string, status: PlatformUploadStatus) => {
      try {
        const res = await plannerApi.batchUpdatePlatforms(itemId, status);
        setDatabase(res.database);
        showToast(`Keempat platform ditandai "${status}".`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal batch update platform.',
          'error'
        );
      }
    },
    [showToast]
  );

  const handleSaveCaption = useCallback(
    async (itemId: string, newText: string) => {
      try {
        const res = await plannerApi.saveCaptionToFile(itemId, newText);
        setDatabase(res.database);
        showToast(
          `Tersimpan ke caption.txt (${res.item.folderCode}) dan database JSON.`
        );
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan ke caption.txt.',
          'error'
        );
        throw err;
      }
    },
    [showToast]
  );

  const handleOpenExplorer = useCallback(
    async (targetPath: string, selectFile: boolean = true) => {
      try {
        await plannerApi.openInExplorer(targetPath, selectFile);
        showToast('Membuka lokasi di Windows Explorer.', 'info');
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Gagal membuka Windows Explorer.',
          'error'
        );
      }
    },
    [showToast]
  );

  const copyText = useCallback(
    (text: string, label: string) => {
      void navigator.clipboard.writeText(text).then(
        () => showToast(`${label} disalin ke clipboard.`),
        () => showToast('Gagal menyalin ke clipboard.', 'error')
      );
    },
    [showToast]
  );

  const clearDeepLinkSearch = useCallback(() => {
    if (routeSearch.detail || routeSearch.caption || routeSearch.watermark) {
      const currentTo = normalizePath(location.pathname) as
        | '/'
        | '/kanban'
        | '/tabel'
        | '/kalender'
        | '/jadwal'
        | '/galeri'
        | '/watermark';
      void navigate({ to: currentTo, search: {}, replace: true });
    }
  }, [
    location.pathname,
    navigate,
    routeSearch.detail,
    routeSearch.caption,
    routeSearch.watermark,
  ]);

  const openDetail = useCallback((item: ContentPlannerItem) => {
    setDetailInitialTab('publish');
    setSelectedItemId(item.id);
  }, []);

  const openCaption = useCallback((item: ContentPlannerItem) => {
    setDetailInitialTab('caption');
    setSelectedItemId(item.id);
  }, []);

  const openWatermark = useCallback(
    (item?: ContentPlannerItem | null) => {
      void navigate({
        to: '/watermark',
        search: item?.id ? { item: item.id } : {},
      });
    },
    [navigate]
  );

  const openAutoPost = useCallback(
    (item?: ContentPlannerItem | null, platform?: PlatformKey | null) => {
      void navigate({
        to: '/auto-post',
        search: {
          item: item?.id,
          platform: platform ?? undefined,
        },
      });
    },
    [navigate]
  );

  // Deep links from the Auto-Post dashboard: /?detail=ID, /?caption=ID, /?watermark=ID
  useEffect(() => {
    if (routeSearch.detail) {
      setDetailInitialTab('publish');
      setSelectedItemId(routeSearch.detail);
      return;
    }
    if (routeSearch.caption) {
      setDetailInitialTab('caption');
      setSelectedItemId(routeSearch.caption);
      return;
    }
    if (routeSearch.watermark) {
      void navigate({
        to: '/watermark',
        search: { item: routeSearch.watermark },
        replace: true,
      });
    }
  }, [routeSearch.detail, routeSearch.caption, routeSearch.watermark, navigate]);

  const workspace = useMemo<PlannerWorkspace>(
    () => ({
      database,
      workspacesRegistry,
      activeWorkspace,
      switchWorkspace: handleSwitchWorkspace,
      openCreateContent,
      openWorkspaceModal,
      openQuickGuide,
      allItems,
      filteredItems,
      isLoading,
      isScanning,
      isLiveSyncActive,
      errorMsg,
      contentRootPath:
        activeWorkspace?.contentRootPath ??
        database?.workspaceConfig.contentRootPath ??
        '',
      lastScanAt: database?.workspaceConfig.lastFullScanAt ?? null,
      refresh: () => void fetchPlanner(),
      rescan: handleRescan,
      searchQuery,
      setSearchQuery,
      slotFilter,
      setSlotFilter,
      readinessFilter,
      setReadinessFilter,
      platformFilter,
      setPlatformFilter,
      monthFilter,
      setMonthFilter,
      workflowStatusFilter,
      setWorkflowStatusFilter,
      availableMonths,
      activeFilterCount,
      resetFilters,
      kanbanGroupBy,
      setKanbanGroupBy,
      updateStatus: handleUpdateStatus,
      togglePlatform: handleTogglePlatform,
      batchPlatforms: handleBatchUpdatePlatforms,
      updatePlatformDetail: handleUpdatePlatformDetail,
      updateProperties: handleUpdateProperties,
      saveCaption: handleSaveCaption,
      openExplorer: handleOpenExplorer,
      copyText,
      showToast,
      openDetail,
      openCaption,
      openWatermark,
      openAutoPost,
    }),
    [
      database,
      workspacesRegistry,
      activeWorkspace,
      handleSwitchWorkspace,
      openCreateContent,
      openWorkspaceModal,
      openQuickGuide,
      allItems,
      filteredItems,
      isLoading,
      isScanning,
      isLiveSyncActive,
      errorMsg,
      fetchPlanner,
      handleRescan,
      searchQuery,
      slotFilter,
      readinessFilter,
      platformFilter,
      monthFilter,
      workflowStatusFilter,
      availableMonths,
      activeFilterCount,
      resetFilters,
      kanbanGroupBy,
      handleUpdateStatus,
      handleTogglePlatform,
      handleBatchUpdatePlatforms,
      handleUpdatePlatformDetail,
      handleUpdateProperties,
      handleSaveCaption,
      handleOpenExplorer,
      copyText,
      showToast,
      openDetail,
      openCaption,
      openWatermark,
      openAutoPost,
    ]
  );

  const activePath = normalizePath(location.pathname);
  const heading = ROUTE_TITLES[activePath] ?? ROUTE_TITLES['/'];
  const shellCounts = useMemo(
    () => ({
      total: allItems.length,
      ready: database?.stats.uploadReadyCount ?? 0,
      needsWm: database?.stats.needsWatermarkCount ?? 0,
    }),
    [
      allItems.length,
      database?.stats.uploadReadyCount,
      database?.stats.needsWatermarkCount,
    ]
  );

  return (
    <PlannerProvider value={workspace}>
      <AppShell
        title={heading.title}
        subtitle={heading.subtitle}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRescan={() => void handleRescan()}
        isScanning={isScanning}
        isLiveSyncActive={isLiveSyncActive}
        counts={shellCounts}
        workspacesRegistry={workspacesRegistry}
        activeWorkspace={activeWorkspace}
        onSwitchWorkspace={(id) => void handleSwitchWorkspace(id)}
        onOpenCreateWorkspace={() => openWorkspaceModal('create')}
        onOpenWorkspaceSettings={() => openWorkspaceModal('edit')}
        onOpenQuickGuide={openQuickGuide}
        onOpenCreateContent={() => openCreateContent('single')}
        toolbar={
          activePath === '/' ||
          activePath === '/watermark' ||
          activePath === '/addons/motionprovit' ? undefined : (
            <PlannerToolbar />
          )
        }
      >
        {errorMsg ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive bg-card px-4 py-3 text-xs"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle
                className="h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span>
                <strong>Gagal memuat data:</strong> {errorMsg}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchPlanner()}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Muat ulang
            </Button>
          </div>
        ) : null}

        {isLoading ? (
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
              Memindai folder KONTEN dan memuat database JSON
            </p>
            <p className="text-xs text-muted-foreground">
              Membaca wm_final, cover, caption.txt, dan motionprovit dari disk.
            </p>
          </div>
        ) : (
          <Outlet />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Database className="h-3 w-3" aria-hidden="true" />
            {activeWorkspace?.name ? (
              <span className="font-medium text-foreground">
                {activeWorkspace.name}
              </span>
            ) : null}
            <code className="font-mono">
              {`data/workspaces/${activeWorkspace?.id ?? 'default'}/planner.json`}
            </code>
          </span>
          <span className="font-mono">
            {activeWorkspace?.timeSlots &&
            Object.keys(activeWorkspace.timeSlots).length > 0
              ? `${Object.values(activeWorkspace.timeSlots)
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map(
                    (slot) =>
                      `Slot ${slot.code} ${slot.label} ${slot.defaultTime.replace(':', '.')}`
                  )
                  .join(' | ')} WIB`
              : 'Slot jam upload workspace'}
          </span>
        </footer>
      </AppShell>

      <ContentDetailModal
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        initialTab={detailInitialTab}
        onClose={() => {
          setSelectedItemId(null);
          clearDeepLinkSearch();
        }}
        allItems={filteredItems}
        onSelectItem={(item) => setSelectedItemId(item.id)}
        onNavigate={(id) => setSelectedItemId(id)}
        onUpdateProperties={handleUpdateProperties}
        onUpdateUserProperties={handleUpdateProperties}
        onUpdateStatus={(itemId, status, lockManually = true) =>
          handleUpdateProperties(itemId, {
            workflowStatus: status,
            statusLockedManually: lockManually,
          })
        }
        onUpdatePlatform={handleUpdatePlatformDetail}
        onBatchUpdatePlatforms={handleBatchUpdatePlatforms}
        onSaveCaption={handleSaveCaption}
        onOpenExplorer={handleOpenExplorer}
        onOpenAutoPost={(item, platform) =>
          openAutoPost(item, platform ?? null)
        }
        onOpenWatermark={(item) => openWatermark(item)}
      />

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
          setDatabase(payload.database);
        }}
        onToast={showToast}
      />

      <CreateContentModal
        isOpen={createContentState.open}
        initialTab={createContentState.tab}
        activeWorkspace={activeWorkspace}
        contentRootPath={workspace.contentRootPath}
        availableMonths={availableMonths}
        onClose={() =>
          setCreateContentState((prev) => ({ ...prev, open: false }))
        }
        onCreatedSingle={(payload) => {
          setDatabase(payload.database);
        }}
        onCreatedBatch={(payload) => {
          setDatabase(payload.database);
        }}
        onToast={showToast}
      />

      <QuickGuideModal
        isOpen={isQuickGuideOpen}
        activeWorkspace={activeWorkspace}
        contentRootPath={workspace.contentRootPath}
        onClose={() => setIsQuickGuideOpen(false)}
        onOpenCreateContent={() => openCreateContent('single')}
        onOpenExplorerRoot={() =>
          void handleOpenExplorer(workspace.contentRootPath, false)
        }
        onOpenWorkspaceSettings={() => openWorkspaceModal('edit')}
      />

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-xs font-medium text-foreground shadow-md"
        >
          {toast.type === 'error' ? (
            <AlertCircle
              className="h-4 w-4 shrink-0 text-destructive"
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
    </PlannerProvider>
  );
}

export default App;