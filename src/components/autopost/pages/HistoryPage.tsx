import { useMemo, useState, type ComponentProps } from 'react';
import { Check, ExternalLink, RotateCcw, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AutoPostEngine, AutoPostJobStatus } from '@/types/autopost';
import type { PlatformKey } from '@/types/planner';
import type { AutoPostPageProps } from '../pageProps';
import { IconActionButton } from '../parts/IconActionButton';
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
  browser: { label: 'Chrome/Edge', variant: 'muted' },
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

export function HistoryPage({ ctx }: AutoPostPageProps) {
  const { jobs, isLoading } = ctx.data;

  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformKey[]>([]);
  const [statusFilter, setStatusFilter] = useState<AutoPostJobStatus | 'all'>(
    'all'
  );

  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
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
        if (needle) {
          const haystack =
            `${job.folderCode} ${PLATFORM_META[job.platform].label}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [jobs, platformFilter, search, statusFilter]);

  const hasActiveFilter =
    search.trim().length > 0 ||
    platformFilter.length > 0 ||
    statusFilter !== 'all';

  function togglePlatform(platform: PlatformKey) {
    setPlatformFilter((prev) =>
      prev.includes(platform)
        ? prev.filter((value) => value !== platform)
        : [...prev, platform]
    );
  }

  function resetFilters() {
    setSearch('');
    setPlatformFilter([]);
    setStatusFilter('all');
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <label
                htmlFor="autopost-history-search"
                className="sr-only"
              >
                Cari riwayat
              </label>
              <Input
                id="autopost-history-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kode konten atau platform"
                className="w-full"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div
                role="group"
                aria-label="Filter platform"
                className="flex items-center gap-1"
              >
                {PLATFORM_ORDER.map((key) => {
                  const active = platformFilter.includes(key);
                  const label = `Filter ${PLATFORM_META[key].label}`;
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant={active ? 'default' : 'outline'}
                            size="icon-sm"
                            aria-label={label}
                            aria-pressed={active}
                            onClick={() => togglePlatform(key)}
                          />
                        }
                      >
                        <PlatformIcon platform={key} />
                      </TooltipTrigger>
                      <TooltipContent side="top">{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="autopost-history-status"
                  className="block text-[11px] font-medium text-muted-foreground"
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
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <IconActionButton
                icon={RotateCcw}
                label="Reset filter"
                variant="outline"
                disabled={!hasActiveFilter}
                onClick={resetFilters}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Waktu</TableHead>
            <TableHead>Konten</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Engine</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && jobs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="p-6 text-center text-muted-foreground"
              >
                Memuat riwayat Auto-Post.
              </TableCell>
            </TableRow>
          ) : filteredJobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="p-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    {jobs.length === 0
                      ? 'Belum ada riwayat Auto-Post.'
                      : 'Tidak ada proses yang cocok dengan filter.'}
                  </p>
                  {jobs.length === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => ctx.onNavigate('dashboard')}
                    >
                      Kembali ke Dasbor
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetFilters}
                    >
                      Reset filter
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
              return (
                <TableRow key={job.jobId}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatJobTime(job.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono">{job.folderCode}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <PlatformIcon platform={job.platform} />
                      {PLATFORM_META[job.platform].label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={engine.variant} size="xs">
                      {engine.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {job.publishedUrl ? (
                        <IconActionButton
                          icon={ExternalLink}
                          label="Buka postingan"
                          onClick={() => {
                            window.open(
                              job.publishedUrl as string,
                              '_blank',
                              'noopener,noreferrer'
                            );
                          }}
                        />
                      ) : null}
                      {isActive ? (
                        <IconActionButton
                          icon={Square}
                          label="Batalkan proses"
                          onClick={() => void ctx.data.cancelJob(job.jobId)}
                        />
                      ) : null}
                      {job.status === 'awaiting_review' ? (
                        <IconActionButton
                          icon={Check}
                          label="Tandai sudah publish"
                          onClick={() => void ctx.data.confirmJob(job.jobId)}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <p className="text-[11px] text-muted-foreground">
        Menampilkan {filteredJobs.length} dari {jobs.length} proses
      </p>
    </div>
  );
}
