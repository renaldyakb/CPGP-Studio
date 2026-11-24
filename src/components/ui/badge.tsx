import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * ReUI + shadcn/ui compatible Badge primitive with WCAG AA verified contrast pairings
 * in both Light and Dark themes.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 border font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground border-primary',
        secondary: 'bg-secondary text-secondary-foreground border-border',
        outline: 'bg-card text-foreground border-border',
        muted: 'bg-muted text-muted-foreground border-border',
        success:
          'bg-[#dcfce7] text-[#166534] border-[#86efac] dark:bg-[#052e16] dark:text-[#86efac] dark:border-[#166534]',
        warning:
          'bg-[#fef3c7] text-[#92400e] border-[#fcd34d] dark:bg-[#451a03] dark:text-[#fcd34d] dark:border-[#92400e]',
        destructive:
          'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5] dark:bg-[#450a0a] dark:text-[#fca5a5] dark:border-[#991b1b]',
        info:
          'bg-[#e0f2fe] text-[#075985] border-[#7dd3fc] dark:bg-[#082f49] dark:text-[#7dd3fc] dark:border-[#0369a1]',
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        sm: 'px-1.5 py-0.5 text-[11px]',
        xs: 'px-1.5 py-0 text-[10px] leading-4',
      },
      radius: {
        default: 'rounded-sm',
        md: 'rounded-md',
        full: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
      radius: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, radius, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, radius }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
