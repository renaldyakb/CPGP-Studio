import React, { useCallback, useMemo, useState } from 'react';
import {
  ContentPlannerItem,
  KANBAN_COLUMNS,
  PLATFORMS,
  PlatformKey,
  WorkflowStatus,
} from '../types/planner';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Droplets,
  Image as ImageIcon,
  Moon,
  Send,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { ItemActionsMenu } from '@/components/ItemActionsMenu';
import { PlatformToggleStrip } from '@/components/planner/PlatformToggleStrip';
import { formatSlotShort, parseTimeToHoursMinutes } from '@/lib/formatSlot';

export interface TableViewProps {
  items: ContentPlannerItem[];
  onSelectItem: (item: ContentPlannerItem) => void;
  onUpdateStatus: (item: ContentPlannerItem, newStatus: WorkflowStatus) => void;
  onTogglePlatform: (item: ContentPlannerItem, platformKey: PlatformKey) => void;
  onEditCaption?: (item: ContentPlannerItem) => void;
  onOpenWatermark?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (item: ContentPlannerItem) => void;
  onCopyText?: (text: string, label: string) => void;
  onOpenExplorer?: (targetPath: string, selectFile?: boolean) => void;
  onResetFilters?: () => void;
  onRescan?: () => void;
}

type SortField = 'code' | 'readiness' | 'status' | 'platforms';
type SortDirection = 'asc' | 'desc';
type QuickSlice = 'all' | 'ready' | 'needs_wm' | 'published';

const STATUS_ORDER: Record<WorkflowStatus, number> = {
  draft_assets: 1,
  needs_watermark: 2,
  ready_to_upload: 3,
  scheduled: 4,
  partially_published: 5,
  published_all: 6,
  on_hold: 7,
};

const STATUS_SHORT_LABEL: Record<WorkflowStatus, string> = {
  draft_assets: 'Draft',
  needs_watermark: 'Watermark',
  ready_to_upload: 'Siap',
  scheduled: 'Terjadwal',
  partially_published: 'Sebagian',
  published_all: 'Selesai',
  on_hold: 'Hold',
};

const SHORT_MONTHS: Record<number, string> = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'Mei',
  6: 'Jun',
  7: 'Jul',
  8: 'Agu',
  9: 'Sep',
  10: 'Okt',
  11: 'Nov',
  12: 'Des',
};

function formatShortDate(item: ContentPlannerItem): string {
  const day = String(item.schedule.dayOfMonth).padStart(2, '0');
  const month =
    SHORT_MONTHS[item.schedule.monthNumber] ||
    item.schedule.monthName.slice(0, 3);
  return `${day} ${month}`;
}

function countPublished(item: ContentPlannerItem): number {
  return PLATFORMS.filter(
    (p) => item.userProperties.platforms[p.key]?.status === 'published'
  ).length;
}

export const TableView: React.FC<TableViewProps> = ({
  items,
  onSelectItem,
  onUpdateStatus,
  onTogglePlatform,
  onEditCaption,
  onOpenWatermark,
  onOpenAutoPost,
  onCopyText,
  onOpenExplorer,
  onResetFilters,
  onRescan,
}) => {
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [quickSlice, setQuickSlice] = useState<QuickSlice>('all');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      );
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
    );
  };

  const getAriaSort = (
    field: SortField
  ): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const handleOpenExplorerSafe = useCallback(
    async (targetPath: string, selectFile = true) => {
      if (onOpenExplorer) {
        onOpenExplorer(targetPath, selectFile);
        return;
      }
      try {
        await fetch('/api/system/open-explorer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath, targetPath, selectFile }),
        });
      } catch {
        // ignore explorer errors
      }
    },
    [onOpenExplorer]
  );

  const getPlatformProgressScore = (item: ContentPlannerItem) => {
    const p = item.userProperties.platforms;
    let score = 0;
    PLATFORMS.forEach((plat) => {
      const st = p[plat.key]?.status;
      if (st === 'published') score += 2;
      else if (st === 'scheduled' || st === 'uploaded_draft') score += 1;
    });
    return score;
  };

  const summary = useMemo(() => {
    const wmReady = items.filter(
      (i) => i.autoMetadata.readiness.hasWmFinal
    ).length;
    const needsWm = items.filter(
      (i) => !i.autoMetadata.readiness.hasWmFinal
    ).length;
    const allPublished = items.filter(
      (item) => countPublished(item) === PLATFORMS.length
    ).length;
    const readyPending = items.filter(
      (item) =>
        item.autoMetadata.readiness.hasWmFinal &&
        countPublished(item) < PLATFORMS.length
    ).length;
    return { wmReady, needsWm, allPublished, readyPending };
  }, [items]);

  const slicedItems = useMemo(() => {
    if (quickSlice === 'all') return items;
    if (quickSlice === 'ready') {
      return items.filter(
        (i) =>
          i.autoMetadata.readiness.hasWmFinal &&
          countPublished(i) < PLATFORMS.length
      );
    }
    if (quickSlice === 'needs_wm') {
      return items.filter((i) => !i.autoMetadata.readiness.hasWmFinal);
    }
    return items.filter((i) => countPublished(i) === PLATFORMS.length);
  }, [items, quickSlice]);

  const sortedItems = useMemo(() => {
    const list = [...slicedItems];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'code') {
        cmp =
          a.schedule.isoDate.localeCompare(b.schedule.isoDate) ||
          a.folderCode.localeCompare(b.folderCode, undefined, {
            numeric: true,
          });
      } else if (sortField === 'readiness') {
        const scoreA =
          (a.autoMetadata.readiness.isUploadReady ? 10 : 0) +
          a.autoMetadata.readiness.completenessScore;
        const scoreB =
          (b.autoMetadata.readiness.isUploadReady ? 10 : 0) +
          b.autoMetadata.readiness.completenessScore;
        cmp = scoreA - scoreB;
      } else if (sortField === 'status') {
        cmp =
          (STATUS_ORDER[a.userProperties.workflowStatus] || 0) -
          (STATUS_ORDER[b.userProperties.workflowStatus] || 0);
      } else if (sortField === 'platforms') {
        cmp = getPlatformProgressScore(a) - getPlatformProgressScore(b);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [slicedItems, sortField, sortDir]);

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Tidak ada baris data yang cocok dengan filter
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tabel kosong karena filter pencarian atau kategori aktif
            menyembunyikan seluruh item. Reset filter untuk menampilkan semua
            folder atau jalankan Scan Folder.
          </p>
          <div className="flex items-center justify-center gap-2 pt-3">
            {onResetFilters && (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                Reset Filter
              </Button>
            )}
            {onRescan && (
              <Button variant="secondary" size="sm" onClick={onRescan}>
                Scan Folder
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact quick-slice & sort bar */}
      <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Filter cepat baris tabel"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              { key: 'all', label: 'Semua', count: items.length },
              { key: 'ready', label: 'Siap Upload', count: summary.readyPending },
              { key: 'needs_wm', label: 'Perlu WM', count: summary.needsWm },
              { key: 'published', label: 'Selesai', count: summary.allPublished },
            ] as const
          ).map((tab) => {
            const active = quickSlice === tab.key;
            return (
              <Button
                key={tab.key}
                type="button"
                size="xs"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => setQuickSlice(tab.key)}
                className="min-h-9 sm:min-h-8"
              >
                <span>{tab.label}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {tab.count}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="lg:hidden">Urutkan:</span>
          <div className="lg:hidden">
            <Select
              value={`${sortField}:${sortDir}`}
              onValueChange={(next) => {
                if (typeof next !== 'string') return;
                const [f, d] = next.split(':') as [SortField, SortDirection];
                if (f && d) {
                  setSortField(f);
                  setSortDir(d);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="Urutkan daftar konten"
                className="min-h-9 w-[165px] text-xs"
              >
                <SelectValue>
                  {sortField === 'code'
                    ? sortDir === 'asc'
                      ? 'Jadwal Terdekat'
                      : 'Jadwal Terjauh'
                    : sortField === 'readiness'
                      ? 'Kesiapan Berkas'
                      : sortField === 'status'
                        ? 'Tahap Status'
                        : 'Progres Platform'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" alignItemWithTrigger={false}>
                <SelectItem value="code:asc" className="text-xs">
                  Jadwal Terdekat
                </SelectItem>
                <SelectItem value="code:desc" className="text-xs">
                  Jadwal Terjauh
                </SelectItem>
                <SelectItem value="readiness:desc" className="text-xs">
                  Siap Upload Dulu
                </SelectItem>
                <SelectItem value="status:asc" className="text-xs">
                  Tahap Status
                </SelectItem>
                <SelectItem value="platforms:desc" className="text-xs">
                  Progres Platform
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="hidden font-mono tabular-nums lg:inline">
            {sortedItems.length} dari {items.length} konten
          </span>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto max-w-sm space-y-2.5">
            <p className="text-xs text-muted-foreground">
              Tidak ada konten pada kategori cepat ini.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setQuickSlice('all')}
            >
              Tampilkan Semua ({items.length})
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table (lg+) */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-[148px]"
                    aria-sort={getAriaSort('code')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort('code')}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span>Kode &amp; Slot</span>
                      {renderSortIcon('code')}
                    </button>
                  </TableHead>

                  <TableHead className="min-w-[260px]">Konten</TableHead>

                  <TableHead
                    className="w-[148px]"
                    aria-sort={getAriaSort('readiness')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort('readiness')}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span>Berkas</span>
                      {renderSortIcon('readiness')}
                    </button>
                  </TableHead>

                  <TableHead
                    className="w-[152px]"
                    aria-sort={getAriaSort('status')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </button>
                  </TableHead>

                  <TableHead
                    className="w-[195px]"
                    aria-sort={getAriaSort('platforms')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort('platforms')}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span>Platform</span>
                      {renderSortIcon('platforms')}
                    </button>
                  </TableHead>

                  <TableHead className="w-[128px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedItems.map((item) => {
                  const { assets, readiness, captionParsed } = item.autoMetadata;
                  const { workflowStatus, customTitle } = item.userProperties;
                  const isDaySlot =
                    parseTimeToHoursMinutes(item.schedule.recommendedTimeWib)
                      .hour < 17;
                  const titleText =
                    customTitle?.trim() ||
                    captionParsed.hookTitle?.trim() ||
                    `Konten ${item.folderCode}`;
                  const publishedCount = countPublished(item);

                  const fileSizeText = assets.wmVideo.exists
                    ? assets.wmVideo.sizeFormatted
                    : assets.rawVideo.exists
                      ? assets.rawVideo.sizeFormatted
                      : '-';

                  return (
                    <TableRow
                      key={item.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      {/* 1. Kode & Slot */}
                      <TableCell className="py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectItem(item)}
                              className="cursor-pointer font-mono text-xs font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {item.folderCode}
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {formatShortDate(item)}
                            </span>
                          </div>
                          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            {isDaySlot ? (
                              <Sun
                                className="h-3 w-3 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <Moon
                                className="h-3 w-3 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <span>{formatSlotShort(item.schedule)}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Konten */}
                      <TableCell className="py-3">
                        <button
                          type="button"
                          onClick={() => onSelectItem(item)}
                          className="group flex w-full cursor-pointer items-start gap-3 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <div className="aspect-[9/16] w-9 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                            {assets.cover.exists && assets.cover.mediaUrl ? (
                              <img
                                src={assets.cover.mediaUrl}
                                alt={`Cover ${item.folderCode}`}
                                width={36}
                                height={64}
                                loading="lazy"
                                decoding="async"
                                className="aspect-[9/16] h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageIcon
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground group-hover:underline">
                              {titleText}
                            </p>
                            {(captionParsed.hashtags.length > 0 ||
                              assets.otherFiles.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {captionParsed.hashtags
                                  .slice(0, 2)
                                  .map((tag) => (
                                    <span
                                      key={tag}
                                      className="font-mono text-[11px] text-muted-foreground"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                {assets.otherFiles.length > 0 && (
                                  <span className="text-[11px] font-medium text-[#991b1b] dark:text-[#fca5a5]">
                                    +{assets.otherFiles.length} file ekstra
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      </TableCell>

                      {/* 3. Berkas */}
                      <TableCell className="py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant={readiness.hasWmFinal ? 'success' : 'warning'}
                            size="xs"
                          >
                            {readiness.hasWmFinal ? (
                              <Check className="mr-0.5 h-3 w-3" aria-hidden="true" />
                            ) : null}
                            {readiness.hasWmFinal ? 'WM Siap' : 'Perlu WM'}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {fileSizeText}
                          </span>
                        </div>
                      </TableCell>

                      {/* 4. Status */}
                      <TableCell className="py-3">
                        <Select
                          value={workflowStatus}
                          onValueChange={(next) => {
                            if (typeof next === 'string' && next.length > 0) {
                              onUpdateStatus(item, next as WorkflowStatus);
                            }
                          }}
                        >
                          <SelectTrigger
                            id={`table-status-${item.id}`}
                            size="sm"
                            aria-label={`Status Kanban ${item.folderCode}`}
                            className="w-[128px] text-xs"
                          >
                            <SelectValue>
                              {STATUS_SHORT_LABEL[workflowStatus]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {KANBAN_COLUMNS.map((col) => (
                              <SelectItem
                                key={col.id}
                                value={col.id}
                                className="text-xs"
                              >
                                {STATUS_SHORT_LABEL[col.id]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 5. Platform */}
                      <TableCell className="py-3">
                        <PlatformToggleStrip
                          item={item}
                          onTogglePlatform={onTogglePlatform}
                        />
                      </TableCell>

                      {/* 6. Aksi */}
                      <TableCell className="py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {!readiness.hasWmFinal && onOpenWatermark ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => onOpenWatermark(item)}
                              aria-label={`Render watermark ${item.folderCode}`}
                              className="min-h-7"
                            >
                              <Droplets className="size-3" aria-hidden="true" />
                              <span>WM</span>
                            </Button>
                          ) : readiness.hasWmFinal &&
                            publishedCount < PLATFORMS.length &&
                            onOpenAutoPost ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => onOpenAutoPost(item)}
                              aria-label={`Buka Auto-Post ${item.folderCode}`}
                              className="min-h-7"
                            >
                              <Send className="size-3" aria-hidden="true" />
                              <span>Post</span>
                            </Button>
                          ) : null}

                          <ItemActionsMenu
                            item={item}
                            onSelectItem={onSelectItem}
                            onEditCaption={onEditCaption}
                            onOpenWatermark={onOpenWatermark}
                            onOpenAutoPost={onOpenAutoPost}
                            onUpdateStatus={onUpdateStatus}
                            onCopyText={onCopyText}
                            onOpenExplorer={handleOpenExplorerSafe}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              <TableFooter>
                <TableRow>
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    Total{' '}
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {sortedItems.length}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    Database Konten
                  </TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    WM Siap{' '}
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {summary.wmReady}/{items.length}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    Perlu WM{' '}
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {summary.needsWm}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-xs text-muted-foreground">
                    Selesai 4/4{' '}
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {summary.allPublished}/{items.length}
                    </span>
                  </TableCell>
                  <TableCell className="py-3" />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Mobile & Tablet Stacked Cards (zero horizontal overflow per R-03) */}
          <div className="grid grid-cols-1 gap-2.5 lg:hidden">
            {sortedItems.map((item) => {
              const { assets, readiness, captionParsed } = item.autoMetadata;
              const { workflowStatus, customTitle } = item.userProperties;
              const isDaySlot =
                parseTimeToHoursMinutes(item.schedule.recommendedTimeWib).hour <
                17;
              const titleText =
                customTitle?.trim() ||
                captionParsed.hookTitle?.trim() ||
                `Konten ${item.folderCode}`;
              const publishedCount = countPublished(item);

              return (
                <Card key={item.id} className="space-y-3 p-3.5">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="aspect-[9/16] w-11 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Buka detail ${item.folderCode}`}
                    >
                      {assets.cover.exists && assets.cover.mediaUrl ? (
                        <img
                          src={assets.cover.mediaUrl}
                          alt={`Cover ${item.folderCode}`}
                          width={44}
                          height={78}
                          loading="lazy"
                          decoding="async"
                          className="aspect-[9/16] h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectItem(item)}
                            className="cursor-pointer font-mono text-xs font-semibold text-foreground hover:underline"
                          >
                            {item.folderCode}
                          </button>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            {isDaySlot ? (
                              <Sun className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Moon className="h-3 w-3" aria-hidden="true" />
                            )}
                            {formatShortDate(item)} ·{' '}
                            {formatSlotShort(item.schedule)}
                          </span>
                        </div>
                        <Badge
                          variant={readiness.hasWmFinal ? 'success' : 'warning'}
                          size="xs"
                        >
                          {readiness.hasWmFinal ? 'WM Siap' : 'Perlu WM'}
                        </Badge>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectItem(item)}
                        className="block w-full cursor-pointer text-left text-xs font-medium leading-snug text-foreground line-clamp-2 hover:underline"
                      >
                        {titleText}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                    <PlatformToggleStrip
                      item={item}
                      onTogglePlatform={onTogglePlatform}
                    />

                    <div className="flex items-center gap-1.5">
                      <Select
                        value={workflowStatus}
                        onValueChange={(next) => {
                          if (typeof next === 'string' && next.length > 0) {
                            onUpdateStatus(item, next as WorkflowStatus);
                          }
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Status Kanban ${item.folderCode}`}
                          className="min-h-10 w-[112px] text-xs"
                        >
                          <SelectValue>
                            {STATUS_SHORT_LABEL[workflowStatus]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="end" alignItemWithTrigger={false}>
                          {KANBAN_COLUMNS.map((col) => (
                            <SelectItem
                              key={col.id}
                              value={col.id}
                              className="text-xs"
                            >
                              {STATUS_SHORT_LABEL[col.id]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {!readiness.hasWmFinal && onOpenWatermark ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => onOpenWatermark(item)}
                          className="min-h-10"
                        >
                          <Droplets className="size-3.5" aria-hidden="true" />
                          <span>WM</span>
                        </Button>
                      ) : readiness.hasWmFinal &&
                        publishedCount < PLATFORMS.length &&
                        onOpenAutoPost ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => onOpenAutoPost(item)}
                          className="min-h-10"
                        >
                          <Send className="size-3.5" aria-hidden="true" />
                          <span>Post</span>
                        </Button>
                      ) : null}

                      <ItemActionsMenu
                        item={item}
                        onSelectItem={onSelectItem}
                        onEditCaption={onEditCaption}
                        onOpenWatermark={onOpenWatermark}
                        onOpenAutoPost={onOpenAutoPost}
                        onUpdateStatus={onUpdateStatus}
                        onCopyText={onCopyText}
                        onOpenExplorer={handleOpenExplorerSafe}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TableView;
