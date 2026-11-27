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
  Image as ImageIcon,
  Sun,
  Moon,
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

  const sortedItems = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'code') {
        cmp = a.folderCode.localeCompare(b.folderCode, undefined, {
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
  }, [items, sortField, sortDir]);

  const summary = useMemo(() => {
    const wmReady = items.filter(
      (i) => i.autoMetadata.readiness.hasWmFinal
    ).length;
    const allPublished = items.filter((item) =>
      PLATFORMS.every(
        (p) => item.userProperties.platforms[p.key]?.status === 'published'
      )
    ).length;
    return { wmReady, allPublished };
  }, [items]);

  if (sortedItems.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Tidak ada baris data yang cocok dengan filter
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tabel kosong karena filter pencarian atau kategori aktif
            menyembunyikan seluruh item. Reset filter untuk menampilkan semua
            folder atau jalankan Scan Folder.
          </p>
          <div className="pt-3 flex items-center justify-center gap-2">
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
    <Table className="min-w-[880px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[145px]">
            <button
              type="button"
              onClick={() => handleSort('code')}
              className="inline-flex items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span>Kode & Slot</span>
              {renderSortIcon('code')}
            </button>
          </TableHead>

          <TableHead className="min-w-[260px]">Konten</TableHead>

          <TableHead className="w-[155px]">
            <button
              type="button"
              onClick={() => handleSort('readiness')}
              className="inline-flex items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span>Berkas</span>
              {renderSortIcon('readiness')}
            </button>
          </TableHead>

          <TableHead className="w-[165px]">
            <button
              type="button"
              onClick={() => handleSort('status')}
              className="inline-flex items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span>Status</span>
              {renderSortIcon('status')}
            </button>
          </TableHead>

          <TableHead className="w-[195px]">
            <button
              type="button"
              onClick={() => handleSort('platforms')}
              className="inline-flex items-center gap-1.5 text-left font-semibold text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span>Platform</span>
              {renderSortIcon('platforms')}
            </button>
          </TableHead>

          <TableHead className="w-[64px] text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {sortedItems.map((item) => {
          const { assets, readiness, captionParsed } = item.autoMetadata;
          const { workflowStatus, customTitle } = item.userProperties;
          const isDaySlot =
            parseTimeToHoursMinutes(item.schedule.recommendedTimeWib).hour < 17;
          const titleText =
            customTitle?.trim() ||
            captionParsed.hookTitle?.trim() ||
            `Konten ${item.folderCode}`;

          const fileSizeText = assets.wmVideo.exists
            ? assets.wmVideo.sizeFormatted
            : assets.rawVideo.exists
            ? assets.rawVideo.sizeFormatted
            : '-';

          return (
            <TableRow key={item.id}>
              {/* 1. Kode & Slot */}
              <TableCell className="py-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="font-mono text-xs font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {item.folderCode}
                    </button>
                    <span className="text-[11px] font-light text-muted-foreground/75">
                      {formatShortDate(item)}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[11px] font-light text-muted-foreground/75">
                    {isDaySlot ? (
                      <Sun className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <Moon className="h-3 w-3 shrink-0" aria-hidden="true" />
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
                  className="flex items-start gap-3 text-left w-full group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="w-9 aspect-[9/16] rounded-sm overflow-hidden bg-muted border border-border shrink-0">
                    {assets.cover.exists && assets.cover.mediaUrl ? (
                      <img
                        src={assets.cover.mediaUrl}
                        alt={`Cover ${item.folderCode}`}
                        width={36}
                        height={64}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full aspect-[9/16] object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-medium text-foreground group-hover:underline line-clamp-2 leading-snug">
                      {titleText}
                    </p>
                    {(captionParsed.hashtags.length > 0 ||
                      assets.otherFiles.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {captionParsed.hashtags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="font-mono text-[10px] font-light text-muted-foreground/75"
                          >
                            {tag}
                          </span>
                        ))}
                        {assets.otherFiles.length > 0 && (
                          <span className="text-[10px] text-[#991b1b] dark:text-[#fca5a5]">
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
                    {readiness.hasWmFinal ? 'Siap' : 'No WM'}
                  </Badge>
                  <span className="font-mono text-[11px] font-light text-muted-foreground/75 tabular-nums">
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
                    className="w-[126px] text-xs"
                  >
                    <SelectValue>{STATUS_SHORT_LABEL[workflowStatus]}</SelectValue>
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
                <div className="inline-flex justify-end">
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
          <TableCell className="py-3 text-xs font-light text-muted-foreground/75">
            Total{' '}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {items.length}
            </span>
          </TableCell>
          <TableCell className="py-3 text-xs font-light text-muted-foreground/75">
            Database Konten
          </TableCell>
          <TableCell className="py-3 text-xs font-light text-muted-foreground/75">
            Siap{' '}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {summary.wmReady}/{items.length}
            </span>
          </TableCell>
          <TableCell className="py-3 text-xs font-light text-muted-foreground/75">
            -
          </TableCell>
          <TableCell className="py-3 text-xs font-light text-muted-foreground/75">
            Selesai{' '}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {summary.allPublished}/{items.length}
            </span>
          </TableCell>
          <TableCell className="py-3" />
        </TableRow>
      </TableFooter>
    </Table>
  );
};

export default TableView;
