import React, { useCallback, useMemo } from 'react';
import {
  ContentPlannerItem,
  PlatformKey,
  WorkflowStatus,
} from '../types/planner';
import { Sun, Moon, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ItemActionsMenu } from '@/components/ItemActionsMenu';
import { PlatformToggleStrip } from '@/components/planner/PlatformToggleStrip';
import { formatSlotShort, parseTimeToHoursMinutes } from '@/lib/formatSlot';

const STATUS_SHORT_LABEL: Record<WorkflowStatus, string> = {
  draft_assets: 'Draft',
  needs_watermark: 'Watermark',
  ready_to_upload: 'Siap',
  scheduled: 'Terjadwal',
  partially_published: 'Sebagian',
  published_all: 'Selesai',
  on_hold: 'Hold',
};

export interface ScheduleViewProps {
  items: ContentPlannerItem[];
  onSelectItem: (item: ContentPlannerItem) => void;
  onUpdateStatus?: (item: ContentPlannerItem, newStatus: WorkflowStatus) => void;
  onTogglePlatform: (item: ContentPlannerItem, platformKey: PlatformKey) => void;
  onEditCaption?: (item: ContentPlannerItem) => void;
  onOpenWatermark?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (item: ContentPlannerItem) => void;
  onCopyText?: (text: string, label: string) => void;
  onOpenExplorer?: (targetPath: string, selectFile?: boolean) => void;
  onResetFilters?: () => void;
  onRescan?: () => void;
}

interface SlotColumnDef {
  code: string;
  label: string;
  timeWindow: string;
  recommendedTimeWib: string;
}

interface DayScheduleGroup {
  dateKey: string;
  dayOfMonth: number;
  monthName: string;
  year: number;
  title: string;
  slots: Record<string, ContentPlannerItem>;
  extraSlots: ContentPlannerItem[];
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
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

  const activeSlots = useMemo<SlotColumnDef[]>(() => {
    const map = new Map<string, SlotColumnDef>();
    for (const item of items) {
      const code = item.schedule.slotCode || '01';
      if (!map.has(code)) {
        map.set(code, {
          code,
          label: item.schedule.slotLabel || `Slot ${code}`,
          timeWindow:
            item.schedule.slotTimeWindow?.trim() ||
            (item.schedule.recommendedTimeWib
              ? `${item.schedule.recommendedTimeWib.replace(':', '.')} WIB`
              : ''),
          recommendedTimeWib: item.schedule.recommendedTimeWib || '12:00',
        });
      }
    }
    if (map.size === 0) {
      return [
        {
          code: '01',
          label: 'Siang',
          timeWindow: '11.30 - 12.00 WIB',
          recommendedTimeWib: '11:30',
        },
        {
          code: '02',
          label: 'Malam',
          timeWindow: '19.30 - 20.00 WIB',
          recommendedTimeWib: '19:30',
        },
      ];
    }
    return Array.from(map.values()).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true })
    );
  }, [items]);

  const dayGroups = useMemo<DayScheduleGroup[]>(() => {
    const map = new Map<string, DayScheduleGroup>();

    const sorted = [...items].sort((a, b) =>
      a.folderCode.localeCompare(b.folderCode, undefined, { numeric: true })
    );

    sorted.forEach((item) => {
      const { dayOfMonth, monthName, monthNumber, year } = item.schedule;
      const dateKey = `${year}-${String(monthNumber).padStart(2, '0')}-${String(
        dayOfMonth
      ).padStart(2, '0')}`;

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateKey,
          dayOfMonth,
          monthName,
          year,
          title: `${dayOfMonth} ${monthName} ${year}`,
          slots: {},
          extraSlots: [],
        });
      }

      const group = map.get(dateKey)!;
      const code = item.schedule.slotCode || '01';
      if (!group.slots[code]) {
        group.slots[code] = item;
      } else {
        group.extraSlots.push(item);
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );
  }, [items]);

  const slotGridClass =
    activeSlots.length === 1
      ? 'grid-cols-1'
      : activeSlots.length === 2
        ? 'grid-cols-1 lg:grid-cols-2'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  const renderSlotCard = (
    slotDef: SlotColumnDef,
    dayGroup: DayScheduleGroup,
    item?: ContentPlannerItem
  ) => {
    const isDaySlot =
      parseTimeToHoursMinutes(
        item?.schedule.recommendedTimeWib ?? slotDef.recommendedTimeWib
      ).hour < 17;
    const expectedCode = `${String(dayGroup.dayOfMonth).padStart(
      2,
      '0'
    )}.${slotDef.code}`;

    if (!item) {
      return (
        <Card className="border-dashed bg-muted/20 p-4 flex flex-col justify-center gap-1 min-h-[132px]">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {isDaySlot ? (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                Slot {slotDef.code} {slotDef.label}
              </span>
            </div>
            <span className="font-mono text-[11px] font-light text-muted-foreground/75">
              {expectedCode}
            </span>
          </div>
          <p className="text-xs font-light text-muted-foreground/75">
            Folder{' '}
            <code className="font-mono font-normal text-foreground">
              {expectedCode}
            </code>{' '}
            belum tersedia di direktori KONTEN.
          </p>
        </Card>
      );
    }

    const { assets, readiness, captionParsed } = item.autoMetadata;
    const { workflowStatus, customTitle } = item.userProperties;
    const statusLabel = STATUS_SHORT_LABEL[workflowStatus];
    const displayTitle =
      customTitle?.trim() ||
      captionParsed.hookTitle?.trim() ||
      `Konten ${item.folderCode}`;

    const fileMeta = assets.wmVideo.exists
      ? assets.wmVideo.sizeFormatted
      : assets.rawVideo.exists
        ? `Raw ${assets.rawVideo.sizeFormatted}`
        : 'Belum ada video';

    return (
      <Card className="p-3.5 space-y-3">
        {/* Header: Folder Code + Slot + WM Status + Actions Menu */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-semibold text-xs text-foreground shrink-0">
              {item.folderCode}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-light text-muted-foreground/75 shrink-0">
              {isDaySlot ? (
                <Sun className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Moon className="h-3 w-3" aria-hidden="true" />
              )}
              <span>{formatSlotShort(item.schedule)}</span>
            </span>
            <span className="text-[11px] font-light text-muted-foreground/75 truncate hidden sm:inline">
              · {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Badge
              variant={readiness.hasWmFinal ? 'success' : 'warning'}
              size="xs"
            >
              {readiness.hasWmFinal ? 'Siap' : 'No WM'}
            </Badge>
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

        {/* Body: 9:16 Cover + Hook Title */}
        <button
          type="button"
          onClick={() => onSelectItem(item)}
          className="flex items-start gap-3 w-full text-left group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="w-11 aspect-[9/16] rounded-sm border border-border overflow-hidden shrink-0 bg-muted">
            {assets.cover.exists && assets.cover.mediaUrl ? (
              <img
                src={assets.cover.mediaUrl}
                alt={`Cover ${item.folderCode}`}
                width={44}
                height={78}
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

          <div className="flex-1 min-w-0 space-y-1">
            <h4 className="text-[13px] font-medium leading-snug text-foreground line-clamp-2 group-hover:underline">
              {displayTitle}
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-light text-muted-foreground/75">
              <span className="font-mono tabular-nums">{fileMeta}</span>
              {assets.otherFiles.length > 0 && (
                <span className="font-normal text-[#991b1b] dark:text-[#fca5a5]">
                  +{assets.otherFiles.length} file ekstra
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Footer: 4-Platform Toggle Row */}
        <div className="pt-2.5 border-t border-border/60">
          <PlatformToggleStrip
            item={item}
            onTogglePlatform={onTogglePlatform}
          />
        </div>
      </Card>
    );
  };

  if (dayGroups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Tidak ada jadwal harian yang cocok dengan filter
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tidak ditemukan jadwal slot untuk filter aktif saat ini. Reset
            filter untuk menampilkan seluruh tanggal atau jalankan Scan Folder.
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
    <div className="space-y-4">
      {/* Slim Dynamic Slot Header Bar */}
      <div
        className={`grid gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-xs ${slotGridClass} lg:gap-4`}
      >
        {activeSlots.map((slot, index) => {
          const isDaySlot =
            parseTimeToHoursMinutes(slot.recommendedTimeWib).hour < 17;
          return (
            <div
              key={slot.code}
              className={`flex items-center gap-2 min-w-0 ${
                index > 0
                  ? 'border-t border-border/70 pt-1.5 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0'
                  : ''
              }`}
            >
              {isDaySlot ? (
                <Sun
                  className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <Moon
                  className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className="font-medium text-foreground truncate">
                Slot {slot.code} {slot.label}
              </span>
              {slot.timeWindow && (
                <span className="font-mono text-[11px] font-light text-muted-foreground/75 truncate">
                  {slot.timeWindow}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Daily Agenda Groups */}
      <div className="space-y-4">
        {dayGroups.map((group) => {
          const readyDayCount = activeSlots.filter(
            (slot) => group.slots[slot.code]?.autoMetadata.readiness.isUploadReady
          ).length;
          const totalSlotsCount = activeSlots.length;
          const dayPrefix = String(group.dayOfMonth).padStart(2, '0');

          return (
            <section
              key={group.dateKey}
              aria-label={`Jadwal ${group.title}`}
              className="rounded-lg border border-border bg-muted/40 p-4 space-y-3.5"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card font-mono text-xs font-semibold text-foreground">
                    {dayPrefix}
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">
                    {group.title}
                  </h3>
                </div>

                <Badge
                  variant={
                    readyDayCount === totalSlotsCount && totalSlotsCount > 0
                      ? 'success'
                      : readyDayCount > 0
                        ? 'warning'
                        : 'secondary'
                  }
                  size="xs"
                  title={`${readyDayCount} dari ${totalSlotsCount} slot siap upload`}
                  className="font-mono tabular-nums"
                >
                  {readyDayCount}/{totalSlotsCount}
                </Badge>
              </header>

              <div className={`grid ${slotGridClass} gap-4`}>
                {activeSlots.map((slot) => (
                  <React.Fragment key={slot.code}>
                    {renderSlotCard(slot, group, group.slots[slot.code])}
                  </React.Fragment>
                ))}
              </div>

              {group.extraSlots.length > 0 && (
                <div className={`grid ${slotGridClass} gap-4 pt-1`}>
                  {group.extraSlots.map((extra) => {
                    const matchedDef: SlotColumnDef =
                      activeSlots.find(
                        (s) => s.code === extra.schedule.slotCode
                      ) ?? {
                        code: extra.schedule.slotCode || '01',
                        label: extra.schedule.slotLabel || 'Slot',
                        timeWindow: extra.schedule.slotTimeWindow || '',
                        recommendedTimeWib:
                          extra.schedule.recommendedTimeWib || '12:00',
                      };
                    return (
                      <React.Fragment key={extra.id}>
                        {renderSlotCard(matchedDef, group, extra)}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ScheduleView;
