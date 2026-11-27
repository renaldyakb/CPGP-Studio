import {
  CalendarClock,
  Check,
  ExternalLink,
  Eye,
  Monitor,
  Send,
  Settings2,
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
import type { AutoPostCapabilities, AutoPostMode } from '@/types/autopost';
import type {
  ContentPlannerItem,
  PlatformKey,
  PlatformUploadStatus,
} from '@/types/planner';
import type { AutoPostPage, UseAutoPostDataResult } from '../useAutoPostData';
import {
  countPublishedPlatforms,
  resolvePlatformEngine,
} from '../useAutoPostData';
import { PLATFORM_ORDER, PlatformIcon } from './platformMeta';

export interface PlatformStatusListProps {
  item: ContentPlannerItem | null;
  data: UseAutoPostDataResult;
  mode: AutoPostMode;
  scheduledAt?: string | null;
  selectedPlatforms: PlatformKey[];
  onTogglePlatform: (platform: PlatformKey) => void;
  onSelectAllPending: () => void;
  onNavigatePage: (page: AutoPostPage) => void;
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
  yt_shorts: 'YouTube Shorts',
  tiktok: 'TikTok',
  ig_reels: 'Instagram Reels',
  fb_reels: 'Facebook Reels',
};

function platformStatusMeta(status: PlatformUploadStatus): {
  label: string;
  variant: PlatformStatusVariant;
} {
  switch (status) {
    case 'published':
      return { label: 'Tayang', variant: 'success' };
    case 'scheduled':
      return { label: 'Terjadwal', variant: 'info' };
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
  selectedPlatforms,
  onTogglePlatform,
  onSelectAllPending,
  onNavigatePage,
  onTriggerRequest,
}: PlatformStatusListProps) {
  const publishedCount = countPublishedPlatforms(item);
  const schedulePill = formatShortSchedulePill(scheduledAt);
  const isScheduling = Boolean(scheduledAt);
  const hasCdpUrl = Boolean(data.settings.browser.cdpUrl?.trim());

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm">Target Platform</CardTitle>
          <p className="text-xs text-muted-foreground">
            Centang platform yang ingin dikirim sekaligus atau jalankan satu per
            satu.
          </p>
        </div>
        {item ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onSelectAllPending}
            className="min-h-9 shrink-0 sm:min-h-7"
          >
            Pilih Belum Tayang
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 space-y-2 p-3 pt-1">
        {!item ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            Pilih konten untuk melihat dan memilih target platform.
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
            const engineLabel = usesApi
              ? key === 'yt_shorts'
                ? 'YouTube API'
                : 'Meta API'
              : hasCdpUrl
                ? 'Chrome CDP'
                : key === 'fb_reels' || key === 'ig_reels'
                  ? 'Meta Studio'
                  : 'Browser';
            const engineTargetPage: AutoPostPage = usesApi
              ? key === 'yt_shorts'
                ? 'youtube'
                : 'meta'
              : 'studio';

            const status = platformStatusMeta(platformState.status);
            const hasWmFinal = item.autoMetadata.readiness.hasWmFinal;
            const isBusy = data.busyKey === `trigger:${item.id}`;
            const publishedUrl = platformState.publishedUrl;
            const isPublished = platformState.status === 'published';
            const isSelected = selectedPlatforms.includes(key);
            const igScheduleWarning =
              isScheduling && key === 'ig_reels' && usesApi;

            return (
              <div
                key={key}
                className={
                  isSelected
                    ? 'rounded-lg border border-[#7F1D1D]/35 bg-[#FCE7EB]/35 p-2.5 transition-colors dark:border-[#9F1239]/50 dark:bg-[#4C0519]/25'
                    : 'rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-muted/40'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Pilih ${platformName}`}
                      onClick={() => onTogglePlatform(key)}
                      className={
                        isSelected
                          ? 'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-[#7F1D1D] bg-[#7F1D1D] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#9F1239] dark:bg-[#9F1239]'
                          : 'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-input bg-card text-transparent hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      }
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <PlatformIcon platform={key} size={16} />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {platformName}
                        </span>
                        <Badge variant={status.variant} size="xs">
                          {status.label}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => onNavigatePage(engineTargetPage)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {usesApi ? (
                            <Zap
                              className="size-3 text-[#075985] dark:text-[#7dd3fc]"
                              aria-hidden="true"
                            />
                          ) : (
                            <Monitor className="size-3" aria-hidden="true" />
                          )}
                          <span>{engineLabel}</span>
                          <Settings2 className="size-2.5" aria-hidden="true" />
                        </button>
                        {platformState.status === 'scheduled' &&
                        platformState.scheduledTime ? (
                          <span className="font-mono text-[11px]">
                            · {platformState.scheduledTime}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isPublished && publishedUrl ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          window.open(
                            publishedUrl,
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                        className="min-h-9 sm:min-h-7"
                      >
                        <ExternalLink className="size-3" aria-hidden="true" />
                        <span>Buka</span>
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          aria-label={
                            isScheduling
                              ? `Tinjau jadwal ${platformName}`
                              : `Tinjau ${platformName}`
                          }
                          disabled={!hasWmFinal || isBusy}
                          onClick={() =>
                            onTriggerRequest(
                              item,
                              [key],
                              'review',
                              scheduledAt
                            )
                          }
                          className="min-h-9 sm:min-h-7"
                        >
                          <Eye className="size-3" aria-hidden="true" />
                          <span>Tinjau</span>
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          aria-label={
                            isScheduling
                              ? `Langsung jadwalkan ${platformName}`
                              : `Langsung publish ${platformName}`
                          }
                          disabled={!hasWmFinal || isBusy}
                          onClick={() =>
                            onTriggerRequest(
                              item,
                              [key],
                              'publish',
                              scheduledAt
                            )
                          }
                          className="min-h-9 sm:min-h-7"
                        >
                          {isScheduling ? (
                            <CalendarClock
                              className="size-3"
                              aria-hidden="true"
                            />
                          ) : (
                            <Send className="size-3" aria-hidden="true" />
                          )}
                          <span>{isScheduling ? 'Jadwal' : 'Kirim'}</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {igScheduleWarning ? (
                  <p className="mt-1.5 pl-7 text-[11px] font-medium text-[#92400e] dark:text-[#fcd34d]">
                    IG Graph API belum mendukung jadwal. Pilih Sekarang atau
                    pakai Browser Studio.
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono font-medium text-foreground">
            {publishedCount}/4
          </span>
          <span>tayang</span>
          {schedulePill ? (
            <Badge variant="info" size="xs" className="font-mono">
              {schedulePill}
            </Badge>
          ) : null}
        </div>
        {item ? (
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
            className="min-h-9 sm:min-h-7"
          >
            <PlatformIcon platform="fb_reels" size={12} />
            <PlatformIcon platform="ig_reels" size={12} />
            <span>
              {isScheduling
                ? mode === 'publish'
                  ? 'Jadwalkan FB + IG'
                  : 'Tinjau FB + IG'
                : mode === 'publish'
                  ? 'Publish FB + IG'
                  : 'Tinjau FB + IG'}
            </span>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
