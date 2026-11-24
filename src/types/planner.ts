export type PlatformKey = 'yt_shorts' | 'tiktok' | 'ig_reels' | 'fb_reels';

export type PlatformUploadStatus =
  | 'not_started'
  | 'uploaded_draft'
  | 'scheduled'
  | 'published'
  | 'issue';

export type WorkflowStatus =
  | 'draft_assets'
  | 'needs_watermark'
  | 'ready_to_upload'
  | 'scheduled'
  | 'partially_published'
  | 'published_all'
  | 'on_hold';

export type PriorityLevel = 'low' | 'normal' | 'high' | 'urgent';

export interface AssetFileInfo {
  exists: boolean;
  fileName: string | null;
  relativePath: string | null;
  absolutePath: string | null;
  mediaUrl: string | null;
  sizeBytes: number;
  sizeFormatted: string;
  mtimeMs: number | null;
  lastModifiedIso: string | null;
  candidates?: string[];
  aspectRatio?: string | null;
  extractedId?: string | null;
}

export interface OtherFileInfo {
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sizeFormatted: string;
  extension: string;
}

export interface ParsedCaption {
  rawText: string;
  hookTitle: string;
  ctaQuestion: string;
  bodyWithoutHashtags: string;
  hashtags: string[];
  charCount: number;
  wordCount: number;
  lineCount: number;
}

export interface ScheduleSlotInfo {
  dayOfMonth: number;
  monthName: string;
  monthNumber: number;
  year: number;
  isoDate: string;
  displayDate: string;
  slotCode: '01' | '02' | string;
  slotLabel: 'Siang' | 'Malam' | string;
  slotTimeWindow: string;
  recommendedTimeWib: string;
  slotDescription: string;
}

export interface AssetReadiness {
  hasRawVideo: boolean;
  hasCover: boolean;
  hasCaption: boolean;
  hasWmFinal: boolean;
  completenessScore: number; // 0 to 4
  requiredScore: number; // 0 to 3 (wm_final + cover + caption)
  isUploadReady: boolean; // true when wm_final + cover + caption all exist
  missingRequired: string[];
  missingOptional: string[];
}

export interface AutoScannedMetadata {
  motionprovitId: string | null;
  aspectRatio: string;
  assets: {
    rawVideo: AssetFileInfo;
    wmVideo: AssetFileInfo;
    cover: AssetFileInfo;
    caption: AssetFileInfo;
    otherFiles: OtherFileInfo[];
  };
  readiness: AssetReadiness;
  captionParsed: ParsedCaption;
  lastScannedAt: string;
}

export interface PlatformPublishState {
  status: PlatformUploadStatus;
  publishedUrl: string;
  scheduledTime: string;
  notes: string;
  updatedAt: string | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface UserContentProperties {
  customTitle: string;
  workflowStatus: WorkflowStatus;
  statusLockedManually: boolean;
  priority: PriorityLevel;
  categoryTags: string[];
  notes: string;
  checklist: ChecklistItem[];
  platforms: Record<PlatformKey, PlatformPublishState>;
  updatedAt: string;
}

export interface ContentPlannerItem {
  id: string; // e.g., "November/24.01"
  folderCode: string; // e.g., "24.01"
  monthFolder: string; // e.g., "November"
  relativeFolderPath: string; // e.g., "November/24.01"
  absolutePath: string; // e.g., "D:\\RENAL\\JURNAL DUNIA\\KONTEN\\November\\24.01"
  schedule: ScheduleSlotInfo;
  autoMetadata: AutoScannedMetadata;
  userProperties: UserContentProperties;
}

export interface WorkspaceStats {
  totalItems: number;
  uploadReadyCount: number;
  needsWatermarkCount: number;
  incompleteAssetsCount: number;
  scheduledCount: number;
  partiallyPublishedCount: number;
  publishedAllCount: number;
  onHoldCount: number;
  slot01Count: number;
  slot02Count: number;
  platformPublishedCounts: Record<PlatformKey, number>;
}

export interface PlannerDatabase {
  schemaVersion: string;
  workspaceConfig: {
    workspaceName: string;
    contentRootPath: string;
    defaultYear: number;
    lastFullScanAt: string;
    timeSlots: {
      '01': {
        code: '01';
        label: 'Siang';
        window: '11.30 - 12.00 WIB';
        defaultTime: '11:30';
        recommendation: 'Menyasar jam istirahat makan siang saat orang membuka HP sambil santai.';
      };
      '02': {
        code: '02';
        label: 'Malam';
        window: '19.30 - 20.00 WIB';
        defaultTime: '19:30';
        recommendation: 'Jam prime time saat orang beristirahat di rumah dan punya waktu lebih lama untuk menyimak cerita sejarah hingga habis.';
      };
    };
  };
  stats: WorkspaceStats;
  items: Record<string, ContentPlannerItem>;
}

export interface KanbanColumnDefinition {
  id: WorkflowStatus;
  label: string;
  shortLabel: string;
  description: string;
  colorClass: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  dotColor: string;
  isAutoByDefault: boolean;
}

export const KANBAN_COLUMNS: KanbanColumnDefinition[] = [
  {
    id: 'draft_assets',
    label: '1. Aset Belum Lengkap',
    shortLabel: 'Draft Aset',
    description: 'File dasar (cover, caption.txt, atau video) masih ada yang kurang.',
    colorClass: 'slate',
    badgeBg: 'bg-slate-500/15',
    badgeText: 'text-slate-300',
    borderClass: 'border-slate-500/30',
    dotColor: 'bg-slate-400',
    isAutoByDefault: true,
  },
  {
    id: 'needs_watermark',
    label: '2. Menunggu Watermark (wm_final)',
    shortLabel: 'Butuh Watermark',
    description: 'Video motionprovit, cover & caption sudah siap, tinggal render wm_final.',
    colorClass: 'amber',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-300',
    borderClass: 'border-amber-500/30',
    dotColor: 'bg-amber-400',
    isAutoByDefault: true,
  },
  {
    id: 'ready_to_upload',
    label: '3. Siap Upload (WM Ready)',
    shortLabel: 'Siap Upload',
    description: 'wm_final, cover, dan caption.txt lengkap dan siap di-upload ke 4 platform.',
    colorClass: 'blue',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-300',
    borderClass: 'border-blue-500/30',
    dotColor: 'bg-blue-400',
    isAutoByDefault: true,
  },
  {
    id: 'scheduled',
    label: '4. Terjadwal di Studio',
    shortLabel: 'Terjadwal',
    description: 'Sudah di-upload dan dijadwalkan tayang (11.30 Siang / 19.30 Malam WIB).',
    colorClass: 'violet',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-300',
    borderClass: 'border-violet-500/30',
    dotColor: 'bg-violet-400',
    isAutoByDefault: false,
  },
  {
    id: 'partially_published',
    label: '5. Terupload Sebagian (1-3/4)',
    shortLabel: 'Upload Sebagian',
    description: 'Sudah tayang di sebagian platform, masih ada platform yang belum di-upload.',
    colorClass: 'cyan',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-300',
    borderClass: 'border-cyan-500/30',
    dotColor: 'bg-cyan-400',
    isAutoByDefault: true,
  },
  {
    id: 'published_all',
    label: '6. Selesai (All 4 Platforms)',
    shortLabel: 'Selesai 4/4',
    description: 'Sudah terupload lengkap di YouTube Shorts, TikTok, Reels & Facebook.',
    colorClass: 'emerald',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-300',
    borderClass: 'border-emerald-500/30',
    dotColor: 'bg-emerald-400',
    isAutoByDefault: true,
  },
  {
    id: 'on_hold',
    label: '7. Revisi / Hold',
    shortLabel: 'Revisi / Hold',
    description: 'Ditahan sementara untuk perbaikan audio, watermark, cover, atau caption.',
    colorClass: 'rose',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-300',
    borderClass: 'border-rose-500/30',
    dotColor: 'bg-rose-400',
    isAutoByDefault: false,
  },
];

export interface PlatformMeta {
  key: PlatformKey;
  label: string;
  shortLabel: string;
  color: string;
  bgActive: string;
  borderActive: string;
  textActive: string;
  uploadUrl: string;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    key: 'yt_shorts',
    label: 'YouTube Shorts',
    shortLabel: 'YT Short',
    color: 'red',
    bgActive: 'bg-red-500/20',
    borderActive: 'border-red-500/50',
    textActive: 'text-red-300',
    uploadUrl: 'https://studio.youtube.com',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TikTok',
    color: 'pink',
    bgActive: 'bg-pink-500/20',
    borderActive: 'border-pink-500/50',
    textActive: 'text-pink-300',
    uploadUrl: 'https://www.tiktok.com/tiktokstudio/upload',
  },
  {
    key: 'ig_reels',
    label: 'Instagram Reels',
    shortLabel: 'IG Reels',
    color: 'fuchsia',
    bgActive: 'bg-fuchsia-500/20',
    borderActive: 'border-fuchsia-500/50',
    textActive: 'text-fuchsia-300',
    uploadUrl: 'https://www.instagram.com',
  },
  {
    key: 'fb_reels',
    label: 'Facebook Reels',
    shortLabel: 'Facebook',
    color: 'blue',
    bgActive: 'bg-blue-500/20',
    borderActive: 'border-blue-500/50',
    textActive: 'text-blue-300',
    uploadUrl: 'https://business.facebook.com/latest/home',
  },
];
