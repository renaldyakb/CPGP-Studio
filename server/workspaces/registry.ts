import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TIME_SLOTS,
  WORKSPACE_RULE_PRESETS,
} from '../../shared/rulePresets.ts';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceMetadata,
  WorkspacePresetId,
  WorkspaceRuleConfig,
  WorkspacesRegistry,
} from '../../shared/types/workspace.ts';
import type { PlatformKey } from '../../src/types/planner.ts';
import type { WatermarkPresetStore } from '../../src/types/watermark.ts';
import {
  DEFAULT_CONTENT_ROOT,
  DEFAULT_YEAR,
  ensureInitialYearMonthFolderOnDisk,
  migrateLegacyMonthFoldersOnDisk,
} from '../scanner.ts';

export const APP_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const DATA_DIR = path.join(APP_ROOT, 'data');
export const WORKSPACES_REGISTRY_FILE = path.join(DATA_DIR, 'workspaces.json');
export const WORKSPACES_DATA_ROOT = path.join(DATA_DIR, 'workspaces');

export const LEGACY_PLANNER_FILE = path.join(DATA_DIR, 'planner-data.json');
export const LEGACY_WATERMARK_PRESETS_FILE = path.join(
  DATA_DIR,
  'watermark-presets.json'
);
export const LEGACY_AUTOPOST_CONFIG_FILE = path.join(
  DATA_DIR,
  'autopost-config.json'
);

const DEFAULT_WORKSPACE_ID = 'jurnal-dunia';
const REGISTRY_SCHEMA_VERSION = '2.0.0';

const ALL_PLATFORMS: PlatformKey[] = [
  'yt_shorts',
  'tiktok',
  'ig_reels',
  'fb_reels',
];

const ACCENT_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
];

export interface WorkspacePaths {
  dir: string;
  plannerFile: string;
  watermarkPresetsFile: string;
  autopostFile: string;
  browserProfileDir: string;
  motionprovitConfigFile: string;
  motionprovitSessionFile: string;
}

export function getWorkspacePaths(workspaceId?: string): WorkspacePaths {
  const resolvedId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;
  const dir = path.join(WORKSPACES_DATA_ROOT, resolvedId);
  return {
    dir,
    plannerFile: path.join(dir, 'planner.json'),
    watermarkPresetsFile: path.join(dir, 'watermark-presets.json'),
    autopostFile: path.join(dir, 'autopost-config.json'),
    browserProfileDir: path.join(dir, 'browser-profile'),
    motionprovitConfigFile: path.join(dir, 'motionprovit-config.json'),
    motionprovitSessionFile: path.join(dir, 'motionprovit-session.json'),
  };
}

function ensureWorkspaceDataDirectory(workspaceId: string): WorkspacePaths {
  const dir = path.join(WORKSPACES_DATA_ROOT, workspaceId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return {
    dir,
    plannerFile: path.join(dir, 'planner.json'),
    watermarkPresetsFile: path.join(dir, 'watermark-presets.json'),
    autopostFile: path.join(dir, 'autopost-config.json'),
    browserProfileDir: path.join(dir, 'browser-profile'),
    motionprovitConfigFile: path.join(dir, 'motionprovit-config.json'),
    motionprovitSessionFile: path.join(dir, 'motionprovit-session.json'),
  };
}

function slugifyWorkspaceId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return base || `workspace-${randomUUID().slice(0, 6)}`;
}

function normalizeHandle(rawHandle: string | undefined, name: string): string {
  const trimmed = (rawHandle ?? '').trim();
  if (trimmed) {
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24);
  return `@${slug || 'channel'}_`;
}

function buildDefaultJurnalDuniaWorkspace(): WorkspaceMetadata {
  const nowIso = new Date().toISOString();
  const handle = '@jurnaldunia_';
  const rules = WORKSPACE_RULE_PRESETS.jurnal_dunia.buildRules(handle);
  rules.watermarkPolicy = 'separate_wm_file';

  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Jurnal Dunia',
    handle,
    description:
      'Channel dokumenter sejarah & edukasi pendek (YouTube Shorts, TikTok, Instagram Reels, Facebook Reels).',
    accentColor: '#3b82f6',
    contentRootPath: DEFAULT_CONTENT_ROOT,
    defaultYear: DEFAULT_YEAR,
    activePlatforms: [...ALL_PLATFORMS],
    browserProfileMode: 'isolated',
    rules,
    timeSlots: { ...DEFAULT_TIME_SLOTS },
    createdAt: nowIso,
    updatedAt: nowIso,
    lastOpenedAt: nowIso,
  };
}

function saveRegistryToDisk(registry: WorkspacesRegistry): WorkspacesRegistry {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(
    WORKSPACES_REGISTRY_FILE,
    JSON.stringify(registry, null, 2) + '\n',
    'utf-8'
  );
  return registry;
}

function migrateLegacyFilesToDefaultWorkspace(): WorkspacesRegistry {
  const defaultWorkspace = buildDefaultJurnalDuniaWorkspace();
  const paths = ensureWorkspaceDataDirectory(DEFAULT_WORKSPACE_ID);

  if (
    fs.existsSync(LEGACY_PLANNER_FILE) &&
    !fs.existsSync(paths.plannerFile)
  ) {
    try {
      fs.copyFileSync(LEGACY_PLANNER_FILE, paths.plannerFile);
    } catch {
      // Ignore copy error if file is temporarily locked
    }
  }

  if (
    fs.existsSync(LEGACY_WATERMARK_PRESETS_FILE) &&
    !fs.existsSync(paths.watermarkPresetsFile)
  ) {
    try {
      fs.copyFileSync(
        LEGACY_WATERMARK_PRESETS_FILE,
        paths.watermarkPresetsFile
      );
    } catch {
      // Ignore copy error
    }
  }

  if (
    fs.existsSync(LEGACY_AUTOPOST_CONFIG_FILE) &&
    !fs.existsSync(paths.autopostFile)
  ) {
    try {
      fs.copyFileSync(LEGACY_AUTOPOST_CONFIG_FILE, paths.autopostFile);
    } catch {
      // Ignore copy error
    }
  }

  const registry: WorkspacesRegistry = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    brandCode: 'CPGP',
    brandFullName: 'Content Planer Gam Puko',
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    onboardingCompleted: fs.existsSync(DEFAULT_CONTENT_ROOT),
    workspaces: {
      [DEFAULT_WORKSPACE_ID]: defaultWorkspace,
    },
  };

  return saveRegistryToDisk(registry);
}

export function getWorkspacesRegistry(): WorkspacesRegistry {
  if (!fs.existsSync(WORKSPACES_REGISTRY_FILE)) {
    return migrateLegacyFilesToDefaultWorkspace();
  }

  try {
    const raw = fs.readFileSync(WORKSPACES_REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as WorkspacesRegistry;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.workspaces ||
      Object.keys(parsed.workspaces).length === 0
    ) {
      return migrateLegacyFilesToDefaultWorkspace();
    }

    let dirty = false;
    if (!parsed.workspaces[parsed.activeWorkspaceId]) {
      const firstId = Object.keys(parsed.workspaces)[0];
      parsed.activeWorkspaceId = firstId;
      dirty = true;
    }

    // Ensure data folder exists for active workspace and keep legacy planner synced
    const activeId = parsed.activeWorkspaceId;
    const activePaths = ensureWorkspaceDataDirectory(activeId);
    if (
      activeId === DEFAULT_WORKSPACE_ID &&
      fs.existsSync(LEGACY_PLANNER_FILE) &&
      !fs.existsSync(activePaths.plannerFile)
    ) {
      try {
        fs.copyFileSync(LEGACY_PLANNER_FILE, activePaths.plannerFile);
      } catch {
        // Ignore
      }
    }

    if (dirty) {
      saveRegistryToDisk(parsed);
    }

    return parsed;
  } catch {
    return migrateLegacyFilesToDefaultWorkspace();
  }
}

export function getActiveWorkspace(): WorkspaceMetadata {
  const registry = getWorkspacesRegistry();
  const active =
    registry.workspaces[registry.activeWorkspaceId] ??
    Object.values(registry.workspaces)[0];
  return active;
}

export function getWorkspaceById(id: string): WorkspaceMetadata | null {
  const registry = getWorkspacesRegistry();
  return registry.workspaces[id] ?? null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function copyWatermarkPresetsWithHandleSubstitution(
  sourceWorkspace: WorkspaceMetadata,
  targetWorkspace: WorkspaceMetadata
): void {
  const sourcePaths = ensureWorkspaceDataDirectory(sourceWorkspace.id);
  const targetPaths = ensureWorkspaceDataDirectory(targetWorkspace.id);

  const candidateSourceFile = fs.existsSync(sourcePaths.watermarkPresetsFile)
    ? sourcePaths.watermarkPresetsFile
    : fs.existsSync(LEGACY_WATERMARK_PRESETS_FILE)
      ? LEGACY_WATERMARK_PRESETS_FILE
      : null;

  if (!candidateSourceFile) {
    return;
  }

  try {
    const raw = fs.readFileSync(candidateSourceFile, 'utf-8');
    const store = JSON.parse(raw) as WatermarkPresetStore;
    if (!store || !Array.isArray(store.presets)) {
      return;
    }

    const oldHandle = sourceWorkspace.handle.trim();
    const newHandle = targetWorkspace.handle.trim();
    const oldName = sourceWorkspace.name.trim();
    const newName = targetWorkspace.name.trim();
    const nowIso = new Date().toISOString();

    const replaceHandleInText = (text: string): string => {
      let updated = text;
      if (oldHandle && newHandle) {
        updated = updated.replace(
          new RegExp(escapeRegExp(oldHandle), 'gi'),
          newHandle
        );
      }
      if (updated === text && /^@[a-zA-Z0-9_.-]+$/.test(text.trim()) && newHandle) {
        updated = newHandle;
      }
      return updated;
    };

    const replaceNameInTitle = (title: string): string => {
      if (!oldName || !newName) return title;
      return title.replace(new RegExp(escapeRegExp(oldName), 'gi'), newName);
    };

    const copiedPresets = store.presets.map((preset) => ({
      ...preset,
      name: replaceNameInTitle(preset.name),
      description: replaceHandleInText(
        replaceNameInTitle(preset.description ?? '')
      ),
      config: {
        ...preset.config,
        text: replaceHandleInText(preset.config.text ?? newHandle),
      },
      updatedAt: nowIso,
    }));

    const nextStore: WatermarkPresetStore = {
      ...store,
      presets: copiedPresets,
    };

    fs.writeFileSync(
      targetPaths.watermarkPresetsFile,
      JSON.stringify(nextStore, null, 2) + '\n',
      'utf-8'
    );
  } catch {
    // Ignore preset copy errors and fall back to default seeding
  }
}

export function createWorkspace(input: CreateWorkspaceInput): {
  workspace: WorkspaceMetadata;
  registry: WorkspacesRegistry;
} {
  const name = (input.name ?? '').trim();
  if (!name) {
    throw new Error('Nama workspace/channel tidak boleh kosong');
  }

  const rawPath = (input.contentRootPath ?? '').trim();
  if (!rawPath) {
    throw new Error('Lokasi folder konten (contentRootPath) wajib diisi');
  }

  const contentRootPath = path.resolve(rawPath);
  if (input.createFolderIfMissing && !fs.existsSync(contentRootPath)) {
    fs.mkdirSync(contentRootPath, { recursive: true });
  }

  const registry = getWorkspacesRegistry();
  let id = slugifyWorkspaceId(name);
  if (registry.workspaces[id]) {
    id = `${id}-${randomUUID().slice(0, 4)}`;
  }

  const handle = normalizeHandle(input.handle, name);
  const presetId: WorkspacePresetId =
    input.presetId && WORKSPACE_RULE_PRESETS[input.presetId]
      ? input.presetId
      : 'standard_creator';

  const baseRules = WORKSPACE_RULE_PRESETS[presetId].buildRules(handle);
  const defaultHashtags =
    Array.isArray(input.defaultHashtags) && input.defaultHashtags.length > 0
      ? input.defaultHashtags.map((t) =>
          t.trim().startsWith('#') ? t.trim() : `#${t.trim()}`
        )
      : baseRules.defaultHashtags;

  const rules: WorkspaceRuleConfig = {
    ...baseRules,
    folderStructure: input.folderStructure ?? baseRules.folderStructure,
    watermarkPolicy: input.watermarkPolicy ?? baseRules.watermarkPolicy,
    requiredAssets: {
      video:
        input.requiredAssets?.video ?? baseRules.requiredAssets.video,
      cover:
        input.requiredAssets?.cover ?? baseRules.requiredAssets.cover,
      caption:
        input.requiredAssets?.caption ?? baseRules.requiredAssets.caption,
    },
    defaultHashtags,
  };

  const existingCount = Object.keys(registry.workspaces).length;
  const accentColor = ACCENT_PALETTE[existingCount % ACCENT_PALETTE.length];
  const nowIso = new Date().toISOString();

  const activePlatforms =
    Array.isArray(input.activePlatforms) && input.activePlatforms.length > 0
      ? input.activePlatforms
      : [...ALL_PLATFORMS];

  const initYear = new Date().getFullYear();

  const workspace: WorkspaceMetadata = {
    id,
    name,
    handle,
    description: (input.description ?? '').trim(),
    accentColor,
    contentRootPath,
    defaultYear: initYear,
    activePlatforms,
    browserProfileMode: input.browserProfileMode ?? 'isolated',
    rules,
    timeSlots:
      input.timeSlots && Object.keys(input.timeSlots).length > 0
        ? input.timeSlots
        : { ...DEFAULT_TIME_SLOTS },
    createdAt: nowIso,
    updatedAt: nowIso,
    lastOpenedAt: nowIso,
  };

  ensureWorkspaceDataDirectory(id);

  // Migrate any legacy bare month folders & ensure the initialization year-month folder exists
  if (rules.folderStructure !== 'flat_slot' && fs.existsSync(contentRootPath)) {
    migrateLegacyMonthFoldersOnDisk(contentRootPath, initYear);
    ensureInitialYearMonthFolderOnDisk(contentRootPath, initYear);
  }

  if (input.copyWatermarkPresetsFromWorkspaceId) {
    const sourceWs =
      registry.workspaces[input.copyWatermarkPresetsFromWorkspaceId];
    if (sourceWs) {
      copyWatermarkPresetsWithHandleSubstitution(sourceWs, workspace);
    }
  }

  registry.workspaces[id] = workspace;
  registry.activeWorkspaceId = id;
  registry.onboardingCompleted = true;

  saveRegistryToDisk(registry);
  return { workspace, registry };
}

export function updateWorkspace(
  id: string,
  patch: UpdateWorkspaceInput
): {
  workspace: WorkspaceMetadata;
  registry: WorkspacesRegistry;
} {
  const registry = getWorkspacesRegistry();
  const existing = registry.workspaces[id];
  if (!existing) {
    throw new Error(`Workspace tidak ditemukan: ${id}`);
  }

  const nextName =
    patch.name !== undefined ? patch.name.trim() || existing.name : existing.name;
  const nextHandle =
    patch.handle !== undefined
      ? normalizeHandle(patch.handle, nextName)
      : existing.handle;
  const nextRootPath =
    patch.contentRootPath !== undefined && patch.contentRootPath.trim()
      ? path.resolve(patch.contentRootPath.trim())
      : existing.contentRootPath;

  let nextRules: WorkspaceRuleConfig = { ...existing.rules };
  if (patch.rules) {
    if (
      patch.rules.presetId &&
      patch.rules.presetId !== existing.rules.presetId &&
      WORKSPACE_RULE_PRESETS[patch.rules.presetId]
    ) {
      nextRules = WORKSPACE_RULE_PRESETS[patch.rules.presetId].buildRules(
        nextHandle
      );
    }
    nextRules = {
      ...nextRules,
      ...patch.rules,
      requiredAssets: {
        ...nextRules.requiredAssets,
        ...(patch.rules.requiredAssets ?? {}),
      },
      fileRules: {
        ...nextRules.fileRules,
        ...(patch.rules.fileRules ?? {}),
      },
    };
  }

  const updated: WorkspaceMetadata = {
    ...existing,
    name: nextName,
    handle: nextHandle,
    description:
      patch.description !== undefined
        ? patch.description.trim()
        : existing.description,
    contentRootPath: nextRootPath,
    defaultYear:
      typeof patch.defaultYear === 'number' &&
      Number.isFinite(patch.defaultYear)
        ? patch.defaultYear
        : existing.defaultYear,
    activePlatforms:
      Array.isArray(patch.activePlatforms) && patch.activePlatforms.length > 0
        ? patch.activePlatforms
        : existing.activePlatforms,
    browserProfileMode:
      patch.browserProfileMode ?? existing.browserProfileMode,
    rules: nextRules,
    timeSlots:
      patch.timeSlots && Object.keys(patch.timeSlots).length > 0
        ? patch.timeSlots
        : existing.timeSlots,
    updatedAt: new Date().toISOString(),
  };

  registry.workspaces[id] = updated;
  saveRegistryToDisk(registry);

  return { workspace: updated, registry };
}

export function activateWorkspace(id: string): {
  workspace: WorkspaceMetadata;
  registry: WorkspacesRegistry;
} {
  const registry = getWorkspacesRegistry();
  const target = registry.workspaces[id];
  if (!target) {
    throw new Error(`Workspace tidak ditemukan: ${id}`);
  }

  ensureWorkspaceDataDirectory(id);
  const nowIso = new Date().toISOString();
  target.lastOpenedAt = nowIso;
  registry.activeWorkspaceId = id;

  saveRegistryToDisk(registry);
  return { workspace: target, registry };
}

export function deleteWorkspace(id: string): WorkspacesRegistry {
  const registry = getWorkspacesRegistry();
  const keys = Object.keys(registry.workspaces);

  if (!registry.workspaces[id]) {
    throw new Error(`Workspace tidak ditemukan: ${id}`);
  }

  if (keys.length <= 1) {
    throw new Error(
      'Minimal harus ada 1 workspace aktif. Buat workspace lain sebelum menghapus workspace ini.'
    );
  }

  delete registry.workspaces[id];

  if (registry.activeWorkspaceId === id) {
    const nextActiveId = Object.keys(registry.workspaces)[0];
    registry.activeWorkspaceId = nextActiveId;
    registry.workspaces[nextActiveId].lastOpenedAt = new Date().toISOString();
  }

  return saveRegistryToDisk(registry);
}

export function markOnboardingCompleted(): WorkspacesRegistry {
  const registry = getWorkspacesRegistry();
  registry.onboardingCompleted = true;
  return saveRegistryToDisk(registry);
}
