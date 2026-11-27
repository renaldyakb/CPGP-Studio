import { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { AutoPostJob, AutoPostJobStatus } from '@/types/autopost';
import { IconActionButton } from './IconActionButton';
import { PLATFORM_META, PlatformIcon } from './platformMeta';

export interface ActivityFeedProps {
  jobs: AutoPostJob[];
  onCancel: (jobId: string) => void | Promise<void>;
  onConfirm: (jobId: string, url?: string) => void | Promise<void>;
  onRetry?: (job: AutoPostJob) => void;
  busyKey: string | null;
}

const ACTIVE_STATUSES: AutoPostJobStatus[] = [
  'queued',
  'running',
  'awaiting_review',
];

const RECENT_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_ROWS = 4;

function jobStatusMeta(status: AutoPostJobStatus): {
  label: string;
  variant: 'secondary' | 'info' | 'warning' | 'destructive';
} {
  switch (status) {
    case 'running':
      return { label: 'Berjalan', variant: 'info' };
    case 'awaiting_review':
      return { label: 'Menunggu Tinjau', variant: 'warning' };
    case 'failed':
      return { label: 'Gagal', variant: 'destructive' };
    default:
      return { label: 'Antre', variant: 'secondary' };
  }
}

function formatLogTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ActivityFeed({
  jobs,
  onCancel,
  onConfirm,
  onRetry,
  busyKey,
}: ActivityFeedProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);
  const now = Date.now();

  const visible = jobs
    .filter((job) => {
      if (ACTIVE_STATUSES.includes(job.status)) return true;
      if (job.status === 'failed' && !dismissedIds.includes(job.jobId)) {
        const finishedMs = Date.parse(job.finishedAt || job.createdAt || '');
        return Number.isFinite(finishedMs)
          ? now - finishedMs <= RECENT_FAILURE_WINDOW_MS
          : true;
      }
      return false;
    })
    .slice(0, MAX_ROWS);

  if (visible.length === 0) return null;

  const toggleLogs = (jobId: string) => {
    setExpandedLogIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  return (
    <Card aria-live="polite">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Proses Aktif &amp; Status Terbaru</CardTitle>
        <Badge variant="muted" size="xs" className="font-mono">
          {visible.length} tugas
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2.5 p-3 pt-0">
        {visible.map((job) => {
          const status = jobStatusMeta(job.status);
          const progress = Math.min(
            100,
            Math.max(0, Math.round(job.progressPercent || 0))
          );
          const isBusy = busyKey === `job:${job.jobId}`;
          const canCancel =
            job.status === 'queued' || job.status === 'running';
          const isFailed = job.status === 'failed';
          const isExpanded = expandedLogIds.includes(job.jobId);
          const recentLogs = (job.logs ?? []).slice(-8);

          return (
            <div
              key={job.jobId}
              className={
                isFailed
                  ? 'rounded-lg border border-[#fca5a5] bg-[#fef2f2]/60 p-3 dark:border-[#991b1b] dark:bg-[#450a0a]/30'
                  : 'rounded-lg border border-border bg-card p-3'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformIcon platform={job.platform} size={15} />
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {job.folderCode}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {PLATFORM_META[job.platform].label}
                    </span>
                    <Badge variant={status.variant} size="xs">
                      {status.label}
                    </Badge>
                    <Badge variant="outline" size="xs">
                      {job.engine === 'meta_api'
                        ? 'Meta API'
                        : job.engine === 'youtube_api'
                          ? 'YouTube API'
                          : 'Browser'}
                    </Badge>
                  </div>

                  {isFailed ? (
                    <div className="flex items-start gap-1.5 text-xs leading-relaxed text-[#991b1b] dark:text-[#fca5a5]">
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{job.error || job.step || 'Proses gagal.'}</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {job.step || 'Menyiapkan proses...'}
                      </p>

                      <div className="flex items-center gap-2.5">
                        <Progress value={progress} className="w-full" />
                        <span className="shrink-0 font-mono text-xs font-medium text-foreground tabular-nums">
                          {progress}%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {recentLogs.length > 0 ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      aria-expanded={isExpanded}
                      onClick={() => toggleLogs(job.jobId)}
                      className="min-h-9 sm:min-h-7"
                    >
                      <Terminal className="size-3" aria-hidden="true" />
                      <span>Log ({job.logs.length})</span>
                      {isExpanded ? (
                        <ChevronUp className="size-3" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-3" aria-hidden="true" />
                      )}
                    </Button>
                  ) : null}

                  {canCancel ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void onCancel(job.jobId)}
                      className="min-h-9 sm:min-h-7"
                    >
                      <Square className="size-3" aria-hidden="true" />
                      <span>Batal</span>
                    </Button>
                  ) : null}

                  {isFailed && onRetry ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => onRetry(job)}
                      className="min-h-9 sm:min-h-7"
                    >
                      <RotateCcw className="size-3" aria-hidden="true" />
                      <span>Coba Lagi</span>
                    </Button>
                  ) : null}

                  {isFailed ? (
                    <IconActionButton
                      icon={X}
                      label="Tutup pemberitahuan gagal"
                      onClick={() =>
                        setDismissedIds((prev) =>
                          prev.includes(job.jobId) ? prev : [...prev, job.jobId]
                        )
                      }
                      className="min-h-9 min-w-9 sm:min-h-7 sm:min-w-7"
                    />
                  ) : null}

                  {job.status === 'awaiting_review' ? (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="editorial"
                        disabled={isBusy}
                        onClick={() => void onConfirm(job.jobId)}
                        className="min-h-9 sm:min-h-7"
                      >
                        {job.engine === 'meta_api' && job.platform === 'ig_reels'
                          ? 'Publish IG Sekarang'
                          : 'Tandai Sudah Publish'}
                      </Button>
                      <IconActionButton
                        icon={X}
                        label="Abaikan tugas ini"
                        disabled={isBusy}
                        onClick={() => void onCancel(job.jobId)}
                        className="min-h-9 min-w-9 sm:min-h-7 sm:min-w-7"
                      />
                    </>
                  ) : null}
                </div>
              </div>

              {isExpanded && recentLogs.length > 0 ? (
                <div className="mt-2.5 rounded-md border border-border bg-muted/60 p-2.5">
                  <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
                    {recentLogs.map((entry, idx) => (
                      <li
                        key={`${job.jobId}-log-${idx}`}
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
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
