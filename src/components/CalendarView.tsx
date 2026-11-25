import React, { useCallback, useMemo } from 'react';
import { id as idLocale } from 'date-fns/locale/id';
import {
  ContentPlannerItem,
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { parseTimeToHoursMinutes } from '@/lib/formatSlot';

export interface CalendarViewProps {
  items: ContentPlannerItem[];
  onSelectItem: (item: ContentPlannerItem) => void;
  onEditCaption?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (item: ContentPlannerItem) => void;
  onUpdateStatus?: (item: ContentPlannerItem, newStatus: WorkflowStatus) => void;
  onTogglePlatform?: (item: ContentPlannerItem, platformKey: PlatformKey) => void;
  onCopyText?: (text: string, label: string) => void;
  onOpenExplorer?: (targetPath: string, selectFile?: boolean) => void;
  onResetFilters?: () => void;
  onRescan?: () => void;
}

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

function getEventColor(item: ContentPlannerItem): string {
  const { workflowStatus } = item.userProperties;
  const { isUploadReady, hasWmFinal, hasRawVideo } = item.autoMetadata.readiness;

  if (workflowStatus === 'on_hold' || workflowStatus === 'draft_assets') {
    return '#991b1b';
  }
  if (workflowStatus === 'published_all' || isUploadReady) {
    return '#166534';
  }
  if (workflowStatus === 'needs_watermark' || (!hasWmFinal && hasRawVideo)) {
    return '#b45309';
  }
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
  onResetFilters,
  onRescan,
}) => {
  const events = useMemo<CalendarEvent<ContentPlannerItem>[]>(() => {
    return items.map((item) => {
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
  }, [items]);

  const initialDate = useMemo<Date>(() => {
    if (events.length === 0) return new Date();
    let earliest = events[0].start;
    for (let i = 1; i < events.length; i += 1) {
      if (events[i].start.getTime() < earliest.getTime()) {
        earliest = events[i].start;
      }
    }
    return new Date(
      earliest.getFullYear(),
      earliest.getMonth(),
      earliest.getDate()
    );
  }, [events]);

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

      return (
        <div className="flex w-full min-w-0 items-center gap-1.5 text-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-(--ec-event-color)"
          />
          <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground">
            {item.folderCode}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {shortTime}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
            {hookTitle}
          </span>
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

      const hookTitle =
        item.userProperties.customTitle?.trim() ||
        item.autoMetadata.captionParsed.hookTitle?.trim() ||
        item.folderCode;
      const { shortTime } = getSlotTimes(item);
      const timeWindow =
        item.schedule.slotTimeWindow?.trim() || `${shortTime} WIB`;
      const color = getEventColor(item);
      const statusText =
        color === '#166534'
          ? 'Siap'
          : color === '#b45309'
          ? 'No WM'
          : 'Hold';

      return (
        <div className="flex w-full min-w-0 items-center gap-3 text-foreground">
          <span className="w-32 shrink-0 font-mono text-xs font-light text-muted-foreground/75 tabular-nums">
            {timeWindow}
          </span>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-(--ec-event-color)"
          />
          <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
            {item.folderCode}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {hookTitle}
          </span>
          <span className="hidden shrink-0 font-mono text-[11px] font-light text-muted-foreground/75 sm:inline">
            {statusText}
          </span>
        </div>
      );
    },
    []
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
    <div className="space-y-2.5">
      {/* Slim Borderless Legend Strip */}
      <div className="flex items-center justify-end gap-3 text-[11px] font-light text-muted-foreground/80">
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="inline-flex cursor-default items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            }
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-[#166534]"
            />
            <span>Siap</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Video wm_final, cover, dan caption siap upload atau sudah tayang
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="inline-flex cursor-default items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            }
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-[#b45309]"
            />
            <span>No WM</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Aset dasar tersedia, menunggu render wm_final
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="inline-flex cursor-default items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            }
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-[#991b1b]"
            />
            <span>Hold</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Konten ditahan untuk revisi atau aset dasar belum lengkap
          </TooltipContent>
        </Tooltip>
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
          className="h-[calc(100vh-17rem)] min-h-[680px] text-xs"
        >
          <EventCalendarNav className="border-b border-border bg-card px-3 py-2" />
          <EventCalendarContent />
        </EventCalendar>
      </Card>
    </div>
  );
};

export default CalendarView;
