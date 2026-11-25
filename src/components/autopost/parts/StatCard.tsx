import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'info';
  active?: boolean;
  onClick?: () => void;
}

const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-[#166534] dark:text-[#86efac]',
  warning: 'text-[#92400e] dark:text-[#fcd34d]',
  info: 'text-[#075985] dark:text-[#7dd3fc]',
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  active = false,
  onClick,
}: StatCardProps) {
  const interactive = Boolean(onClick);

  return (
    <Card
      className={cn(
        'transition-colors',
        interactive && 'cursor-pointer hover:bg-muted/50',
        active && 'border-foreground/40 bg-muted/40'
      )}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? active : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'font-mono text-2xl font-semibold leading-none tabular-nums',
              TONE_CLASS[tone]
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="text-[11px] font-light leading-tight text-muted-foreground/75">
              {hint}
            </p>
          ) : null}
        </div>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted"
          aria-hidden="true"
        >
          <Icon className={cn('h-3.5 w-3.5', TONE_CLASS[tone])} />
        </span>
      </CardContent>
    </Card>
  );
}