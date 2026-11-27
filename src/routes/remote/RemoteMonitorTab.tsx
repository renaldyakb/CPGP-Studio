import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Droplets,
  RotateCcw,
  Square,
  Terminal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  PLATFORM_META,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import type { AutoPostJob } from '@/types/autopost';
import type { WatermarkRenderJob } from '@/types/watermark';

export interface RemoteMonitorTabProps {
  autoPostJobs: AutoPostJob[];
  watermarkJobs: WatermarkRenderJob[];
  busyJobId: string | null;
  onCancelAutoPost: (jobId: string) => Promise<void>;
  onConfirmAutoPost: (jobId: string) => Promise<void>;
  onRetryAutoPost: (job: AutoPostJob) => Promise<void>;
  onCancelWatermark: (jobId: string) => Promise<void>;
}

function statusBadgeMeta(status: string): {
  label: string;
  variant: 'info' | 'warning' | 'success' | 'destructive' | 'muted';
} {
  switch (status) {
    case 'running':
    case 'rendering':
      return { label: 'Berjalan', variant: 'info' };
    case 'queued':
      return { label: 'Antre', variant: 'muted' };
    case 'awaiting_review':
      return { label: 'Menunggu Tinjau', variant: 'warning' };
    case 'completed':
      return { label: 'Selesai', variant: 'success' };
    case 'failed':
      return { label: 'Gagal', variant: 'destructive' };
    default:
      return { label: 'Dibatalkan', variant: 'muted' };
  }
}

export function RemoteMonitorTab({
  autoPostJobs,
  watermarkJobs,
  busyJobId,
  onCancelAutoPost,
  onConfirmAutoPost,
  onRetryAutoPost,
  onCancelWatermark,
}: RemoteMonitorTabProps) {
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);

  const toggleLog = (id: string) => {
    setExpandedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const recentAutoPost = autoPostJobs.slice(0, 12);
  const recentWatermark = watermarkJobs.slice(0, 12);

  return (
    <div className="space-y-4">
      {/* Auto-Post Jobs */}
      <section className="space-y-2" aria-labelledby="remote-ap-jobs-heading">
        <div className="flex items-center justify-between">
          <h2
            id="remote-ap-jobs-heading"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Antrean Auto-Post ({recentAutoPost.length})
          </h2>
        </div>

        {recentAutoPost.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-xs text-muted-foreground">
              Belum ada proses Auto-Post yang berjalan pada sesi ini.
            </p>
          </Card>
        ) : (
          recentAutoPost.map((job) => {
            const st = statusBadgeMeta(job.status);
            const pct = Math.max(0, Math.min(100, Math.round(job.progressPercent || 0)));
            const isBusy = busyJobId === job.jobId;
            const isExpanded = expandedLogIds.includes(job.jobId);
            const canCancel = job.status === 'queued' || job.status === 'running';
            const canRetry = job.status === 'failed' || job.status === 'cancelled';

            return (
              <Card key={job.jobId}>
                <CardContent className="space-y-2.5 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PlatformIcon platform={job.platform} size={15} />
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {job.folderCode}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        {PLATFORM_META[job.platform].label}
                      </span>
                    </div>
                    <Badge variant={st.variant} size="xs">
                      {st.label}
                    </Badge>
                  </div>

                  {job.status === 'failed' ? (
                    <div className="flex items-start gap-1.5 rounded-md border border-[#fca5a5] bg-[#fef2f2] p-2 text-xs text-[#991b1b] dark:border-[#991b1b] dark:bg-[#450a0a] dark:text-[#fca5a5]">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>{job.error || job.step}</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{job.step}</p>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="w-full" />
                        <span className="shrink-0 font-mono text-xs font-medium tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {job.status === 'awaiting_review' ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="editorial"
                        disabled={isBusy}
                        onClick={() => void onConfirmAutoPost(job.jobId)}
                        className="min-h-10"
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        <span>
                          {job.engine === 'meta_api' &&
                          job.platform === 'ig_reels'
                            ? 'Publish IG Sekarang'
                            : 'Tandai Selesai'}
                        </span>
                      </Button>
                    ) : null}

                    {canCancel ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void onCancelAutoPost(job.jobId)}
                        className="min-h-10"
                      >
                        <Square className="size-3.5" aria-hidden="true" />
                        <span>Batalkan</span>
                      </Button>
                    ) : null}

                    {canRetry ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void onRetryAutoPost(job)}
                        className="min-h-10"
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        <span>Coba Lagi</span>
                      </Button>
                    ) : null}

                    {(job.logs?.length ?? 0) > 0 ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        aria-expanded={isExpanded}
                        onClick={() => toggleLog(job.jobId)}
                        className="min-h-10"
                      >
                        <Terminal className="size-3.5" aria-hidden="true" />
                        <span>Log ({job.logs.length})</span>
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <ul className="space-y-1 rounded-md border border-border bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed">
                      {(job.logs ?? []).slice(-10).map((entry, idx) => (
                        <li
                          key={`${job.jobId}-rlog-${idx}`}
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
                          {entry.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {/* Watermark Render Jobs */}
      <section className="space-y-2" aria-labelledby="remote-wm-jobs-heading">
        <h2
          id="remote-wm-jobs-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Antrean Watermark ({recentWatermark.length})
        </h2>

        {recentWatermark.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-xs text-muted-foreground">
              Belum ada proses render watermark pada sesi ini.
            </p>
          </Card>
        ) : (
          recentWatermark.map((job) => {
            const st = statusBadgeMeta(job.status);
            const pct = Math.max(0, Math.min(100, Math.round(job.percent || 0)));
            const canCancel = job.status === 'queued' || job.status === 'rendering';

            return (
              <Card key={job.jobId}>
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Droplets className="size-3.5 text-foreground" aria-hidden="true" />
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {job.folderCode}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {job.encoderUsed || job.encoderRequested}
                      </span>
                    </div>
                    <Badge variant={st.variant} size="xs">
                      {st.label}
                    </Badge>
                  </div>

                  {job.error ? (
                    <p className="text-xs text-[#991b1b] dark:text-[#fca5a5]">
                      {job.error}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="w-full" />
                      <span className="shrink-0 font-mono text-xs tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  )}

                  {canCancel ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busyJobId === job.jobId}
                      onClick={() => void onCancelWatermark(job.jobId)}
                      className="min-h-10"
                    >
                      <Square className="size-3.5" aria-hidden="true" />
                      <span>Batalkan Render</span>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
