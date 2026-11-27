import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock,
  Check,
  Clock,
  Droplets,
  Globe,
  LoaderCircle,
  Play,
  Search,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AiContentDisclosureMode,
  AutoPostJob,
  AutoPostMode,
} from '@/types/autopost';
import type {
  ContentPlannerItem,
  PlatformKey,
  WorkflowStatus,
} from '@/types/planner';
import { formatSlotShort } from '@/lib/formatSlot';
import type { AutoPostPageProps } from '../pageProps';
import { ActivityFeed } from '../parts/ActivityFeed';
import {
  AiContentAlertDialog,
  type PendingAutoPostConfirmation,
} from '../parts/AiContentAlertDialog';
import { NextContentCard } from '../parts/NextContentCard';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '../parts/platformMeta';
import { PlatformStatusList } from '../parts/PlatformStatusList';
import { pickNextContent, useDerivedStats } from '../useAutoPostData';

const INITIAL_QUEUE_LIMIT = 15;

type QueueFilterKey = 'all' | 'ready' | 'needs_wm' | 'published';

const WORKFLOW_SHORT_LABEL: Record<WorkflowStatus, string> = {
  draft_assets: 'Draft',
  needs_watermark: 'Perlu WM',
  ready_to_upload: 'Siap',
  scheduled: 'Terjadwal',
  partially_published: 'Sebagian',
  published_all: 'Selesai',
  on_hold: 'Hold',
};

function workflowShortLabel(status: WorkflowStatus): string {
  return WORKFLOW_SHORT_LABEL[status] ?? status;
}

function deriveDefaultScheduleForItem(item: ContentPlannerItem | null): {
  date: string;
  time: string;
} {
  if (!item) {
    const fallback = new Date(Date.now() + 60 * 60 * 1000);
    const yyyy = fallback.getFullYear();
    const mm = String(fallback.getMonth() + 1).padStart(2, '0');
    const dd = String(fallback.getDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, time: '19:30' };
  }

  const date = item.schedule.isoDate || '';
  const recMatch = (item.schedule.recommendedTimeWib || '').match(
    /(\d{1,2})[:.](\d{2})/
  );
  if (recMatch) {
    const hh = String(Number(recMatch[1])).padStart(2, '0');
    const mm = String(Number(recMatch[2])).padStart(2, '0');
    return { date, time: `${hh}:${mm}` };
  }
  const time = item.schedule.slotCode === '01' ? '11:30' : '19:30';
  return { date, time };
}

function isValidPlatformKey(
  value: string | null | undefined
): value is PlatformKey {
  return Boolean(value && PLATFORM_ORDER.includes(value as PlatformKey));
}

function getPendingPlatformsForItem(
  item: ContentPlannerItem | null,
  scheduleEnabled: boolean
): PlatformKey[] {
  if (!item) return [];
  return PLATFORM_ORDER.filter((key) => {
    const st = item.userProperties.platforms[key].status;
    if (scheduleEnabled) {
      return st !== 'published' && st !== 'scheduled';
    }
    return st !== 'published';
  });
}

export function DashboardPage({ ctx }: AutoPostPageProps) {
  const navigate = useNavigate();
  const stats = useDerivedStats(ctx.items, ctx.data.jobs);

  const sortedItems = useMemo(
    () =>
      [...ctx.items].sort(
        (a, b) =>
          a.schedule.isoDate.localeCompare(b.schedule.isoDate) ||
          a.folderCode.localeCompare(b.folderCode)
      ),
    [ctx.items]
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (
      ctx.initialItemId &&
      ctx.items.some((item) => item.id === ctx.initialItemId)
    ) {
      return ctx.initialItemId;
    }
    return pickNextContent(ctx.items)?.id ?? '';
  });

  const [mode, setMode] = useState<AutoPostMode>(
    () => ctx.data.settings.defaultMode
  );
  const [aiDisclosure, setAiDisclosure] = useState<AiContentDisclosureMode>(
    () => ctx.data.settings.aiContentDisclosure ?? 'ask'
  );
  const [pendingUpload, setPendingUpload] =
    useState<PendingAutoPostConfirmation | null>(null);

  const [queueFilter, setQueueFilter] = useState<QueueFilterKey>('all');
  const [queueSearch, setQueueSearch] = useState<string>('');
  const [showAllQueue, setShowAllQueue] = useState<boolean>(false);

  useEffect(() => {
    setMode(ctx.data.settings.defaultMode);
  }, [ctx.data.settings.defaultMode]);

  useEffect(() => {
    setAiDisclosure(ctx.data.settings.aiContentDisclosure ?? 'ask');
  }, [ctx.data.settings.aiContentDisclosure]);

  const handleModeChange = (nextMode: AutoPostMode) => {
    setMode(nextMode);
    if (ctx.data.settings.defaultMode !== nextMode) {
      void ctx.data.saveSettings({ defaultMode: nextMode });
    }
  };

  const handleAiDisclosureChange = (next: AiContentDisclosureMode) => {
    setAiDisclosure(next);
    if (ctx.data.settings.aiContentDisclosure !== next) {
      void ctx.data.saveSettings({ aiContentDisclosure: next });
    }
  };

  const appliedInitialItemRef = useRef<string | null>(null);
  const appliedInitialPlatformRef = useRef<string | null>(null);
  const [focusedPlatform, setFocusedPlatform] = useState<PlatformKey | null>(
    () => (isValidPlatformKey(ctx.initialPlatform) ? ctx.initialPlatform : null)
  );

  useEffect(() => {
    if (!ctx.initialItemId) {
      appliedInitialItemRef.current = null;
      return;
    }
    if (
      appliedInitialItemRef.current !== ctx.initialItemId &&
      ctx.items.some((item) => item.id === ctx.initialItemId)
    ) {
      appliedInitialItemRef.current = ctx.initialItemId;
      setSelectedId(ctx.initialItemId);
    }
  }, [ctx.initialItemId, ctx.items]);

  useEffect(() => {
    if (
      selectedId &&
      ctx.items.some((item) => item.id === selectedId)
    ) {
      return;
    }
    if (
      ctx.initialItemId &&
      ctx.items.some((item) => item.id === ctx.initialItemId)
    ) {
      setSelectedId(ctx.initialItemId);
      return;
    }
    setSelectedId(pickNextContent(ctx.items)?.id ?? '');
  }, [ctx.items, ctx.initialItemId, selectedId]);

  const activeItem =
    ctx.items.find((item) => item.id === selectedId) ??
    sortedItems[0] ??
    null;

  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>(
    () => deriveDefaultScheduleForItem(activeItem).date
  );
  const [scheduleTime, setScheduleTime] = useState<string>(
    () => deriveDefaultScheduleForItem(activeItem).time
  );

  useEffect(() => {
    const defaults = deriveDefaultScheduleForItem(activeItem);
    setScheduleDate(defaults.date);
    setScheduleTime(defaults.time);
  }, [activeItem?.id]);

  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>(
    () => {
      if (isValidPlatformKey(ctx.initialPlatform)) {
        return [ctx.initialPlatform];
      }
      return getPendingPlatformsForItem(activeItem, false);
    }
  );

  useEffect(() => {
    if (!ctx.initialPlatform) {
      appliedInitialPlatformRef.current = null;
      return;
    }
    if (
      appliedInitialPlatformRef.current !== ctx.initialPlatform &&
      isValidPlatformKey(ctx.initialPlatform)
    ) {
      appliedInitialPlatformRef.current = ctx.initialPlatform;
      setFocusedPlatform(ctx.initialPlatform);
      setSelectedPlatforms([ctx.initialPlatform]);
    }
  }, [ctx.initialPlatform]);

  // Reset selected platforms cleanly when active item changes (unless focused platform deep-link applies)
  const prevActiveItemIdRef = useRef<string | undefined>(activeItem?.id);
  useEffect(() => {
    const nextId = activeItem?.id;
    if (!nextId) {
      setSelectedPlatforms([]);
      prevActiveItemIdRef.current = undefined;
      return;
    }
    if (prevActiveItemIdRef.current !== nextId) {
      prevActiveItemIdRef.current = nextId;
      if (focusedPlatform) {
        setSelectedPlatforms([focusedPlatform]);
      } else {
        setSelectedPlatforms(
          getPendingPlatformsForItem(activeItem, scheduleEnabled)
        );
      }
    }
  }, [activeItem, focusedPlatform, scheduleEnabled]);

  const activeScheduledAt = useMemo(() => {
    if (!scheduleEnabled || !scheduleDate || !scheduleTime) return null;
    return `${scheduleDate}T${scheduleTime}`;
  }, [scheduleEnabled, scheduleDate, scheduleTime]);

  const handleResetScheduleToSlot = () => {
    const defaults = deriveDefaultScheduleForItem(activeItem);
    setScheduleDate(defaults.date);
    setScheduleTime(defaults.time);
  };

  const handleManualSelectItem = (nextId: string) => {
    setSelectedId(nextId);
    if (ctx.initialItemId && nextId !== ctx.initialItemId) {
      void navigate({
        to: '/auto-post',
        search: (prev) => ({
          ...prev,
          item: undefined,
        }),
        replace: true,
      });
    }
  };

  const handleClearFocusedPlatform = () => {
    setFocusedPlatform(null);
    setSelectedPlatforms(
      getPendingPlatformsForItem(activeItem, scheduleEnabled)
    );
    if (ctx.initialPlatform) {
      void navigate({
        to: '/auto-post',
        search: (prev) => ({
          ...prev,
          platform: undefined,
        }),
        replace: true,
      });
    }
  };

  const handleTogglePlatform = (platform: PlatformKey) => {
    setFocusedPlatform(null);
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleSelectAllPending = () => {
    setFocusedPlatform(null);
    setSelectedPlatforms(
      getPendingPlatformsForItem(activeItem, scheduleEnabled)
    );
  };

  const requestTriggerPost = (
    targetItem: ContentPlannerItem,
    platforms: PlatformKey[],
    requestedMode: AutoPostMode,
    scheduledAt: string | null = null
  ) => {
    if (platforms.length === 0) return;
    if (aiDisclosure === 'ask') {
      setPendingUpload({
        itemId: targetItem.id,
        folderCode: targetItem.folderCode,
        platforms,
        mode: requestedMode,
        scheduledAt,
      });
      return;
    }
    void ctx.data.triggerPost(
      targetItem.id,
      platforms,
      requestedMode,
      scheduledAt,
      aiDisclosure === 'always_ai'
    );
  };

  const handleRetryJob = (job: AutoPostJob) => {
    const targetItem = ctx.items.find((entry) => entry.id === job.itemId);
    if (!targetItem) return;
    requestTriggerPost(
      targetItem,
      [job.platform],
      job.mode,
      job.scheduledAt ?? null
    );
  };

  const handleConfirmAiDialog = (
    aiGenerated: boolean,
    saveAsDefault: boolean
  ) => {
    if (!pendingUpload) return;
    const req = pendingUpload;
    setPendingUpload(null);

    if (saveAsDefault) {
      const nextDefault: AiContentDisclosureMode = aiGenerated
        ? 'always_ai'
        : 'always_non_ai';
      setAiDisclosure(nextDefault);
      void ctx.data.saveSettings({ aiContentDisclosure: nextDefault });
    }

    void ctx.data.triggerPost(
      req.itemId,
      req.platforms,
      req.mode,
      req.scheduledAt,
      aiGenerated
    );
  };

  const filteredQueue = useMemo(() => {
    const needle = queueSearch.trim().toLowerCase();
    return sortedItems.filter((item) => {
      if (queueFilter === 'ready') {
        const hasPending = PLATFORM_ORDER.some(
          (p) => item.userProperties.platforms[p].status !== 'published'
        );
        if (!item.autoMetadata.readiness.hasWmFinal || !hasPending) {
          return false;
        }
      } else if (queueFilter === 'needs_wm') {
        if (item.autoMetadata.readiness.hasWmFinal) return false;
      } else if (queueFilter === 'published') {
        const allDone = PLATFORM_ORDER.every(
          (p) => item.userProperties.platforms[p].status === 'published'
        );
        if (!allDone) return false;
      }

      if (needle) {
        const title =
          item.autoMetadata.captionParsed.hookTitle ||
          item.userProperties.customTitle ||
          '';
        const haystack =
          `${item.folderCode} ${item.monthFolder} ${title}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [queueFilter, queueSearch, sortedItems]);

  const visibleQueue = showAllQueue
    ? filteredQueue
    : filteredQueue.slice(0, INITIAL_QUEUE_LIMIT);

  const hasCdpUrl = Boolean(ctx.data.settings.browser.cdpUrl?.trim());
  const metaApiReady = Boolean(
    ctx.data.capabilities.metaFbApiReady || ctx.data.capabilities.metaIgApiReady
  );
  const ytApiReady = Boolean(ctx.data.capabilities.youtubeApiReady);

  return (
    <div className="space-y-4">
      {/* Compact actionable status & connection strip */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Ringkasan dan filter cepat antrean"
          className="flex flex-wrap items-center gap-1.5"
        >
          <Button
            type="button"
            size="xs"
            variant={queueFilter === 'ready' ? 'default' : 'outline'}
            aria-pressed={queueFilter === 'ready'}
            onClick={() =>
              setQueueFilter((prev) => (prev === 'ready' ? 'all' : 'ready'))
            }
            className="min-h-9 sm:min-h-8"
          >
            <Send className="size-3" aria-hidden="true" />
            <span>Siap Kirim</span>
            <span className="font-mono font-semibold">{stats.readyToPost}</span>
          </Button>
          <Button
            type="button"
            size="xs"
            variant={queueFilter === 'needs_wm' ? 'default' : 'outline'}
            aria-pressed={queueFilter === 'needs_wm'}
            onClick={() =>
              setQueueFilter((prev) =>
                prev === 'needs_wm' ? 'all' : 'needs_wm'
              )
            }
            className="min-h-9 sm:min-h-8"
          >
            <Droplets className="size-3" aria-hidden="true" />
            <span>Perlu WM</span>
            <span className="font-mono font-semibold">
              {stats.needsWatermark}
            </span>
          </Button>
          <Button
            type="button"
            size="xs"
            variant={queueFilter === 'published' ? 'default' : 'outline'}
            aria-pressed={queueFilter === 'published'}
            onClick={() =>
              setQueueFilter((prev) =>
                prev === 'published' ? 'all' : 'published'
              )
            }
            className="min-h-9 sm:min-h-8"
          >
            <Check className="size-3" aria-hidden="true" />
            <span>Tayang</span>
            <span className="font-mono font-semibold">
              {stats.publishedTotal}
            </span>
          </Button>
          {stats.runningJobs > 0 ? (
            <Badge variant="info" size="sm" className="gap-1.5 font-mono">
              <LoaderCircle
                className="size-3 animate-spin"
                aria-hidden="true"
              />
              {stats.runningJobs} berjalan
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Koneksi:</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => ctx.onNavigate('studio')}
            className="min-h-9 sm:min-h-7"
          >
            <Globe className="size-3" aria-hidden="true" />
            <span>{hasCdpUrl ? 'Chrome CDP' : 'Browser Lokal'}</span>
            <Badge
              variant={
                ctx.data.browserSession.isOpen || hasCdpUrl ? 'success' : 'muted'
              }
              size="xs"
            >
              {ctx.data.browserSession.isOpen
                ? 'Aktif'
                : hasCdpUrl
                  ? 'Siap'
                  : 'Default'}
            </Badge>
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => ctx.onNavigate('meta')}
            className="min-h-9 sm:min-h-7"
          >
            <Share2 className="size-3" aria-hidden="true" />
            <span>Meta API</span>
            <Badge variant={metaApiReady ? 'success' : 'muted'} size="xs">
              {metaApiReady ? 'Aktif' : 'Belum'}
            </Badge>
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => ctx.onNavigate('youtube')}
            className="min-h-9 sm:min-h-7"
          >
            <PlatformIcon platform="yt_shorts" size={12} />
            <span>YouTube API</span>
            <Badge variant={ytApiReady ? 'success' : 'muted'} size="xs">
              {ytApiReady ? 'Aktif' : 'Belum'}
            </Badge>
          </Button>
        </div>
      </div>

      {/* Live running / awaiting-review / recently failed jobs shown prominently at top */}
      <ActivityFeed
        jobs={ctx.data.jobs}
        onCancel={ctx.data.cancelJob}
        onConfirm={ctx.data.confirmJob}
        onRetry={handleRetryJob}
        busyKey={ctx.data.busyKey}
      />

      {/* Focused platform deep-link banner */}
      {focusedPlatform && activeItem ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <PlatformIcon platform={focusedPlatform} size={15} />
            <span className="font-medium text-foreground">
              Fokus platform: {PLATFORM_META[focusedPlatform].label}
            </span>
            <Badge variant="outline" size="xs" className="font-mono">
              {activeItem.folderCode}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="editorial"
              disabled={
                !activeItem.autoMetadata.readiness.hasWmFinal ||
                ctx.data.busyKey === `trigger:${activeItem.id}` ||
                (scheduleEnabled && !activeScheduledAt)
              }
              onClick={() =>
                requestTriggerPost(
                  activeItem,
                  [focusedPlatform],
                  mode,
                  activeScheduledAt
                )
              }
              className="min-h-9 sm:min-h-7"
            >
              {scheduleEnabled ? (
                <CalendarClock className="size-3" aria-hidden="true" />
              ) : mode === 'publish' ? (
                <Send className="size-3" aria-hidden="true" />
              ) : (
                <Play className="size-3" aria-hidden="true" />
              )}
              {scheduleEnabled
                ? mode === 'publish'
                  ? `Jadwalkan ${PLATFORM_META[focusedPlatform].label}`
                  : `Tinjau Jadwal ${PLATFORM_META[focusedPlatform].label}`
                : mode === 'publish'
                  ? `Publish ${PLATFORM_META[focusedPlatform].label}`
                  : `Tinjau ${PLATFORM_META[focusedPlatform].label}`}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleClearFocusedPlatform}
              className="min-h-9 sm:min-h-7"
            >
              <X className="size-3" aria-hidden="true" />
              Semua Platform
            </Button>
          </div>
        </div>
      ) : null}

      {/* Main 2-column publishing workbench */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <NextContentCard
            items={sortedItems}
            data={ctx.data}
            selectedId={activeItem?.id ?? ''}
            selectedPlatforms={selectedPlatforms}
            mode={mode}
            onModeChange={handleModeChange}
            aiDisclosure={aiDisclosure}
            onAiDisclosureChange={handleAiDisclosureChange}
            scheduleEnabled={scheduleEnabled}
            scheduleDate={scheduleDate}
            scheduleTime={scheduleTime}
            onScheduleEnabledChange={setScheduleEnabled}
            onScheduleDateChange={setScheduleDate}
            onScheduleTimeChange={setScheduleTime}
            onResetScheduleToSlot={handleResetScheduleToSlot}
            onTriggerRequest={requestTriggerPost}
            onSelectChange={handleManualSelectItem}
            onEditCaption={ctx.onEditCaption}
            onOpenWatermark={ctx.onOpenWatermark}
            onOpenContentDetail={ctx.onOpenContentDetail}
          />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <PlatformStatusList
            item={activeItem}
            data={ctx.data}
            mode={mode}
            scheduledAt={activeScheduledAt}
            selectedPlatforms={selectedPlatforms}
            onTogglePlatform={handleTogglePlatform}
            onSelectAllPending={handleSelectAllPending}
            onNavigatePage={ctx.onNavigate}
            onTriggerRequest={requestTriggerPost}
          />
        </div>
      </div>

      {/* Interactive content queue (responsive desktop table + mobile cards) */}
      <section className="space-y-3 pt-1" aria-labelledby="autopost-queue-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2
              id="autopost-queue-heading"
              className="text-sm font-semibold text-foreground"
            >
              Antrean Konten
            </h2>
            <Badge variant="muted" size="xs" className="font-mono">
              {filteredQueue.length}/{sortedItems.length}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label htmlFor="autopost-queue-search" className="sr-only">
                Cari konten di antrean
              </label>
              <Input
                id="autopost-queue-search"
                type="search"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Cari kode atau judul..."
                className="min-h-10 pl-8 text-xs sm:min-h-8"
              />
            </div>

            {queueFilter !== 'all' || queueSearch.trim() ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => {
                  setQueueFilter('all');
                  setQueueSearch('');
                }}
                className="min-h-10 sm:min-h-8"
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden overflow-x-auto lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Judul &amp; Slot</TableHead>
                <TableHead>Berkas</TableHead>
                <TableHead>Status 4 Platform</TableHead>
                <TableHead>Tahap</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleQueue.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-xs text-muted-foreground"
                  >
                    {sortedItems.length === 0
                      ? 'Belum ada konten di folder workspace ini.'
                      : 'Tidak ada konten yang cocok dengan filter aktif.'}
                  </TableCell>
                </TableRow>
              ) : (
                visibleQueue.map((item) => {
                  const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
                  const isCurrent = item.id === activeItem?.id;
                  const pendingKeys = getPendingPlatformsForItem(
                    item,
                    scheduleEnabled
                  );
                  const isTriggering =
                    ctx.data.busyKey === `trigger:${item.id}`;
                  const title =
                    item.autoMetadata.captionParsed.hookTitle ||
                    item.userProperties.customTitle ||
                    'Tanpa judul';

                  return (
                    <TableRow
                      key={item.id}
                      className={
                        isCurrent
                          ? 'bg-[#FCE7EB]/35 dark:bg-[#4C0519]/25'
                          : undefined
                      }
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => handleManualSelectItem(item.id)}
                          className="cursor-pointer rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {item.folderCode}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <button
                          type="button"
                          onClick={() => handleManualSelectItem(item.id)}
                          className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block truncate text-xs font-medium text-foreground">
                            {title}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {formatSlotShort(item.schedule)}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={hasWmFinal ? 'success' : 'warning'}
                          size="xs"
                        >
                          {hasWmFinal ? 'WM Siap' : 'Perlu WM'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {PLATFORM_ORDER.map((key) => {
                            const pStatus =
                              item.userProperties.platforms[key].status;
                            const published = pStatus === 'published';
                            const scheduled =
                              pStatus === 'scheduled' ||
                              pStatus === 'uploaded_draft';
                            const statusLabel = published
                              ? 'Sudah Publish'
                              : scheduled
                                ? 'Terjadwal / Draft'
                                : 'Belum Publish';
                            return (
                              <span
                                key={key}
                                title={`${PLATFORM_META[key].label}: ${statusLabel}`}
                                aria-label={`${PLATFORM_META[key].label}: ${statusLabel}`}
                                className={
                                  published
                                    ? 'inline-flex h-6 items-center gap-0.5 rounded-md border border-[#86efac] bg-[#dcfce7] px-1.5 text-[10px] font-medium text-[#166534] dark:border-[#166534] dark:bg-[#052e16] dark:text-[#86efac]'
                                    : scheduled
                                      ? 'inline-flex h-6 items-center gap-0.5 rounded-md border border-[#7dd3fc] bg-[#e0f2fe] px-1.5 text-[10px] font-medium text-[#075985] dark:border-[#0369a1] dark:bg-[#082f49] dark:text-[#7dd3fc]'
                                      : 'inline-flex h-6 items-center gap-0.5 rounded-md border border-border bg-card px-1.5 text-[10px] font-medium text-muted-foreground'
                                }
                              >
                                <PlatformIcon
                                  platform={key}
                                  size={12}
                                  className={
                                    published || scheduled
                                      ? 'text-current'
                                      : PLATFORM_META[key].accentClass
                                  }
                                />
                                {published ? (
                                  <Check
                                    className="h-2.5 w-2.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                ) : scheduled ? (
                                  <Clock
                                    className="h-2.5 w-2.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted" size="xs">
                          {workflowShortLabel(
                            item.userProperties.workflowStatus
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant={isCurrent ? 'default' : 'outline'}
                            onClick={() => handleManualSelectItem(item.id)}
                            className="min-h-7"
                          >
                            {isCurrent ? 'Dipilih' : 'Pilih'}
                          </Button>
                          {hasWmFinal ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={pendingKeys.length === 0 || isTriggering}
                              onClick={() => {
                                const rowScheduledAt = scheduleEnabled
                                  ? item.id === activeItem?.id
                                    ? activeScheduledAt
                                    : (() => {
                                        const d =
                                          deriveDefaultScheduleForItem(item);
                                        return `${d.date}T${d.time}`;
                                      })()
                                  : null;
                                requestTriggerPost(
                                  item,
                                  pendingKeys,
                                  mode,
                                  rowScheduledAt
                                );
                              }}
                              className="min-h-7"
                            >
                              {scheduleEnabled ? (
                                <CalendarClock
                                  className="size-3"
                                  aria-hidden="true"
                                />
                              ) : mode === 'publish' ? (
                                <Send className="size-3" aria-hidden="true" />
                              ) : (
                                <Play className="size-3" aria-hidden="true" />
                              )}
                              <span>
                                {scheduleEnabled
                                  ? 'Jadwal'
                                  : mode === 'publish'
                                    ? 'Kirim'
                                    : 'Tinjau'}
                              </span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => ctx.onOpenWatermark(item)}
                              className="min-h-7"
                            >
                              <Droplets className="size-3" aria-hidden="true" />
                              <span>WM</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile & Tablet Card Stack (zero horizontal overflow per R-03) */}
        <div className="grid grid-cols-1 gap-2.5 lg:hidden">
          {visibleQueue.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-xs text-muted-foreground">
              {sortedItems.length === 0
                ? 'Belum ada konten di folder workspace ini.'
                : 'Tidak ada konten yang cocok dengan filter aktif.'}
            </div>
          ) : (
            visibleQueue.map((item) => {
              const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
              const isCurrent = item.id === activeItem?.id;
              const title =
                item.autoMetadata.captionParsed.hookTitle ||
                item.userProperties.customTitle ||
                'Tanpa judul';

              return (
                <div
                  key={item.id}
                  className={
                    isCurrent
                      ? 'space-y-2.5 rounded-lg border border-[#7F1D1D]/40 bg-[#FCE7EB]/35 p-3 dark:border-[#9F1239]/50 dark:bg-[#4C0519]/25'
                      : 'space-y-2.5 rounded-lg border border-border bg-card p-3'
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.folderCode}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatSlotShort(item.schedule)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-foreground">
                        {title}
                      </p>
                    </div>
                    <Badge
                      variant={hasWmFinal ? 'success' : 'warning'}
                      size="xs"
                    >
                      {hasWmFinal ? 'WM Siap' : 'Perlu WM'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {PLATFORM_ORDER.map((key) => {
                        const pStatus =
                          item.userProperties.platforms[key].status;
                        const published = pStatus === 'published';
                        const scheduled =
                          pStatus === 'scheduled' ||
                          pStatus === 'uploaded_draft';
                        return (
                          <span
                            key={key}
                            className={
                              published
                                ? 'inline-flex h-6 items-center gap-0.5 rounded-md border border-[#86efac] bg-[#dcfce7] px-1.5 text-[10px] font-medium text-[#166534] dark:border-[#166534] dark:bg-[#052e16] dark:text-[#86efac]'
                                : scheduled
                                  ? 'inline-flex h-6 items-center gap-0.5 rounded-md border border-[#7dd3fc] bg-[#e0f2fe] px-1.5 text-[10px] font-medium text-[#075985] dark:border-[#0369a1] dark:bg-[#082f49] dark:text-[#7dd3fc]'
                                  : 'inline-flex h-6 items-center gap-0.5 rounded-md border border-border bg-card px-1.5 text-[10px] font-medium text-muted-foreground'
                            }
                          >
                            <PlatformIcon platform={key} size={12} />
                            {published ? (
                              <Check className="h-2.5 w-2.5" aria-hidden="true" />
                            ) : null}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        variant={isCurrent ? 'default' : 'outline'}
                        onClick={() => handleManualSelectItem(item.id)}
                        className="min-h-10"
                      >
                        {isCurrent ? 'Dipilih' : 'Pilih'}
                      </Button>
                      {!hasWmFinal ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => ctx.onOpenWatermark(item)}
                          className="min-h-10"
                        >
                          WM
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {filteredQueue.length > INITIAL_QUEUE_LIMIT ? (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAllQueue((prev) => !prev)}
              className="min-h-10 sm:min-h-8"
            >
              {showAllQueue
                ? `Ringkas (${INITIAL_QUEUE_LIMIT} teratas)`
                : `Tampilkan semua (${filteredQueue.length} konten)`}
            </Button>
          </div>
        ) : null}
      </section>

      <AiContentAlertDialog
        pending={pendingUpload}
        onCancel={() => setPendingUpload(null)}
        onConfirm={handleConfirmAiDialog}
      />
    </div>
  );
}
