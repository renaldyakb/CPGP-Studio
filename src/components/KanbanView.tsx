import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ContentPlannerItem,
  KANBAN_COLUMNS,
  PlatformKey,
  WorkflowStatus,
} from '../types/planner';
import {
  Image as ImageIcon,
  Sun,
  Moon,
  Columns3,
  Eye,
  GripVertical,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ItemActionsMenu } from '@/components/ItemActionsMenu';
import { PlatformToggleStrip } from '@/components/planner/PlatformToggleStrip';
import { formatSlotShort, parseTimeToHoursMinutes } from '@/lib/formatSlot';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanCommitMeta,
} from '@/components/reui/kanban';

export type KanbanGroupBy = 'status' | 'slot' | 'readiness';

export interface KanbanViewProps {
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
  groupBy?: KanbanGroupBy;
  onGroupByChange?: (mode: KanbanGroupBy) => void;
}

interface InternalColumn {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  slotIcon?: 'sun' | 'moon';
  workflowStatus?: WorkflowStatus;
  items: ContentPlannerItem[];
}

export const KanbanView: React.FC<KanbanViewProps> = ({
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
  groupBy: controlledGroupBy,
  onGroupByChange,
}) => {
  const [internalGroupBy, setInternalGroupBy] =
    useState<KanbanGroupBy>('status');
  const [showAllColumns, setShowAllColumns] = useState<boolean>(false);
  const [dragColumns, setDragColumns] = useState<Record<
    string,
    ContentPlannerItem[]
  > | null>(null);
  const [activeDragItemId, setActiveDragItemId] = useState<string | null>(null);

  const activeGroupBy = controlledGroupBy ?? internalGroupBy;

  useEffect(() => {
    setDragColumns(null);
  }, [items, activeGroupBy]);

  const handleGroupByChange = (mode: string) => {
    const next = mode as KanbanGroupBy;
    setInternalGroupBy(next);
    setDragColumns(null);
    setActiveDragItemId(null);
    onGroupByChange?.(next);
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

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.folderCode.localeCompare(b.folderCode, undefined, { numeric: true })
      ),
    [items]
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, ContentPlannerItem>();
    for (const item of sortedItems) {
      map.set(item.id, item);
    }
    return map;
  }, [sortedItems]);

  const baseStatusColumnsRecord = useMemo<
    Record<string, ContentPlannerItem[]>
  >(() => {
    const record: Record<string, ContentPlannerItem[]> = {};
    for (const col of KANBAN_COLUMNS) {
      record[col.id] = sortedItems.filter(
        (item) => item.userProperties.workflowStatus === col.id
      );
    }
    return record;
  }, [sortedItems]);

  const kanbanColumnsRecord = dragColumns ?? baseStatusColumnsRecord;

  const columns = useMemo<InternalColumn[]>(() => {
    if (activeGroupBy === 'status') {
      return KANBAN_COLUMNS.map((col) => ({
        id: col.id,
        title: col.label,
        shortTitle: col.shortLabel,
        subtitle: col.description,
        workflowStatus: col.id,
        items: baseStatusColumnsRecord[col.id] ?? [],
      }));
    }

    if (activeGroupBy === 'slot') {
      const slotMap = new Map<
        string,
        {
          code: string;
          label: string;
          timeWindow: string;
          recommendedTimeWib: string;
          description: string;
          items: ContentPlannerItem[];
        }
      >();

      for (const item of sortedItems) {
        const code = item.schedule.slotCode || '01';
        let entry = slotMap.get(code);
        if (!entry) {
          entry = {
            code,
            label: item.schedule.slotLabel || `Slot ${code}`,
            timeWindow: item.schedule.slotTimeWindow || '',
            recommendedTimeWib: item.schedule.recommendedTimeWib || '',
            description: item.schedule.slotDescription || '',
            items: [],
          };
          slotMap.set(code, entry);
        }
        entry.items.push(item);
      }

      return Array.from(slotMap.values())
        .sort((a, b) =>
          a.code.localeCompare(b.code, undefined, { numeric: true })
        )
        .map((entry) => {
          const { hour } = parseTimeToHoursMinutes(entry.recommendedTimeWib);
          return {
            id: `slot_${entry.code}`,
            title: entry.timeWindow
              ? `Slot ${entry.code} ${entry.label}: ${entry.timeWindow}`
              : `Slot ${entry.code} ${entry.label}`,
            shortTitle: `Slot ${entry.code} ${entry.label}`,
            subtitle:
              entry.description ||
              `Jadwal upload slot ${entry.code}${
                entry.timeWindow ? ` (${entry.timeWindow})` : ''
              }.`,
            slotIcon: hour < 17 ? ('sun' as const) : ('moon' as const),
            items: entry.items,
          };
        });
    }

    const readyUploadItems = sortedItems.filter(
      (item) => item.autoMetadata.readiness.isUploadReady
    );
    const missingWmOnlyItems = sortedItems.filter(
      (item) =>
        !item.autoMetadata.readiness.isUploadReady &&
        item.autoMetadata.readiness.hasRawVideo &&
        item.autoMetadata.readiness.hasCover &&
        item.autoMetadata.readiness.hasCaption &&
        !item.autoMetadata.readiness.hasWmFinal
    );
    const incompleteItems = sortedItems.filter(
      (item) =>
        !item.autoMetadata.readiness.isUploadReady &&
        !(
          item.autoMetadata.readiness.hasRawVideo &&
          item.autoMetadata.readiness.hasCover &&
          item.autoMetadata.readiness.hasCaption &&
          !item.autoMetadata.readiness.hasWmFinal
        )
    );

    return [
      {
        id: 'readiness_ready',
        title: 'Siap Upload',
        shortTitle: 'WM Siap',
        subtitle:
          'File wm_final, cover, dan caption.txt sudah lengkap di folder konten.',
        items: readyUploadItems,
      },
      {
        id: 'readiness_no_wm',
        title: 'Menunggu Watermark',
        shortTitle: 'Belum WM',
        subtitle:
          'Video raw, cover, dan caption tersedia, tinggal render wm_final.mp4.',
        items: missingWmOnlyItems,
      },
      {
        id: 'readiness_incomplete',
        title: 'Aset Dasar Kurang',
        shortTitle: 'Aset Kurang',
        subtitle:
          'Salah satu dari cover, caption.txt, atau video dasar belum tersedia.',
        items: incompleteItems,
      },
    ];
  }, [sortedItems, activeGroupBy, baseStatusColumnsRecord]);

  const { visibleColumns, hiddenEmptyColumns } = useMemo(() => {
    if (activeGroupBy !== 'status' || showAllColumns) {
      return {
        visibleColumns: columns,
        hiddenEmptyColumns: [] as InternalColumn[],
      };
    }
    const nonEmpty = columns.filter((col) => col.items.length > 0);
    const empty = columns.filter((col) => col.items.length === 0);
    if (nonEmpty.length === 0) {
      return {
        visibleColumns: columns,
        hiddenEmptyColumns: [] as InternalColumn[],
      };
    }
    return { visibleColumns: nonEmpty, hiddenEmptyColumns: empty };
  }, [columns, activeGroupBy, showAllColumns]);

  const getItemValue = useCallback((item: ContentPlannerItem) => item.id, []);

  const handleKanbanCommit = useCallback(
    (
      finalValue: Record<string, ContentPlannerItem[]>,
      meta: KanbanCommitMeta<ContentPlannerItem>
    ) => {
      if (meta.kind !== 'item') return;
      if (meta.overContainer === meta.activeContainer) return;

      const targetStatus = meta.overContainer as WorkflowStatus;
      const activeId = String(meta.event.active.id);
      const movedItem =
        finalValue[targetStatus]?.find((item) => item.id === activeId) ??
        itemsById.get(activeId);

      if (
        movedItem &&
        movedItem.userProperties.workflowStatus !== targetStatus
      ) {
        setDragColumns(finalValue);
        onUpdateStatus(movedItem, targetStatus);
      }
    },
    [itemsById, onUpdateStatus]
  );

  const renderCard = (
    item: ContentPlannerItem,
    options: { isDraggable: boolean; isOverlay?: boolean }
  ) => {
    const { assets, readiness, captionParsed } = item.autoMetadata;
    const { customTitle } = item.userProperties;
    const displayTitle =
      customTitle?.trim() ||
      captionParsed.hookTitle?.trim() ||
      `Konten ${item.folderCode}`;

    return (
      <Card
        className={`p-3.5 space-y-3 transition-colors ${
          options.isOverlay ? 'shadow-lg ring-1 ring-ring/50 bg-card' : ''
        }`}
      >
        {/* Zone 1: Top Meta */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {options.isDraggable &&
              (options.isOverlay ? (
                <span
                  className="inline-flex items-center justify-center rounded-sm p-0.5 text-foreground shrink-0"
                  aria-hidden="true"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              ) : (
                <KanbanItemHandle
                  render={<button type="button" />}
                  aria-label={`Seret kartu ${item.folderCode} untuk memindah status`}
                  className="inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring shrink-0"
                >
                  <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                </KanbanItemHandle>
              ))}
            <span className="font-mono font-semibold text-xs text-foreground shrink-0">
              {item.folderCode}
            </span>
            <span className="text-[11px] text-muted-foreground truncate">
              {formatSlotShort(item.schedule)}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Badge
              variant={readiness.hasWmFinal ? 'success' : 'warning'}
              size="xs"
            >
              {readiness.hasWmFinal ? 'WM Siap' : 'Belum WM'}
            </Badge>
            {options.isOverlay ? (
              <span
                className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground"
                aria-hidden="true"
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
            ) : (
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
            )}
          </div>
        </div>

        {/* Zone 2: Visual + Hook */}
        <button
          type="button"
          onClick={() => !options.isOverlay && onSelectItem(item)}
          className="flex items-start gap-3 w-full text-left group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="w-11 aspect-[9/16] rounded-sm border border-border overflow-hidden shrink-0 bg-muted">
            {assets.cover.exists && assets.cover.mediaUrl ? (
              <img
                src={assets.cover.mediaUrl}
                alt={`Cover konten ${item.folderCode}`}
                width={44}
                height={78}
                loading="lazy"
                className="h-full w-full aspect-[9/16] object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <h4 className="text-[13px] font-medium leading-snug text-foreground line-clamp-2 group-hover:underline">
              {displayTitle}
            </h4>
            {assets.otherFiles.length > 0 && (
              <p className="text-[11px] text-[#991b1b] dark:text-[#fca5a5]">
                +{assets.otherFiles.length} file ekstra
              </p>
            )}
          </div>
        </button>

        {/* Zone 3: Footer Platform Strip */}
        <div className="pt-2.5 border-t border-border/60">
          <PlatformToggleStrip
            item={item}
            onTogglePlatform={onTogglePlatform}
            disabled={options.isOverlay}
          />
        </div>
      </Card>
    );
  };

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Tidak ada konten yang cocok dengan filter aktif
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tidak ditemukan folder konten untuk kriteria pencarian atau filter
            saat ini. Reset filter untuk melihat seluruh jadwal atau jalankan
            Scan Folder.
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

  const isHorizontalStatusBoard =
    activeGroupBy === 'status' &&
    (showAllColumns || visibleColumns.length > 3);

  const boardLayoutClass = isHorizontalStatusBoard
    ? 'flex gap-3.5 overflow-x-auto pb-4 items-start sm:grid-cols-none auto-rows-auto'
    : visibleColumns.length === 1
    ? 'grid grid-cols-1 sm:grid-cols-1 gap-4 items-start auto-rows-auto'
    : visibleColumns.length === 2
    ? 'grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-4 items-start auto-rows-auto'
    : 'grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start auto-rows-auto';

  const useTwoColCardGrid =
    !isHorizontalStatusBoard && visibleColumns.length <= 2;

  return (
    <div className="space-y-4">
      {/* Top Bar: Group-By Tabs + Column Focus Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
        <Tabs value={activeGroupBy} onValueChange={handleGroupByChange}>
          <TabsList aria-label="Pengelompokan papan Kanban">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="slot">Jam Upload</TabsTrigger>
            <TabsTrigger value="readiness">Kesiapan File</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeGroupBy === 'status' && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={showAllColumns ? 'secondary' : 'outline'}
                  size="sm"
                  aria-pressed={showAllColumns}
                  aria-label={
                    showAllColumns
                      ? 'Sembunyikan kolom kosong (fokus kolom terisi)'
                      : 'Tampilkan semua 7 kolom status Kanban'
                  }
                  onClick={() => setShowAllColumns((prev) => !prev)}
                  className="gap-1.5"
                />
              }
            >
              {showAllColumns ? (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{showAllColumns ? '7 Kolom' : 'Kolom Aktif'}</span>
              <Badge
                variant="outline"
                size="xs"
                className="font-mono tabular-nums"
              >
                {visibleColumns.length}/{columns.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              {showAllColumns
                ? 'Sembunyikan kolom kosong agar fokus pada kolom terisi'
                : 'Tampilkan semua 7 kolom status Kanban'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {activeGroupBy === 'status' ? (
        <Kanban
          value={kanbanColumnsRecord}
          onValueChange={setDragColumns}
          onValueCommit={handleKanbanCommit}
          getItemValue={getItemValue}
          restoreOnCancel
          onDragStart={(event) => setActiveDragItemId(String(event.active.id))}
          onDragEnd={() => setActiveDragItemId(null)}
          onDragCancel={() => {
            setActiveDragItemId(null);
            setDragColumns(null);
          }}
          className="space-y-4"
        >
          {/* Compact Drop-Target Pills for Hidden Empty Columns */}
          {!showAllColumns && hiddenEmptyColumns.length > 0 && (
            <div
              aria-label="Target pindah status kolom kosong"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-2"
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {activeDragItemId
                  ? 'Lepaskan kartu ke status:'
                  : 'Kolom kosong (tarik kartu ke sini):'}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {hiddenEmptyColumns.map((col) => {
                  const pillItems = kanbanColumnsRecord[col.id] ?? [];
                  const isTargeted = pillItems.length > 0;
                  return (
                    <KanbanColumn
                      key={col.id}
                      value={col.id}
                      className={`inline-flex flex-row items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                        isTargeted
                          ? 'border-ring bg-card text-foreground ring-2 ring-ring font-medium'
                          : activeDragItemId
                          ? 'border-foreground/30 border-dashed bg-card text-foreground'
                          : 'border-border bg-card/70 text-muted-foreground'
                      }`}
                    >
                      <span>{col.shortTitle}</span>
                      <span className="font-mono text-[10px] tabular-nums opacity-75">
                        {pillItems.length}
                      </span>
                      <KanbanColumnContent
                        value={col.id}
                        className="flex-row items-center gap-1"
                      >
                        {pillItems.map((item) => (
                          <KanbanItem
                            key={item.id}
                            value={item.id}
                            className="font-mono text-[10px] font-semibold text-foreground"
                          >
                            {item.folderCode}
                          </KanbanItem>
                        ))}
                      </KanbanColumnContent>
                    </KanbanColumn>
                  );
                })}
              </div>
            </div>
          )}

          {/* ReUI Kanban Board */}
          <KanbanBoard className={boardLayoutClass}>
            {visibleColumns.map((column) => {
              const columnItems = kanbanColumnsRecord[column.id] ?? [];
              const columnWidthClass = isHorizontalStatusBoard
                ? 'w-[310px] min-w-[310px] max-w-[310px] shrink-0'
                : 'w-full';

              return (
                <KanbanColumn
                  key={column.id}
                  value={column.id}
                  aria-label={column.title}
                  className={`${columnWidthClass} bg-muted/50 border border-border rounded-lg p-3.5 flex flex-col gap-3`}
                >
                  <header className="space-y-1 border-b border-border pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-foreground truncate">
                        {column.title}
                      </h3>
                      <Badge
                        variant="outline"
                        size="xs"
                        className="font-mono shrink-0 tabular-nums"
                      >
                        {columnItems.length}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {column.subtitle}
                    </p>
                  </header>

                  <KanbanColumnContent
                    value={column.id}
                    className={
                      useTwoColCardGrid
                        ? 'grid grid-cols-1 xl:grid-cols-2 gap-3'
                        : 'flex flex-col gap-3'
                    }
                  >
                    {columnItems.length === 0 ? (
                      <div className="col-span-full rounded-md border border-dashed border-border bg-card/50 py-8 px-3 text-center">
                        <p className="text-xs text-muted-foreground">
                          Belum ada konten di {column.shortTitle}.
                        </p>
                      </div>
                    ) : (
                      columnItems.map((item) => (
                        <KanbanItem key={item.id} value={item.id}>
                          {renderCard(item, { isDraggable: true })}
                        </KanbanItem>
                      ))
                    )}
                  </KanbanColumnContent>
                </KanbanColumn>
              );
            })}
          </KanbanBoard>

          <KanbanOverlay>
            {({ value, variant }) => {
              if (variant !== 'item') return null;
              const activeItem = itemsById.get(String(value));
              if (!activeItem) return null;
              return renderCard(activeItem, {
                isDraggable: true,
                isOverlay: true,
              });
            }}
          </KanbanOverlay>
        </Kanban>
      ) : (
        /* Static Board for Slot & Readiness Grouping */
        <div className={boardLayoutClass}>
          {visibleColumns.map((column) => (
            <section
              key={column.id}
              aria-label={column.title}
              className="w-full bg-muted/50 border border-border rounded-lg p-3.5 flex flex-col gap-3"
            >
              <header className="space-y-1 border-b border-border pb-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {column.slotIcon === 'sun' && (
                      <Sun
                        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {column.slotIcon === 'moon' && (
                      <Moon
                        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <h3 className="text-xs font-semibold text-foreground truncate">
                      {column.title}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    size="xs"
                    className="font-mono shrink-0 tabular-nums"
                  >
                    {column.items.length}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {column.subtitle}
                </p>
              </header>

              <div
                className={
                  useTwoColCardGrid
                    ? 'grid grid-cols-1 xl:grid-cols-2 gap-3'
                    : 'flex flex-col gap-3'
                }
              >
                {column.items.length === 0 ? (
                  <div className="col-span-full rounded-md border border-dashed border-border bg-card/50 py-8 px-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      Belum ada konten di {column.shortTitle}.
                    </p>
                  </div>
                ) : (
                  column.items.map((item) => (
                    <div key={item.id}>
                      {renderCard(item, { isDraggable: false })}
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default KanbanView;
