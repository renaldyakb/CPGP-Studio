import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Droplets,
  ExternalLink,
  LoaderCircle,
  Play,
  Send,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AiContentDisclosureMode, AutoPostMode } from '@/types/autopost';
import type {
  ContentPlannerItem,
  PlatformKey,
  WorkflowStatus,
} from '@/types/planner';
import type { AutoPostPageProps } from '../pageProps';
import { useDerivedStats, pickNextContent } from '../useAutoPostData';
import { ActivityFeed } from '../parts/ActivityFeed';
import {
  AiContentAlertDialog,
  type PendingAutoPostConfirmation,
} from '../parts/AiContentAlertDialog';
import { IconActionButton } from '../parts/IconActionButton';
import { NextContentCard } from '../parts/NextContentCard';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '../parts/platformMeta';
import { PlatformStatusList } from '../parts/PlatformStatusList';
import { StatCard } from '../parts/StatCard';
import { formatSlotShort } from '@/lib/formatSlot';

const QUEUE_LIMIT = 12;

const WORKFLOW_SHORT_LABEL: Record<WorkflowStatus, string> = {
  draft_assets: 'Draft',
  needs_watermark: 'Watermark',
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

export function DashboardPage({ ctx }: AutoPostPageProps) {
  const navigate = useNavigate();
  const stats = useDerivedStats(ctx.items, ctx.data.jobs);

  const queue = [...ctx.items]
    .sort(
      (a, b) =>
        a.schedule.isoDate.localeCompare(b.schedule.isoDate) ||
        a.folderCode.localeCompare(b.folderCode)
    )
    .slice(0, QUEUE_LIMIT);

  const selectedItem = queue[0] ?? null;

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

  const appliedInitialItemRef = useRef<string | null>(null);
  const appliedInitialPlatformRef = useRef<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>(
    () => (isValidPlatformKey(ctx.initialPlatform) ? [ctx.initialPlatform] : [])
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
      setSelectedPlatforms([ctx.initialPlatform]);
    }
  }, [ctx.initialPlatform]);

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
    setSelectedPlatforms([]);
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

  const focusedPlatform =
    selectedPlatforms.length === 1 ? selectedPlatforms[0] : null;

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
    ctx.items.find((item) => item.id === selectedId) ?? selectedItem;

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

  const activeScheduledAt = useMemo(() => {
    if (!scheduleEnabled || !scheduleDate || !scheduleTime) return null;
    return `${scheduleDate}T${scheduleTime}`;
  }, [scheduleEnabled, scheduleDate, scheduleTime]);

  const handleResetScheduleToSlot = () => {
    const defaults = deriveDefaultScheduleForItem(activeItem);
    setScheduleDate(defaults.date);
    setScheduleTime(defaults.time);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Siap"
          value={stats.readyToPost}
          tone="default"
          icon={Send}
        />
        <StatCard
          label="Berjalan"
          value={stats.runningJobs}
          tone="info"
          icon={LoaderCircle}
        />
        <StatCard
          label="Tayang"
          value={stats.publishedTotal}
          tone="success"
          icon={CheckCheck}
        />
        <StatCard
          label="Watermark"
          value={stats.needsWatermark}
          tone="warning"
          icon={Droplets}
        />
      </div>

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
            >
              <X className="size-3" aria-hidden="true" />
              Semua Platform
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <NextContentCard
            items={ctx.items}
            data={ctx.data}
            selectedId={activeItem?.id ?? ''}
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
        <div className="xl:col-span-5">
          <PlatformStatusList
            item={activeItem}
            data={ctx.data}
            mode={mode}
            scheduledAt={activeScheduledAt}
            onTriggerRequest={requestTriggerPost}
          />
        </div>
      </div>

      <ActivityFeed
        jobs={ctx.data.jobs}
        onCancel={ctx.data.cancelJob}
        onConfirm={ctx.data.confirmJob}
        busyKey={ctx.data.busyKey}
      />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Antrean Konten
          </h2>
          <span className="text-[11px] font-light text-muted-foreground/75">
            {queue.length} konten
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Berkas</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-xs font-light text-muted-foreground/75"
                >
                  Belum ada konten di folder KONTEN.
                </TableCell>
              </TableRow>
            ) : (
              queue.map((item) => {
                const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
                const pendingKeys: PlatformKey[] = PLATFORM_ORDER.filter(
                  (key) =>
                    item.userProperties.platforms[key].status !== 'published'
                );
                const isTriggering =
                  ctx.data.busyKey === `trigger:${item.id}`;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {item.folderCode}
                    </TableCell>
                    <TableCell className="text-xs font-light whitespace-nowrap text-muted-foreground/75">
                      {formatSlotShort(item.schedule)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={hasWmFinal ? 'success' : 'warning'}
                        size="xs"
                      >
                        {hasWmFinal ? 'Siap' : 'No WM'}
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
                          const tooltipText = `${PLATFORM_META[key].label}: ${statusLabel}`;

                          return (
                            <Tooltip key={key}>
                              <TooltipTrigger
                                render={
                                  <span
                                    tabIndex={0}
                                    role="img"
                                    aria-label={tooltipText}
                                    className={
                                      published
                                        ? 'inline-flex h-6 items-center gap-0.5 rounded-md border border-[#86efac] bg-[#dcfce7] px-1.5 text-[10px] font-medium text-[#166534] outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:border-[#166534] dark:bg-[#052e16] dark:text-[#86efac]'
                                        : scheduled
                                          ? 'inline-flex h-6 items-center gap-0.5 rounded-md border border-[#7dd3fc] bg-[#e0f2fe] px-1.5 text-[10px] font-medium text-[#075985] outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:border-[#0369a1] dark:bg-[#082f49] dark:text-[#7dd3fc]'
                                          : 'inline-flex h-6 items-center gap-0.5 rounded-md border border-border bg-card px-1.5 text-[10px] font-medium text-muted-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
                                    }
                                  />
                                }
                              >
                                <PlatformIcon
                                  platform={key}
                                  size={12}
                                  className={
                                    published || scheduled
                                      ? 'text-current'
                                      : `${PLATFORM_META[key].accentClass} opacity-75`
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
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {tooltipText}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted" size="xs">
                        {workflowShortLabel(item.userProperties.workflowStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <IconActionButton
                          icon={
                            scheduleEnabled
                              ? CalendarClock
                              : mode === 'publish'
                                ? Send
                                : Play
                          }
                          label={
                            scheduleEnabled
                              ? mode === 'publish'
                                ? 'Langsung jadwalkan konten ini'
                                : 'Tinjau jadwal konten ini'
                              : mode === 'publish'
                                ? 'Langsung publish konten ini'
                                : 'Tinjau auto-post konten ini'
                          }
                          disabled={
                            pendingKeys.length === 0 ||
                            !hasWmFinal ||
                            isTriggering
                          }
                          onClick={() => {
                            const rowScheduledAt = scheduleEnabled
                              ? item.id === activeItem?.id
                                ? activeScheduledAt
                                : (() => {
                                    const d = deriveDefaultScheduleForItem(item);
                                    return d.date && d.time
                                      ? `${d.date}T${d.time}`
                                      : null;
                                  })()
                              : null;
                            requestTriggerPost(
                              item,
                              pendingKeys,
                              mode,
                              rowScheduledAt
                            );
                          }}
                        />
                        <IconActionButton
                          icon={ExternalLink}
                          label="Buka detail konten"
                          onClick={() => ctx.onOpenContentDetail(item)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      <AiContentAlertDialog
        pending={pendingUpload}
        onCancel={() => setPendingUpload(null)}
        onConfirm={handleConfirmAiDialog}
      />
    </div>
  );
}
