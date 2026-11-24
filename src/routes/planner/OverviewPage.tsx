import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  Columns3,
  Database,
  Droplets,
  ExternalLink,
  FileEdit,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Share2,
  Table2,
} from 'lucide-react';
import { SiYoutube } from 'react-icons/si';
import type { ContentPlannerItem } from '@/types/planner';
import type { WatermarkPolicyMode } from '@/types/workspace';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import { StatCard } from '@/components/autopost/parts/StatCard';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import { formatSlotShort } from '@/lib/formatSlot';

interface AttentionRow {
  item: ContentPlannerItem;
  text: string;
  needsWatermark: boolean;
}

function getWatermarkPolicyBadgeLabel(policy?: WatermarkPolicyMode): string {
  switch (policy) {
    case 'direct_or_wm':
      return 'Video Langsung';
    case 'overwrite_source':
      return 'Mode Overwrite';
    case 'separate_wm_file':
    default:
      return 'Wajib wm_final.mp4';
  }
}

export function OverviewPage() {
  const workspace = usePlannerWorkspace();
  const navigate = useNavigate();

  const { allItems, database } = workspace;
  const stats = database?.stats ?? null;

  const sortedItems = useMemo(
    () =>
      [...allItems].sort(
        (a, b) =>
          a.schedule.isoDate.localeCompare(b.schedule.isoDate) ||
          a.folderCode.localeCompare(b.folderCode)
      ),
    [allItems]
  );

  const firstNeedsWmItem = useMemo(
    () =>
      sortedItems.find((item) => !item.autoMetadata.readiness.hasWmFinal) ??
      null,
    [sortedItems]
  );

  const firstReadyItem = useMemo(
    () =>
      sortedItems.find((item) => item.autoMetadata.readiness.isUploadReady) ??
      null,
    [sortedItems]
  );

  const [selectedCaptionId, setSelectedCaptionId] = useState<string>('');

  const activeCaptionItem = useMemo(() => {
    if (selectedCaptionId) {
      const found = sortedItems.find((item) => item.id === selectedCaptionId);
      if (found) return found;
    }
    return firstReadyItem ?? sortedItems[0] ?? null;
  }, [selectedCaptionId, sortedItems, firstReadyItem]);

  const readyCount = useMemo(
    () =>
      stats?.uploadReadyCount ??
      allItems.filter((item) => item.autoMetadata.readiness.isUploadReady)
        .length,
    [stats, allItems]
  );

  const needsWmCount = useMemo(
    () =>
      stats?.needsWatermarkCount ??
      allItems.filter((item) => !item.autoMetadata.readiness.hasWmFinal).length,
    [stats, allItems]
  );

  const publishedTotal = useMemo(
    () =>
      allItems.reduce((sum, item) => {
        const published = PLATFORM_ORDER.filter(
          (key) => item.userProperties.platforms[key]?.status === 'published'
        ).length;
        return sum + published;
      }, 0),
    [allItems]
  );

  const upcoming = useMemo(() => sortedItems.slice(0, 6), [sortedItems]);

  const attention = useMemo<AttentionRow[]>(() => {
    const rows: AttentionRow[] = [];
    for (const item of sortedItems) {
      const { readiness, assets } = item.autoMetadata;
      if (!readiness.hasWmFinal) {
        rows.push({
          item,
          text: 'Belum ada wm_final yang siap di-upload.',
          needsWatermark: true,
        });
      } else if (item.userProperties.workflowStatus === 'on_hold') {
        rows.push({
          item,
          text: 'Ditandai revisi atau hold untuk perbaikan.',
          needsWatermark: false,
        });
      } else if (assets.otherFiles.length > 0) {
        rows.push({
          item,
          text: `Ada ${assets.otherFiles.length} file ekstra di luar 4 berkas utama.`,
          needsWatermark: false,
        });
      }
      if (rows.length === 5) break;
    }
    return rows;
  }, [sortedItems]);

  const platformProgress = useMemo(
    () =>
      PLATFORM_ORDER.map((key) => {
        const published = allItems.filter(
          (item) => item.userProperties.platforms[key]?.status === 'published'
        ).length;
        const total = allItems.length;
        return {
          key,
          published,
          total,
          pct: total > 0 ? Math.round((published / total) * 100) : 0,
        };
      }),
    [allItems]
  );

  const quickLaunchTiles = [
    {
      label: 'Papan Kanban',
      to: '/kanban' as const,
      Icon: Columns3,
    },
    {
      label: 'Tabel Database',
      to: '/tabel' as const,
      Icon: Table2,
    },
    {
      label: 'Kalender Event',
      to: '/kalender' as const,
      Icon: CalendarDays,
    },
    {
      label: 'Jadwal Slot',
      to: '/jadwal' as const,
      Icon: CalendarClock,
    },
    {
      label: 'Galeri 9:16',
      to: '/galeri' as const,
      Icon: LayoutGrid,
    },
    {
      label: 'Sesi Browser Studio',
      to: '/auto-post/studio' as const,
      Icon: MonitorSmartphone,
    },
    {
      label: 'Meta Graph API',
      to: '/auto-post/meta' as const,
      Icon: Share2,
    },
    {
      label: 'YouTube Data API',
      to: '/auto-post/youtube' as const,
      Icon: SiYoutube,
    },
  ];

  const activeWs = workspace.activeWorkspace;
  const activeWsName =
    activeWs?.name ?? database?.workspaceConfig.workspaceName ?? 'Workspace Aktif';
  const activeWsHandle = activeWs?.handle || '@channel';
  const activeWsPolicy = activeWs?.rules.watermarkPolicy ?? 'separate_wm_file';

  return (
    <div className="space-y-3">
      {/* Section 0: Prominent Active Workspace Banner */}
      <Card className="border-t-cpgp p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-[#4a0d18] bg-cpgp-gradient font-mono text-xs font-bold tracking-wider text-white"
              aria-hidden="true"
            >
              CPGP
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                  {activeWsName}
                </h2>
                <Badge variant="outline" size="xs" className="font-mono">
                  {activeWsHandle}
                </Badge>
                <Badge variant="secondary" size="xs" className="font-mono">
                  {getWatermarkPolicyBadgeLabel(activeWsPolicy)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>Folder Konten:</span>
                <code className="truncate font-mono text-foreground">
                  {workspace.contentRootPath}
                </code>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="editorial"
              size="sm"
              onClick={() => workspace.openCreateContent('single')}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Konten Baru</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => workspace.openCreateContent('batch')}
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Batch Generate Slot</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => workspace.openWorkspaceModal('edit')}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pengaturan Workspace</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => workspace.openQuickGuide()}
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Panduan</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => workspace.openWorkspaceModal('create')}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Workspace Baru</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Section 1: 4 Interactive KPI StatCards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Konten"
          value={allItems.length}
          hint="Seluruh folder di KONTEN"
          icon={Database}
          onClick={() => {
            workspace.resetFilters();
            void navigate({ to: '/tabel' });
          }}
        />
        <StatCard
          label="Siap Upload"
          value={readyCount}
          hint="wm_final, cover, caption lengkap"
          icon={CheckCheck}
          tone="success"
          active={workspace.readinessFilter === 'ready'}
          onClick={() => {
            workspace.setReadinessFilter('ready');
            void navigate({ to: '/kanban' });
          }}
        />
        <StatCard
          label="Butuh Watermark"
          value={needsWmCount}
          hint="Tinggal render wm_final"
          icon={Droplets}
          tone="warning"
          active={workspace.readinessFilter === 'needs_wm'}
          onClick={() => {
            workspace.setReadinessFilter('needs_wm');
            void navigate({ to: '/kanban' });
          }}
        />
        <StatCard
          label="Sudah Publish"
          value={publishedTotal}
          hint="Total unggahan lintas 4 platform"
          icon={Send}
          tone="info"
          onClick={() => void navigate({ to: '/auto-post/history' })}
        />
      </div>

      {/* Section 2: Pusat Fitur & Tool Studio */}
      <Card className="p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Pusat Fitur & Tool Studio
            </h2>
            <p className="text-xs text-muted-foreground">
              Akses cepat ke seluruh tool produksi, otomatisasi upload, tampilan
              workspace, dan integrasi API.
            </p>
          </div>
          <Badge variant="outline" size="xs">
            Semua Tool Tersedia
          </Badge>
        </div>

        {/* Subsection A: Tool Produksi & Otomatisasi (4 Primary Tool Cards) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Watermark Studio & Preset */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                  <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <Badge
                  variant={needsWmCount > 0 ? 'warning' : 'success'}
                  size="xs"
                >
                  {needsWmCount} butuh WM
                </Badge>
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Watermark Studio & Preset
              </h3>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Atur posisi, font, warna, outline {activeWsHandle} di atas video
                9:16 dan render batch wm_final.mp4.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              disabled={allItems.length === 0}
              onClick={() => {
                const target = firstNeedsWmItem ?? allItems[0];
                if (target) {
                  workspace.openWatermark(target);
                }
              }}
            >
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              Buka Watermark Studio
            </Button>
          </div>

          {/* 2. Dasbor Auto-Post (4 Platform) */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <Badge variant="success" size="xs">
                  {readyCount} siap kirim
                </Badge>
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Dasbor Auto-Post (4 Platform)
              </h3>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Trigger upload otomatis satu per satu atau sekaligus ke YouTube
                Shorts, TikTok, IG Reels, dan Facebook.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() =>
                workspace.openAutoPost(firstReadyItem ?? null, null)
              }
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Buka Dasbor Auto-Post
            </Button>
          </div>

          {/* 3. Live Editor caption.txt */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                  <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <Badge variant="outline" size="xs">
                  {allItems.length} berkas
                </Badge>
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Live Editor caption.txt
              </h3>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Edit langsung hook judul, pertanyaan CTA, dan hashtag dengan
                sinkronisasi dua arah ke file caption.txt.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <NativeSelect
                aria-label="Pilih kode folder konten untuk edit caption"
                className="min-h-8 flex-1 px-2 py-1 font-mono text-xs"
                value={activeCaptionItem?.id ?? ''}
                disabled={sortedItems.length === 0}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedCaptionId(nextId);
                  const picked = sortedItems.find((item) => item.id === nextId);
                  if (picked) {
                    workspace.openCaption(picked);
                  }
                }}
              >
                {sortedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.folderCode} ({formatSlotShort(item.schedule)})
                  </option>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                size="sm"
                disabled={!activeCaptionItem}
                onClick={() => {
                  const target =
                    activeCaptionItem ?? firstReadyItem ?? allItems[0];
                  if (target) {
                    workspace.openCaption(target);
                  }
                }}
              >
                Edit
              </Button>
            </div>
          </div>

          {/* 4. Sinkronisasi & Folder KONTEN */}
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-background/50 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <Badge variant="outline" size="xs">
                  Disk Lokal
                </Badge>
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Sinkronisasi & Folder KONTEN
              </h3>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Scan ulang folder{' '}
                <span className="font-mono text-foreground">
                  {workspace.contentRootPath || 'KONTEN'}
                </span>{' '}
                ke JSON atau buka langsung di Windows Explorer.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-center"
                disabled={workspace.isScanning}
                onClick={() => void workspace.rescan()}
              >
                <RefreshCw
                  className={
                    workspace.isScanning
                      ? 'h-3.5 w-3.5 animate-spin'
                      : 'h-3.5 w-3.5'
                  }
                  aria-hidden="true"
                />
                Scan Ulang
              </Button>
              <IconActionButton
                icon={FolderOpen}
                variant="outline"
                label="Buka Folder KONTEN di Explorer"
                onClick={() =>
                  void workspace.openExplorer(workspace.contentRootPath, false)
                }
              />
            </div>
          </div>
        </div>

        {/* Subsection B: Tampilan Workspace & Koneksi API (Compact Quick-Launch Strip) */}
        <div className="border-t border-border pt-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              Tampilan Workspace & Koneksi API
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {quickLaunchTiles.map(({ label, to, Icon }) => (
              <button
                key={to}
                type="button"
                onClick={() => void navigate({ to })}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Section 3: Two-Column Operational Feed */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Left Column: Jadwal Konten Terdekat */}
        <div className="xl:col-span-7">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Jadwal Konten Terdekat
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {upcoming.length} dari {allItems.length}
              </span>
            </div>

            {upcoming.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Belum ada konten terjadwal di folder KONTEN.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((item) => {
                  const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <button
                        type="button"
                        onClick={() => workspace.openDetail(item)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.folderCode}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatSlotShort(item.schedule)}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {item.schedule.displayDate}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant={hasWmFinal ? 'success' : 'warning'}
                          size="xs"
                        >
                          {hasWmFinal ? 'Siap' : 'Butuh WM'}
                        </Badge>
                        <IconActionButton
                          icon={FileEdit}
                          label={`Edit caption ${item.folderCode}`}
                          onClick={() => workspace.openCaption(item)}
                        />
                        <IconActionButton
                          icon={Droplets}
                          label={`Render watermark ${item.folderCode}`}
                          onClick={() => workspace.openWatermark(item)}
                        />
                        <IconActionButton
                          icon={Send}
                          label={`Auto-Post ${item.folderCode}`}
                          onClick={() => workspace.openAutoPost(item, null)}
                        />
                        <IconActionButton
                          icon={ExternalLink}
                          label={`Buka detail ${item.folderCode}`}
                          onClick={() => workspace.openDetail(item)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ to: '/kanban' })}
              >
                Lihat semua di Kanban
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ to: '/jadwal' })}
              >
                Buka Matriks Jadwal Slot
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Butuh Perhatian + Progres Publikasi 4 Platform */}
        <div className="space-y-3 xl:col-span-5">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Butuh Perhatian
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {attention.length}
              </span>
            </div>

            {attention.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Tidak ada konten yang butuh perhatian.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map(({ item, text, needsWatermark }) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {item.folderCode}
                      </span>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {text}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {needsWatermark ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => workspace.openWatermark(item)}
                        >
                          <Droplets
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          Render WM
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => workspace.openDetail(item)}
                        >
                          Periksa
                        </Button>
                      )}
                      <IconActionButton
                        icon={ExternalLink}
                        label={`Buka detail ${item.folderCode}`}
                        onClick={() => workspace.openDetail(item)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Progres Publikasi 4 Platform
              </h2>
              <span className="text-[11px] text-muted-foreground">
                Dari {allItems.length} konten
              </span>
            </div>

            <ul className="divide-y divide-border">
              {platformProgress.map(({ key, published, total, pct }) => (
                <li key={key} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                      <PlatformIcon platform={key} />
                      {PLATFORM_META[key].label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {published}/{total}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    aria-label={`Progres ${PLATFORM_META[key].label}`}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
