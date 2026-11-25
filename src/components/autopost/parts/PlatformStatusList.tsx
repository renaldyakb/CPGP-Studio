import { ExternalLink, Monitor, Play, Zap } from 'lucide-react';
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
import type { AutoPostCapabilities } from '@/types/autopost';
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

export function PlatformStatusList({ item, data }: PlatformStatusListProps) {
  const publishedCount = countPublishedPlatforms(item);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle>Status Platform</CardTitle>
        <p className="font-mono text-[11px] font-light text-muted-foreground/75">
          {item ? item.folderCode : 'Belum ada konten'}
        </p>
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
                  <Badge variant={status.variant} size="xs">
                    {status.label}
                  </Badge>
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
                    <IconActionButton
                      icon={Play}
                      label={`Auto-Post ${platformName}`}
                      disabled={!hasWmFinal || isBusy}
                      onClick={() =>
                        void data.triggerPost(
                          item.id,
                          [key],
                          data.settings.defaultMode
                        )
                      }
                    />
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
                    void data.triggerPost(
                      item.id,
                      ['fb_reels', 'ig_reels'],
                      data.settings.defaultMode
                    )
                  }
                />
              }
            >
              <span className="inline-flex items-center gap-1">
                <PlatformIcon platform="fb_reels" size={12} />
                <PlatformIcon platform="ig_reels" size={12} />
                <span>FB + IG</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Upload Facebook &amp; Instagram sekaligus via Meta Business Suite
            </TooltipContent>
          </Tooltip>
        ) : null}
      </CardFooter>
    </Card>
  );
}
