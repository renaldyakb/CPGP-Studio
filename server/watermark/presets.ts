import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { clampNumber } from '../../shared/watermarkSvg.ts';
import {
  DEFAULT_WATERMARK_CONFIG,
  type WatermarkAnchor,
  type WatermarkEncoderMode,
  type WatermarkPreset,
  type WatermarkPresetStore,
  type WatermarkStyleConfig,
} from '../../src/types/watermark.ts';
import { DATA_DIR } from '../storage.ts';
import {
  getActiveWorkspace,
  getWorkspacePaths,
} from '../workspaces/registry.ts';

export const WATERMARK_PRESETS_FILE_PATH = path.join(
  DATA_DIR,
  'watermark-presets.json'
);

const SCHEMA_VERSION = '1.0.0';

const VALID_ANCHORS = new Set<WatermarkAnchor>([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'custom',
]);

const VALID_ENCODERS = new Set<WatermarkEncoderMode>([
  'auto',
  'x264',
  'nvenc',
]);

function resolvePresetsFilePath(filePath?: string): string {
  if (filePath && filePath.trim()) {
    return filePath;
  }
  return getWorkspacePaths().watermarkPresetsFile;
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return fallback;
}

export function normalizeWatermarkConfig(
  input?: Partial<WatermarkStyleConfig> | null,
  base: WatermarkStyleConfig = DEFAULT_WATERMARK_CONFIG
): WatermarkStyleConfig {
  const src = input ?? {};
  const anchorCandidate = src.anchor ?? base.anchor;
  const anchor: WatermarkAnchor = VALID_ANCHORS.has(anchorCandidate)
    ? anchorCandidate
    : base.anchor;

  return {
    text: typeof src.text === 'string' ? src.text.slice(0, 120) : base.text,
    fontId:
      typeof src.fontId === 'string' && src.fontId.trim()
        ? src.fontId.trim()
        : base.fontId,
    fontSizePx: clampNumber(
      Number(src.fontSizePx ?? base.fontSizePx),
      20,
      180
    ),
    letterSpacingPx: clampNumber(
      Number(src.letterSpacingPx ?? base.letterSpacingPx),
      -8,
      24
    ),
    xPercent: clampNumber(Number(src.xPercent ?? base.xPercent), 0, 100),
    yPercent: clampNumber(Number(src.yPercent ?? base.yPercent), 0, 100),
    anchor,
    rotationDeg: clampNumber(
      Number(src.rotationDeg ?? base.rotationDeg),
      -45,
      45
    ),
    opacity: clampNumber(Number(src.opacity ?? base.opacity), 0.05, 1),
    fillColor: normalizeHexColor(src.fillColor, base.fillColor),
    strokeEnabled:
      src.strokeEnabled !== undefined
        ? Boolean(src.strokeEnabled)
        : base.strokeEnabled,
    strokeColor: normalizeHexColor(src.strokeColor, base.strokeColor),
    strokeWidthPx: clampNumber(
      Number(src.strokeWidthPx ?? base.strokeWidthPx),
      0,
      20
    ),
    strokeOpacity: clampNumber(
      Number(src.strokeOpacity ?? base.strokeOpacity),
      0,
      1
    ),
    shadowEnabled:
      src.shadowEnabled !== undefined
        ? Boolean(src.shadowEnabled)
        : base.shadowEnabled,
    shadowColor: normalizeHexColor(src.shadowColor, base.shadowColor),
    shadowBlurPx: clampNumber(
      Number(src.shadowBlurPx ?? base.shadowBlurPx),
      0,
      32
    ),
    shadowOpacity: clampNumber(
      Number(src.shadowOpacity ?? base.shadowOpacity),
      0,
      1
    ),
  };
}

function createBuiltInPresets(): WatermarkPreset[] {
  const nowIso = new Date().toISOString();
  const activeWs = getActiveWorkspace();
  const wsName = activeWs?.name || 'Jurnal Dunia';
  const wsHandle = activeWs?.handle || '@jurnaldunia_';

  return [
    {
      id: 'jurnal-dunia-center',
      name: `${wsName}: Tengah (Referensi)`,
      description: `Watermark tengah transparan sesuai gaya referensi ${wsHandle} dengan outline putih halus.`,
      isBuiltIn: true,
      isDefault: true,
      config: { ...DEFAULT_WATERMARK_CONFIG, text: wsHandle },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jurnal-dunia-light-glass',
      name: `${wsName}: Putih Halus`,
      description:
        'Teks putih transparan dengan outline gelap tipis untuk footage sinematik atau kontras rendah.',
      isBuiltIn: true,
      isDefault: false,
      config: {
        ...DEFAULT_WATERMARK_CONFIG,
        text: wsHandle,
        fontId: 'segoe-ui-black',
        fontSizePx: 72,
        xPercent: 50,
        yPercent: 50,
        anchor: 'center',
        opacity: 0.28,
        fillColor: '#FFFFFF',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidthPx: 2,
        strokeOpacity: 0.35,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'jurnal-dunia-bottom-subtle',
      name: `${wsName}: Bawah Ringkas`,
      description:
        'Watermark ringkas di area bawah (82%) agar fokus visual utama di tengah tetap bersih.',
      isBuiltIn: true,
      isDefault: false,
      config: {
        ...DEFAULT_WATERMARK_CONFIG,
        text: wsHandle,
        fontId: 'arial-bold',
        fontSizePx: 46,
        xPercent: 50,
        yPercent: 82,
        anchor: 'bottom-center',
        opacity: 0.38,
        fillColor: '#FFFFFF',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidthPx: 2,
        strokeOpacity: 0.4,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

function createInitialStore(): WatermarkPresetStore {
  const presets = createBuiltInPresets();
  return {
    schemaVersion: SCHEMA_VERSION,
    defaultPresetId: presets[0].id,
    defaultEncoder: 'auto',
    presets,
  };
}

function reconcileStoreDefaults(
  store: WatermarkPresetStore
): WatermarkPresetStore {
  const presets =
    Array.isArray(store.presets) && store.presets.length > 0
      ? store.presets.map((preset) => ({
          ...preset,
          config: normalizeWatermarkConfig(preset.config),
        }))
      : createBuiltInPresets();

  let defaultPresetId = store.defaultPresetId;
  if (!presets.some((preset) => preset.id === defaultPresetId)) {
    const flagged = presets.find((preset) => preset.isDefault);
    defaultPresetId = flagged ? flagged.id : presets[0].id;
  }

  const normalizedPresets = presets.map((preset) => ({
    ...preset,
    isDefault: preset.id === defaultPresetId,
  }));

  const defaultEncoder: WatermarkEncoderMode = VALID_ENCODERS.has(
    store.defaultEncoder
  )
    ? store.defaultEncoder
    : 'auto';

  return {
    schemaVersion: SCHEMA_VERSION,
    defaultPresetId,
    defaultEncoder,
    presets: normalizedPresets,
  };
}

function savePresetStore(
  store: WatermarkPresetStore,
  filePath?: string
): WatermarkPresetStore {
  const resolvedPath = resolvePresetsFilePath(filePath);
  const normalized = reconcileStoreDefaults(store);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    resolvedPath,
    JSON.stringify(normalized, null, 2) + '\n',
    'utf-8'
  );
  return normalized;
}

export function getPresetStore(filePath?: string): WatermarkPresetStore {
  const resolvedPath = resolvePresetsFilePath(filePath);
  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf-8');
      const parsed = JSON.parse(raw) as WatermarkPresetStore;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.presets)) {
        return reconcileStoreDefaults(parsed);
      }
    } catch {
      // Fall through to re-seed default store if file is unreadable
    }
  }

  return savePresetStore(createInitialStore(), resolvedPath);
}

export function getPresetById(
  id: string,
  filePath?: string
): WatermarkPreset | null {
  const store = getPresetStore(filePath);
  return store.presets.find((preset) => preset.id === id) ?? null;
}

export interface CreatePresetInput {
  name: string;
  description?: string;
  config: Partial<WatermarkStyleConfig>;
  isDefault?: boolean;
}

export function createPreset(
  input: CreatePresetInput,
  filePath?: string
): { store: WatermarkPresetStore; preset: WatermarkPreset } {
  const resolvedPath = resolvePresetsFilePath(filePath);
  const name = (input.name ?? '').trim();
  if (!name) {
    throw new Error('Nama preset watermark tidak boleh kosong');
  }

  const store = getPresetStore(resolvedPath);
  const nowIso = new Date().toISOString();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const id = `${slug || 'preset'}-${randomUUID().slice(0, 8)}`;

  const shouldBeDefault = Boolean(input.isDefault);
  const newPreset: WatermarkPreset = {
    id,
    name,
    description: (input.description ?? '').trim(),
    isBuiltIn: false,
    isDefault: shouldBeDefault,
    config: normalizeWatermarkConfig(input.config),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextStore = savePresetStore(
    {
      ...store,
      defaultPresetId: shouldBeDefault ? id : store.defaultPresetId,
      presets: [...store.presets, newPreset],
    },
    resolvedPath
  );

  const savedPreset = nextStore.presets.find((p) => p.id === id) ?? newPreset;
  return { store: nextStore, preset: savedPreset };
}

export interface UpdatePresetPatch {
  name?: string;
  description?: string;
  config?: Partial<WatermarkStyleConfig>;
  isDefault?: boolean;
}

export function updatePreset(
  id: string,
  patch: UpdatePresetPatch,
  filePath?: string
): { store: WatermarkPresetStore; preset: WatermarkPreset } {
  const resolvedPath = resolvePresetsFilePath(filePath);
  const store = getPresetStore(resolvedPath);
  const index = store.presets.findIndex((preset) => preset.id === id);
  if (index === -1) {
    throw new Error(`Preset watermark tidak ditemukan: ${id}`);
  }

  const existing = store.presets[index];
  const nextName =
    patch.name !== undefined ? patch.name.trim() : existing.name;
  if (!nextName) {
    throw new Error('Nama preset watermark tidak boleh kosong');
  }

  const nextDescription =
    patch.description !== undefined
      ? patch.description.trim()
      : existing.description;

  const nextConfig = patch.config
    ? normalizeWatermarkConfig(patch.config, existing.config)
    : existing.config;

  const setAsDefault = patch.isDefault === true;
  const updatedPreset: WatermarkPreset = {
    ...existing,
    name: nextName,
    description: nextDescription,
    config: nextConfig,
    isDefault: setAsDefault ? true : existing.isDefault,
    updatedAt: new Date().toISOString(),
  };

  const nextPresets = [...store.presets];
  nextPresets[index] = updatedPreset;

  const nextStore = savePresetStore(
    {
      ...store,
      defaultPresetId: setAsDefault ? id : store.defaultPresetId,
      presets: nextPresets,
    },
    resolvedPath
  );

  const savedPreset =
    nextStore.presets.find((p) => p.id === id) ?? updatedPreset;
  return { store: nextStore, preset: savedPreset };
}

export function deletePreset(
  id: string,
  filePath?: string
): { store: WatermarkPresetStore; deletedId: string } {
  const resolvedPath = resolvePresetsFilePath(filePath);
  const store = getPresetStore(resolvedPath);
  const target = store.presets.find((preset) => preset.id === id);
  if (!target) {
    throw new Error(`Preset watermark tidak ditemukan: ${id}`);
  }

  if (target.isBuiltIn) {
    throw new Error('Preset bawaan tidak dapat dihapus');
  }

  const remaining = store.presets.filter((preset) => preset.id !== id);
  if (remaining.length === 0) {
    throw new Error('Minimal harus tersisa satu preset watermark');
  }

  const nextDefaultId =
    store.defaultPresetId === id ? remaining[0].id : store.defaultPresetId;

  const nextStore = savePresetStore(
    {
      ...store,
      defaultPresetId: nextDefaultId,
      presets: remaining,
    },
    resolvedPath
  );

  return { store: nextStore, deletedId: id };
}

export function setDefaultPreset(
  id: string,
  filePath?: string
): { store: WatermarkPresetStore; preset: WatermarkPreset } {
  const resolvedPath = resolvePresetsFilePath(filePath);
  const store = getPresetStore(resolvedPath);
  const target = store.presets.find((preset) => preset.id === id);
  if (!target) {
    throw new Error(`Preset watermark tidak ditemukan: ${id}`);
  }

  const nextStore = savePresetStore(
    {
      ...store,
      defaultPresetId: id,
    },
    resolvedPath
  );

  const savedPreset = nextStore.presets.find((p) => p.id === id) ?? target;
  return { store: nextStore, preset: savedPreset };
}

export function setDefaultEncoder(
  encoder: WatermarkEncoderMode,
  filePath?: string
): WatermarkPresetStore {
  const resolvedPath = resolvePresetsFilePath(filePath);
  if (!VALID_ENCODERS.has(encoder)) {
    throw new Error(
      `Encoder tidak valid: ${String(encoder)}. Gunakan auto, x264, atau nvenc.`
    );
  }

  const store = getPresetStore(resolvedPath);
  return savePresetStore(
    {
      ...store,
      defaultEncoder: encoder,
    },
    resolvedPath
  );
}
