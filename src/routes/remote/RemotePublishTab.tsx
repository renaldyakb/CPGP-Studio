import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import {
  pickNextContent,
  resolvePlatformEngine,
} from '@/components/autopost/useAutoPostData';
import type {
  AiContentDisclosureMode,
  AutoPostCapabilities,
  AutoPostMode,
} from '@/types/autopost';
import type { ContentPlannerItem, PlatformKey } from '@/types/planner';
import { formatSlotShort } from '@/lib/formatSlot';

export interface RemotePublishTabProps {
  items: ContentPlannerItem[];
  capabilities: AutoPostCapabilities;
  defaultMode: AutoPostMode;
  defaultAiDisclosure: AiContentDisclosureMode;
  isSubmitting: boolean;
  onTriggerPost: (params: {
    item: ContentPlannerItem;
    platforms: PlatformKey[];
    mode: AutoPostMode;
    scheduledAt: string | null;
    aiGenerated?: boolean;
  }) => Promise<void>;
  onGoToWatermark: () => void;
}

function deriveSlotDateTime(item: ContentPlannerItem | null): {
  date: string;
  time: string;
} {
  if (!item) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, time: '19:30' };
  }
  const date = item.schedule.isoDate || '';
  const m = (item.schedule.recommendedTimeWib || '').match(/(\d{1,2})[:.](\d{2})/);
  const time = m
    ? `${String(Number(m[1])).padStart(2, '0')}:${String(Number(m[2])).padStart(2, '0')}`
    : item.schedule.slotCode === '01'
      ? '11:30'
      : '19:30';
  return { date, time };
}

function getPendingKeys(
  item: ContentPlannerItem | null,
  scheduleEnabled: boolean
): PlatformKey[] {
  if (!item) return [];
  return PLATFORM_ORDER.filter((key) => {
    const st = item.userProperties.platforms[key]?.status;
    if (scheduleEnabled) {
      return st !== 'published' && st !== 'scheduled';
    }
    return st !== 'published';
  });
}

type RemotePublishFilter = 'not_uploaded' | 'ready_wm' | 'all';

function isItemNotFullyUploaded(item: ContentPlannerItem): boolean {
  return PLATFORM_ORDER.some(
    (key) => item.userProperties.platforms[key]?.status !== 'published'
  );
}

export function RemotePublishTab({
  items,
  capabilities,
  defaultMode,
  defaultAiDisclosure,
  isSubmitting,
  onTriggerPost,
  onGoToWatermark,
}: RemotePublishTabProps) {
  const [contentFilter, setContentFilter] =
    useState<RemotePublishFilter>('not_uploaded');

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          a.schedule.isoDate.localeCompare(b.schedule.isoDate) ||
          a.folderCode.localeCompare(b.folderCode)
      ),
    [items]
  );

  const filterCounts = useMemo(() => {
    let notUploaded = 0;
    let readyWm = 0;
    for (const item of sortedItems) {
      const pending = isItemNotFullyUploaded(item);
      if (pending) {
        notUploaded += 1;
        if (item.autoMetadata.readiness.hasWmFinal) {
          readyWm += 1;
        }
      }
    }
    return { notUploaded, readyWm, all: sortedItems.length };
  }, [sortedItems]);

  const filteredItems = useMemo(() => {
    if (contentFilter === 'all') return sortedItems;
    if (contentFilter === 'ready_wm') {
      return sortedItems.filter(
        (item) =>
          item.autoMetadata.readiness.hasWmFinal && isItemNotFullyUploaded(item)
      );
    }
    return sortedItems.filter((item) => isItemNotFullyUploaded(item));
  }, [contentFilter, sortedItems]);

  const [selectedId, setSelectedId] = useState<string>(
    () => pickNextContent(filteredItems)?.id ?? filteredItems[0]?.id ?? ''
  );

  useEffect(() => {
    if (selectedId && filteredItems.some((i) => i.id === selectedId)) return;
    setSelectedId(
      pickNextContent(filteredItems)?.id ?? filteredItems[0]?.id ?? ''
    );
  }, [selectedId, filteredItems]);

  const activeIndex = useMemo(() => {
    const idx = filteredItems.findIndex((i) => i.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [filteredItems, selectedId]);

  const activeItem = filteredItems[activeIndex] ?? null;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < filteredItems.length - 1;

  const handlePrevItem = () => {
    if (!hasPrev) return;
    setSelectedId(filteredItems[activeIndex - 1].id);
  };

  const handleNextItem = () => {
    if (!hasNext) return;
    setSelectedId(filteredItems[activeIndex + 1].id);
  };

  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>(
    () => deriveSlotDateTime(activeItem).date
  );
  const [scheduleTime, setScheduleTime] = useState<string>(
    () => deriveSlotDateTime(activeItem).time
  );
  const [mode, setMode] = useState<AutoPostMode>(defaultMode);
  const [aiChoice, setAiChoice] = useState<'yes' | 'no'>(
    defaultAiDisclosure === 'always_ai' ? 'yes' : 'no'
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>(
    () => getPendingKeys(activeItem, false)
  );

  const prevItemIdRef = useRef<string | undefined>(activeItem?.id);
  useEffect(() => {
    if (prevItemIdRef.current !== activeItem?.id) {
      prevItemIdRef.current = activeItem?.id;
      const defaults = deriveSlotDateTime(activeItem);
      setScheduleDate(defaults.date);
      setScheduleTime(defaults.time);
      setSelectedPlatforms(getPendingKeys(activeItem, scheduleEnabled));
    }
  }, [activeItem, scheduleEnabled]);

  const filterBar = (
    <div
      role="group"
      aria-label="Filter status upload konten"
      className="grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-card p-1"
    >
      {(
        [
          {
            key: 'not_uploaded',
            label: 'Belum Upload',
            count: filterCounts.notUploaded,
          },
          {
            key: 'ready_wm',
            label: 'Siap (WM)',
            count: filterCounts.readyWm,
          },
          {
            key: 'all',
            label: 'Semua',
            count: filterCounts.all,
          },
        ] as const
      ).map((pill) => {
        const active = contentFilter === pill.key;
        return (
          <Button
            key={pill.key}
            type="button"
            size="xs"
            variant={active ? 'default' : 'ghost'}
            aria-pressed={active}
            onClick={() => setContentFilter(pill.key)}
            className="min-h-10 gap-1 px-1.5 text-[11px]"
          >
            <span className="truncate">{pill.label}</span>
            <span className="font-mono font-semibold tabular-nums">
              {pill.count}
            </span>
          </Button>
        );
      })}
    </div>
  );

  if (!activeItem) {
    return (
      <div className="space-y-3">
        {filterBar}
        <Card className="space-y-3 p-6 text-center">
          <p className="text-xs text-muted-foreground">
            {sortedItems.length === 0
              ? 'Belum ada konten di folder workspace aktif.'
              : contentFilter === 'ready_wm'
                ? 'Tidak ada konten ber-watermark yang menunggu upload.'
                : 'Semua konten sudah selesai diupload ke 4 platform.'}
          </p>
          {sortedItems.length > 0 && contentFilter !== 'all' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setContentFilter('all')}
              className="min-h-10"
            >
              Tampilkan Semua ({sortedItems.length})
            </Button>
          ) : null}
        </Card>
      </div>
    );
  }

  const { assets, captionParsed, readiness } = activeItem.autoMetadata;
  const hookTitle =
    captionParsed.hookTitle ||
    activeItem.userProperties.customTitle ||
    activeItem.folderCode;
  const hasWmFinal = readiness.hasWmFinal;
  const scheduledAtPayload =
    scheduleEnabled && scheduleDate && scheduleTime
      ? `${scheduleDate}T${scheduleTime}`
      : null;

  const togglePlatform = (key: PlatformKey) => {
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const canSend =
    hasWmFinal &&
    selectedPlatforms.length > 0 &&
    !isSubmitting &&
    (!scheduleEnabled || Boolean(scheduledAtPayload));

  const igApiScheduleWarning =
    scheduleEnabled &&
    selectedPlatforms.includes('ig_reels') &&
    capabilities.metaIgApiReady;

  return (
    <div className="space-y-3.5">
      {filterBar}

      {/* Selected content card */}
      <Card className="overflow-hidden">
        <div
          className="h-1 w-full bg-[image:var(--gradient-burgundy)]"
          aria-hidden="true"
        />
        <CardContent className="space-y-3 p-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="remote-content-select"
                className="block text-xs font-medium text-foreground"
              >
                Pilih Konten
              </label>
              <span className="font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
                {activeIndex + 1} / {filteredItems.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Konten sebelumnya"
                disabled={!hasPrev}
                onClick={handlePrevItem}
                className="min-h-11 min-w-11 shrink-0"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>

              <NativeSelect
                id="remote-content-select"
                value={activeItem.id}
                onChange={(e) => setSelectedId(e.target.value)}
                className="min-h-11 min-w-0 flex-1 font-mono text-xs"
              >
                {filteredItems.map((item) => {
                  const pubCount = PLATFORM_ORDER.filter(
                    (k) => item.userProperties.platforms[k]?.status === 'published'
                  ).length;
                  const shortMonth = item.schedule.monthName.slice(0, 3);
                  const dateLabel = `${item.schedule.dayOfMonth} ${shortMonth} ${item.schedule.year}`;
                  return (
                    <option key={item.id} value={item.id}>
                      {item.folderCode} · {dateLabel} [{pubCount}/4] (
                      {item.autoMetadata.readiness.hasWmFinal
                        ? 'WM'
                        : 'No WM'}
                      ) -{' '}
                      {(
                        item.autoMetadata.captionParsed.hookTitle ||
                        item.folderCode
                      ).slice(0, 26)}
                    </option>
                  );
                })}
              </NativeSelect>

              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Konten berikutnya"
                disabled={!hasNext}
                onClick={handleNextItem}
                className="min-h-11 min-w-11 shrink-0"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <div className="aspect-[9/16] w-[68px] shrink-0 overflow-hidden rounded border border-border bg-card">
              {assets.cover.mediaUrl ? (
                <img
                  src={assets.cover.mediaUrl}
                  alt={`Cover ${activeItem.folderCode}`}
                  width={68}
                  height={121}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {activeItem.folderCode}
                </span>
                <Badge variant="outline" size="xs" className="gap-1 font-medium">
                  <CalendarDays className="size-3" aria-hidden="true" />
                  <span>{activeItem.schedule.displayDate}</span>
                </Badge>
              </div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Target: {formatSlotShort(activeItem.schedule)} WIB
              </p>
              <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                {hookTitle}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <Badge
                  variant={hasWmFinal ? 'success' : 'destructive'}
                  size="xs"
                >
                  {hasWmFinal ? (
                    <Check className="mr-0.5 size-3" aria-hidden="true" />
                  ) : (
                    <X className="mr-0.5 size-3" aria-hidden="true" />
                  )}
                  WM
                </Badge>
                <Badge
                  variant={readiness.hasCover ? 'success' : 'destructive'}
                  size="xs"
                >
                  Cover
                </Badge>
                <Badge
                  variant={readiness.hasCaption ? 'success' : 'destructive'}
                  size="xs"
                >
                  Caption
                </Badge>
              </div>
            </div>
          </div>

          {!hasWmFinal ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#fcd34d] bg-[#fef3c7] px-3 py-2 text-xs text-[#92400e] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fcd34d]"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                Video watermark belum ada.
              </span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={onGoToWatermark}
                className="min-h-9 bg-card text-foreground"
              >
                Ke Tab Watermark
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Platform checkboxes */}
      <Card>
        <CardContent className="space-y-2.5 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-foreground">
              Target Platform
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setSelectedPlatforms(['fb_reels', 'ig_reels'])}
                className="min-h-9"
              >
                FB + IG
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() =>
                  setSelectedPlatforms(
                    getPendingKeys(activeItem, scheduleEnabled)
                  )
                }
                className="min-h-9"
              >
                Belum Tayang
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PLATFORM_ORDER.map((key) => {
              const checked = selectedPlatforms.includes(key);
              const st = activeItem.userProperties.platforms[key]?.status;
              const engine = resolvePlatformEngine(key, capabilities);
              return (
                <button
                  key={key}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => togglePlatform(key)}
                  className={
                    checked
                      ? 'flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border border-[#7F1D1D]/45 bg-[#FCE7EB]/40 px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#9F1239]/60 dark:bg-[#4C0519]/30'
                      : 'flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  }
                >
                  <span
                    aria-hidden="true"
                    className={
                      checked
                        ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#7F1D1D] bg-[#7F1D1D] text-white dark:border-[#9F1239] dark:bg-[#9F1239]'
                        : 'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-input bg-background text-transparent'
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <PlatformIcon platform={key} size={13} />
                      <span className="truncate text-xs font-semibold text-foreground">
                        {PLATFORM_META[key].label.replace(' Shorts', '').replace(' Reels', '')}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>{engine.label}</span>
                      <span>·</span>
                      <span>
                        {st === 'published'
                          ? 'Tayang'
                          : st === 'scheduled'
                            ? 'Jadwal'
                            : 'Belum'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Timing, Mode & AI */}
      <Card>
        <CardContent className="space-y-3 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">
              Waktu Tayang
            </span>
            <div
              role="group"
              aria-label="Waktu tayang remote"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <Button
                type="button"
                size="xs"
                variant={!scheduleEnabled ? 'default' : 'ghost'}
                aria-pressed={!scheduleEnabled}
                onClick={() => setScheduleEnabled(false)}
                className="min-h-10"
              >
                Sekarang
              </Button>
              <Button
                type="button"
                size="xs"
                variant={scheduleEnabled ? 'default' : 'ghost'}
                aria-pressed={scheduleEnabled}
                onClick={() => setScheduleEnabled(true)}
                className="min-h-10"
              >
                Jadwalkan
              </Button>
            </div>
          </div>

          {scheduleEnabled ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="remote-sched-date"
                    className="block text-[11px] font-medium text-foreground"
                  >
                    Tanggal
                  </label>
                  <Input
                    id="remote-sched-date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="min-h-11 bg-card font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="remote-sched-time"
                    className="block text-[11px] font-medium text-foreground"
                  >
                    Jam (WIB)
                  </label>
                  <Input
                    id="remote-sched-time"
                    type="time"
                    step={300}
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="min-h-11 bg-card font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant={scheduleTime === '11:30' ? 'default' : 'outline'}
                  onClick={() => setScheduleTime('11:30')}
                  className="min-h-10 flex-1"
                >
                  Siang 11:30
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={scheduleTime === '19:30' ? 'default' : 'outline'}
                  onClick={() => setScheduleTime('19:30')}
                  className="min-h-10 flex-1"
                >
                  Malam 19:30
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label="Reset ke jadwal slot"
                  onClick={() => {
                    const d = deriveSlotDateTime(activeItem);
                    setScheduleDate(d.date);
                    setScheduleTime(d.time);
                  }}
                  className="min-h-10 min-w-10"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              {igApiScheduleWarning ? (
                <p className="text-[11px] font-medium text-[#92400e] dark:text-[#fcd34d]">
                  IG via Meta API tidak mendukung jadwal. Hapus centang IG atau
                  pilih Sekarang.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">
              Mode Eksekusi
            </span>
            <div
              role="group"
              aria-label="Mode eksekusi remote"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <Button
                type="button"
                size="xs"
                variant={mode === 'review' ? 'default' : 'ghost'}
                aria-pressed={mode === 'review'}
                onClick={() => setMode('review')}
                className="min-h-10"
              >
                Tinjau Dulu
              </Button>
              <Button
                type="button"
                size="xs"
                variant={mode === 'publish' ? 'default' : 'ghost'}
                aria-pressed={mode === 'publish'}
                onClick={() => setMode('publish')}
                className="min-h-10"
              >
                Langsung
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Bot className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Konten AI-Generated
            </span>
            <div
              role="group"
              aria-label="Label konten AI remote"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <Button
                type="button"
                size="xs"
                variant={aiChoice === 'yes' ? 'default' : 'ghost'}
                aria-pressed={aiChoice === 'yes'}
                onClick={() => setAiChoice('yes')}
                className="min-h-10"
              >
                Ya (AI)
              </Button>
              <Button
                type="button"
                size="xs"
                variant={aiChoice === 'no' ? 'default' : 'ghost'}
                aria-pressed={aiChoice === 'no'}
                onClick={() => setAiChoice('no')}
                className="min-h-10"
              >
                Bukan AI
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="editorial"
            disabled={!canSend}
            onClick={() =>
              void onTriggerPost({
                item: activeItem,
                platforms: selectedPlatforms,
                mode,
                scheduledAt: scheduledAtPayload,
                aiGenerated: aiChoice === 'yes',
              })
            }
            className="min-h-12 w-full text-sm font-semibold"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : scheduleEnabled ? (
              <CalendarClock className="size-4" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            <span>
              {selectedPlatforms.length === 0
                ? 'Pilih minimal 1 platform'
                : scheduleEnabled
                  ? mode === 'publish'
                    ? `Jadwalkan (${selectedPlatforms.length} Platform)`
                    : `Tinjau Jadwal (${selectedPlatforms.length} Platform)`
                  : mode === 'publish'
                    ? `Publish Sekarang (${selectedPlatforms.length} Platform)`
                    : `Tinjau di PC (${selectedPlatforms.length} Platform)`}
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
