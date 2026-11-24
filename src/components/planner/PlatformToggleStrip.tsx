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
          'border-[#86efac] bg-[#dcfce7] text-[#166534] dark:border-[#166534] dark:bg-[#052e16] dark:text-[#86efac]',
        useBrandIconColor: false,
      };
    case 'scheduled':
      return {
        statusLabel: 'Terjadwal',
        pillClassName:
          'border-[#7dd3fc] bg-[#e0f2fe] text-[#075985] dark:border-[#0369a1] dark:bg-[#082f49] dark:text-[#7dd3fc]',
        useBrandIconColor: false,
      };
    case 'uploaded_draft':
      return {
        statusLabel: 'Draft Studio',
        pillClassName:
          'border-[#fcd34d] bg-[#fef3c7] text-[#92400e] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fcd34d]',
        useBrandIconColor: false,
      };
    case 'issue':
      return {
        statusLabel: 'Kendala / Revisi',
        pillClassName:
          'border-[#fca5a5] bg-[#fee2e2] text-[#991b1b] dark:border-[#991b1b] dark:bg-[#450a0a] dark:text-[#fca5a5]',
        useBrandIconColor: false,
      };
    default:
      return {
        statusLabel: 'Belum Upload',
        pillClassName:
          'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
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
      <div className="flex items-center gap-1">
        {PLATFORM_ORDER.map((key) => {
          const meta = PLATFORM_META[key];
          const status = platforms[key]?.status || 'not_started';
          const visual = getPlatformStatusVisual(status);
          const tooltipText = onTogglePlatform && !disabled
            ? `${meta.label}: ${visual.statusLabel} (Klik untuk ubah status)`
            : `${meta.label}: ${visual.statusLabel}`;

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
                      'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none',
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
                      ? `${meta.accentClass} opacity-80`
                      : 'text-current'
                  }
                />
                {status === 'published' ? (
                  <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : status === 'scheduled' || status === 'uploaded_draft' ? (
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : status === 'issue' ? (
                  <AlertTriangle
                    className="h-3 w-3 shrink-0"
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
          className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums"
          title={`${publishedCount} dari 4 platform sudah publish`}
        >
          {publishedCount}/4
        </span>
      ) : null}
    </div>
  );
};

export default PlatformToggleStrip;
