import React, { useCallback, useMemo, useState } from 'react';
import { id as idLocale } from 'date-fns/locale/id';
import {
  Check,
  CheckCheck,
  Clock,
  Droplets,
  Image as ImageIcon,
  Send,
} from 'lucide-react';
import {
  ContentPlannerItem,
  PLATFORMS,
  PlatformKey,
  WorkflowStatus,
} from '../types/planner';
import {
  EventCalendar,
  type EventCalendarRenderEventProps,
} from '@/components/reui/event-calendar/event-calendar';
import { EventCalendarNav } from '@/components/reui/event-calendar/event-calendar-nav';
import { EventCalendarContent } from '@/components/reui/event-calendar/event-calendar-content';
import type {
  CalendarEvent,
  CalendarView as ReuiCalendarView,
  EventCalendarInteractions,
  EventCalendarOccurrence,
} from '@/components/reui/event-calendar/event-calendar-types';
import type { EventCalendarI18nOverrides } from '@/components/reui/event-calendar/event-calendar-i18n';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { parseTimeToHoursMinutes } from '@/lib/formatSlot';

export interface CalendarViewProps {
  items: ContentPlannerItem[];
  onSelectItem: (item: ContentPlannerItem) => void;
  onEditCaption?: (item: ContentPlannerItem) => void;
  onOpenWatermark?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (item: ContentPlannerItem) => void;
  onUpdateStatus?: (item: ContentPlannerItem, newStatus: WorkflowStatus) => void;
  onTogglePlatform?: (item: ContentPlannerItem, platformKey: PlatformKey) => void;
  onCopyText?: (text: string, label: string) => void;
  onOpenExplorer?: (targetPath: string, selectFile?: boolean) => void;
  onResetFilters?: () => void;
  onRescan?: () => void;
}

type CalendarStatusFilter =
  | 'all'
  | 'published_all'
  | 'published_partial'
  | 'ready'
  | 'needs_wm'
  | 'hold';

const CALENDAR_VIEWS: ReuiCalendarView[] = ['month', 'week', 'day', 'agenda'];

const CALENDAR_INTERACTIONS: EventCalendarInteractions = {
  drag: false,
  resize: false,
  selectSlot: false,
};

const CALENDAR_I18N: EventCalendarI18nOverrides = {
  labels: {
    today: 'Hari Ini',
    previous: 'Sebelumnya',
    next: 'Berikutnya',
    selectView: 'Pilih Tampilan',
    noEvents: 'Tidak ada jadwal konten pada rentang ini.',
    more: (count) => `+${count} lainnya`,
  },
  viewNames: {
    month: 'Bulan',
    week: 'Minggu',
    day: 'Hari',
    agenda: 'Agenda',
  },
  formats: {
    eventTime: 'HH.mm',
    timeGutter: 'HH.mm',
    timeGutterMinute: 'HH.mm',
  },
};

function getPublishStats(item: ContentPlannerItem): {
  publishedCount: number;
  scheduledCount: number;
  publishedLabels: string[];
} {
  let publishedCount = 0;
  let scheduledCount = 0;
  const publishedLabels: string[] = [];

  for (const key of PLATFORM_ORDER) {
    const st = item.userProperties.platforms[key]?.status;
    if (st === 'published') {
      publishedCount += 1;
      publishedLabels.push(PLATFORM_META[key].label);
    } else if (st === 'scheduled' || st === 'uploaded_draft') {
      scheduledCount += 1;
    }
  }
  return { publishedCount, scheduledCount, publishedLabels };
}

function classifyCalendarStatus(
  item: ContentPlannerItem
): Exclude<CalendarStatusFilter, 'all'> {
  const { workflowStatus } = item.userProperties;
  const { isUploadReady, hasWmFinal, hasRawVideo } = item.autoMetadata.readiness;
  const { publishedCount, scheduledCount } = getPublishStats(item);

  if (workflowStatus === 'published_all' || publishedCount === PLATFORMS.length) {
    return 'published_all';
  }
  if (
    publishedCount > 0 ||
    scheduledCount > 0 ||
    workflowStatus === 'partially_published' ||
    workflowStatus === 'scheduled'
  ) {
    return 'published_partial';
  }
  if (workflowStatus === 'on_hold' || workflowStatus === 'draft_assets') {
    return 'hold';
  }
  if (isUploadReady || hasWmFinal) {
    return 'ready';
  }
  if (workflowStatus === 'needs_watermark' || (!hasWmFinal && hasRawVideo)) {
    return 'needs_wm';
  }
  return 'hold';
}

function getEventColor(item: ContentPlannerItem): string {
  const bucket = classifyCalendarStatus(item);
  if (bucket === 'published_all') return '#166534';
  if (bucket === 'published_partial') return '#075985';
  if (bucket === 'ready') return '#7F1D1D';
  if (bucket === 'needs_wm') return '#b45309';
  return '#991b1b';
}

function getSlotTimes(item: ContentPlannerItem): {
  start: Date;
  end: Date;
  shortTime: string;
} {
  const { year, monthNumber, dayOfMonth, recommendedTimeWib } = item.schedule;
  const monthIdx = Math.max(0, (monthNumber || 1) - 1);
  const { hour, minute } = parseTimeToHoursMinutes(recommendedTimeWib);
  const start = new Date(year, monthIdx, dayOfMonth, hour, minute, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const shortTime = `${String(hour).padStart(2, '0')}.${String(minute).padStart(
    2,
    '0'
  )}`;
  return { start, end, shortTime };
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  items,
  onSelectItem,
  onOpenWatermark,
  onOpenAutoPost,
  onResetFilters,
  onRescan,
}) => {
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>('all');

  const counts = useMemo(() => {
    let publishedAll = 0;
    let publishedPartial = 0;
    let ready = 0;
    let needsWm = 0;
    let hold = 0;
    for (const item of items) {
      const bucket = classifyCalendarStatus(item);
      if (bucket === 'published_all') publishedAll += 1;
      else if (bucket === 'published_partial') publishedPartial += 1;
      else if (bucket === 'ready') ready += 1;
      else if (bucket === 'needs_wm') needsWm += 1;
      else hold += 1;
    }
    return { publishedAll, publishedPartial, ready, needsWm, hold };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter((item) => classifyCalendarStatus(item) === statusFilter);
  }, [items, statusFilter]);

  const events = useMemo<CalendarEvent<ContentPlannerItem>[]>(() => {
    return visibleItems.map((item) => {
      const { start, end } = getSlotTimes(item);
      const hookTitle =
        item.userProperties.customTitle?.trim() ||
        item.autoMetadata.captionParsed.hookTitle?.trim() ||
        item.folderCode;

      return {
        id: item.id,
        title: `${item.folderCode} ${hookTitle}`,
        start,
        end,
        color: getEventColor(item),
        data: item,
        readOnly: true,
      };
    });
  }, [visibleItems]);

  const initialDate = useMemo<Date>(() => {
    if (items.length === 0) return new Date();
    const firstTimes = items.map((item) => getSlotTimes(item).start);
    let earliest = firstTimes[0];
    for (let i = 1; i < firstTimes.length; i += 1) {
      if (firstTimes[i].getTime() < earliest.getTime()) {
        earliest = firstTimes[i];
      }
    }
    return new Date(
      earliest.getFullYear(),
      earliest.getMonth(),
      earliest.getDate()
    );
  }, [items]);

  const renderEvent = useCallback(
    ({
      occurrence,
    }: EventCalendarRenderEventProps<ContentPlannerItem>) => {
      const item = occurrence.event.data;
      if (!item) {
        return (
          <span className="truncate font-medium text-foreground">
            {occurrence.event.title}
          </span>
        );
      }

      const { shortTime } = getSlotTimes(item);
      const hookTitle =
        item.userProperties.customTitle?.trim() ||
        item.autoMetadata.captionParsed.hookTitle?.trim() ||
        item.folderCode;
      const bucket = classifyCalendarStatus(item);
      const { publishedCount, scheduledCount, publishedLabels } =
        getPublishStats(item);

      const titleTooltip =
        bucket === 'published_all'
          ? `${item.folderCode}: Sudah terpublish di 4/4 platform`
          : publishedCount > 0
            ? `${item.folderCode}: Terpublish ${publishedCount}/4 (${publishedLabels.join(', ')})`
            : scheduledCount > 0
              ? `${item.folderCode}: Terjadwal di ${scheduledCount} platform`
              : bucket === 'ready'
                ? `${item.folderCode}: WM siap upload (0/4 tayang)`
                : `${item.folderCode}: Menunggu watermark`;

      return (
        <div
          title={titleTooltip}
          className="flex w-full min-w-0 items-center gap-1 text-foreground"
        >
          {bucket === 'published_all' ? (
            <CheckCheck
              className="size-3 shrink-0 text-[#166534] dark:text-[#86efac]"
              aria-hidden="true"
            />
          ) : bucket === 'published_partial' ? (
            publishedCount > 0 ? (
              <Check
                className="size-3 shrink-0 text-[#075985] dark:text-[#7dd3fc]"
                aria-hidden="true"
              />
            ) : (
              <Clock
                className="size-3 shrink-0 text-[#075985] dark:text-[#7dd3fc]"
                aria-hidden="true"
              />
            )
          ) : (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-(--ec-event-color)"
            />
          )}

          <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground">
            {item.folderCode}
          </span>
          <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground md:inline">
            {shortTime}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
            {hookTitle}
          </span>

          {bucket === 'published_all' ? (
            <span className="shrink-0 rounded bg-[#dcfce7] px-1 font-mono text-[10px] font-semibold text-[#166534] dark:bg-[#052e16] dark:text-[#86efac]">
              4/4
            </span>
          ) : publishedCount > 0 ? (
            <span className="shrink-0 rounded bg-[#e0f2fe] px-1 font-mono text-[10px] font-semibold text-[#075985] dark:bg-[#082f49] dark:text-[#7dd3fc]">
              {publishedCount}/4
            </span>
          ) : scheduledCount > 0 ? (
            <span className="shrink-0 rounded bg-[#e0f2fe] px-1 font-mono text-[10px] font-semibold text-[#075985] dark:bg-[#082f49] dark:text-[#7dd3fc]">
              Jdw
            </span>
          ) : null}
        </div>
      );
    },
    []
  );

  const renderAgendaEvent = useCallback(
    ({
      occurrence,
    }: EventCalendarRenderEventProps<ContentPlannerItem>) => {
      const item = occurrence.event.data;
      if (!item) {
        return (
          <span className="truncate font-medium text-foreground">
            {occurrence.event.title}
          </span>
        );
      }

      const { assets, readiness } = item.autoMetadata;
      const hookTitle =
        item.userProperties.customTitle?.trim() ||
        item.autoMetadata.captionParsed.hookTitle?.trim() ||
        item.folderCode;
      const { shortTime } = getSlotTimes(item);
      const timeWindow =
        item.schedule.slotTimeWindow?.trim() || `${shortTime} WIB`;
      const bucket = classifyCalendarStatus(item);
      const { publishedCount, scheduledCount } = getPublishStats(item);

      const statusBadge =
        bucket === 'published_all'
          ? { label: 'Terpublish 4/4', variant: 'success' as const }
          : bucket === 'published_partial'
            ? publishedCount > 0
              ? {
                  label: `Terpublish ${publishedCount}/4`,
                  variant: 'info' as const,
                }
              : {
                  label: `Terjadwal (${scheduledCount})`,
                  variant: 'info' as const,
                }
            : bucket === 'ready'
              ? { label: 'Siap Upload', variant: 'outline' as const }
              : bucket === 'needs_wm'
                ? { label: 'Perlu WM', variant: 'warning' as const }
                : { label: 'Hold / Draft', variant: 'destructive' as const };

      return (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 py-0.5 text-foreground sm:flex-nowrap">
          <div className="aspect-[9/16] w-7 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
            {assets.cover.exists && assets.cover.mediaUrl ? (
              <img
                src={assets.cover.mediaUrl}
                alt={`Cover ${item.folderCode}`}
                width={28}
                height={50}
                loading="lazy"
                decoding="async"
                className="aspect-[9/16] h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-3 w-3" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">
                {item.folderCode}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {timeWindow}
              </span>
              <Badge variant={statusBadge.variant} size="xs">
                {statusBadge.label}
              </Badge>
            </div>
            <p className="truncate text-xs font-medium text-foreground">
              {hookTitle}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {PLATFORM_ORDER.map((key) => {
                const pStatus = item.userProperties.platforms[key]?.status;
                const isPublished = pStatus === 'published';
                const isScheduled =
                  pStatus === 'scheduled' || pStatus === 'uploaded_draft';
                return (
                  <span
                    key={key}
                    title={`${PLATFORM_META[key].label}: ${
                      isPublished
                        ? 'Sudah Terpublish'
                        : isScheduled
                          ? 'Terjadwal / Draft'
                          : 'Belum Publish'
                    }`}
                    className={
                      isPublished
                        ? 'inline-flex h-5 items-center gap-0.5 rounded border border-[#86efac] bg-[#dcfce7] px-1 text-[10px] font-medium text-[#166534] dark:border-[#166534] dark:bg-[#052e16] dark:text-[#86efac]'
                        : isScheduled
                          ? 'inline-flex h-5 items-center gap-0.5 rounded border border-[#7dd3fc] bg-[#e0f2fe] px-1 text-[10px] font-medium text-[#075985] dark:border-[#0369a1] dark:bg-[#082f49] dark:text-[#7dd3fc]'
                          : 'inline-flex h-5 items-center gap-0.5 rounded border border-border bg-card px-1 text-[10px] text-muted-foreground'
                    }
                  >
                    <PlatformIcon platform={key} size={11} />
                    {isPublished ? (
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    ) : isScheduled ? (
                      <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {!readiness.hasWmFinal && onOpenWatermark ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onOpenWatermark(item)}
                className="min-h-8"
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
                className="min-h-8"
              >
                <Send className="size-3" aria-hidden="true" />
                <span>Post</span>
              </Button>
            ) : null}
          </div>
        </div>
      );
    },
    [onOpenAutoPost, onOpenWatermark]
  );

  const handleEventClick = useCallback(
    (occurrence: EventCalendarOccurrence<ContentPlannerItem>) => {
      if (occurrence.event.data) {
        onSelectItem(occurrence.event.data);
      }
    },
    [onSelectItem]
  );

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Tidak ada jadwal konten yang cocok dengan filter
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tidak ditemukan folder jadwal DD.SLOT untuk filter aktif saat ini.
            Reset filter untuk menampilkan seluruh jadwal atau jalankan Scan
            Folder.
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
      {/* Interactive publish + WM status filter & legend bar */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 xl:flex-row xl:items-center xl:justify-between">
        <div
          role="group"
          aria-label="Filter status kalender"
          className="flex flex-wrap items-center gap-1.5"
        >
          {(
            [
              { key: 'all', label: 'Semua', count: items.length, dot: null },
              {
                key: 'published_all',
                label: 'Terpublish 4/4',
                count: counts.publishedAll,
                dot: 'bg-[#166534]',
              },
              {
                key: 'published_partial',
                label: 'Sebagian / Jadwal',
                count: counts.publishedPartial,
                dot: 'bg-[#075985]',
              },
              {
                key: 'ready',
                label: 'Siap Upload',
                count: counts.ready,
                dot: 'bg-[#7F1D1D]',
              },
              {
                key: 'needs_wm',
                label: 'Perlu WM',
                count: counts.needsWm,
                dot: 'bg-[#b45309]',
              },
              {
                key: 'hold',
                label: 'Hold / Draft',
                count: counts.hold,
                dot: 'bg-[#991b1b]',
              },
            ] as const
          ).map((pill) => {
            const active = statusFilter === pill.key;
            return (
              <Button
                key={pill.key}
                type="button"
                size="xs"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => setStatusFilter(pill.key)}
                className="min-h-9 sm:min-h-8"
              >
                {pill.dot ? (
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${pill.dot}`}
                  />
                ) : active ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : null}
                <span>{pill.label}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {pill.count}
                </span>
              </Button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Ikon centang menandakan konten sudah terpublish (4/4 atau sebagian).
          Pilih <span className="font-medium text-foreground">Agenda</span>{' '}
          untuk detail 4 platform per tanggal.
        </p>
      </div>

      {/* ReUI Event Calendar Card */}
      <Card className="overflow-hidden p-0">
        <EventCalendar<ContentPlannerItem>
          events={events}
          defaultDate={initialDate}
          defaultView="month"
          views={CALENDAR_VIEWS}
          interactions={CALENDAR_INTERACTIONS}
          locale={idLocale}
          weekStartsOn={1}
          dayStartHour={9}
          dayEndHour={22}
          scrollToHour={10}
          i18n={CALENDAR_I18N}
          renderEvent={renderEvent}
          renderAgendaEvent={renderAgendaEvent}
          onEventClick={handleEventClick}
          className="h-[calc(100vh-16rem)] min-h-[540px] text-xs lg:min-h-[680px]"
        >
          <EventCalendarNav className="border-b border-border bg-card px-3 py-2" />
          <EventCalendarContent />
        </EventCalendar>
      </Card>
    </div>
  );
};

export default CalendarView;
