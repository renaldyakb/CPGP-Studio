import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CheckCircle2,
  Database,
  Droplets,
  ExternalLink,
  FileEdit,
  FolderOpen,
  Layers,
  Pencil,
  Send,
} from 'lucide-react';
import type {
  ContentPlannerItem,
  PlatformKey,
  ScheduleSlotInfo,
} from '@/types/planner';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import { StatCard } from '@/components/autopost/parts/StatCard';
import {
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import { formatSlotShort } from '@/lib/formatSlot';

type AttentionKind = 'no_wm' | 'on_hold' | 'extra_files';

interface AttentionRow {
  item: ContentPlannerItem;
  kind: AttentionKind;
  extraCount: number;
}

const PLATFORM_SHORT_LABEL: Record<PlatformKey, string> = {
  yt_shorts: 'YouTube',
  tiktok: 'TikTok',
  ig_reels: 'Instagram',
  fb_reels: 'Facebook',
};

function formatShortDate(schedule: ScheduleSlotInfo): string {
  const monthShort = schedule.monthName
    ? schedule.monthName.slice(0, 3)
    : '';
  return monthShort
    ? `${schedule.dayOfMonth} ${monthShort}`
    : schedule.displayDate;
}

function getItemHookTitle(item: ContentPlannerItem): string {
  return (
    item.userProperties.customTitle?.trim() ||
    item.autoMetadata.captionParsed.hookTitle?.trim() ||
    item.folderCode
  );
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

  const selectedCaptionItem = useMemo(() => {
    if (selectedCaptionId) {
      const found = sortedItems.find((item) => item.id === selectedCaptionId);
      if (found) return found;
    }
    return firstReadyItem ?? sortedItems[0] ?? null;
  }, [selectedCaptionId, sortedItems, firstReadyItem]);

  const uploadReadyCount = useMemo(
    () =>
      stats?.uploadReadyCount ??
      allItems.filter((item) => item.autoMetadata.readiness.isUploadReady)
        .length,
    [stats, allItems]
  );

  const needsWatermarkCount = useMemo(
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
        rows.push({ item, kind: 'no_wm', extraCount: 0 });
      } else if (item.userProperties.workflowStatus === 'on_hold') {
        rows.push({ item, kind: 'on_hold', extraCount: 0 });
      } else if (assets.otherFiles.length > 0) {
        rows.push({
          item,
          kind: 'extra_files',
          extraCount: assets.otherFiles.length,
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
          label: PLATFORM_SHORT_LABEL[key],
          published,
          total,
          pct: total > 0 ? Math.round((published / total) * 100) : 0,
        };
      }),
    [allItems]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={allItems.length}
          hint="folder"
          icon={Database}
          onClick={() => {
            workspace.resetFilters();
            void navigate({ to: '/tabel' });
          }}
        />
        <StatCard
          label="Siap"
          value={uploadReadyCount}
          hint="siap kirim"
          icon={CheckCircle2}
          tone="success"
          active={workspace.readinessFilter === 'ready'}
          onClick={() => {
            workspace.setReadinessFilter('ready');
            void navigate({ to: '/kanban' });
          }}
        />
        <StatCard
          label="Watermark"
          value={needsWatermarkCount}
          hint="belum WM"
          icon={Droplets}
          tone="warning"
          active={workspace.readinessFilter === 'needs_wm'}
          onClick={() => {
            workspace.setReadinessFilter('needs_wm');
            void navigate({ to: '/kanban' });
          }}
        />
        <StatCard
          label="Tayang"
          value={publishedTotal}
          hint="total post"
          icon={Send}
          tone="info"
          onClick={() => void navigate({ to: '/auto-post/history' })}
        />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={allItems.length === 0}
              onClick={() => {
                const target = firstNeedsWmItem ?? allItems[0];
                if (target) {
                  workspace.openWatermark(target);
                }
              }}
            >
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Watermark</span>
              {needsWatermarkCount > 0 ? (
                <Badge
                  variant="warning"
                  size="xs"
                  className="ml-0.5 font-mono tabular-nums"
                >
                  {needsWatermarkCount}
                </Badge>
              ) : null}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                workspace.openAutoPost(firstReadyItem ?? null, null)
              }
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Auto-Post</span>
              {uploadReadyCount > 0 ? (
                <Badge
                  variant="success"
                  size="xs"
                  className="ml-0.5 font-mono tabular-nums"
                >
                  {uploadReadyCount}
                </Badge>
              ) : null}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => workspace.openCreateContent('batch')}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Batch Slot</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void workspace.openExplorer(workspace.contentRootPath, false)
              }
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Folder</span>
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <FileEdit
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/75"
              aria-hidden="true"
            />
            <NativeSelect
              aria-label="Pilih konten"
              className="h-7 min-h-0 w-24 px-2 py-0 font-mono text-xs"
              value={selectedCaptionItem?.id ?? ''}
              disabled={sortedItems.length === 0}
              onChange={(event) => setSelectedCaptionId(event.target.value)}
            >
              {sortedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.folderCode}
                </option>
              ))}
            </NativeSelect>
            <IconActionButton
              icon={Pencil}
              variant="outline"
              label="Edit caption"
              disabled={!selectedCaptionItem}
              onClick={() => {
                if (selectedCaptionItem) {
                  workspace.openCaption(selectedCaptionItem);
                }
              }}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">
                Jadwal Terdekat
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="font-light text-muted-foreground/75 hover:text-foreground"
                onClick={() => void navigate({ to: '/jadwal' })}
              >
                Semua
              </Button>
            </div>

            {upcoming.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs font-light text-muted-foreground/75">
                Belum ada jadwal.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((item) => {
                  const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
                  const title = getItemHookTitle(item);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <button
                        type="button"
                        onClick={() => workspace.openDetail(item)}
                        className="min-w-0 flex-1 space-y-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-xs font-medium text-foreground">
                            {item.folderCode}
                          </span>
                          <span className="truncate text-[11px] font-light text-muted-foreground/80">
                            {formatSlotShort(item.schedule)} ·{' '}
                            {formatShortDate(item.schedule)}
                          </span>
                        </div>
                        <p className="truncate text-xs font-normal text-foreground">
                          {title}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <Badge
                          variant={hasWmFinal ? 'success' : 'warning'}
                          size="xs"
                        >
                          {hasWmFinal ? 'Siap' : 'No WM'}
                        </Badge>
                        <IconActionButton
                          icon={Pencil}
                          label="Edit caption"
                          onClick={() => workspace.openCaption(item)}
                        />
                        <IconActionButton
                          icon={Droplets}
                          label="Watermark"
                          onClick={() => workspace.openWatermark(item)}
                        />
                        <IconActionButton
                          icon={Send}
                          label="Auto-Post"
                          onClick={() => workspace.openAutoPost(item, null)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">
                Perlu Tindakan
              </h2>
              <span className="font-mono text-[11px] font-light text-muted-foreground/75 tabular-nums">
                {attention.length}
              </span>
            </div>

            {attention.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs font-light text-muted-foreground/75">
                Semua konten siap.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map(({ item, kind, extraCount }) => {
                  const title = getItemHookTitle(item);
                  const badgeVariant =
                    kind === 'no_wm'
                      ? 'warning'
                      : kind === 'on_hold'
                        ? 'destructive'
                        : 'muted';
                  const badgeLabel =
                    kind === 'no_wm'
                      ? 'No WM'
                      : kind === 'on_hold'
                        ? 'Hold'
                        : `+${extraCount} file`;

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
                        <span className="shrink-0 font-mono text-xs font-medium text-foreground">
                          {item.folderCode}
                        </span>
                        <span className="truncate text-xs font-light text-muted-foreground/80">
                          {title}
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant={badgeVariant} size="xs">
                          {badgeLabel}
                        </Badge>
                        {kind === 'no_wm' ? (
                          <IconActionButton
                            icon={Droplets}
                            label="Render"
                            onClick={() => workspace.openWatermark(item)}
                          />
                        ) : (
                          <IconActionButton
                            icon={ExternalLink}
                            label="Buka"
                            onClick={() => workspace.openDetail(item)}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">Platform</h2>
            </div>

            <ul className="divide-y divide-border">
              {platformProgress.map(({ key, label, published, total, pct }) => (
                <li
                  key={key}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="inline-flex w-24 shrink-0 items-center gap-2 text-xs font-normal text-foreground">
                    <PlatformIcon platform={key} />
                    <span>{label}</span>
                  </span>
                  <Progress
                    value={pct}
                    aria-label={label}
                    className="min-w-0 flex-1"
                  />
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] font-light text-muted-foreground/75 tabular-nums">
                    {published}/{total}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
