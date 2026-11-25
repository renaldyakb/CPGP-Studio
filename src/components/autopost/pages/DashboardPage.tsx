import { useEffect, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Droplets,
  ExternalLink,
  LoaderCircle,
  Play,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import type { PlatformKey, WorkflowStatus } from '@/types/planner';
import type { AutoPostPageProps } from '../pageProps';
import { useDerivedStats, pickNextContent } from '../useAutoPostData';
import { ActivityFeed } from '../parts/ActivityFeed';
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

export function DashboardPage({ ctx }: AutoPostPageProps) {
  const stats = useDerivedStats(ctx.items, ctx.data.jobs);

  const queue = [...ctx.items]
    .sort(
      (a, b) =>
        a.schedule.isoDate.localeCompare(b.schedule.isoDate) ||
        a.folderCode.localeCompare(b.folderCode)
    )
    .slice(0, QUEUE_LIMIT);

  const selectedItem = queue[0] ?? null;

  const [selectedId, setSelectedId] = useState<string>(
    () => pickNextContent(ctx.items)?.id ?? ''
  );

  useEffect(() => {
    if (
      selectedId &&
      ctx.items.some((item) => item.id === selectedId)
    ) {
      return;
    }
    setSelectedId(pickNextContent(ctx.items)?.id ?? '');
  }, [ctx.items, selectedId]);

  const activeItem =
    ctx.items.find((item) => item.id === selectedId) ?? selectedItem;

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

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <NextContentCard
            items={ctx.items}
            data={ctx.data}
            selectedId={activeItem?.id ?? ''}
            onSelectChange={setSelectedId}
            onEditCaption={ctx.onEditCaption}
            onOpenWatermark={ctx.onOpenWatermark}
            onOpenContentDetail={ctx.onOpenContentDetail}
          />
        </div>
        <div className="xl:col-span-5">
          <PlatformStatusList item={activeItem} data={ctx.data} />
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
                          icon={Play}
                          label="Auto-Post konten ini"
                          disabled={
                            pendingKeys.length === 0 ||
                            !hasWmFinal ||
                            isTriggering
                          }
                          onClick={() =>
                            void ctx.data.triggerPost(
                              item.id,
                              pendingKeys,
                              'review'
                            )
                          }
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
    </div>
  );
}
