import { createContext, useContext } from 'react';
import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
  PlatformPublishState,
  PlatformUploadStatus,
  UserContentProperties,
  WorkflowStatus,
} from '@/types/planner';
import type {
  WorkspaceMetadata,
  WorkspacesRegistry,
} from '@/types/workspace';
import type { KanbanGroupBy } from '@/components/KanbanView';
import type { WorkspaceModalMode } from '@/components/workspace/WorkspaceModal';
import type { CreateContentTab } from '@/components/planner/CreateContentModal';

export type PlannerSlotFilter = 'all' | '01' | '02' | string;
export type PlannerReadinessFilter =
  | 'all'
  | 'ready'
  | 'needs_wm'
  | 'incomplete';
export type PlannerPlatformFilter =
  | 'all'
  | PlatformKey
  | 'missing_yt_shorts'
  | 'missing_tiktok'
  | 'missing_ig_reels'
  | 'missing_fb_reels';

export type PlannerToastKind = 'success' | 'info' | 'error';

export interface PlannerWorkspace {
  database: PlannerDatabase | null;
  workspacesRegistry: WorkspacesRegistry | null;
  activeWorkspace: WorkspaceMetadata | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  openCreateContent: (initialTab?: CreateContentTab) => void;
  openWorkspaceModal: (mode?: WorkspaceModalMode) => void;
  openQuickGuide: () => void;

  allItems: ContentPlannerItem[];
  filteredItems: ContentPlannerItem[];
  isLoading: boolean;
  isScanning: boolean;
  isLiveSyncActive: boolean;
  errorMsg: string | null;
  contentRootPath: string;
  lastScanAt: string | null;
  refresh: () => void;
  rescan: () => Promise<void>;

  searchQuery: string;
  setSearchQuery: (value: string) => void;
  slotFilter: PlannerSlotFilter;
  setSlotFilter: (value: PlannerSlotFilter) => void;
  readinessFilter: PlannerReadinessFilter;
  setReadinessFilter: (value: PlannerReadinessFilter) => void;
  platformFilter: PlannerPlatformFilter;
  setPlatformFilter: (value: PlannerPlatformFilter) => void;
  monthFilter: string;
  setMonthFilter: (value: string) => void;
  workflowStatusFilter: WorkflowStatus | 'all';
  setWorkflowStatusFilter: (value: WorkflowStatus | 'all') => void;
  availableMonths: string[];
  activeFilterCount: number;
  resetFilters: () => void;

  kanbanGroupBy: KanbanGroupBy;
  setKanbanGroupBy: (value: KanbanGroupBy) => void;

  updateStatus: (
    item: ContentPlannerItem,
    status: WorkflowStatus
  ) => Promise<void>;
  togglePlatform: (
    item: ContentPlannerItem,
    platform: PlatformKey
  ) => Promise<void>;
  batchPlatforms: (
    itemId: string,
    status: PlatformUploadStatus
  ) => Promise<void>;
  updatePlatformDetail: (
    itemId: string,
    platform: PlatformKey,
    patch: Partial<PlatformPublishState>
  ) => Promise<void>;
  updateProperties: (
    itemId: string,
    patch: Partial<UserContentProperties>
  ) => Promise<void>;
  saveCaption: (itemId: string, text: string) => Promise<void>;
  openExplorer: (targetPath: string, selectFile?: boolean) => Promise<void>;
  copyText: (text: string, label: string) => void;
  showToast: (message: string, type?: PlannerToastKind) => void;

  openDetail: (item: ContentPlannerItem) => void;
  openCaption: (item: ContentPlannerItem) => void;
  openWatermark: (item: ContentPlannerItem) => void;
  openAutoPost: (
    item?: ContentPlannerItem | null,
    platform?: PlatformKey | null
  ) => void;
}

const PlannerContext = createContext<PlannerWorkspace | null>(null);

export const PlannerProvider = PlannerContext.Provider;

export function usePlannerWorkspace(): PlannerWorkspace {
  const ctx = useContext(PlannerContext);
  if (!ctx) {
    throw new Error('usePlannerWorkspace dipakai di luar PlannerProvider.');
  }
  return ctx;
}