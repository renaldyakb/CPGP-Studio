import {
  CalendarClock,
  ExternalLink,
  Eye,
  Monitor,
  Send,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AutoPostCapabilities, AutoPostMode } from '@/types/autopost';
import type {
  ContentPlannerItem,
  PlatformKey,
  PlatformUploadStatus,
} from '@/types/planner';
import type { UseAutoPostDataResult } from '../useAutoPostData';
import {
  countPublishedPlatforms,
  resolvePlatformEngine,
} from '../useAutoPostData';
import { IconActionButton } from './IconActionButton';
import { PLATFORM_ORDER, PlatformIcon } from './platformMeta';

export interface PlatformStatusListProps {
  item: ContentPlannerItem | null;
  data: UseAutoPostDataResult;
  mode: AutoPostMode;
  scheduledAt?: string | null;
  onTriggerRequest: (
    item: ContentPlannerItem,
    platforms: PlatformKey[],
    mode: AutoPostMode,
    scheduledAt: string | null
  ) => void;
}

function formatShortSchedulePill(scheduledAt?: string | null): string | null {
  if (!scheduledAt) return null;
  const match = scheduledAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  if (!match) return scheduledAt;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  return `${day} ${months[monthIdx] ?? match[2]} · ${match[4]}`;
}

type PlatformStatusVariant =
  | 'success'
  | 'info'
  | 'warning'
  | 'destructive'
  | 'muted';

const PLATFORM_SHORT_NAME: Record<PlatformKey, string> = {
  yt_shorts: 'YouTube',
  tiktok: 'TikTok',
  ig_reels: 'Instagram',
  fb_reels: 'Facebook',
};

function platformStatusMeta(status: PlatformUploadStatus): {
  label: string;
  variant: PlatformStatusVariant;
} {
  switch (status) {
    case 'published':
      return { label: 'Tayang', variant: 'success' };
    case 'scheduled':
      return { label: 'Jadwal', variant: 'info' };
    case 'uploaded_draft':
      return { label: 'Draft', variant: 'warning' };
    case 'issue':
      return { label: 'Kendala', variant: 'destructive' };
    default:
      return { label: 'Belum', variant: 'muted' };
  }
}

export function PlatformStatusList({
  item,
  data,
  mode,
  scheduledAt = null,
  onTriggerRequest,
}: PlatformStatusListProps) {
  const publishedCount = countPublishedPlatforms(item);
  const schedulePill = formatShortSchedulePill(scheduledAt);
  const isScheduling = Boolean(scheduledAt);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
        <div className="space-y-0.5">
          <CardTitle>Status Platform</CardTitle>
          <p className="font-mono text-[11px] font-light text-muted-foreground/75">
            {item ? item.folderCode : 'Belum ada konten'}
          </p>
        </div>
        {schedulePill ? (
          <Badge variant="info" size="xs" className="font-mono">
            {schedulePill}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 space-y-1 p-2 pt-0">
        {!item ? (
          <p className="px-2 py-6 text-center text-[11px] font-light text-muted-foreground/75">
            Pilih konten untuk melihat status platform.
          </p>
        ) : (
          PLATFORM_ORDER.map((key: PlatformKey) => {
            const platformName = PLATFORM_SHORT_NAME[key];
            const platformState = item.userProperties.platforms[key];
            const engine = resolvePlatformEngine(
              key,
              data.capabilities as AutoPostCapabilities
            );
            const usesApi = engine.variant === 'info';
            const engineTooltip = usesApi
              ? key === 'yt_shorts'
                ? 'YouTube API'
                : 'Meta Graph API'
              : key === 'fb_reels' || key === 'ig_reels'
                ? 'Meta Business Suite'
                : 'Chrome / Edge Lokal';
            const status = platformStatusMeta(platformState.status);
            const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
            const isBusy = data.busyKey === `trigger:${item.id}`;
            const publishedUrl = platformState.publishedUrl;

            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PlatformIcon platform={key} />
                  <span className="truncate text-xs font-medium text-foreground">
                    {platformName}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label={engineTooltip}
                          className="inline-flex shrink-0 items-center rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      }
                    >
                      {usesApi ? (
                        <Zap
                          className="size-3.5 text-[#075985] dark:text-[#7dd3fc]"
                          aria-hidden="true"
                        />
                      ) : (
                        <Monitor
                          className="size-3.5 text-muted-foreground/70"
                          aria-hidden="true"
                        />
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top">{engineTooltip}</TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {platformState.status === 'scheduled' &&
                  platformState.scheduledTime ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className="inline-flex cursor-default rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        }
                      >
                        <Badge variant={status.variant} size="xs">
                          {status.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Terjadwal: {platformState.scheduledTime}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge variant={status.variant} size="xs">
                      {status.label}
                    </Badge>
                  )}
                  {platformState.status === 'published' && publishedUrl ? (
                    <IconActionButton
                      icon={ExternalLink}
                      label="Buka postingan"
                      onClick={() =>
                        window.open(
                          publishedUrl,
                          '_blank',
                          'noopener,noreferrer'
                        )
                      }
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <IconActionButton
                        icon={Eye}
                        label={
                          isScheduling
                            ? `Tinjau jadwal ${platformName}`
                            : `Tinjau ${platformName}`
                        }
                        disabled={!hasWmFinal || isBusy}
                        onClick={() =>
                          onTriggerRequest(item, [key], 'review', scheduledAt)
                        }
                      />
                      <IconActionButton
                        icon={isScheduling ? CalendarClock : Send}
                        label={
                          isScheduling
                            ? `Langsung jadwalkan ${platformName} (${schedulePill})`
                            : `Langsung publish ${platformName}`
                        }
                        variant="outline"
                        disabled={!hasWmFinal || isBusy}
                        onClick={() =>
                          onTriggerRequest(item, [key], 'publish', scheduledAt)
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
        <span className="text-[11px] font-light text-muted-foreground/75">
          {publishedCount}/4 selesai
        </span>
        {item ? (
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={
                      !item.autoMetadata.readiness.hasWmFinal ||
                      data.busyKey === `trigger:${item.id}`
                    }
                    onClick={() =>
                      onTriggerRequest(
                        item,
                        ['fb_reels', 'ig_reels'],
                        mode,
                        scheduledAt
                      )
                    }
                  />
                }
              >
                <span className="inline-flex items-center gap-1">
                  <PlatformIcon platform="fb_reels" size={12} />
                  <PlatformIcon platform="ig_reels" size={12} />
                  <span>
                    {isScheduling
                      ? mode === 'publish'
                        ? 'Jadwalkan FB + IG'
                        : 'Tinjau Jadwal FB + IG'
                      : mode === 'publish'
                        ? 'Publish FB + IG'
                        : 'Tinjau FB + IG'}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isScheduling
                  ? mode === 'publish'
                    ? `Langsung jadwalkan Facebook & Instagram (${schedulePill}) via Meta Business Suite`
                    : `Tinjau jadwal Facebook & Instagram (${schedulePill}) via Meta Business Suite`
                  : mode === 'publish'
                    ? 'Langsung publish Facebook & Instagram sekaligus via Meta Business Suite'
                    : 'Tinjau Facebook & Instagram sekaligus via Meta Business Suite'}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}
