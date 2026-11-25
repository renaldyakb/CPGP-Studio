import * as React from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale/id';
import { type DateRange } from 'react-day-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export const INDONESIAN_MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const MONTH_ALIASES: Record<string, number> = {
  januari: 0,
  january: 0,
  jan: 0,
  februari: 1,
  february: 1,
  feb: 1,
  maret: 2,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  may: 4,
  juni: 5,
  june: 5,
  jun: 5,
  juli: 6,
  july: 6,
  jul: 6,
  agustus: 7,
  august: 7,
  agu: 7,
  ags: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  oktober: 9,
  october: 9,
  okt: 9,
  oct: 9,
  november: 10,
  nov: 10,
  desember: 11,
  december: 11,
  des: 11,
  dec: 11,
};

export function monthNameToIndex(name: string): number {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return -1;
  if (normalized in MONTH_ALIASES) {
    return MONTH_ALIASES[normalized];
  }
  const idx = INDONESIAN_MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === normalized
  );
  return idx;
}

export interface DatePickerProps {
  id?: string;
  value?: Date;
  onChange: (date?: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  defaultMonth?: Date;
  ariaLabel?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pilih tanggal',
  disabled = false,
  className,
  defaultMonth,
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const label = value
    ? format(value, 'd MMM yyyy', { locale: idLocale })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              'min-h-9 w-full justify-start gap-2 rounded-md border-input bg-card px-3 text-left text-xs font-normal text-foreground hover:bg-muted/60',
              !value && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <CalendarIcon
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value ?? defaultMonth}
          locale={idLocale}
          onSelect={(nextDate) => {
            onChange(nextDate);
            if (nextDate) {
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateRangePickerProps {
  id?: string;
  value?: DateRange;
  onChange: (range?: DateRange) => void;
  placeholder?: string;
  disabled?: boolean;
  numberOfMonths?: number;
  className?: string;
  defaultMonth?: Date;
  ariaLabel?: string;
}

function formatDateRangeLabel(
  range: DateRange | undefined,
  placeholder: string
): string {
  if (!range?.from) return placeholder;
  if (!range.to) {
    return format(range.from, 'd MMM yyyy', { locale: idLocale });
  }
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  const sameDay =
    sameYear &&
    range.from.getMonth() === range.to.getMonth() &&
    range.from.getDate() === range.to.getDate();

  if (sameDay) {
    return format(range.from, 'd MMM yyyy', { locale: idLocale });
  }
  if (sameYear) {
    return `${format(range.from, 'd MMM', { locale: idLocale })} - ${format(range.to, 'd MMM yyyy', { locale: idLocale })}`;
  }
  return `${format(range.from, 'd MMM yyyy', { locale: idLocale })} - ${format(range.to, 'd MMM yyyy', { locale: idLocale })}`;
}

export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder = 'Pilih rentang',
  disabled = false,
  numberOfMonths = 2,
  className,
  defaultMonth,
  ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const hasValue = Boolean(value?.from || value?.to);
  const label = formatDateRangeLabel(value, placeholder);

  return (
    <div className={cn('relative flex items-center', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={ariaLabel}
              className={cn(
                'min-h-9 w-full justify-start gap-2 rounded-md border-input bg-card px-3 text-left text-xs font-normal text-foreground hover:bg-muted/60',
                hasValue && !disabled && 'pr-8',
                !hasValue && 'text-muted-foreground'
              )}
            />
          }
        >
          <CalendarIcon
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={value}
            defaultMonth={value?.from ?? defaultMonth}
            numberOfMonths={numberOfMonths}
            locale={idLocale}
            onSelect={(nextRange) => {
              onChange(nextRange);
            }}
          />
        </PopoverContent>
      </Popover>

      {hasValue && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Hapus rentang tanggal"
          onClick={(event) => {
            event.stopPropagation();
            onChange(undefined);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
