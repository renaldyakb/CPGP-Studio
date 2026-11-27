import { lazy, Suspense, type ReactNode } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App';
import { useAutoPostPageContext } from '@/components/autopost/AutoPostContext';
import { OverviewPage } from './routes/planner/OverviewPage';

const KanbanPage = lazy(() =>
  import('./routes/planner/KanbanPage').then((m) => ({ default: m.KanbanPage }))
);
const TablePage = lazy(() =>
  import('./routes/planner/TablePage').then((m) => ({ default: m.TablePage }))
);
const CalendarPage = lazy(() =>
  import('./routes/planner/CalendarPage').then((m) => ({
    default: m.CalendarPage,
  }))
);
const SchedulePage = lazy(() =>
  import('./routes/planner/SchedulePage').then((m) => ({
    default: m.SchedulePage,
  }))
);
const GalleryPage = lazy(() =>
  import('./routes/planner/GalleryPage').then((m) => ({
    default: m.GalleryPage,
  }))
);
const WatermarkPage = lazy(() =>
  import('./routes/planner/WatermarkPage').then((m) => ({
    default: m.WatermarkPage,
  }))
);
const MotionProvitPage = lazy(() =>
  import('./routes/planner/MotionProvitPage').then((m) => ({
    default: m.MotionProvitPage,
  }))
);

const AutoPostLayout = lazy(() =>
  import('@/components/autopost/AutoPostLayout').then((m) => ({
    default: m.AutoPostLayout,
  }))
);
const DashboardPage = lazy(() =>
  import('@/components/autopost/pages/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  }))
);
const HistoryPage = lazy(() =>
  import('@/components/autopost/pages/HistoryPage').then((m) => ({
    default: m.HistoryPage,
  }))
);
const StudioPage = lazy(() =>
  import('@/components/autopost/pages/StudioPage').then((m) => ({
    default: m.StudioPage,
  }))
);
const MetaApiPage = lazy(() =>
  import('@/components/autopost/pages/MetaApiPage').then((m) => ({
    default: m.MetaApiPage,
  }))
);
const YouTubeApiPage = lazy(() =>
  import('@/components/autopost/pages/YouTubeApiPage').then((m) => ({
    default: m.YouTubeApiPage,
  }))
);
const RemotePage = lazy(() =>
  import('./routes/remote/RemotePage').then((m) => ({
    default: m.RemotePage,
  }))
);

function RouteLoadingFallback({ fullPage = false }: { fullPage?: boolean }) {
  const content = (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[220px] w-full items-center justify-center rounded-lg border border-border bg-card/60 px-4 py-12 text-xs text-muted-foreground"
    >
      Memuat halaman...
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">{content}</div>
      </div>
    );
  }

  return content;
}

function withRouteSuspense(node: ReactNode, options?: { fullPage?: boolean }) {
  return (
    <Suspense fallback={<RouteLoadingFallback fullPage={options?.fullPage} />}>
      {node}
    </Suspense>
  );
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface PlannerSearch {
  detail?: string;
  caption?: string;
  watermark?: string;
  view?: string;
  item?: string;
}

export interface AutoPostSearch {
  item?: string;
  platform?: string;
}

function RootComponent() {
  return (
    <TooltipProvider>
      <Outlet />
    </TooltipProvider>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="mt-1 text-base font-semibold text-foreground">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Rute yang Anda buka tidak tersedia di Content Studio ini.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
        >
          Kembali ke Ringkasan
        </Link>
      </div>
    </div>
  );
}

function RootErrorComponent({ error, reset }: { error: unknown; reset?: () => void }) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Terjadi kesalahan saat merender halaman.';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-mono text-xs text-destructive">CPGP Error</p>
        <h1 className="text-base font-semibold text-foreground">
          Terjadi kesalahan tampilan
        </h1>
        <p className="rounded-md bg-muted p-2.5 font-mono text-[11px] text-muted-foreground break-words">
          {message}
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
            >
              Coba Lagi
            </button>
          ) : null}
          <Link
            to="/"
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Kembali ke Ringkasan
          </Link>
        </div>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: RootErrorComponent,
});

const plannerLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'planner-layout',
  validateSearch: (search: Record<string, unknown>): PlannerSearch => ({
    detail: readString(search.detail),
    caption: readString(search.caption),
    watermark: readString(search.watermark),
    view: readString(search.view),
    item: readString(search.item),
  }),
  component: App,
});

const overviewRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/',
  component: OverviewPage,
});

function KanbanRoute() {
  return withRouteSuspense(<KanbanPage />);
}

function TableRoute() {
  return withRouteSuspense(<TablePage />);
}

function CalendarRoute() {
  return withRouteSuspense(<CalendarPage />);
}

function ScheduleRoute() {
  return withRouteSuspense(<SchedulePage />);
}

function GalleryRoute() {
  return withRouteSuspense(<GalleryPage />);
}

function WatermarkRoute() {
  return withRouteSuspense(<WatermarkPage />);
}

function MotionProvitRoute() {
  return withRouteSuspense(<MotionProvitPage />);
}

function AutoPostLayoutRoute() {
  return withRouteSuspense(<AutoPostLayout />, { fullPage: true });
}

const kanbanRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/kanban',
  component: KanbanRoute,
});

const tableRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/tabel',
  component: TableRoute,
});

const calendarRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/kalender',
  component: CalendarRoute,
});

const scheduleRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/jadwal',
  component: ScheduleRoute,
});

const galleryRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/galeri',
  component: GalleryRoute,
});

const watermarkRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/watermark',
  component: WatermarkRoute,
});

const motionProvitAddonRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/addons/motionprovit',
  component: MotionProvitRoute,
});

const autoPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auto-post',
  validateSearch: (search: Record<string, unknown>): AutoPostSearch => ({
    item: readString(search.item),
    platform: readString(search.platform),
  }),
  component: AutoPostLayoutRoute,
});

function DashboardRoute() {
  const ctx = useAutoPostPageContext();
  return withRouteSuspense(<DashboardPage ctx={ctx} />);
}

function HistoryRoute() {
  const ctx = useAutoPostPageContext();
  return withRouteSuspense(<HistoryPage ctx={ctx} />);
}

function StudioRoute() {
  const ctx = useAutoPostPageContext();
  return withRouteSuspense(<StudioPage ctx={ctx} />);
}

function MetaApiRoute() {
  const ctx = useAutoPostPageContext();
  return withRouteSuspense(<MetaApiPage ctx={ctx} />);
}

function YouTubeApiRoute() {
  const ctx = useAutoPostPageContext();
  return withRouteSuspense(<YouTubeApiPage ctx={ctx} />);
}

const autoPostIndexRoute = createRoute({
  getParentRoute: () => autoPostRoute,
  path: '/',
  component: DashboardRoute,
});

const autoPostHistoryRoute = createRoute({
  getParentRoute: () => autoPostRoute,
  path: '/history',
  component: HistoryRoute,
});

const autoPostStudioRoute = createRoute({
  getParentRoute: () => autoPostRoute,
  path: '/studio',
  component: StudioRoute,
});

const autoPostMetaRoute = createRoute({
  getParentRoute: () => autoPostRoute,
  path: '/meta',
  component: MetaApiRoute,
});

const autoPostYouTubeRoute = createRoute({
  getParentRoute: () => autoPostRoute,
  path: '/youtube',
  component: YouTubeApiRoute,
});

function RemoteRoute() {
  return withRouteSuspense(<RemotePage />, { fullPage: true });
}

const remoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/remote',
  component: RemoteRoute,
});

const routeTree = rootRoute.addChildren([
  plannerLayoutRoute.addChildren([
    overviewRoute,
    kanbanRoute,
    tableRoute,
    calendarRoute,
    scheduleRoute,
    galleryRoute,
    watermarkRoute,
    motionProvitAddonRoute,
  ]),
  autoPostRoute.addChildren([
    autoPostIndexRoute,
    autoPostHistoryRoute,
    autoPostStudioRoute,
    autoPostMetaRoute,
    autoPostYouTubeRoute,
  ]),
  remoteRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}