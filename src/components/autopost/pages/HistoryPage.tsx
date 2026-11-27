import { Fragment, useMemo, useState, type ComponentProps } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RotateCcw,
  Square,
  Terminal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-picker';
import { Input, NativeSelect } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  AutoPostEngine,
  AutoPostJob,
  AutoPostJobStatus,
} from '@/types/autopost';
import type { PlatformKey } from '@/types/planner';
import type { AutoPostPageProps } from '../pageProps';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '../parts/platformMeta';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

const STATUS_META: Record<
  AutoPostJobStatus,
  { label: string; variant: BadgeVariant }
> = {
  running: { label: 'Berjalan', variant: 'info' },
  queued: { label: 'Antre', variant: 'muted' },
  awaiting_review: { label: 'Menunggu tinjau', variant: 'warning' },
  completed: { label: 'Selesai', variant: 'success' },
  failed: { label: 'Gagal', variant: 'destructive' },
  cancelled: { label: 'Dibatalkan', variant: 'muted' },
};

const ENGINE_META: Record<
  AutoPostEngine,
  { label: string; variant: BadgeVariant }
> = {
  browser: { label: 'Browser', variant: 'muted' },
  youtube_api: { label: 'YouTube API', variant: 'info' },
  meta_api: { label: 'Meta API', variant: 'info' },
};

const STATUS_FILTER_OPTIONS: Array<{
  value: AutoPostJobStatus | 'all';
  label: string;
}> = [
  { value: 'all', label: 'Semua status' },
  { value: 'running', label: 'Berjalan' },
  { value: 'awaiting_review', label: 'Menunggu tinjau' },
  { value: 'completed', label: 'Selesai' },
  { value: 'failed', label: 'Gagal' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

function formatJobTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function HistoryPage({ ctx }: AutoPostPageProps) {
  const { jobs, isLoading } = ctx.data;

  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformKey[]>([]);
  const [statusFilter, setStatusFilter] = useState<AutoPostJobStatus | 'all'>(
    'all'
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (dateRange?.from) {
      rangeStart = new Date(dateRange.from);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(dateRange.to ?? dateRange.from);
      rangeEnd.setHours(23, 59, 59, 999);
    }

    return jobs
      .filter((job) => {
        if (
          platformFilter.length > 0 &&
          !platformFilter.includes(job.platform)
        ) {
          return false;
        }
        if (statusFilter !== 'all' && job.status !== statusFilter) {
          return false;
        }
        if (rangeStart && rangeEnd) {
          const created = new Date(job.createdAt);
          if (
            Number.isNaN(created.getTime()) ||
            created < rangeStart ||
            created > rangeEnd
          ) {
            return false;
          }
        }
        if (needle) {
          const haystack =
            `${job.folderCode} ${PLATFORM_META[job.platform].label} ${job.error ?? ''} ${job.step ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [dateRange, jobs, platformFilter, search, statusFilter]);

  const hasActiveFilter =
    search.trim().length > 0 ||
    platformFilter.length > 0 ||
    statusFilter !== 'all' ||
    Boolean(dateRange?.from);

  function togglePlatform(platform: PlatformKey) {
    setPlatformFilter((prev) =>
      prev.includes(platform)
        ? prev.filter((value) => value !== platform)
        : [...prev, platform]
    );
  }

  function toggleExpanded(jobId: string) {
    setExpandedIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  }

  function resetFilters() {
    setSearch('');
    setPlatformFilter([]);
    setStatusFilter('all');
    setDateRange(undefined);
  }

  function handleRetry(job: AutoPostJob) {
    void ctx.data.triggerPost(
      job.itemId,
      [job.platform],
      job.mode,
      job.scheduledAt ?? null,
      Boolean(job.aiGenerated)
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <label
                htmlFor="autopost-history-search"
                className="block text-xs font-medium text-foreground"
              >
                Cari Riwayat
              </label>
              <Input
                id="autopost-history-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kode folder, platform, atau pesan error..."
                className="min-h-10 w-full text-xs sm:min-h-9"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-foreground">
                  Platform
                </span>
                <div
                  role="group"
                  aria-label="Filter platform"
                  className="flex items-center gap-1"
                >
                  {PLATFORM_ORDER.map((key) => {
                    const active = platformFilter.includes(key);
                    const label = `Filter ${PLATFORM_META[key].label}`;
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="icon-sm"
                        aria-label={label}
                        aria-pressed={active}
                        title={label}
                        onClick={() => togglePlatform(key)}
                        className="min-h-10 min-w-10 sm:min-h-9 sm:min-w-9"
                      >
                        <PlatformIcon platform={key} />
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="autopost-history-date-range"
                  className="block text-xs font-medium text-foreground"
                >
                  Rentang Tanggal
                </label>
                <DateRangePicker
                  id="autopost-history-date-range"
                  value={dateRange}
                  onChange={setDateRange}
                  placeholder="Semua tanggal"
                  ariaLabel="Filter rentang tanggal riwayat"
                  className="w-full sm:w-[215px]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="autopost-history-status"
                  className="block text-xs font-medium text-foreground"
                >
                  Status
                </label>
                <NativeSelect
                  id="autopost-history-status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as AutoPostJobStatus | 'all'
                    )
                  }
                  className="min-h-10 sm:min-h-9"
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasActiveFilter}
                onClick={resetFilters}
                className="min-h-10 sm:min-h-9"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                <span>Reset</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Konten</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead>Status &amp; Ringkasan</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && jobs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="p-6 text-center text-xs text-muted-foreground"
                >
                  Memuat riwayat proses Auto-Post...
                </TableCell>
              </TableRow>
            ) : filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-8">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      {jobs.length === 0
                        ? 'Belum ada riwayat Auto-Post pada sesi ini. Mulai kirim konten dari Dasbor.'
                        : 'Tidak ada proses yang cocok dengan filter aktif.'}
                    </p>
                    {jobs.length === 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => ctx.onNavigate('dashboard')}
                      >
                        Buka Dasbor Auto-Post
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={resetFilters}
                      >
                        Reset Filter
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs.map((job) => {
                const status = STATUS_META[job.status];
                const engine = ENGINE_META[job.engine];
                const isActive =
                  job.status === 'running' || job.status === 'queued';
                const canRetry =
                  job.status === 'failed' || job.status === 'cancelled';
                const isExpanded = expandedIds.includes(job.jobId);
                const logs = job.logs ?? [];

                return (
                  <Fragment key={job.jobId}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatJobTime(job.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">
                        {job.folderCode}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
                          <PlatformIcon platform={job.platform} />
                          {PLATFORM_META[job.platform].label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={engine.variant} size="xs">
                          {engine.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="space-y-1">
                          <Badge variant={status.variant} size="xs">
                            {status.label}
                          </Badge>
                          {job.error ? (
                            <p className="line-clamp-2 text-xs text-[#991b1b] dark:text-[#fca5a5]">
                              {job.error}
                            </p>
                          ) : job.step ? (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {job.step}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {logs.length > 0 ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              aria-expanded={isExpanded}
                              onClick={() => toggleExpanded(job.jobId)}
                              className="min-h-7"
                            >
                              <Terminal className="size-3" aria-hidden="true" />
                              <span>Log</span>
                              {isExpanded ? (
                                <ChevronUp className="size-3" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="size-3" aria-hidden="true" />
                              )}
                            </Button>
                          ) : null}

                          {job.publishedUrl ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                window.open(
                                  job.publishedUrl as string,
                                  '_blank',
                                  'noopener,noreferrer'
                                );
                              }}
                              className="min-h-7"
                            >
                              <ExternalLink className="size-3" aria-hidden="true" />
                              <span>Buka</span>
                            </Button>
                          ) : null}

                          {canRetry ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => handleRetry(job)}
                              className="min-h-7"
                            >
                              <RotateCcw className="size-3" aria-hidden="true" />
                              <span>Ulangi</span>
                            </Button>
                          ) : null}

                          {isActive ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => void ctx.data.cancelJob(job.jobId)}
                              className="min-h-7"
                            >
                              <Square className="size-3" aria-hidden="true" />
                              <span>Batal</span>
                            </Button>
                          ) : null}

                          {job.status === 'awaiting_review' ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="editorial"
                              onClick={() => void ctx.data.confirmJob(job.jobId)}
                              className="min-h-7"
                            >
                              <Check className="size-3" aria-hidden="true" />
                              <span>Publish</span>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40 p-3">
                          {job.error ? (
                            <div className="mb-2 flex items-start gap-1.5 rounded-md border border-[#fca5a5] bg-[#fef2f2] p-2 text-xs text-[#991b1b] dark:border-[#991b1b] dark:bg-[#450a0a] dark:text-[#fca5a5]">
                              <AlertCircle
                                className="mt-0.5 size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{job.error}</span>
                            </div>
                          ) : null}
                          <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
                            {logs.map((entry, idx) => (
                              <li
                                key={`${job.jobId}-hlog-${idx}`}
                                className={
                                  entry.level === 'error'
                                    ? 'text-[#991b1b] dark:text-[#fca5a5]'
                                    : entry.level === 'warning'
                                      ? 'text-[#92400e] dark:text-[#fcd34d]'
                                      : entry.level === 'success'
                                        ? 'text-[#166534] dark:text-[#86efac]'
                                        : 'text-foreground'
                                }
                              >
                                <span className="mr-2 text-muted-foreground">
                                  {formatLogTime(entry.timestamp)}
                                </span>
                                <span>{entry.message}</span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile & Tablet Stacked Cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:hidden">
        {isLoading && jobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-xs text-muted-foreground">
            Memuat riwayat proses Auto-Post...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-xs text-muted-foreground">
              {jobs.length === 0
                ? 'Belum ada riwayat Auto-Post pada sesi ini.'
                : 'Tidak ada proses yang cocok dengan filter aktif.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={
                jobs.length === 0
                  ? () => ctx.onNavigate('dashboard')
                  : resetFilters
              }
              className="min-h-10"
            >
              {jobs.length === 0 ? 'Buka Dasbor' : 'Reset Filter'}
            </Button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const status = STATUS_META[job.status];
            const engine = ENGINE_META[job.engine];
            const isExpanded = expandedIds.includes(job.jobId);
            const canRetry =
              job.status === 'failed' || job.status === 'cancelled';

            return (
              <div
                key={job.jobId}
                className="space-y-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PlatformIcon platform={job.platform} />
                    <span className="font-mono text-xs font-semibold">
                      {job.folderCode}
                    </span>
                    <Badge variant={status.variant} size="xs">
                      {status.label}
                    </Badge>
                    <Badge variant={engine.variant} size="xs">
                      {engine.label}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {formatJobTime(job.createdAt)}
                  </span>
                </div>

                {job.error ? (
                  <p className="text-xs text-[#991b1b] dark:text-[#fca5a5]">
                    {job.error}
                  </p>
                ) : job.step ? (
                  <p className="text-xs text-muted-foreground">{job.step}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(job.logs?.length ?? 0) > 0 ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(job.jobId)}
                      className="min-h-10"
                    >
                      <Terminal className="size-3" aria-hidden="true" />
                      <span>Log ({job.logs.length})</span>
                    </Button>
                  ) : null}
                  {canRetry ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => handleRetry(job)}
                      className="min-h-10"
                    >
                      <RotateCcw className="size-3" aria-hidden="true" />
                      <span>Coba Lagi</span>
                    </Button>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div className="rounded-md border border-border bg-muted/50 p-2.5">
                    <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
                      {(job.logs ?? []).map((entry, idx) => (
                        <li key={`${job.jobId}-mlog-${idx}`}>
                          <span className="mr-2 text-muted-foreground">
                            {formatLogTime(entry.timestamp)}
                          </span>
                          <span>{entry.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Menampilkan {filteredJobs.length} dari {jobs.length} proses
      </p>
    </div>
  );
}
