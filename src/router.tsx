import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App';
import { AutoPostLayout } from '@/components/autopost/AutoPostLayout';
import { useAutoPostPageContext } from '@/components/autopost/AutoPostContext';
import { DashboardPage } from '@/components/autopost/pages/DashboardPage';
import { HistoryPage } from '@/components/autopost/pages/HistoryPage';
import { StudioPage } from '@/components/autopost/pages/StudioPage';
import { MetaApiPage } from '@/components/autopost/pages/MetaApiPage';
import { YouTubeApiPage } from '@/components/autopost/pages/YouTubeApiPage';
import { OverviewPage } from './routes/planner/OverviewPage';
import { KanbanPage } from './routes/planner/KanbanPage';
import { TablePage } from './routes/planner/TablePage';
import { CalendarPage } from './routes/planner/CalendarPage';
import { SchedulePage } from './routes/planner/SchedulePage';
import { GalleryPage } from './routes/planner/GalleryPage';

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
  }),
  component: App,
});

const overviewRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/',
  component: OverviewPage,
});

const kanbanRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/kanban',
  component: KanbanPage,
});

const tableRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/tabel',
  component: TablePage,
});

const calendarRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/kalender',
  component: CalendarPage,
});

const scheduleRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/jadwal',
  component: SchedulePage,
});

const galleryRoute = createRoute({
  getParentRoute: () => plannerLayoutRoute,
  path: '/galeri',
  component: GalleryPage,
});

const autoPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auto-post',
  validateSearch: (search: Record<string, unknown>): AutoPostSearch => ({
    item: readString(search.item),
    platform: readString(search.platform),
  }),
  component: AutoPostLayout,
});

function DashboardRoute() {
  const ctx = useAutoPostPageContext();
  return <DashboardPage ctx={ctx} />;
}

function HistoryRoute() {
  const ctx = useAutoPostPageContext();
  return <HistoryPage ctx={ctx} />;
}

function StudioRoute() {
  const ctx = useAutoPostPageContext();
  return <StudioPage ctx={ctx} />;
}

function MetaApiRoute() {
  const ctx = useAutoPostPageContext();
  return <MetaApiPage ctx={ctx} />;
}

function YouTubeApiRoute() {
  const ctx = useAutoPostPageContext();
  return <YouTubeApiPage ctx={ctx} />;
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

const routeTree = rootRoute.addChildren([
  plannerLayoutRoute.addChildren([
    overviewRoute,
    kanbanRoute,
    tableRoute,
    calendarRoute,
    scheduleRoute,
    galleryRoute,
  ]),
  autoPostRoute.addChildren([
    autoPostIndexRoute,
    autoPostHistoryRoute,
    autoPostStudioRoute,
    autoPostMetaRoute,
    autoPostYouTubeRoute,
  ]),
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