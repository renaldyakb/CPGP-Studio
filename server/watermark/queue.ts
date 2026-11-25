import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PQueue from 'p-queue';
import type { ContentPlannerItem } from '../../src/types/planner.ts';
import type {
  WatermarkEncoderMode,
  WatermarkRenderJob,
  WatermarkRenderSpeedMode,
  WatermarkStyleConfig,
} from '../../src/types/watermark.ts';
import { OVERWRITE_WATERMARK_MARKER_FILE } from '../scanner.ts';
import { getActiveWorkspace } from '../workspaces/registry.ts';
import { renderWatermarkedVideo } from './renderer.ts';

const MAX_RETAINED_JOBS = 30;
const PROGRESS_EMIT_INTERVAL_MS = 200;

export type WatermarkOutputMode = 'separate_wm_file' | 'overwrite_source';

export interface WatermarkQueueEvent {
  type: 'job-updated';
  job: WatermarkRenderJob;
  jobs: WatermarkRenderJob[];
  timestamp: string;
}

export type WatermarkQueueListener = (event: WatermarkQueueEvent) => void;

export interface EnqueueBatchInput {
  items: ContentPlannerItem[];
  config: WatermarkStyleConfig;
  presetName: string;
  encoder: WatermarkEncoderMode;
  speedMode?: WatermarkRenderSpeedMode;
  outputMode?: WatermarkOutputMode;
}

export interface WatermarkQueueOptions {
  onJobCompleted?: (itemId: string, job: WatermarkRenderJob) => void;
}

export class WatermarkQueueManager {
  private readonly queue: PQueue;
  private readonly jobs: WatermarkRenderJob[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private readonly listeners = new Set<WatermarkQueueListener>();
  private readonly lastEmitAt = new Map<string, number>();
  private readonly onJobCompleted?: (
    itemId: string,
    job: WatermarkRenderJob
  ) => void;

  constructor(options: WatermarkQueueOptions = {}) {
    this.queue = new PQueue({ concurrency: 1 });
    this.onJobCompleted = options.onJobCompleted;
  }

  listJobs(workspaceId?: string): WatermarkRenderJob[] {
    const filtered = workspaceId
      ? this.jobs.filter(
          (job) => !job.workspaceId || job.workspaceId === workspaceId
        )
      : this.jobs;
    return filtered.map((job) => ({ ...job }));
  }

  getJob(jobId: string): WatermarkRenderJob | null {
    const found = this.jobs.find((job) => job.jobId === jobId);
    return found ? { ...found } : null;
  }

  subscribe(listener: WatermarkQueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private trimOldJobs(): void {
    if (this.jobs.length <= MAX_RETAINED_JOBS) return;

    for (
      let i = this.jobs.length - 1;
      i >= 0 && this.jobs.length > MAX_RETAINED_JOBS;
      i -= 1
    ) {
      const status = this.jobs[i].status;
      if (status !== 'queued' && status !== 'rendering') {
        const removed = this.jobs.splice(i, 1)[0];
        if (removed) {
          this.lastEmitAt.delete(removed.jobId);
        }
      }
    }
  }

  private emitJobUpdate(job: WatermarkRenderJob, force = false): void {
    const now = Date.now();
    if (!force) {
      const prev = this.lastEmitAt.get(job.jobId) ?? 0;
      if (now - prev < PROGRESS_EMIT_INTERVAL_MS) {
        return;
      }
    }
    this.lastEmitAt.set(job.jobId, now);

    const snapshot = this.listJobs(job.workspaceId);
    const event: WatermarkQueueEvent = {
      type: 'job-updated',
      job: { ...job },
      jobs: snapshot,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors so queue execution continues cleanly
      }
    }
  }

  enqueueBatch(input: EnqueueBatchInput): WatermarkRenderJob[] {
    const createdJobs: WatermarkRenderJob[] = [];
    const configSnapshot: WatermarkStyleConfig = { ...input.config };

    const activeWs = getActiveWorkspace();
    const resolvedOutputMode: WatermarkOutputMode =
      input.outputMode ??
      (activeWs?.rules?.watermarkPolicy === 'overwrite_source'
        ? 'overwrite_source'
        : 'separate_wm_file');

    for (const item of input.items) {
      const rawVideoPath =
        item.autoMetadata.assets.rawVideo.absolutePath ??
        item.autoMetadata.assets.wmVideo.absolutePath;
      const rawVideoName =
        item.autoMetadata.assets.rawVideo.fileName ??
        item.autoMetadata.assets.wmVideo.fileName;
      if (!rawVideoPath || !rawVideoName) {
        continue;
      }

      const jobId = `wm-${randomUUID().slice(0, 12)}`;
      const isOverwrite = resolvedOutputMode === 'overwrite_source';
      const outputFileName = isOverwrite
        ? path.basename(rawVideoPath)
        : 'wm_final.mp4';
      const outputAbsPath = path.join(item.absolutePath, outputFileName);

      const resolvedSpeedMode: WatermarkRenderSpeedMode =
        input.speedMode === 'balanced' || input.speedMode === 'max_compression'
          ? input.speedMode
          : 'fast';

      const job: WatermarkRenderJob = {
        jobId,
        workspaceId: activeWs.id,
        itemId: item.id,
        folderCode: item.folderCode,
        inputFile: rawVideoName,
        outputFile: outputFileName,
        encoderRequested: input.encoder,
        encoderUsed: null,
        speedMode: resolvedSpeedMode,
        presetName: input.presetName,
        status: 'queued',
        percent: 0,
        fps: null,
        speed: null,
        etaSec: null,
        durationSec: null,
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
      };

      const controller = new AbortController();
      this.controllers.set(jobId, controller);

      this.jobs.unshift(job);
      this.trimOldJobs();
      createdJobs.push({ ...job });
      this.emitJobUpdate(job, true);

      void this.queue
        .add(
          async ({ signal }) => {
            if (
              controller.signal.aborted ||
              signal?.aborted ||
              job.status === 'cancelled'
            ) {
              job.status = 'cancelled';
              job.finishedAt = job.finishedAt ?? new Date().toISOString();
              this.emitJobUpdate(job, true);
              return;
            }

            job.status = 'rendering';
            job.startedAt = new Date().toISOString();
            job.percent = 0;
            this.emitJobUpdate(job, true);

            try {
              const result = await renderWatermarkedVideo({
                inputPath: rawVideoPath,
                outputDir: path.dirname(outputAbsPath),
                outputFileName,
                config: configSnapshot,
                encoder: input.encoder,
                speedMode: resolvedSpeedMode,
                signal: controller.signal,
                onEncoderResolved: (encoderUsed) => {
                  job.encoderUsed = encoderUsed;
                  this.emitJobUpdate(job, true);
                },
                onProgress: (progress) => {
                  if (job.status !== 'rendering') return;
                  job.percent = progress.percent;
                  job.fps = progress.fps;
                  job.speed = progress.speed;
                  job.etaSec = progress.etaSec;
                  job.durationSec = progress.durationSec;
                  this.emitJobUpdate(job, progress.percent === 100);
                },
              });

              if (isOverwrite) {
                const markerPath = path.join(
                  item.absolutePath,
                  OVERWRITE_WATERMARK_MARKER_FILE
                );
                try {
                  fs.writeFileSync(
                    markerPath,
                    JSON.stringify(
                      {
                        watermarkedAt: new Date().toISOString(),
                        presetName: input.presetName,
                        outputFile: outputFileName,
                      },
                      null,
                      2
                    ) + '\n',
                    'utf-8'
                  );
                } catch {
                  // Ignore marker write error
                }
              }

              job.encoderUsed = result.encoderUsed;
              job.durationSec = result.durationSec;
              job.percent = 100;
              job.etaSec = 0;
              job.status = 'completed';
              job.finishedAt = new Date().toISOString();
              job.error = null;
              this.emitJobUpdate(job, true);

              try {
                this.onJobCompleted?.(item.id, { ...job });
              } catch (err) {
                console.error('[WatermarkQueue] onJobCompleted error:', err);
              }
            } catch (err) {
              const isAbort =
                controller.signal.aborted ||
                (err instanceof Error && err.name === 'AbortError');

              if (isAbort) {
                job.status = 'cancelled';
                job.error = null;
              } else {
                job.status = 'failed';
                job.error =
                  err instanceof Error ? err.message : String(err);
              }
              job.finishedAt = new Date().toISOString();
              this.emitJobUpdate(job, true);
            } finally {
              this.controllers.delete(jobId);
            }
          },
          { signal: controller.signal }
        )
        .catch(() => {
          this.controllers.delete(jobId);
          if (job.status !== 'completed' && job.status !== 'failed') {
            job.status = 'cancelled';
            job.finishedAt = job.finishedAt ?? new Date().toISOString();
            this.emitJobUpdate(job, true);
          }
        });
    }

    return createdJobs;
  }

  cancelJob(jobId: string): WatermarkRenderJob | null {
    const job = this.jobs.find((entry) => entry.jobId === jobId);
    if (!job) {
      return null;
    }

    if (
      job.status === 'completed' ||
      job.status === 'failed' ||
      job.status === 'cancelled'
    ) {
      return { ...job };
    }

    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    job.error = null;

    const controller = this.controllers.get(jobId);
    if (controller) {
      controller.abort();
      this.controllers.delete(jobId);
    }

    this.emitJobUpdate(job, true);
    return { ...job };
  }
}

export function createWatermarkQueue(
  options: WatermarkQueueOptions = {}
): WatermarkQueueManager {
  return new WatermarkQueueManager(options);
}
