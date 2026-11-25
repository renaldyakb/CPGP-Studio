import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Columns3,
  Droplets,
  FolderKanban,
  HelpCircle,
  History,
  LayoutDashboard,
  LayoutGrid,
  MonitorSmartphone,
  Moon,
  PlugZap,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  Settings2,
  Share2,
  Sun,
  Table2,
} from 'lucide-react';
import { SiYoutube } from 'react-icons/si';
import type {
  WorkspaceMetadata,
  WorkspacesRegistry,
} from '@/types/workspace';
import {
  UpdateNotificationBanner,
  useUpdateChecker,
} from '@/components/shell/UpdateNotificationBanner';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { Kbd } from '@/components/ui/kbd';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import { cn } from '@/lib/utils';

type NavTo =
  | '/'
  | '/kanban'
  | '/tabel'
  | '/kalender'
  | '/jadwal'
  | '/galeri'
  | '/watermark'
  | '/addons/motionprovit'
  | '/auto-post'
  | '/auto-post/history'
  | '/auto-post/studio'
  | '/auto-post/meta'
  | '/auto-post/youtube';

interface NavSubItem {
  to: NavTo;
  label: string;
  icon: ReactNode;
}

const PLANNER_VIEWS_SUB: NavSubItem[] = [
  {
    to: '/kanban',
    label: 'Kanban',
    icon: <Columns3 aria-hidden="true" />,
  },
  {
    to: '/tabel',
    label: 'Tabel',
    icon: <Table2 aria-hidden="true" />,
  },
  {
    to: '/kalender',
    label: 'Kalender',
    icon: <CalendarDays aria-hidden="true" />,
  },
  {
    to: '/jadwal',
    label: 'Jadwal',
    icon: <CalendarClock aria-hidden="true" />,
  },
  {
    to: '/galeri',
    label: 'Galeri',
    icon: <LayoutGrid aria-hidden="true" />,
  },
];

const CONNECTIONS_SUB: NavSubItem[] = [
  {
    to: '/auto-post/studio',
    label: 'Browser',
    icon: <MonitorSmartphone aria-hidden="true" />,
  },
  {
    to: '/auto-post/meta',
    label: 'Meta API',
    icon: <Share2 aria-hidden="true" />,
  },
  {
    to: '/auto-post/youtube',
    label: 'YouTube',
    icon: <SiYoutube aria-hidden="true" />,
  },
];

const CONNECTION_ROUTES: ReadonlySet<string> = new Set(
  CONNECTIONS_SUB.map((item) => item.to)
);

const PLANNER_VIEW_ROUTES: ReadonlySet<string> = new Set(
  PLANNER_VIEWS_SUB.map((item) => item.to)
);

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

export interface AppShellCounts {
  total?: number;
  ready?: number;
  needsWm?: number;
  runningJobs?: number;
  reviewJobs?: number;
}

export interface AppShellProps {
  title: string;
  subtitle?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRescan?: () => void;
  isScanning?: boolean;
  isLiveSyncActive?: boolean;
  counts?: AppShellCounts;
  workspacesRegistry?: WorkspacesRegistry | null;
  activeWorkspace?: WorkspaceMetadata | null;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onOpenCreateWorkspace?: () => void;
  onOpenWorkspaceSettings?: () => void;
  onOpenQuickGuide?: () => void;
  onOpenCreateContent?: () => void;
  toolbar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  theme,
  onToggleTheme,
  onRescan,
  isScanning = false,
  isLiveSyncActive = false,
  counts,
  workspacesRegistry,
  activeWorkspace,
  onSwitchWorkspace,
  onOpenCreateWorkspace,
  onOpenWorkspaceSettings,
  onOpenQuickGuide,
  onOpenCreateContent,
  toolbar,
  actions,
  children,
}: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = normalizePath(location.pathname);

  const isPublishingGroup = activePath.startsWith('/auto-post');
  const isPlannerSubActive = PLANNER_VIEW_ROUTES.has(activePath);
  const isConnectionSubActive = CONNECTION_ROUTES.has(activePath);

  const [isPlannerOpen, setIsPlannerOpen] = useState<boolean>(true);
  const [isConnectionsOpen, setIsConnectionsOpen] = useState<boolean>(() =>
    CONNECTION_ROUTES.has(activePath)
  );
  const [commandOpen, setCommandOpen] = useState<boolean>(false);
  const { updateInfo, dismissed, dismissUpdate } = useUpdateChecker();

  useEffect(() => {
    if (CONNECTION_ROUTES.has(activePath)) {
      setIsConnectionsOpen(true);
    }
  }, [activePath]);

  const totalCount = counts?.total;
  const readyCount = counts?.ready;
  const needsWmCount = counts?.needsWm;
  const runningJobsCount = counts?.runningJobs;
  const reviewJobsCount = counts?.reviewJobs;

  const historyBadgeCount =
    (reviewJobsCount ?? 0) > 0
      ? reviewJobsCount
      : (runningJobsCount ?? 0) > 0
        ? runningJobsCount
        : undefined;

  const liveSyncLabel = isLiveSyncActive
    ? 'Live sync folder KONTEN aktif'
    : 'Live sync terputus';

  const workspaceList = workspacesRegistry?.workspaces
    ? Object.values(workspacesRegistry.workspaces)
    : activeWorkspace
      ? [activeWorkspace]
      : [];
  const currentWorkspaceName = activeWorkspace?.name ?? 'Workspace Aktif';
  const currentWorkspaceHandle = activeWorkspace?.handle ?? '@workspace';

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="space-y-1.5">
          <button
            type="button"
            onClick={() => void navigate({ to: '/' })}
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
            aria-label="Buka Ringkasan CPGP"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#4a0d18] bg-cpgp-gradient font-mono text-[10px] font-bold tracking-tight text-white"
              aria-hidden="true"
            >
              CPGP
            </span>
            <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-mono text-xs font-bold tracking-wide text-foreground">
                CPGP
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                Content Planer Gam Puko
              </span>
            </span>
          </button>

          {/* Multi-Workspace Switcher Dropdown */}
          <div className="group-data-[collapsible=icon]:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Workspace aktif: ${currentWorkspaceName}. Klik untuk ganti workspace`}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
                  />
                }
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-semibold text-foreground">
                    {currentWorkspaceName}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {currentWorkspaceHandle}
                  </span>
                </span>
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Daftar Workspace</DropdownMenuLabel>
                  {workspaceList.length === 0 ? (
                    <DropdownMenuItem disabled>
                      <span className="truncate text-xs">
                        {currentWorkspaceName} ({currentWorkspaceHandle})
                      </span>
                    </DropdownMenuItem>
                  ) : (
                    workspaceList.map((ws) => {
                      const isCurrent = ws.id === activeWorkspace?.id;
                      return (
                        <DropdownMenuItem
                          key={ws.id}
                          onClick={() => onSwitchWorkspace?.(ws.id)}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {ws.name}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {ws.handle}
                            </span>
                          </div>
                          {isCurrent ? (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                          ) : null}
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                {onOpenWorkspaceSettings ? (
                  <DropdownMenuItem onClick={onOpenWorkspaceSettings}>
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs">Pengaturan Workspace</span>
                  </DropdownMenuItem>
                ) : null}

                {onOpenQuickGuide ? (
                  <DropdownMenuItem onClick={onOpenQuickGuide}>
                    <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs">Panduan Singkat</span>
                  </DropdownMenuItem>
                ) : null}

                {onOpenCreateWorkspace ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onOpenCreateWorkspace}>
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="text-xs font-semibold">
                        + Buat Workspace Baru
                      </span>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* Group 1: Workspace Konten */}
          <SidebarGroup>
            <SidebarGroupLabel>Konten</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activePath === '/'}
                    tooltip="Ringkasan"
                    onClick={() => void navigate({ to: '/' })}
                  >
                    <LayoutDashboard aria-hidden="true" />
                    <span>Ringkasan</span>
                  </SidebarMenuButton>
                  {typeof totalCount === 'number' && totalCount > 0 ? (
                    <SidebarMenuBadge className="font-mono text-[10px] text-muted-foreground">
                      {totalCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isPlannerSubActive && !isPlannerOpen}
                    tooltip="Tampilan"
                    aria-expanded={isPlannerOpen}
                    onClick={() => setIsPlannerOpen((prev) => !prev)}
                    className="group-data-[collapsible=icon]:hidden"
                  >
                    <FolderKanban aria-hidden="true" />
                    <span>Tampilan</span>
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
                        isPlannerOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>

                  {isPlannerOpen ? (
                    <SidebarMenuSub>
                      {PLANNER_VIEWS_SUB.map((item) => {
                        const isSubActive = activePath === item.to;
                        const showNeedsWm =
                          item.to === '/kanban' &&
                          typeof needsWmCount === 'number' &&
                          needsWmCount > 0;
                        const showTotal =
                          item.to === '/tabel' &&
                          typeof totalCount === 'number' &&
                          totalCount > 0;

                        return (
                          <SidebarMenuSubItem key={item.to}>
                            <SidebarMenuSubButton
                              size="sm"
                              isActive={isSubActive}
                              href={item.to}
                              onClick={(event) => {
                                event.preventDefault();
                                void navigate({ to: item.to });
                              }}
                            >
                              {item.icon}
                              <span>{item.label}</span>
                              {showNeedsWm ? (
                                <span
                                  className="ml-auto rounded-sm bg-[#FEF3C7] px-1 font-mono text-[10px] font-medium text-[#92400E] dark:bg-[#451A03] dark:text-[#FCD34D]"
                                  title={`${needsWmCount} konten menunggu watermark`}
                                >
                                  {needsWmCount} WM
                                </span>
                              ) : showTotal ? (
                                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                  {totalCount}
                                </span>
                              ) : null}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>

                {/* Icon-rail fallback items so every planner sub-route stays accessible when collapsed */}
                {PLANNER_VIEWS_SUB.map((item) => (
                  <SidebarMenuItem
                    key={`rail-${item.to}`}
                    className="hidden group-data-[collapsible=icon]:block"
                  >
                    <SidebarMenuButton
                      isActive={activePath === item.to}
                      tooltip={item.label}
                      onClick={() => void navigate({ to: item.to })}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activePath === '/watermark'}
                    tooltip="Watermark"
                    onClick={() => void navigate({ to: '/watermark' })}
                  >
                    <Droplets aria-hidden="true" />
                    <span>Watermark</span>
                  </SidebarMenuButton>
                  {typeof needsWmCount === 'number' && needsWmCount > 0 ? (
                    <SidebarMenuBadge className="rounded-sm bg-[#FEF3C7] px-1 font-mono text-[10px] font-medium text-[#92400E] dark:bg-[#451A03] dark:text-[#FCD34D]">
                      {needsWmCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* Group 2: Distribusi */}
          <SidebarGroup>
            <SidebarGroupLabel>Distribusi</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activePath === '/auto-post'}
                    tooltip="Auto-Post"
                    onClick={() => void navigate({ to: '/auto-post' })}
                  >
                    <Send aria-hidden="true" />
                    <span>Auto-Post</span>
                  </SidebarMenuButton>
                  {typeof readyCount === 'number' && readyCount > 0 ? (
                    <SidebarMenuBadge
                      className="rounded-sm bg-[#DCFCE7] px-1 font-mono text-[10px] font-medium text-[#166534] dark:bg-[#052E16] dark:text-[#86EFAC]"
                      title={`${readyCount} siap upload`}
                    >
                      {readyCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activePath === '/auto-post/history'}
                    tooltip="Riwayat"
                    onClick={() => void navigate({ to: '/auto-post/history' })}
                  >
                    <History aria-hidden="true" />
                    <span>Riwayat</span>
                  </SidebarMenuButton>
                  {typeof historyBadgeCount === 'number' &&
                  historyBadgeCount > 0 ? (
                    <SidebarMenuBadge className="rounded-sm bg-muted px-1 font-mono text-[10px] text-foreground">
                      {historyBadgeCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isConnectionSubActive && !isConnectionsOpen}
                    tooltip="Koneksi"
                    aria-expanded={isConnectionsOpen}
                    onClick={() => setIsConnectionsOpen((prev) => !prev)}
                    className="group-data-[collapsible=icon]:hidden"
                  >
                    <PlugZap aria-hidden="true" />
                    <span>Koneksi</span>
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
                        isConnectionsOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>

                  {isConnectionsOpen ? (
                    <SidebarMenuSub>
                      {CONNECTIONS_SUB.map((item) => (
                        <SidebarMenuSubItem key={item.to}>
                          <SidebarMenuSubButton
                            size="sm"
                            isActive={activePath === item.to}
                            href={item.to}
                            onClick={(event) => {
                              event.preventDefault();
                              void navigate({ to: item.to });
                            }}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>

                {/* Icon-rail fallback items so every connection sub-route stays accessible when collapsed */}
                {CONNECTIONS_SUB.map((item) => (
                  <SidebarMenuItem
                    key={`rail-${item.to}`}
                    className="hidden group-data-[collapsible=icon]:block"
                  >
                    <SidebarMenuButton
                      isActive={activePath === item.to}
                      tooltip={item.label}
                      onClick={() => void navigate({ to: item.to })}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* Group 3: Add-ons Opsional */}
          <SidebarGroup>
            <SidebarGroupLabel>Add-ons</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activePath === '/addons/motionprovit'}
                    tooltip="MotionProvit"
                    onClick={() => void navigate({ to: '/addons/motionprovit' })}
                  >
                    <CloudDownload aria-hidden="true" />
                    <span>MotionProvit</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <div className="flex items-center justify-between gap-1.5 px-2 py-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            <span className="flex min-w-0 items-center gap-1.5">
              <Radio
                className={
                  isLiveSyncActive
                    ? 'h-3 w-3 shrink-0 text-[#166534] dark:text-[#86efac]'
                    : 'h-3 w-3 shrink-0 text-muted-foreground'
                }
                aria-hidden="true"
              />
              <span className="truncate">
                {isLiveSyncActive ? 'Live sync aktif' : 'Live sync terputus'}
              </span>
            </span>
            {typeof readyCount === 'number' && typeof totalCount === 'number' ? (
              <span
                className="shrink-0 font-mono text-[10px] text-muted-foreground"
                title="Konten siap upload dari total konten"
              >
                {readyCount}/{totalCount}
              </span>
            ) : null}
          </div>
          {updateInfo ? (
            <div className="flex items-center justify-between gap-1.5 px-2 pb-1 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
              <span className="font-mono">CPGP v{updateInfo.currentVersion}</span>
              {updateInfo.hasUpdate ? (
                <a
                  href={updateInfo.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-semibold text-[#651220] hover:underline dark:text-[#fda4af]"
                >
                  Update v{updateInfo.latestVersion}
                </a>
              ) : (
                <a
                  href={updateInfo.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  GitHub
                </a>
              )}
            </div>
          ) : null}
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-primary-foreground"
        >
          Langsung ke konten
        </a>

        <UpdateNotificationBanner
          updateInfo={updateInfo}
          dismissed={dismissed}
          onDismiss={dismissUpdate}
        />
        <header className="sticky top-0 z-20 flex min-h-13 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger aria-label="Buka atau tutup menu navigasi" />
            <Separator orientation="vertical" className="h-4" />
            <div className="min-w-0 leading-tight">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-xs font-light text-muted-foreground/80">
                  {isPublishingGroup ? 'Distribusi' : 'Konten'}
                </span>
                <span
                  className="shrink-0 text-xs text-muted-foreground/50"
                  aria-hidden="true"
                >
                  /
                </span>
                <h1 className="truncate text-sm font-semibold text-foreground">
                  {title}
                </h1>
              </div>
              {subtitle ? (
                <p className="hidden truncate text-[11px] font-light text-muted-foreground/75 md:block">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCommandOpen(true)}
                    aria-label="Buka pencarian cepat (Ctrl+K)"
                    className="h-7 gap-2 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                  />
                }
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Cari cepat...</span>
                <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
              </TooltipTrigger>
              <TooltipContent side="bottom">Pencarian Cepat (Ctrl+K)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    role="status"
                    aria-label={liveSyncLabel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        isLiveSyncActive
                          ? 'bg-[#16a34a] dark:bg-[#4ade80]'
                          : 'bg-muted-foreground/40'
                      )}
                      aria-hidden="true"
                    />
                  </span>
                }
              />
              <TooltipContent side="bottom">{liveSyncLabel}</TooltipContent>
            </Tooltip>

            {onOpenCreateContent ? (
              <Button
                type="button"
                variant="editorial"
                size="sm"
                onClick={onOpenCreateContent}
                aria-label="Buat konten baru"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Baru</span>
              </Button>
            ) : null}

            {actions}

            {onOpenQuickGuide ? (
              <IconActionButton
                icon={HelpCircle}
                label="Panduan"
                side="bottom"
                onClick={onOpenQuickGuide}
              />
            ) : null}

            {onOpenWorkspaceSettings ? (
              <IconActionButton
                icon={Settings}
                label="Pengaturan"
                side="bottom"
                onClick={onOpenWorkspaceSettings}
              />
            ) : null}

            {onRescan ? (
              <IconActionButton
                icon={RefreshCw}
                label="Scan ulang"
                side="bottom"
                onClick={onRescan}
                disabled={isScanning}
                iconClassName={isScanning ? 'animate-spin' : undefined}
              />
            ) : null}

            <IconActionButton
              icon={theme === 'dark' ? Sun : Moon}
              label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              side="bottom"
              onClick={onToggleTheme}
            />
          </div>
        </header>

        {toolbar ? (
          <div className="shrink-0 border-b border-border bg-card px-3 py-2 sm:px-5">
            {toolbar}
          </div>
        ) : null}

        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <div className="mx-auto w-full max-w-[1500px] space-y-4 p-4 sm:p-6">
            {children}
          </div>
        </main>
      </SidebarInset>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onRescan={onRescan}
        onOpenCreateContent={onOpenCreateContent}
        onOpenCreateWorkspace={onOpenCreateWorkspace}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
        onOpenQuickGuide={onOpenQuickGuide}
        workspaces={workspaceList}
        activeWorkspaceId={activeWorkspace?.id}
        onSwitchWorkspace={onSwitchWorkspace}
      />
    </SidebarProvider>
  );
}
