import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Outlet,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
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
import { IconActionButton } from './parts/IconActionButton';
import { AutoPostProvider } from './AutoPostContext';
import { useAutoPostData, type ToastKind } from './useAutoPostData';
import type { AutoPostPageContext } from './pageProps';
import type { ContentPlannerItem, PlannerDatabase } from '@/types/planner';
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
  const { database, items, refresh: refreshItems } = usePlannerItems();

  const [workspacesRegistry, setWorkspacesRegistry] =
    useState<WorkspacesRegistry | null>(null);
  const [workspaceModalState, setWorkspaceModalState] = useState<{
    open: boolean;
    mode: WorkspaceModalMode;
  }>({ open: false, mode: 'edit' });
  const [createContentState, setCreateContentState] = useState<{
    open: boolean;
    tab: CreateContentTab;
  }>({ open: false, tab: 'single' });
  const [isQuickGuideOpen, setIsQuickGuideOpen] = useState<boolean>(false);

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

  const data = useAutoPostData({
    isOpen: true,
    onToast: showToast,
    onPlannerSync: () => {
      void refreshItems();
    },
  });

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
      }
    } catch {
      // ignore if workspace endpoint is unavailable
    }
  }, []);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/events');
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (
            payload.type === 'workspace-switched' ||
            payload.type === 'workspace-activated'
          ) {
            void fetchWorkspaces();
            void refreshItems();
            void data.refresh();
          }
        } catch {
          // ignore heartbeat
        }
      };
    } catch {
      // EventSource unavailable
    }
    return () => {
      source?.close();
    };
  }, [fetchWorkspaces, refreshItems, data.refresh]);

  const activeWorkspace = useMemo<WorkspaceMetadata | null>(() => {
    if (!workspacesRegistry || !workspacesRegistry.workspaces) return null;
    const activeId = workspacesRegistry.activeWorkspaceId;
    return (
      (activeId ? workspacesRegistry.workspaces[activeId] : undefined) ??
      Object.values(workspacesRegistry.workspaces)[0] ??
      null
    );
  }, [workspacesRegistry]);

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
    [activeWorkspace?.id, refreshItems, data.refresh, showToast]
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

  const openContentDetail = useCallback(
    (item: ContentPlannerItem) => {
      void navigate({ to: '/', search: { detail: item.id } });
    },
    [navigate]
  );

  const editCaption = useCallback(
    (item: ContentPlannerItem) => {
      void navigate({ to: '/', search: { caption: item.id } });
    },
    [navigate]
  );

  const openWatermark = useCallback(
    (item: ContentPlannerItem) => {
      void navigate({ to: '/', search: { watermark: item.id } });
    },
    [navigate]
  );

  const ctx = useMemo<AutoPostPageContext>(
    () => ({
      items,
      data,
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
    [items, data, navigate, openContentDetail, editCaption, openWatermark]
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
    ? items.find((entry) => entry.id === search.item)?.folderCode ?? search.item
    : null;

  return (
    <AutoPostProvider value={ctx}>
      <AppShell
        title={headerMeta.title}
        subtitle={headerMeta.subtitle}
        theme={theme}
        onToggleTheme={toggleTheme}
        isLiveSyncActive
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
