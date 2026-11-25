import fs from 'node:fs';
import path from 'node:path';
import type {
  AutoScannedMetadata,
  ChecklistItem,
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
  PlatformPublishState,
  PlatformUploadStatus,
  UserContentProperties,
  WorkflowStatus,
  WorkspaceStats,
} from '../src/types/planner.ts';
import type { WorkspaceMetadata } from '../shared/types/workspace.ts';
import {
  migrateLegacyMonthFoldersOnDisk,
  scanContentDirectory,
  scanSingleContentFolder,
  type ScannedContentFolder,
} from './scanner.ts';
import { resolveAppRoot } from './core/appPaths.ts';
import {
  getActiveWorkspace,
  getWorkspacePaths,
  LEGACY_PLANNER_FILE,
} from './workspaces/registry.ts';

export const APP_ROOT = resolveAppRoot();
export const DATA_DIR = path.join(APP_ROOT, 'data');
export const DATABASE_FILE_PATH = path.join(DATA_DIR, 'planner-data.json');

export const ALL_PLATFORM_KEYS: PlatformKey[] = [
  'yt_shorts',
  'tiktok',
  'ig_reels',
  'fb_reels',
];

const GENERIC_HASHTAGS = new Set([
  '#edukasi',
  '#jurnaldunia',
  '#sejarah',
  '#faktaunik',
  '#fyp',
  '#shorts',
  '#reels',
]);

export function generateCategoryTagsFromHashtags(hashtags: string[]): string[] {
  const tags: string[] = [];
  for (const rawTag of hashtags) {
    const lower = rawTag.toLowerCase().trim();
    if (!lower || GENERIC_HASHTAGS.has(lower)) continue;
    const cleaned = rawTag.replace(/^#+/, '').trim();
    if (!cleaned) continue;
    const formatted =
      cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    if (!tags.includes(formatted)) {
      tags.push(formatted);
    }
  }
  return tags;
}

export function createDefaultChecklist(
  autoMetadata?: AutoScannedMetadata
): ChecklistItem[] {
  const hasWm = autoMetadata?.readiness.hasWmFinal ?? false;
  const hasCover = autoMetadata?.readiness.hasCover ?? false;
  const hasCaption = autoMetadata?.readiness.hasCaption ?? false;

  return [
    {
      id: 'chk-wm',
      text: 'Cek video wm_final & watermark',
      done: hasWm,
    },
    {
      id: 'chk-cover',
      text: 'Siapkan cover thumbnail 9:16',
      done: hasCover,
    },
    {
      id: 'chk-caption',
      text: 'Copy caption & hashtag',
      done: hasCaption,
    },
    {
      id: 'chk-upload',
      text: 'Upload ke 4 platform',
      done: false,
    },
  ];
}

export function createDefaultPlatforms(
  recommendedTimeWib = '11:30'
): Record<PlatformKey, PlatformPublishState> {
  const createState = (): PlatformPublishState => ({
    status: 'not_started',
    publishedUrl: '',
    scheduledTime: recommendedTimeWib,
    notes: '',
    updatedAt: null,
  });

  return {
    yt_shorts: createState(),
    tiktok: createState(),
    ig_reels: createState(),
    fb_reels: createState(),
  };
}

export function calculateAutoWorkflowStatus(
  autoMetadata: AutoScannedMetadata,
  platforms: Record<PlatformKey, PlatformPublishState>
): WorkflowStatus {
  const statuses = ALL_PLATFORM_KEYS.map(
    (key) => platforms[key]?.status ?? 'not_started'
  );
  const publishedCount = statuses.filter((s) => s === 'published').length;
  const scheduledCount = statuses.filter((s) => s === 'scheduled').length;

  if (publishedCount === ALL_PLATFORM_KEYS.length) {
    return 'published_all';
  }
  if (publishedCount >= 1 && publishedCount < ALL_PLATFORM_KEYS.length) {
    return 'partially_published';
  }
  if (scheduledCount >= 1) {
    return 'scheduled';
  }

  const { readiness } = autoMetadata;
  if (readiness.isUploadReady) {
    return 'ready_to_upload';
  }
  if (
    readiness.hasRawVideo &&
    !readiness.hasWmFinal &&
    !readiness.missingRequired.includes('cover') &&
    !readiness.missingRequired.includes('caption.txt')
  ) {
    return 'needs_watermark';
  }
  return 'draft_assets';
}

export function mergeUserProperties(
  scanned: ScannedContentFolder,
  existing?: UserContentProperties
): UserContentProperties {
  const nowIso = new Date().toISOString();
  const defaultTags = generateCategoryTagsFromHashtags(
    scanned.autoMetadata.captionParsed.hashtags
  );
  const defaultPlatforms = createDefaultPlatforms(
    scanned.schedule.recommendedTimeWib
  );

  if (!existing) {
    const workflowStatus = calculateAutoWorkflowStatus(
      scanned.autoMetadata,
      defaultPlatforms
    );
    return {
      customTitle: '',
      workflowStatus,
      statusLockedManually: false,
      priority: 'normal',
      categoryTags: defaultTags,
      notes: '',
      checklist: createDefaultChecklist(scanned.autoMetadata),
      platforms: defaultPlatforms,
      updatedAt: nowIso,
    };
  }

  const mergedPlatforms: Record<PlatformKey, PlatformPublishState> = {
    yt_shorts: {
      ...defaultPlatforms.yt_shorts,
      ...(existing.platforms?.yt_shorts ?? {}),
    },
    tiktok: {
      ...defaultPlatforms.tiktok,
      ...(existing.platforms?.tiktok ?? {}),
    },
    ig_reels: {
      ...defaultPlatforms.ig_reels,
      ...(existing.platforms?.ig_reels ?? {}),
    },
    fb_reels: {
      ...defaultPlatforms.fb_reels,
      ...(existing.platforms?.fb_reels ?? {}),
    },
  };

  const categoryTags =
    Array.isArray(existing.categoryTags) && existing.categoryTags.length > 0
      ? existing.categoryTags
      : defaultTags;

  const checklist =
    Array.isArray(existing.checklist) && existing.checklist.length > 0
      ? existing.checklist
      : createDefaultChecklist(scanned.autoMetadata);

  const statusLockedManually = Boolean(existing.statusLockedManually);
  const workflowStatus = statusLockedManually
    ? existing.workflowStatus
    : calculateAutoWorkflowStatus(scanned.autoMetadata, mergedPlatforms);

  return {
    customTitle: existing.customTitle ?? '',
    workflowStatus,
    statusLockedManually,
    priority: existing.priority ?? 'normal',
    categoryTags,
    notes: existing.notes ?? '',
    checklist,
    platforms: mergedPlatforms,
    updatedAt: existing.updatedAt ?? nowIso,
  };
}

export function computeWorkspaceStats(
  itemsMap: Record<string, ContentPlannerItem>
): WorkspaceStats {
  const items = Object.values(itemsMap);

  const platformPublishedCounts: Record<PlatformKey, number> = {
    yt_shorts: 0,
    tiktok: 0,
    ig_reels: 0,
    fb_reels: 0,
  };

  let uploadReadyCount = 0;
  let needsWatermarkCount = 0;
  let incompleteAssetsCount = 0;
  let scheduledCount = 0;
  let partiallyPublishedCount = 0;
  let publishedAllCount = 0;
  let onHoldCount = 0;
  let slot01Count = 0;
  let slot02Count = 0;

  for (const item of items) {
    const { readiness } = item.autoMetadata;
    const { workflowStatus, platforms } = item.userProperties;

    if (readiness.isUploadReady) {
      uploadReadyCount += 1;
    } else if (
      readiness.hasRawVideo &&
      !readiness.hasWmFinal &&
      !readiness.missingRequired.includes('cover') &&
      !readiness.missingRequired.includes('caption.txt')
    ) {
      needsWatermarkCount += 1;
    } else {
      incompleteAssetsCount += 1;
    }

    if (workflowStatus === 'scheduled') scheduledCount += 1;
    if (workflowStatus === 'partially_published') partiallyPublishedCount += 1;
    if (workflowStatus === 'published_all') publishedAllCount += 1;
    if (workflowStatus === 'on_hold') onHoldCount += 1;

    if (item.schedule.slotCode === '01') slot01Count += 1;
    if (item.schedule.slotCode === '02') slot02Count += 1;

    for (const key of ALL_PLATFORM_KEYS) {
      if (platforms[key]?.status === 'published') {
        platformPublishedCounts[key] += 1;
      }
    }
  }

  return {
    totalItems: items.length,
    uploadReadyCount,
    needsWatermarkCount,
    incompleteAssetsCount,
    scheduledCount,
    partiallyPublishedCount,
    publishedAllCount,
    onHoldCount,
    slot01Count,
    slot02Count,
    platformPublishedCounts,
  };
}

export function createEmptyDatabase(
  contentRootPath?: string,
  defaultYear?: number,
  workspaceOverride?: WorkspaceMetadata
): PlannerDatabase {
  const targetWs = workspaceOverride ?? getActiveWorkspace();
  const resolvedRoot = contentRootPath ?? targetWs.contentRootPath;
  const resolvedYear = defaultYear ?? targetWs.defaultYear;

  return {
    schemaVersion: '1.0.0',
    workspaceConfig: {
      workspaceName: `${targetWs.name.toUpperCase()}: Content Planner`,
      contentRootPath: resolvedRoot,
      defaultYear: resolvedYear,
      lastFullScanAt: new Date().toISOString(),
      timeSlots: {
        '01': {
          code: '01',
          label: 'Siang',
          window: '11.30 - 12.00 WIB',
          defaultTime: '11:30',
          recommendation:
            'Menyasar jam istirahat makan siang saat orang membuka HP sambil santai.',
        },
        '02': {
          code: '02',
          label: 'Malam',
          window: '19.30 - 20.00 WIB',
          defaultTime: '19:30',
          recommendation:
            'Jam prime time saat orang beristirahat di rumah dan punya waktu lebih lama untuk menyimak cerita sejarah hingga habis.',
        },
      },
    },
    stats: {
      totalItems: 0,
      uploadReadyCount: 0,
      needsWatermarkCount: 0,
      incompleteAssetsCount: 0,
      scheduledCount: 0,
      partiallyPublishedCount: 0,
      publishedAllCount: 0,
      onHoldCount: 0,
      slot01Count: 0,
      slot02Count: 0,
      platformPublishedCounts: {
        yt_shorts: 0,
        tiktok: 0,
        ig_reels: 0,
        fb_reels: 0,
      },
    },
    items: {},
  };
}

export function loadDatabaseFromFile(
  dbFilePath?: string
): PlannerDatabase | null {
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths().plannerFile;
  if (!fs.existsSync(resolvedDbFile)) return null;
  try {
    const raw = fs.readFileSync(resolvedDbFile, 'utf-8');
    const parsed = JSON.parse(raw) as PlannerDatabase;
    if (!parsed || typeof parsed !== 'object' || !parsed.items) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDatabaseToFile(
  db: PlannerDatabase,
  dbFilePath?: string,
  workspaceId?: string
): PlannerDatabase {
  const targetWsId = workspaceId ?? getActiveWorkspace().id;
  const targetPaths = getWorkspacePaths(targetWsId);
  const resolvedDbFile = dbFilePath ?? targetPaths.plannerFile;

  db.stats = computeWorkspaceStats(db.items);
  const dir = path.dirname(resolvedDbFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const serialized = JSON.stringify(db, null, 2) + '\n';
  fs.writeFileSync(resolvedDbFile, serialized, 'utf-8');

  // Keep legacy data/planner-data.json synchronized when saving the default workspace
  if (
    targetWsId === 'jurnal-dunia' &&
    path.resolve(resolvedDbFile) === path.resolve(targetPaths.plannerFile)
  ) {
    try {
      fs.writeFileSync(LEGACY_PLANNER_FILE, serialized, 'utf-8');
    } catch {
      // Ignore legacy sync failure
    }
  }

  return db;
}

export function syncDatabaseWithDisk(
  contentRootPath?: string,
  defaultYear?: number,
  dbFilePath?: string,
  workspaceOverride?: WorkspaceMetadata
): PlannerDatabase {
  const targetWs = workspaceOverride ?? getActiveWorkspace();
  const resolvedRoot = contentRootPath ?? targetWs.contentRootPath;
  const resolvedYear = defaultYear ?? targetWs.defaultYear;
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths(targetWs.id).plannerFile;

  const existingDb =
    loadDatabaseFromFile(resolvedDbFile) ??
    createEmptyDatabase(resolvedRoot, resolvedYear, targetWs);

  // Automatically migrate bare month folders (e.g. "November" -> "2026-November") on disk
  if (targetWs.rules.folderStructure !== 'flat_slot') {
    migrateLegacyMonthFoldersOnDisk(resolvedRoot, resolvedYear);
  }

  const scannedFolders = scanContentDirectory(
    resolvedRoot,
    resolvedYear,
    targetWs
  );
  const nextItems: Record<string, ContentPlannerItem> = {};

  // Build fallback lookup maps by isoDate+slotCode and bare month/folderCode so migrating
  // "November/24.01" -> "2026-November/24.01" preserves 100% of userProperties without data loss!
  const existingByIsoSlot = new Map<string, ContentPlannerItem>();
  for (const existingItem of Object.values(existingDb.items)) {
    const isoKey = `${existingItem.schedule.isoDate}::${existingItem.schedule.slotCode}`;
    if (!existingByIsoSlot.has(isoKey)) {
      existingByIsoSlot.set(isoKey, existingItem);
    }
  }

  for (const scanned of scannedFolders) {
    const legacyBareId = `${scanned.schedule.monthName}/${scanned.folderCode}`;
    const isoSlotKey = `${scanned.schedule.isoDate}::${scanned.schedule.slotCode}`;
    const existingItem =
      existingDb.items[scanned.id] ??
      (scanned.schedule.year === resolvedYear
        ? existingDb.items[legacyBareId]
        : undefined) ??
      existingByIsoSlot.get(isoSlotKey);

    const userProperties = mergeUserProperties(
      scanned,
      existingItem?.userProperties
    );

    nextItems[scanned.id] = {
      id: scanned.id,
      folderCode: scanned.folderCode,
      monthFolder: scanned.monthFolder,
      relativeFolderPath: scanned.relativeFolderPath,
      absolutePath: scanned.absolutePath,
      schedule: scanned.schedule,
      autoMetadata: scanned.autoMetadata,
      userProperties,
    };
  }

  const updatedDb: PlannerDatabase = {
    ...existingDb,
    schemaVersion: '1.0.0',
    workspaceConfig: {
      ...existingDb.workspaceConfig,
      workspaceName: `${targetWs.name.toUpperCase()}: Content Planner`,
      contentRootPath: resolvedRoot,
      defaultYear: resolvedYear,
      lastFullScanAt: new Date().toISOString(),
    },
    items: nextItems,
    stats: computeWorkspaceStats(nextItems),
  };

  return saveDatabaseToFile(updatedDb, resolvedDbFile, targetWs.id);
}

export function getOrInitDatabase(
  contentRootPath?: string,
  defaultYear?: number,
  dbFilePath?: string,
  workspaceOverride?: WorkspaceMetadata
): PlannerDatabase {
  const targetWs = workspaceOverride ?? getActiveWorkspace();
  const resolvedRoot = contentRootPath ?? targetWs.contentRootPath;
  const resolvedYear = defaultYear ?? targetWs.defaultYear;
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths(targetWs.id).plannerFile;

  const existing = loadDatabaseFromFile(resolvedDbFile);
  if (existing && Object.keys(existing.items).length > 0) {
    return existing;
  }
  return syncDatabaseWithDisk(
    resolvedRoot,
    resolvedYear,
    resolvedDbFile,
    targetWs
  );
}

export function updateItemUserProperties(
  itemId: string,
  patch: Partial<UserContentProperties>,
  dbFilePath?: string
): { db: PlannerDatabase; item: ContentPlannerItem } {
  const activeWs = getActiveWorkspace();
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths(activeWs.id).plannerFile;
  const db = getOrInitDatabase(
    activeWs.contentRootPath,
    activeWs.defaultYear,
    resolvedDbFile
  );
  const item = db.items[itemId];
  if (!item) {
    throw new Error(`Content item not found: ${itemId}`);
  }

  const nowIso = new Date().toISOString();
  const prevProps = item.userProperties;

  let statusLockedManually =
    patch.statusLockedManually !== undefined
      ? Boolean(patch.statusLockedManually)
      : prevProps.statusLockedManually;

  if (
    patch.workflowStatus !== undefined &&
    patch.statusLockedManually === undefined
  ) {
    statusLockedManually = true;
  }

  const nextPlatforms = patch.platforms
    ? {
        ...prevProps.platforms,
        ...patch.platforms,
      }
    : prevProps.platforms;

  const nextWorkflowStatus =
    patch.workflowStatus !== undefined
      ? patch.workflowStatus
      : statusLockedManually
        ? prevProps.workflowStatus
        : calculateAutoWorkflowStatus(item.autoMetadata, nextPlatforms);

  item.userProperties = {
    ...prevProps,
    ...patch,
    platforms: nextPlatforms,
    workflowStatus: nextWorkflowStatus,
    statusLockedManually,
    updatedAt: nowIso,
  };

  saveDatabaseToFile(db, resolvedDbFile);
  return { db, item };
}

export function updateItemPlatformState(
  itemId: string,
  platformKey: PlatformKey,
  patch: Partial<PlatformPublishState>,
  dbFilePath?: string,
  workspaceOverride?: WorkspaceMetadata
): { db: PlannerDatabase; item: ContentPlannerItem } {
  const targetWs = workspaceOverride ?? getActiveWorkspace();
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths(targetWs.id).plannerFile;
  const db = getOrInitDatabase(
    targetWs.contentRootPath,
    targetWs.defaultYear,
    resolvedDbFile,
    targetWs
  );
  const item = db.items[itemId];
  if (!item) {
    throw new Error(`Content item not found: ${itemId}`);
  }

  if (!ALL_PLATFORM_KEYS.includes(platformKey)) {
    throw new Error(`Invalid platform key: ${platformKey}`);
  }

  const nowIso = new Date().toISOString();
  const currentPlatform = item.userProperties.platforms[platformKey] ?? {
    status: 'not_started',
    publishedUrl: '',
    scheduledTime: item.schedule.recommendedTimeWib,
    notes: '',
    updatedAt: null,
  };

  item.userProperties.platforms[platformKey] = {
    ...currentPlatform,
    ...patch,
    updatedAt: nowIso,
  };

  const autoStatus = calculateAutoWorkflowStatus(
    item.autoMetadata,
    item.userProperties.platforms
  );

  if (
    !item.userProperties.statusLockedManually ||
    item.userProperties.workflowStatus !== 'on_hold'
  ) {
    item.userProperties.workflowStatus = autoStatus;
    item.userProperties.statusLockedManually = false;
  }

  const allPublished = ALL_PLATFORM_KEYS.every(
    (k) => item.userProperties.platforms[k]?.status === 'published'
  );
  const uploadChk = item.userProperties.checklist.find(
    (c) => c.id === 'chk-upload' || c.text.toLowerCase().includes('4 platform')
  );
  if (uploadChk) {
    uploadChk.done = allPublished;
  }

  item.userProperties.updatedAt = nowIso;
  saveDatabaseToFile(db, resolvedDbFile, targetWs.id);
  return { db, item };
}

export function batchUpdateItemPlatforms(
  itemId: string,
  status: PlatformUploadStatus,
  scheduledTime?: string,
  dbFilePath?: string
): { db: PlannerDatabase; item: ContentPlannerItem } {
  const activeWs = getActiveWorkspace();
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths(activeWs.id).plannerFile;
  const db = getOrInitDatabase(
    activeWs.contentRootPath,
    activeWs.defaultYear,
    resolvedDbFile
  );
  const item = db.items[itemId];
  if (!item) {
    throw new Error(`Content item not found: ${itemId}`);
  }

  const nowIso = new Date().toISOString();
  for (const key of ALL_PLATFORM_KEYS) {
    const prev = item.userProperties.platforms[key];
    item.userProperties.platforms[key] = {
      ...prev,
      status,
      scheduledTime:
        scheduledTime !== undefined
          ? scheduledTime
          : prev?.scheduledTime || item.schedule.recommendedTimeWib,
      updatedAt: nowIso,
    };
  }

  item.userProperties.workflowStatus = calculateAutoWorkflowStatus(
    item.autoMetadata,
    item.userProperties.platforms
  );
  item.userProperties.statusLockedManually = false;

  const uploadChk = item.userProperties.checklist.find(
    (c) => c.id === 'chk-upload' || c.text.toLowerCase().includes('4 platform')
  );
  if (uploadChk) {
    uploadChk.done = status === 'published';
  }

  item.userProperties.updatedAt = nowIso;
  saveDatabaseToFile(db, resolvedDbFile);
  return { db, item };
}

export function updateItemCaptionOnDisk(
  itemId: string,
  rawText: string,
  contentRootPath?: string,
  defaultYear?: number,
  dbFilePath?: string
): { db: PlannerDatabase; item: ContentPlannerItem } {
  const activeWs = getActiveWorkspace();
  const resolvedRoot = contentRootPath ?? activeWs.contentRootPath;
  const resolvedYear = defaultYear ?? activeWs.defaultYear;
  const resolvedDbFile = dbFilePath ?? getWorkspacePaths(activeWs.id).plannerFile;

  const db = getOrInitDatabase(resolvedRoot, resolvedYear, resolvedDbFile);
  const item = db.items[itemId];
  if (!item) {
    throw new Error(`Content item not found: ${itemId}`);
  }

  if (!fs.existsSync(item.absolutePath)) {
    throw new Error(
      `Content folder does not exist on disk: ${item.absolutePath}`
    );
  }

  const captionFileName =
    activeWs.rules.fileRules?.captionFileName?.trim() || 'caption.txt';
  const captionFilePath = path.join(item.absolutePath, captionFileName);
  const normalizedText = rawText.replace(/\r\n?/g, '\n');
  fs.writeFileSync(captionFilePath, normalizedText, 'utf-8');

  const rescanned = scanSingleContentFolder(
    item.absolutePath,
    resolvedRoot,
    resolvedYear,
    activeWs
  );

  item.autoMetadata = rescanned.autoMetadata;
  item.userProperties = mergeUserProperties(rescanned, item.userProperties);
  item.userProperties.updatedAt = new Date().toISOString();

  saveDatabaseToFile(db, resolvedDbFile);
  return { db, item };
}
