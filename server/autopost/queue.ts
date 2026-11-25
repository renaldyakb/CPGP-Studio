import { randomUUID } from 'node:crypto';
import PQueue from 'p-queue';
import type {
  AutoPostEngine,
  AutoPostJob,
  AutoPostJobStatus,
  AutoPostMode,
  AutoPostStepLog,
} from '../../src/types/autopost.ts';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
} from '../../src/types/planner.ts';
import { getOrInitDatabase, updateItemPlatformState } from '../storage.ts';
import {
  getActiveWorkspace,
  getWorkspaceById,
  getWorkspacePaths,
} from '../workspaces/registry.ts';
import { publishViaBrowser } from './browserPublishers.ts';
import { subscribeBrowserSession } from './browserSession.ts';
import {
  detectAutoPostCapabilities,
  getInternalAutoPostConfig,
} from './config.ts';
import {
  publishFacebookReelViaMetaApi,
  publishInstagramContainerNow,
  publishInstagramReelViaMetaApi,
} from './metaApi.ts';
import { publishToYouTubeApi } from './youtubeApi.ts';

const MAX_RETAINED_JOBS = 40;
const MAX_LOGS_PER_JOB = 60;
const PROGRESS_EMIT_INTERVAL_MS = 180;

export interface AutoPostQueueEvent {
  type: 'job-updated';
  job: AutoPostJob;
  jobs: AutoPostJob[];
  timestamp: string;
}

export type AutoPostQueueListener = (event: AutoPostQueueEvent) => void;

export interface EnqueueAutoPostBatchInput {
  item: ContentPlannerItem;
  platforms: PlatformKey[];
  mode?: AutoPostMode;
  youtubePrivacy?: 'public' | 'unlisted' | 'private';
}

export interface AutoPostQueueOptions {
  onPlannerUpdated?: (
    reason: string,
    db: PlannerDatabase,
    workspaceId?: string
  ) => void;
}

export interface ConfirmReviewJobResult {
  job: AutoPostJob;
  db: PlannerDatabase;
  item: ContentPlannerItem;
}

interface CapturedWorkspaceContext {
  workspaceId: string;
  contentRootPath: string;
  defaultYear: number;
  plannerFile: string;
  workspace: WorkspaceMetadata;
}

function cloneJob(job: AutoPostJob): AutoPostJob {
  return {
    ...job,
    logs: job.logs.map((entry) => ({ ...entry })),
  };
}

export class AutoPostQueueManager {
  private readonly queue: PQueue;
  private readonly jobs: AutoPostJob[] = [];
  private readonly controllers = new Map<string, AbortController>();
  private readonly pendingIgContainers = new Map<string, string>();
  private readonly combinedMetaPartners = new Map<string, string>();
  private readonly jobWorkspaces = new Map<string, CapturedWorkspaceContext>();
  private readonly listeners = new Set<AutoPostQueueListener>();
  private readonly lastEmitAt = new Map<string, number>();
  private readonly onPlannerUpdated?: (
    reason: string,
    db: PlannerDatabase,
    workspaceId?: string
  ) => void;

  constructor(options: AutoPostQueueOptions = {}) {
    this.queue = new PQueue({ concurrency: 1 });
    this.onPlannerUpdated = options.onPlannerUpdated;

    // Immediately clean up running browser jobs when user closes Chrome manually
    subscribeBrowserSession((session) => {
      if (session.isOpen) return;

      for (const job of this.jobs) {
        if (job.engine !== 'browser') continue;

        if (job.status === 'running') {
          job.status = 'cancelled';
          job.step = 'Browser ditutup oleh pengguna';
          job.finishedAt = new Date().toISOString();
          job.error = null;
          this.appendLog(
            job,
            'Jendela browser ditutup sebelum proses selesai.',
            'warning'
          );
          const controller = this.controllers.get(job.jobId);
          if (controller) {
            controller.abort();
            this.controllers.delete(job.jobId);
          }
          this.emitJobUpdate(job, true);
        } else if (job.status === 'awaiting_review') {
          job.step =
            'Browser ditutup. Klik Tandai Sudah Publish jika sudah tayang, atau Abaikan.';
          this.emitJobUpdate(job, true);
        }
      }
    });
  }

  listJobs(workspaceId?: string): AutoPostJob[] {
    const filtered = workspaceId
      ? this.jobs.filter(
          (job) => !job.workspaceId || job.workspaceId === workspaceId
        )
      : this.jobs;
    return filtered.map(cloneJob);
  }

  getJob(jobId: string): AutoPostJob | null {
    const found = this.jobs.find((job) => job.jobId === jobId);
    return found ? cloneJob(found) : null;
  }

  subscribe(listener: AutoPostQueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private appendLog(
    job: AutoPostJob,
    message: string,
    level: AutoPostStepLog['level'] = 'info'
  ): void {
    job.logs.push({
      timestamp: new Date().toISOString(),
      message,
      level,
    });
    if (job.logs.length > MAX_LOGS_PER_JOB) {
      job.logs.splice(0, job.logs.length - MAX_LOGS_PER_JOB);
    }
  }

  private trimOldJobs(): void {
    if (this.jobs.length <= MAX_RETAINED_JOBS) return;

    for (
      let i = this.jobs.length - 1;
      i >= 0 && this.jobs.length > MAX_RETAINED_JOBS;
      i -= 1
    ) {
      const status = this.jobs[i].status;
      if (status !== 'queued' && status !== 'running') {
        const removed = this.jobs.splice(i, 1)[0];
        if (removed) {
          this.lastEmitAt.delete(removed.jobId);
          this.pendingIgContainers.delete(removed.jobId);
          this.jobWorkspaces.delete(removed.jobId);
        }
      }
    }
  }

  private emitJobUpdate(job: AutoPostJob, force = false): void {
    const now = Date.now();
    if (!force) {
      const prev = this.lastEmitAt.get(job.jobId) ?? 0;
      if (now - prev < PROGRESS_EMIT_INTERVAL_MS) {
        return;
      }
    }
    this.lastEmitAt.set(job.jobId, now);

    const snapshot = this.listJobs(job.workspaceId);
    const event: AutoPostQueueEvent = {
      type: 'job-updated',
      job: cloneJob(job),
      jobs: snapshot,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore broken listener streams so queue continues safely
      }
    }
  }

  private resolveEngineForPlatform(
    platform: PlatformKey,
    workspaceId?: string
  ): AutoPostEngine {
    const capabilities = detectAutoPostCapabilities(workspaceId);
    if (platform === 'yt_shorts') {
      return capabilities.youtubeApiReady ? 'youtube_api' : 'browser';
    }
    if (platform === 'fb_reels') {
      return capabilities.metaFbApiReady ? 'meta_api' : 'browser';
    }
    if (platform === 'ig_reels') {
      return capabilities.metaIgApiReady ? 'meta_api' : 'browser';
    }
    return 'browser';
  }

  private resolveWorkspaceContextForJob(
    jobId: string,
    fallbackWorkspaceId?: string
  ): CapturedWorkspaceContext {
    const captured = this.jobWorkspaces.get(jobId);
    if (captured) {
      return captured;
    }
    const workspace =
      (fallbackWorkspaceId ? getWorkspaceById(fallbackWorkspaceId) : null) ??
      getActiveWorkspace();
    const paths = getWorkspacePaths(workspace.id);
    return {
      workspaceId: workspace.id,
      contentRootPath: workspace.contentRootPath,
      defaultYear: workspace.defaultYear,
      plannerFile: paths.plannerFile,
      workspace,
    };
  }

  private syncPlannerAfterCompletion(
    itemId: string,
    platform: PlatformKey,
    publishedUrl?: string | null,
    jobId?: string
  ): void {
    try {
      const wsCtx = jobId
        ? this.resolveWorkspaceContextForJob(jobId)
        : this.resolveWorkspaceContextForJob('');
      const patch: { status: 'published'; publishedUrl?: string } = {
        status: 'published',
      };
      if (publishedUrl && publishedUrl.trim()) {
        patch.publishedUrl = publishedUrl.trim();
      }
      const updated = updateItemPlatformState(
        itemId,
        platform,
        patch,
        wsCtx.plannerFile,
        wsCtx.workspace
      );
      this.onPlannerUpdated?.(
        `autopost-published:${itemId}:${platform}`,
        updated.db,
        wsCtx.workspaceId
      );
    } catch (error) {
      console.error('[AutoPostQueue] Failed updating completed platform:', error);
    }
  }

  private syncPlannerAfterReview(
    itemId: string,
    platform: PlatformKey,
    publishedUrl?: string | null,
    jobId?: string
  ): void {
    try {
      const wsCtx = jobId
        ? this.resolveWorkspaceContextForJob(jobId)
        : this.resolveWorkspaceContextForJob('');
      const db = getOrInitDatabase(
        wsCtx.contentRootPath,
        wsCtx.defaultYear,
        wsCtx.plannerFile,
        wsCtx.workspace
      );
      const currentItem = db.items[itemId];
      const currentStatus =
        currentItem?.userProperties.platforms[platform]?.status ?? 'not_started';

      if (currentStatus === 'not_started') {
        const patch: { status: 'uploaded_draft'; publishedUrl?: string } = {
          status: 'uploaded_draft',
        };
        if (publishedUrl && publishedUrl.trim()) {
          patch.publishedUrl = publishedUrl.trim();
        }
        const updated = updateItemPlatformState(
          itemId,
          platform,
          patch,
          wsCtx.plannerFile,
          wsCtx.workspace
        );
        this.onPlannerUpdated?.(
          `autopost-draft:${itemId}:${platform}`,
          updated.db,
          wsCtx.workspaceId
        );
      } else if (publishedUrl && publishedUrl.trim()) {
        const updated = updateItemPlatformState(
          itemId,
          platform,
          {
            publishedUrl: publishedUrl.trim(),
          },
          wsCtx.plannerFile,
          wsCtx.workspace
        );
        this.onPlannerUpdated?.(
          `autopost-url:${itemId}:${platform}`,
          updated.db,
          wsCtx.workspaceId
        );
      }
    } catch (error) {
      console.error('[AutoPostQueue] Failed updating review platform:', error);
    }
  }

  enqueueBatch(input: EnqueueAutoPostBatchInput): AutoPostJob[] {
    const activeWorkspace = getActiveWorkspace();
    const workspacePaths = getWorkspacePaths(activeWorkspace.id);
    const capturedContext: CapturedWorkspaceContext = {
      workspaceId: activeWorkspace.id,
      contentRootPath: activeWorkspace.contentRootPath,
      defaultYear: activeWorkspace.defaultYear,
      plannerFile: workspacePaths.plannerFile,
      workspace: activeWorkspace,
    };

    const config = getInternalAutoPostConfig(activeWorkspace.id);
    const resolvedMode: AutoPostMode = input.mode ?? config.defaultMode;
    const batchId = `apb-${randomUUID().slice(0, 10)}`;
    const createdJobs: AutoPostJob[] = [];

    const uniquePlatforms: PlatformKey[] = [];
    for (const p of input.platforms) {
      if (!uniquePlatforms.includes(p)) {
        uniquePlatforms.push(p);
      }
    }

    const resolvedEngines = new Map<PlatformKey, AutoPostEngine>();
    for (const p of uniquePlatforms) {
      resolvedEngines.set(p, this.resolveEngineForPlatform(p, activeWorkspace.id));
    }

    const combineMetaViaBrowser =
      uniquePlatforms.includes('fb_reels') &&
      uniquePlatforms.includes('ig_reels') &&
      resolvedEngines.get('fb_reels') === 'browser' &&
      resolvedEngines.get('ig_reels') === 'browser';

    let combinedMetaScheduled = false;

    for (const platform of uniquePlatforms) {
      if (
        combineMetaViaBrowser &&
        (platform === 'fb_reels' || platform === 'ig_reels')
      ) {
        if (combinedMetaScheduled) {
          continue;
        }
        combinedMetaScheduled = true;

        const nowIso = new Date().toISOString();
        const fbJobId = `ap-${randomUUID().slice(0, 12)}`;
        const igJobId = `ap-${randomUUID().slice(0, 12)}`;

        const makeCombinedJob = (
          jobId: string,
          targetPlatform: 'fb_reels' | 'ig_reels'
        ): AutoPostJob => ({
          jobId,
          batchId,
          workspaceId: activeWorkspace.id,
          itemId: input.item.id,
          folderCode: input.item.folderCode,
          platform: targetPlatform,
          engine: 'browser',
          mode: resolvedMode,
          status: 'queued',
          step: 'Menunggu antrean Meta Business Suite (FB & IG)',
          progressPercent: 0,
          publishedUrl: null,
          error: null,
          logs: [
            {
              timestamp: nowIso,
              message: `Masuk antrean gabungan Meta Business Suite (Facebook & Instagram sekaligus, mode: ${resolvedMode}).`,
              level: 'info',
            },
          ],
          createdAt: nowIso,
          startedAt: null,
          finishedAt: null,
        });

        const fbJob = makeCombinedJob(fbJobId, 'fb_reels');
        const igJob = makeCombinedJob(igJobId, 'ig_reels');
        const metaJobs: AutoPostJob[] = [fbJob, igJob];

        const combinedController = new AbortController();
        this.controllers.set(fbJobId, combinedController);
        this.controllers.set(igJobId, combinedController);
        this.jobWorkspaces.set(fbJobId, capturedContext);
        this.jobWorkspaces.set(igJobId, capturedContext);
        this.combinedMetaPartners.set(fbJobId, igJobId);
        this.combinedMetaPartners.set(igJobId, fbJobId);

        for (const metaJob of metaJobs) {
          this.jobs.unshift(metaJob);
          this.trimOldJobs();
          createdJobs.push(cloneJob(metaJob));
          this.emitJobUpdate(metaJob, true);
        }

        void this.queue
          .add(
            async ({ signal }) => {
              if (
                combinedController.signal.aborted ||
                signal?.aborted ||
                metaJobs.every((j) => j.status === 'cancelled')
              ) {
                const finishedAt = new Date().toISOString();
                for (const metaJob of metaJobs) {
                  metaJob.status = 'cancelled';
                  metaJob.step = 'Dibatalkan';
                  metaJob.finishedAt = metaJob.finishedAt ?? finishedAt;
                  this.emitJobUpdate(metaJob, true);
                }
                return;
              }

              const startedAt = new Date().toISOString();
              for (const metaJob of metaJobs) {
                metaJob.status = 'running';
                metaJob.startedAt = startedAt;
                metaJob.step = 'Memulai upload Meta Business Suite (FB & IG)';
                metaJob.progressPercent = 2;
                this.emitJobUpdate(metaJob, true);
              }

              const handleCombinedProgress = (update: {
                step: string;
                progressPercent: number;
                log?: string;
                level?: 'info' | 'success' | 'warning' | 'error';
              }) => {
                const clamped = Math.max(
                  0,
                  Math.min(100, Math.round(update.progressPercent))
                );
                const hasLog = Boolean(update.log);
                for (const metaJob of metaJobs) {
                  if (metaJob.status !== 'running') continue;
                  metaJob.step = update.step;
                  metaJob.progressPercent = clamped;
                  if (update.log) {
                    this.appendLog(metaJob, update.log, update.level ?? 'info');
                  }
                  this.emitJobUpdate(metaJob, hasLog || clamped >= 100);
                }
              };

              try {
                const result = await publishViaBrowser({
                  platform: 'fb_reels',
                  metaTargets: { facebook: true, instagram: true },
                  item: input.item,
                  mode: resolvedMode,
                  signal: combinedController.signal,
                  onProgress: handleCombinedProgress,
                  workspace: capturedContext.workspace,
                });

                if (
                  combinedController.signal.aborted ||
                  metaJobs.some(
                    (j) => (j.status as AutoPostJobStatus) === 'cancelled'
                  )
                ) {
                  const finishedAt = new Date().toISOString();
                  for (const metaJob of metaJobs) {
                    metaJob.status = 'cancelled';
                    metaJob.step = 'Dibatalkan';
                    metaJob.finishedAt = finishedAt;
                    this.emitJobUpdate(metaJob, true);
                  }
                  return;
                }

                const finishedAt = new Date().toISOString();
                for (const metaJob of metaJobs) {
                  metaJob.publishedUrl = result.publishedUrl ?? null;
                  metaJob.finishedAt = finishedAt;
                  metaJob.error = null;

                  if (result.status === 'completed') {
                    metaJob.status = 'completed';
                    metaJob.progressPercent = 100;
                    metaJob.step = 'Selesai dipublikasikan (FB & IG)';
                    this.appendLog(metaJob, result.summary, 'success');
                    this.emitJobUpdate(metaJob, true);
                    this.syncPlannerAfterCompletion(
                      input.item.id,
                      metaJob.platform,
                      result.publishedUrl,
                      metaJob.jobId
                    );
                  } else {
                    metaJob.status = 'awaiting_review';
                    metaJob.progressPercent = Math.max(
                      metaJob.progressPercent,
                      85
                    );
                    metaJob.step = 'Menunggu review manual (FB & IG)';
                    this.appendLog(metaJob, result.summary, 'warning');
                    this.emitJobUpdate(metaJob, true);
                    this.syncPlannerAfterReview(
                      input.item.id,
                      metaJob.platform,
                      result.publishedUrl,
                      metaJob.jobId
                    );
                  }
                }
              } catch (err) {
                const isAbort =
                  combinedController.signal.aborted ||
                  (err instanceof Error && err.name === 'AbortError');
                const finishedAt = new Date().toISOString();

                for (const metaJob of metaJobs) {
                  if (isAbort) {
                    metaJob.status = 'cancelled';
                    metaJob.step = 'Dibatalkan';
                    metaJob.error = null;
                    this.appendLog(
                      metaJob,
                      'Job dibatalkan oleh pengguna.',
                      'warning'
                    );
                  } else {
                    const message =
                      err instanceof Error ? err.message : String(err);
                    metaJob.status = 'failed';
                    metaJob.step = 'Gagal';
                    metaJob.error = message;
                    this.appendLog(metaJob, `Gagal: ${message}`, 'error');
                  }
                  metaJob.finishedAt = finishedAt;
                  this.emitJobUpdate(metaJob, true);
                }
              } finally {
                this.controllers.delete(fbJobId);
                this.controllers.delete(igJobId);
              }
            },
            { signal: combinedController.signal }
          )
          .catch(() => {
            this.controllers.delete(fbJobId);
            this.controllers.delete(igJobId);
            const finishedAt = new Date().toISOString();
            for (const metaJob of metaJobs) {
              if (
                metaJob.status !== 'completed' &&
                metaJob.status !== 'awaiting_review' &&
                metaJob.status !== 'failed'
              ) {
                metaJob.status = 'cancelled';
                metaJob.step = 'Dibatalkan';
                metaJob.finishedAt = metaJob.finishedAt ?? finishedAt;
                this.emitJobUpdate(metaJob, true);
              }
            }
          });

        continue;
      }

      const engine =
        resolvedEngines.get(platform) ??
        this.resolveEngineForPlatform(platform, activeWorkspace.id);
      const jobId = `ap-${randomUUID().slice(0, 12)}`;
      const nowIso = new Date().toISOString();

      const job: AutoPostJob = {
        jobId,
        batchId,
        workspaceId: activeWorkspace.id,
        itemId: input.item.id,
        folderCode: input.item.folderCode,
        platform,
        engine,
        mode: resolvedMode,
        status: 'queued',
        step: 'Menunggu antrean',
        progressPercent: 0,
        publishedUrl: null,
        error: null,
        logs: [
          {
            timestamp: nowIso,
            message: `Masuk antrean Auto-Post (${platform}, engine: ${engine}, mode: ${resolvedMode}).`,
            level: 'info',
          },
        ],
        createdAt: nowIso,
        startedAt: null,
        finishedAt: null,
      };

      const controller = new AbortController();
      this.controllers.set(jobId, controller);
      this.jobWorkspaces.set(jobId, capturedContext);

      this.jobs.unshift(job);
      this.trimOldJobs();
      createdJobs.push(cloneJob(job));
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
              job.step = 'Dibatalkan';
              job.finishedAt = job.finishedAt ?? new Date().toISOString();
              this.emitJobUpdate(job, true);
              return;
            }

            job.status = 'running';
            job.startedAt = new Date().toISOString();
            job.step = 'Memulai proses Auto-Post';
            job.progressPercent = 2;
            this.emitJobUpdate(job, true);

            const handleProgress = (update: {
              step: string;
              progressPercent: number;
              log?: string;
              level?: 'info' | 'success' | 'warning' | 'error';
            }) => {
              if (job.status !== 'running') return;
              job.step = update.step;
              job.progressPercent = Math.max(
                0,
                Math.min(100, Math.round(update.progressPercent))
              );
              const hasLog = Boolean(update.log);
              if (update.log) {
                this.appendLog(job, update.log, update.level ?? 'info');
              }
              this.emitJobUpdate(job, hasLog || job.progressPercent >= 100);
            };

            try {
              let result: {
                status: 'completed' | 'awaiting_review';
                publishedUrl?: string | null;
                summary: string;
                pendingIgContainerId?: string;
              };

              if (engine === 'youtube_api') {
                result = await publishToYouTubeApi({
                  item: input.item,
                  mode: resolvedMode,
                  privacy: input.youtubePrivacy,
                  signal: controller.signal,
                  onProgress: handleProgress,
                  workspace: capturedContext.workspace,
                });
              } else if (engine === 'meta_api') {
                if (platform === 'fb_reels') {
                  result = await publishFacebookReelViaMetaApi({
                    item: input.item,
                    mode: resolvedMode,
                    signal: controller.signal,
                    onProgress: handleProgress,
                    workspace: capturedContext.workspace,
                  });
                } else if (platform === 'ig_reels') {
                  result = await publishInstagramReelViaMetaApi({
                    item: input.item,
                    mode: resolvedMode,
                    signal: controller.signal,
                    onProgress: handleProgress,
                    workspace: capturedContext.workspace,
                  });
                } else {
                  throw new Error(
                    `Meta Graph API tidak mendukung platform ${platform}.`
                  );
                }
              } else {
                result = await publishViaBrowser({
                  platform,
                  item: input.item,
                  mode: resolvedMode,
                  signal: controller.signal,
                  onProgress: handleProgress,
                  workspace: capturedContext.workspace,
                });
              }

              if (
                controller.signal.aborted ||
                (job.status as AutoPostJobStatus) === 'cancelled'
              ) {
                job.status = 'cancelled';
                job.step = 'Dibatalkan';
                job.finishedAt = new Date().toISOString();
                this.pendingIgContainers.delete(jobId);
                this.emitJobUpdate(job, true);
                return;
              }

              job.publishedUrl = result.publishedUrl ?? null;
              job.finishedAt = new Date().toISOString();
              job.error = null;

              if (result.status === 'completed') {
                this.pendingIgContainers.delete(jobId);
                job.status = 'completed';
                job.progressPercent = 100;
                job.step = 'Selesai dipublikasikan';
                this.appendLog(job, result.summary, 'success');
                this.emitJobUpdate(job, true);
                this.syncPlannerAfterCompletion(
                  input.item.id,
                  platform,
                  result.publishedUrl,
                  jobId
                );
              } else {
                if (result.pendingIgContainerId) {
                  this.pendingIgContainers.set(
                    jobId,
                    result.pendingIgContainerId
                  );
                }
                job.status = 'awaiting_review';
                job.progressPercent = Math.max(job.progressPercent, 85);
                job.step = 'Menunggu review manual';
                this.appendLog(job, result.summary, 'warning');
                this.emitJobUpdate(job, true);
                this.syncPlannerAfterReview(
                  input.item.id,
                  platform,
                  result.publishedUrl,
                  jobId
                );
              }
            } catch (err) {
              const isAbort =
                controller.signal.aborted ||
                (err instanceof Error && err.name === 'AbortError');

              if (isAbort) {
                job.status = 'cancelled';
                job.step = 'Dibatalkan';
                job.error = null;
                this.appendLog(job, 'Job dibatalkan oleh pengguna.', 'warning');
              } else {
                const message =
                  err instanceof Error ? err.message : String(err);
                job.status = 'failed';
                job.step = 'Gagal';
                job.error = message;
                this.appendLog(job, `Gagal: ${message}`, 'error');
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
          if (
            job.status !== 'completed' &&
            job.status !== 'awaiting_review' &&
            job.status !== 'failed'
          ) {
            job.status = 'cancelled';
            job.step = 'Dibatalkan';
            job.finishedAt = job.finishedAt ?? new Date().toISOString();
            this.emitJobUpdate(job, true);
          }
        });
    }

    return createdJobs;
  }

  cancelJob(jobId: string): AutoPostJob | null {
    const job = this.jobs.find((entry) => entry.jobId === jobId);
    if (!job) {
      return null;
    }

    if (
      job.status === 'completed' ||
      job.status === 'failed' ||
      job.status === 'cancelled'
    ) {
      return cloneJob(job);
    }

    job.status = 'cancelled';
    job.step = 'Dibatalkan';
    job.finishedAt = new Date().toISOString();
    job.error = null;
    this.pendingIgContainers.delete(jobId);
    this.appendLog(job, 'Job dibatalkan oleh pengguna.', 'warning');

    const controller = this.controllers.get(jobId);
    if (controller) {
      controller.abort();
      this.controllers.delete(jobId);
    }

    const partnerId = this.combinedMetaPartners.get(jobId);
    if (partnerId) {
      const partnerJob = this.jobs.find((entry) => entry.jobId === partnerId);
      this.controllers.delete(partnerId);
      if (
        partnerJob &&
        partnerJob.status !== 'completed' &&
        partnerJob.status !== 'failed' &&
        partnerJob.status !== 'cancelled'
      ) {
        partnerJob.status = 'cancelled';
        partnerJob.step = 'Dibatalkan';
        partnerJob.finishedAt = new Date().toISOString();
        partnerJob.error = null;
        this.appendLog(
          partnerJob,
          'Job gabungan Meta Business Suite dibatalkan oleh pengguna.',
          'warning'
        );
        this.emitJobUpdate(partnerJob, true);
      }
    }

    this.emitJobUpdate(job, true);
    return cloneJob(job);
  }

  async confirmReviewJob(
    jobId: string,
    publishedUrl?: string
  ): Promise<ConfirmReviewJobResult | null> {
    const job = this.jobs.find((entry) => entry.jobId === jobId);
    if (!job) {
      return null;
    }

    const explicitUrl =
      typeof publishedUrl === 'string' && publishedUrl.trim()
        ? publishedUrl.trim()
        : null;

    let resolvedUrl: string | null = explicitUrl ?? job.publishedUrl;
    let publishedViaIgContainer = false;
    let publishedIgMediaId: string | null = null;

    const wsCtx = this.resolveWorkspaceContextForJob(jobId, job.workspaceId);
    const pendingContainerId = this.pendingIgContainers.get(jobId);
    if (pendingContainerId) {
      job.step = 'Menerbitkan container Instagram Reels via Meta API';
      job.progressPercent = Math.max(job.progressPercent, 92);
      this.appendLog(
        job,
        `Menerbitkan container Instagram Reels (${pendingContainerId}) melalui Meta Graph API...`,
        'info'
      );
      this.emitJobUpdate(job, true);

      try {
        const published = await publishInstagramContainerNow(
          pendingContainerId,
          undefined,
          wsCtx.workspaceId
        );
        this.pendingIgContainers.delete(jobId);
        publishedViaIgContainer = true;
        publishedIgMediaId = published.mediaId;
        resolvedUrl = explicitUrl ?? published.permalink ?? job.publishedUrl;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        job.step = 'Gagal menerbitkan container Instagram';
        job.error = message;
        this.appendLog(
          job,
          `Gagal menerbitkan container Instagram Reels: ${message}`,
          'error'
        );
        this.emitJobUpdate(job, true);
        throw error;
      }
    }

    job.status = 'completed';
    job.progressPercent = 100;
    job.step = publishedViaIgContainer
      ? 'Selesai dipublikasikan via Meta API'
      : 'Dikonfirmasi tayang';
    job.publishedUrl = resolvedUrl ?? null;
    job.error = null;
    job.finishedAt = new Date().toISOString();

    if (publishedViaIgContainer) {
      this.appendLog(
        job,
        resolvedUrl
          ? `Instagram Reels berhasil diterbitkan via Meta API: ${resolvedUrl}`
          : `Instagram Reels berhasil diterbitkan via Meta API (Media ID: ${publishedIgMediaId ?? '-'}).`,
        'success'
      );
    } else {
      this.appendLog(
        job,
        resolvedUrl
          ? `Dikonfirmasi tayang secara manual: ${resolvedUrl}`
          : 'Dikonfirmasi tayang secara manual oleh pengguna.',
        'success'
      );
    }

    const patch: { status: 'published'; publishedUrl?: string } = {
      status: 'published',
    };
    if (resolvedUrl) {
      patch.publishedUrl = resolvedUrl;
    }

    let updated = updateItemPlatformState(
      job.itemId,
      job.platform,
      patch,
      wsCtx.plannerFile,
      wsCtx.workspace
    );
    this.emitJobUpdate(job, true);

    // If this job ran as a combined FB+IG Meta Business Suite upload, confirm its partner too
    const partnerId = this.combinedMetaPartners.get(jobId);
    if (partnerId) {
      const partnerJob = this.jobs.find((entry) => entry.jobId === partnerId);
      if (partnerJob && partnerJob.status === 'awaiting_review') {
        partnerJob.status = 'completed';
        partnerJob.progressPercent = 100;
        partnerJob.step = 'Dikonfirmasi tayang (FB & IG)';
        partnerJob.error = null;
        partnerJob.finishedAt = new Date().toISOString();
        this.appendLog(
          partnerJob,
          'Dikonfirmasi tayang bersama sesi Meta Business Suite.',
          'success'
        );
        updated = updateItemPlatformState(
          partnerJob.itemId,
          partnerJob.platform,
          { status: 'published' },
          wsCtx.plannerFile,
          wsCtx.workspace
        );
        this.emitJobUpdate(partnerJob, true);
      }
    }

    this.onPlannerUpdated?.(
      `autopost-confirmed:${job.itemId}:${job.platform}`,
      updated.db,
      wsCtx.workspaceId
    );

    return {
      job: cloneJob(job),
      db: updated.db,
      item: updated.item,
    };
  }
}

export function createAutoPostQueue(
  options: AutoPostQueueOptions = {}
): AutoPostQueueManager {
  return new AutoPostQueueManager(options);
}
