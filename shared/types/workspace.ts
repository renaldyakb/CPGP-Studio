import type { PlatformKey } from '../../src/types/planner.ts';

export type WorkspacePresetId =
  | 'jurnal_dunia'
  | 'standard_creator'
  | 'overwrite_creator';

export type WatermarkPolicyMode =
  | 'separate_wm_file'
  | 'direct_or_wm'
  | 'overwrite_source';

export type FolderStructureMode =
  | 'month_and_slot'
  | 'flat_slot'
  | 'auto_both';

export interface TimeSlotDefinition {
  code: string;
  label: string;
  window: string;
  defaultTime: string;
  recommendation: string;
}

export interface WorkspaceRuleConfig {
  presetId: WorkspacePresetId;
  folderStructure: FolderStructureMode;
  watermarkPolicy: WatermarkPolicyMode;
  requiredAssets: {
    video: boolean;
    cover: boolean;
    caption: boolean;
  };
  fileRules: {
    rawVideoRegex: string;
    wmVideoRegex: string;
    coverRegex: string;
    captionFileName: string;
  };
  defaultHashtags: string[];
  captionTemplate: string;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  handle: string;
  description: string;
  accentColor: string;
  contentRootPath: string;
  defaultYear: number;
  activePlatforms: PlatformKey[];
  browserProfileMode: 'isolated' | 'shared';
  rules: WorkspaceRuleConfig;
  timeSlots: Record<string, TimeSlotDefinition>;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface WorkspacesRegistry {
  schemaVersion: string;
  brandCode: 'CPGP';
  brandFullName: 'Content Planer Gam Puko';
  activeWorkspaceId: string;
  onboardingCompleted: boolean;
  workspaces: Record<string, WorkspaceMetadata>;
}

export interface CreateWorkspaceInput {
  name: string;
  handle?: string;
  description?: string;
  contentRootPath: string;
  createFolderIfMissing?: boolean;
  presetId?: WorkspacePresetId;
  folderStructure?: FolderStructureMode;
  watermarkPolicy?: WatermarkPolicyMode;
  requiredAssets?: {
    video?: boolean;
    cover?: boolean;
    caption?: boolean;
  };
  timeSlots?: Record<string, TimeSlotDefinition>;
  defaultHashtags?: string[];
  activePlatforms?: PlatformKey[];
  browserProfileMode?: 'isolated' | 'shared';
  copyWatermarkPresetsFromWorkspaceId?: string | null;
}

export interface UpdateWorkspaceInput {
  name?: string;
  handle?: string;
  description?: string;
  contentRootPath?: string;
  defaultYear?: number;
  activePlatforms?: PlatformKey[];
  browserProfileMode?: 'isolated' | 'shared';
  rules?: Partial<WorkspaceRuleConfig>;
  timeSlots?: Record<string, TimeSlotDefinition>;
}

export interface CreateContentSlotInput {
  monthFolder?: string;
  dayOfMonth: number;
  slotCode: string;
  hookTitle?: string;
  ctaQuestion?: string;
  hashtags?: string[];
  rawCaptionText?: string;
  customTitle?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  categoryTags?: string[];
  openInExplorer?: boolean;
}

export interface BatchGenerateSlotsInput {
  monthFolder?: string;
  startDay: number;
  endDay: number;
  slotCodes: string[];
  defaultHashtags?: string[];
  ctaTemplate?: string;
}

export interface PathValidationResult {
  exists: boolean;
  isDirectory: boolean;
  writable: boolean;
  normalizedPath: string;
  detectedMonthFolders: string[];
  detectedSlotFoldersCount: number;
  sampleCodes: string[];
}

export interface NextSuggestedSlot {
  monthFolder: string;
  year?: number;
  isoDate?: string;
  dayOfMonth: number;
  slotCode: string;
  folderCode: string;
  slotLabel: string;
  slotTimeWindow: string;
  lastOccupiedSlot?: {
    monthFolder: string;
    folderCode: string;
    isoDate: string;
  } | null;
}
