import { ExternalLink, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { PLATFORM_META, PLATFORM_ORDER, PlatformIcon } from './platformMeta';

export interface PlatformStatusListProps {
  item: ContentPlannerItem | null;
  data: UseAutoPostDataResult;
}

type PlatformStatusVariant = 'success' | 'info' | 'warning' | 'destructive' | 'muted';

function platformStatusMeta(status: PlatformUploadStatus): {
  label: string;
  variant: PlatformStatusVariant;
} {
  switch (status) {
    case 'published':
      return { label: 'Published', variant: 'success' };
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

export function PlatformStatusList({ item, data }: PlatformStatusListProps) {
  const publishedCount = countPublishedPlatforms(item);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle>Status Platform</CardTitle>
        <p className="font-mono text-[11px] text-muted-foreground">
          {item ? item.folderCode : 'Belum ada konten terpilih'}
        </p>
      </CardHeader>

      <CardContent className="flex-1 space-y-1 p-2 pt-0">
        {!item ? (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            Pilih konten untuk melihat status per platform.
          </p>
        ) : (
          PLATFORM_ORDER.map((key: PlatformKey) => {
            const meta = PLATFORM_META[key];
            const platformState = item.userProperties.platforms[key];
            const engine = resolvePlatformEngine(
              key,
              data.capabilities as AutoPostCapabilities
            );
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
                    {meta.label}
                  </span>
                  <Badge variant={engine.variant} size="xs">
                    {engine.label}
                  </Badge>
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
                      label={`Auto-Post ${meta.label}`}
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

      <CardFooter className="border-t border-border px-4 py-2">
        <span className="text-[11px] text-muted-foreground">
          {publishedCount} dari 4 platform selesai
        </span>
      </CardFooter>
    </Card>
  );
}
