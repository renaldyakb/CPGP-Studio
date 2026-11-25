import React from 'react';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import type {
  ContentPlannerItem,
  PlatformKey,
  PlatformUploadStatus,
} from '@/types/planner';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface PlatformToggleStripProps {
  item: ContentPlannerItem;
  onTogglePlatform?: (
    item: ContentPlannerItem,
    platformKey: PlatformKey
  ) => void;
  disabled?: boolean;
  showCounter?: boolean;
  className?: string;
}

function getPlatformStatusVisual(status: PlatformUploadStatus): {
  statusLabel: string;
  pillClassName: string;
  useBrandIconColor: boolean;
} {
  switch (status) {
    case 'published':
      return {
        statusLabel: 'Published',
        pillClassName:
          'border-transparent bg-[#dcfce7]/85 text-[#166534] hover:bg-[#dcfce7] dark:bg-[#052e16]/85 dark:text-[#86efac] dark:hover:bg-[#052e16]',
        useBrandIconColor: false,
      };
    case 'scheduled':
      return {
        statusLabel: 'Terjadwal',
        pillClassName:
          'border-transparent bg-[#e0f2fe]/85 text-[#075985] hover:bg-[#e0f2fe] dark:bg-[#082f49]/85 dark:text-[#7dd3fc] dark:hover:bg-[#082f49]',
        useBrandIconColor: false,
      };
    case 'uploaded_draft':
      return {
        statusLabel: 'Draft Studio',
        pillClassName:
          'border-transparent bg-[#fef3c7]/85 text-[#92400e] hover:bg-[#fef3c7] dark:bg-[#451a03]/85 dark:text-[#fcd34d] dark:hover:bg-[#451a03]',
        useBrandIconColor: false,
      };
    case 'issue':
      return {
        statusLabel: 'Kendala / Revisi',
        pillClassName:
          'border-transparent bg-[#fee2e2]/85 text-[#991b1b] hover:bg-[#fee2e2] dark:bg-[#450a0a]/85 dark:text-[#fca5a5] dark:hover:bg-[#450a0a]',
        useBrandIconColor: false,
      };
    default:
      return {
        statusLabel: 'Belum Upload',
        pillClassName:
          'border-transparent bg-transparent text-muted-foreground opacity-60 hover:opacity-100 hover:bg-card hover:text-foreground',
        useBrandIconColor: true,
      };
  }
}

export const PlatformToggleStrip: React.FC<PlatformToggleStripProps> = ({
  item,
  onTogglePlatform,
  disabled = false,
  showCounter = true,
  className,
}) => {
  const { platforms } = item.userProperties;

  const publishedCount = PLATFORM_ORDER.filter(
    (key) => platforms[key]?.status === 'published'
  ).length;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        className
      )}
    >
      <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/35 p-0.5">
        {PLATFORM_ORDER.map((key) => {
          const meta = PLATFORM_META[key];
          const status = platforms[key]?.status || 'not_started';
          const visual = getPlatformStatusVisual(status);
          const tooltipText = `${meta.label}: ${visual.statusLabel}`;

          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={disabled || !onTogglePlatform}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!disabled && onTogglePlatform) {
                        onTogglePlatform(item, key);
                      }
                    }}
                    aria-label={tooltipText}
                    className={cn(
                      'inline-flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none',
                      visual.pillClassName
                    )}
                  />
                }
              >
                <PlatformIcon
                  platform={key}
                  size={13}
                  className={
                    visual.useBrandIconColor
                      ? `${meta.accentClass}`
                      : 'text-current'
                  }
                />
                {status === 'published' ? (
                  <Check className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                ) : status === 'scheduled' ? (
                  <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                ) : status === 'issue' ? (
                  <AlertTriangle
                    className="h-2.5 w-2.5 shrink-0"
                    aria-hidden="true"
                  />
                ) : null}
              </TooltipTrigger>
              <TooltipContent side="top">{tooltipText}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {showCounter ? (
        <span
          className="shrink-0 font-mono text-[11px] font-light text-muted-foreground/75 tabular-nums"
          title={`${publishedCount} dari 4 platform sudah publish`}
        >
          {publishedCount}/4
        </span>
      ) : null}
    </div>
  );
};

export default PlatformToggleStrip;
