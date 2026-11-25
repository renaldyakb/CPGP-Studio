import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DEFAULT_TIME_SLOTS } from '../../../shared/rulePresets';
import {
  Input,
  NativeSelect,
  Separator,
} from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  KANBAN_COLUMNS,
  PLATFORMS,
  type WorkflowStatus,
} from '@/types/planner';
import {
  usePlannerWorkspace,
  type PlannerPlatformFilter,
  type PlannerReadinessFilter,
  type PlannerSlotFilter,
} from './PlannerContext';

const PLATFORM_FILTER_OPTIONS: Array<{
  value: PlannerPlatformFilter;
  label: string;
}> = [
  { value: 'all', label: 'Semua platform' },
  { value: 'missing_yt_shorts', label: 'Belum upload YouTube Shorts' },
  { value: 'missing_tiktok', label: 'Belum upload TikTok' },
  { value: 'missing_ig_reels', label: 'Belum upload Instagram Reels' },
  { value: 'missing_fb_reels', label: 'Belum upload Facebook Reels' },
];

export function PlannerToolbar() {
  const workspace = usePlannerWorkspace();

  const slotValue = workspace.slotFilter;
  const readinessValue = workspace.readinessFilter;
  const platformValue = workspace.platformFilter;
  const statusValue = workspace.workflowStatusFilter;

  const timeSlotsList = Object.values(
    workspace.activeWorkspace?.timeSlots ?? DEFAULT_TIME_SLOTS
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative w-full max-w-xs">
          <label htmlFor="planner-search" className="sr-only">
            Cari konten
          </label>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="planner-search"
            value={workspace.searchQuery}
            onChange={(event) => workspace.setSearchQuery(event.target.value)}
            placeholder="Cari kode, judul, atau tag"
            className="pl-8 pr-8"
          />
          {workspace.searchQuery ? (
            <button
              type="button"
              onClick={() => workspace.setSearchQuery('')}
              aria-label="Bersihkan pencarian"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" aria-label="Buka filter" />
            }
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filter</span>
            {workspace.activeFilterCount > 0 ? (
              <Badge variant="default" size="xs" className="ml-1">
                {workspace.activeFilterCount}
              </Badge>
            ) : null}
          </PopoverTrigger>

          <PopoverContent align="start" className="w-80 space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="planner-filter-slot"
                className="block text-[11px] font-medium text-foreground"
              >
                Slot jam upload
              </label>
              <NativeSelect
                id="planner-filter-slot"
                className="w-full"
                value={slotValue}
                onChange={(event) =>
                  workspace.setSlotFilter(event.target.value as PlannerSlotFilter)
                }
              >
                <option value="all">Semua slot</option>
                {timeSlotsList.map((slot) => (
                  <option key={slot.code} value={slot.code}>
                    {slot.code} {slot.label}, {slot.defaultTime} WIB
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="planner-filter-readiness"
                className="block text-[11px] font-medium text-foreground"
              >
                Status berkas
              </label>
              <NativeSelect
                id="planner-filter-readiness"
                className="w-full"
                value={readinessValue}
                onChange={(event) =>
                  workspace.setReadinessFilter(
                    event.target.value as PlannerReadinessFilter
                  )
                }
              >
                <option value="all">Semua status</option>
                <option value="ready">Siap upload (wm_final ada)</option>
                <option value="needs_wm">Butuh watermark</option>
                <option value="incomplete">Aset kurang</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="planner-filter-platform"
                className="block text-[11px] font-medium text-foreground"
              >
                Status platform
              </label>
              <NativeSelect
                id="planner-filter-platform"
                className="w-full"
                value={platformValue}
                onChange={(event) =>
                  workspace.setPlatformFilter(
                    event.target.value as PlannerPlatformFilter
                  )
                }
              >
                {PLATFORM_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="planner-filter-status"
                className="block text-[11px] font-medium text-foreground"
              >
                Status alur kerja
              </label>
              <NativeSelect
                id="planner-filter-status"
                className="w-full"
                value={statusValue}
                onChange={(event) =>
                  workspace.setWorkflowStatusFilter(
                    event.target.value as WorkflowStatus | 'all'
                  )
                }
              >
                <option value="all">Semua status</option>
                {KANBAN_COLUMNS.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.shortLabel}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {workspace.availableMonths.length > 0 ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="planner-filter-month"
                  className="block text-[11px] font-medium text-foreground"
                >
                  Bulan
                </label>
                <NativeSelect
                  id="planner-filter-month"
                  className="w-full"
                  value={workspace.monthFilter}
                  onChange={(event) =>
                    workspace.setMonthFilter(event.target.value)
                  }
                >
                  <option value="all">Semua bulan</option>
                  {workspace.availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}

            <Separator />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={workspace.resetFilters}
            >
              Reset semua filter
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2 font-mono text-[11px] font-light text-muted-foreground/85">
        <span>
          {workspace.filteredItems.length}/{workspace.allItems.length} konten
        </span>
        {workspace.database?.stats ? (
          <span className="hidden sm:inline">
            · {workspace.database.stats.uploadReadyCount} siap ·{' '}
            {workspace.database.stats.needsWatermarkCount} WM
          </span>
        ) : null}
      </div>
    </div>
  );
}