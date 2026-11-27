import { useState } from 'react';
import { Square, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { AutoPostJob, AutoPostJobStatus } from '@/types/autopost';
import { IconActionButton } from './IconActionButton';
import { PlatformIcon } from './platformMeta';

export interface ActivityFeedProps {
  jobs: AutoPostJob[];
  onCancel: (jobId: string) => void | Promise<void>;
  onConfirm: (jobId: string, url?: string) => void | Promise<void>;
  busyKey: string | null;
}

const ACTIVE_STATUSES: AutoPostJobStatus[] = [
  'queued',
  'running',
  'awaiting_review',
];

const RECENT_FAILURE_WINDOW_MS = 5 * 60 * 1000;
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

export function ActivityFeed({
  jobs,
  onCancel,
  onConfirm,
  busyKey,
}: ActivityFeedProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Aktivitas Berjalan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-2 pt-0">
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

          return (
            <div
              key={job.jobId}
              className="flex flex-wrap items-start gap-2 rounded-md border border-border p-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformIcon platform={job.platform} />
                  <span className="font-mono text-[11px] font-semibold text-foreground">
                    {job.folderCode}
                  </span>
                  <Badge variant={status.variant} size="xs">
                    {status.label}
                  </Badge>
                </div>

                {isFailed ? (
                  <p className="text-[11px] leading-relaxed text-[#991b1b] dark:text-[#fca5a5]">
                    {job.error || job.step || 'Proses gagal.'}
                  </p>
                ) : (
                  <>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {job.step || 'Menyiapkan proses...'}
                    </p>

                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="w-full" />
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {progress}%
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {canCancel ? (
                  <IconActionButton
                    icon={Square}
                    label="Batalkan proses"
                    disabled={isBusy}
                    onClick={() => void onCancel(job.jobId)}
                  />
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
                    />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
