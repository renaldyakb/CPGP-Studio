export interface MotionProvitConfigPublic {
  workspaceId: string;
  baseUrl: string;
  email: string;
  passwordConfigured: boolean;
  connected: boolean;
  accountName: string | null;
  accountEmail: string | null;
  lastVerifiedAt: string | null;
  lastSyncedAt: string | null;
  cachedJobsCount: number;
  totalRemoteCount: number;
}

export interface MotionProvitJobSummary {
  id: string;
  shortId: string;
  title: string;
  style: string;
  status: 'completed' | 'processing' | 'failed' | 'unknown';
  statusLabel: string;
  aspectRatio: string;
  durationSec: number | null;
  createdAtText: string;
  createdAtIso: string | null;
  thumbnailUrl: string | null;
  detailUrl: string;
  videoUrl: string | null;
  coverUrl: string | null;
  captionPreview: string | null;
  alreadyImported: boolean;
  importedItemId: string | null;
  importedFolderCode: string | null;
}

export interface MotionProvitDownloadAssetsSelection {
  video: boolean;
  cover: boolean;
  caption: boolean;
}

export interface MotionProvitImportRequest {
  jobIds: string[];
  assets: MotionProvitDownloadAssetsSelection;
  startDateIso?: string;
  startSlotCode?: string;
  skipExistingSlots?: boolean;
}

export interface MotionProvitImportItemResult {
  jobId: string;
  shortId: string;
  title: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';
  itemId: string | null;
  folderCode: string | null;
  monthFolder: string | null;
  downloadedFiles: string[];
  error: string | null;
}

export interface MotionProvitImportProgress {
  runId: string;
  workspaceId: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completedCount: number;
  failedCount: number;
  currentStep: string;
  progressPercent: number;
  startedAt: string | null;
  finishedAt: string | null;
  items: MotionProvitImportItemResult[];
}
