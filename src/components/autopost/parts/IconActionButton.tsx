import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ButtonProps = React.ComponentProps<typeof Button>;

export interface IconActionButtonProps extends Omit<ButtonProps, 'children'> {
  icon: LucideIcon;
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  iconClassName?: string;
}

/**
 * Single source of truth for icon-only actions.
 * Always exposes an accessible name plus a tooltip.
 */
export function IconActionButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'icon-sm',
  side = 'top',
  className,
  iconClassName,
  ...props
}: IconActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
            className={cn('shrink-0', className)}
            {...props}
          />
        }
      >
        <Icon
          className={cn('h-3.5 w-3.5', iconClassName)}
          aria-hidden="true"
        />
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}