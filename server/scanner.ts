import fs from 'node:fs';
import path from 'node:path';
import { parseCaptionText } from '../shared/captionParser.ts';
import type { WorkspaceMetadata } from '../shared/types/workspace.ts';
import type {
  AssetFileInfo,
  AssetReadiness,
  AutoScannedMetadata,
  OtherFileInfo,
  ParsedCaption,
  ScheduleSlotInfo,
} from '../src/types/planner.ts';

import { resolveAppRoot } from './core/appPaths.ts';

export { parseCaptionText };

export const WORKSPACE_ROOT = path.resolve(resolveAppRoot(), '..');
export const DEFAULT_CONTENT_ROOT = path.join(WORKSPACE_ROOT, 'KONTEN');
export const DEFAULT_YEAR = new Date().getFullYear();
export const OVERWRITE_WATERMARK_MARKER_FILE = '.cpgp-watermarked.json';

export const INDONESIAN_MONTH_LIST = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const CONTENT_FOLDER_REGEX = /^(\d{1,2})\.(\d{2})$/;
const DEFAULT_RAW_VIDEO_REGEX =
  /^motionprovit-([a-z0-9_-]+?)(?:-(\d+x\d+))?\.(mp4|mov|mkv|webm)$/i;
const DEFAULT_COVER_REGEX =
  /^cover-([a-z0-9_-]+?)(?:-(\d+x\d+))?\.(jpg|jpeg|png|webp)$/i;
const DEFAULT_WM_VIDEO_REGEX =
  /^wm_final(?:\s*\(\d+\))?\.(mp4|mov|mkv|webm)$/i;
const ANY_VIDEO_REGEX = /^(?!wm_final).+\.(mp4|mov|mkv|webm)$/i;
const ANY_IMAGE_REGEX = /^.+\.(jpg|jpeg|png|webp)$/i;

const MONTH_MAP: Record<string, { number: number; display: string }> = {
  januari: { number: 1, display: 'Januari' },
  january: { number: 1, display: 'Januari' },
  jan: { number: 1, display: 'Januari' },
  februari: { number: 2, display: 'Februari' },
  february: { number: 2, display: 'Februari' },
  feb: { number: 2, display: 'Februari' },
  maret: { number: 3, display: 'Maret' },
  march: { number: 3, display: 'Maret' },
  mar: { number: 3, display: 'Maret' },
  april: { number: 4, display: 'April' },
  apr: { number: 4, display: 'April' },
  mei: { number: 5, display: 'Mei' },
  may: { number: 5, display: 'Mei' },
  juni: { number: 6, display: 'Juni' },
  june: { number: 6, display: 'Juni' },
  jun: { number: 6, display: 'Juni' },
  juli: { number: 7, display: 'Juli' },
  july: { number: 7, display: 'Juli' },
  jul: { number: 7, display: 'Juli' },
  agustus: { number: 8, display: 'Agustus' },
  august: { number: 8, display: 'Agustus' },
  agu: { number: 8, display: 'Agustus' },
  aug: { number: 8, display: 'Agustus' },
  september: { number: 9, display: 'September' },
  sep: { number: 9, display: 'September' },
  sept: { number: 9, display: 'September' },
  oktober: { number: 10, display: 'Oktober' },
  october: { number: 10, display: 'Oktober' },
  okt: { number: 10, display: 'Oktober' },
  oct: { number: 10, display: 'Oktober' },
  november: { number: 11, display: 'November' },
  nov: { number: 11, display: 'November' },
  desember: { number: 12, display: 'Desember' },
  december: { number: 12, display: 'Desember' },
  des: { number: 12, display: 'Desember' },
  dec: { number: 12, display: 'Desember' },
};

export interface ScannedContentFolder {
  id: string;
  folderCode: string;
  monthFolder: string;
  relativeFolderPath: string;
  absolutePath: string;
  schedule: ScheduleSlotInfo;
  autoMetadata: AutoScannedMetadata;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[i]}`;
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function buildMediaUrl(relativePath: string): string {
  const normalized = toPosixPath(relativePath).replace(/^\/+/, '');
  const encodedSegments = normalized
    .split('/')
    .map((seg) => encodeURIComponent(seg));
  return `/media/${encodedSegments.join('/')}`;
}

export function createEmptyAssetInfo(
  extra?: Partial<AssetFileInfo>
): AssetFileInfo {
  return {
    exists: false,
    fileName: null,
    relativePath: null,
    absolutePath: null,
    mediaUrl: null,
    sizeBytes: 0,
    sizeFormatted: '0 B',
    mtimeMs: null,
    lastModifiedIso: null,
    ...extra,
  };
}

export function formatYearMonthFolder(
  year: number,
  monthNumber: number
): string {
  const safeYear =
    Number.isFinite(year) && year >= 2000 && year <= 2100
      ? Math.floor(year)
      : new Date().getFullYear();
  const idx = Math.max(0, Math.min(11, Math.floor(monthNumber) - 1));
  const monthName = INDONESIAN_MONTH_LIST[idx] ?? 'November';
  return `${safeYear}-${monthName}`;
}

export function normalizeYearMonthFolderName(
  rawMonthFolder: string,
  fallbackYear = new Date().getFullYear()
): string {
  const cleaned = rawMonthFolder.trim();
  if (!cleaned) {
    const now = new Date();
    return formatYearMonthFolder(fallbackYear || now.getFullYear(), now.getMonth() + 1);
  }
  const info = resolveMonthInfo(cleaned, fallbackYear);
  return formatYearMonthFolder(info.year, info.monthNumber);
}

/**
 * Migrates legacy bare month folders (e.g. `KONTEN\November`) to canonical `YYYY-Bulan`
 * format (e.g. `KONTEN\2026-November`) safely without losing any files.
 */
export function migrateLegacyMonthFoldersOnDisk(
  contentRootPath: string,
  defaultYear = new Date().getFullYear()
): Array<{ from: string; to: string }> {
  const migrated: Array<{ from: string; to: string }> = [];
  if (!contentRootPath || !fs.existsSync(contentRootPath)) {
    return migrated;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(contentRootPath, { withFileTypes: true });
  } catch {
    return migrated;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name.trim();
    // Skip folders that already have a 4-digit year (e.g. 2026-November or 2027) or DD.SLOT
    if (/\b20\d{2}\b/.test(name) || CONTENT_FOLDER_REGEX.test(name)) {
      continue;
    }

    const monthInfo = MONTH_MAP[name.toLowerCase()];
    if (!monthInfo) continue;

    const targetName = formatYearMonthFolder(defaultYear, monthInfo.number);
    if (targetName === name) continue;

    const srcPath = path.join(contentRootPath, name);
    const dstPath = path.join(contentRootPath, targetName);

    try {
      if (!fs.existsSync(dstPath)) {
        try {
          fs.renameSync(srcPath, dstPath);
          migrated.push({ from: name, to: targetName });
          continue;
        } catch (renameErr) {
          const code = (renameErr as NodeJS.ErrnoException)?.code;
          if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EXDEV') {
            throw renameErr;
          }
          // Windows directory handle held (e.g. chokidar/Explorer): create target and move children safely
          fs.mkdirSync(dstPath, { recursive: true });
        }
      }

      const children = fs.readdirSync(srcPath, { withFileTypes: true });
      for (const child of children) {
        const childSrc = path.join(srcPath, child.name);
        const childDst = path.join(dstPath, child.name);
        if (fs.existsSync(childDst)) continue;
        try {
          fs.renameSync(childSrc, childDst);
        } catch (childErr) {
          const code = (childErr as NodeJS.ErrnoException)?.code;
          if (code === 'EPERM' || code === 'EBUSY' || code === 'EXDEV') {
            fs.cpSync(childSrc, childDst, { recursive: true });
            try {
              fs.rmSync(childSrc, { recursive: true, force: true });
            } catch {
              // ignore if source handle is still busy
            }
          } else {
            throw childErr;
          }
        }
      }
      try {
        const remaining = fs.readdirSync(srcPath);
        if (remaining.length === 0) {
          fs.rmdirSync(srcPath);
        }
      } catch {
        // Parent folder may remain empty until watcher releases handle
      }
      migrated.push({ from: name, to: targetName });
    } catch (error) {
      console.error(
        `[Scanner] Gagal migrasi folder bulan ${name} -> ${targetName}:`,
        error
      );
    }
  }

  return migrated;
}

/**
 * Ensures an initialized workspace has its initialization year-month folder (e.g. `2026-November`)
 * created on disk when using month_slot / auto_both structure.
 */
export function ensureInitialYearMonthFolderOnDisk(
  contentRootPath: string,
  initYear = new Date().getFullYear()
): string | null {
  if (!contentRootPath || !fs.existsSync(contentRootPath)) {
    return null;
  }
  try {
    const entries = fs.readdirSync(contentRootPath, { withFileTypes: true });
    const yearPrefix = `${initYear}-`;
    const hasCurrentYearFolder = entries.some(
      (e) =>
        e.isDirectory() &&
        (e.name.startsWith(yearPrefix) || e.name === String(initYear))
    );
    if (hasCurrentYearFolder) {
      return null;
    }

    const now = new Date();
    const targetName = formatYearMonthFolder(initYear, now.getMonth() + 1);
    const targetPath = path.join(contentRootPath, targetName);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    return targetName;
  } catch {
    return null;
  }
}

export function resolveMonthInfo(
  monthFolder: string,
  defaultYear = DEFAULT_YEAR
): { monthNumber: number; monthName: string; year: number } {
  const cleaned = monthFolder.trim();
  const yearMatch = cleaned.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : defaultYear;

  const lower = cleaned.toLowerCase();
  for (const [key, info] of Object.entries(MONTH_MAP)) {
    if (lower === key || lower.includes(key)) {
      return {
        monthNumber: info.number,
        monthName: info.display,
        year,
      };
    }
  }

  return {
    monthNumber: new Date().getMonth() + 1,
    monthName: cleaned || INDONESIAN_MONTH_LIST[new Date().getMonth()] || 'November',
    year,
  };
}

export function parseScheduleSlot(
  folderCode: string,
  monthFolder: string,
  defaultYear = DEFAULT_YEAR,
  workspace?: WorkspaceMetadata
): ScheduleSlotInfo {
  const match = folderCode.match(CONTENT_FOLDER_REGEX);
  const dayOfMonth = match ? parseInt(match[1], 10) : 1;
  const slotCode = match ? match[2] : '01';

  const { monthNumber, monthName, year } = resolveMonthInfo(
    monthFolder,
    defaultYear
  );
  const paddedMonth = String(monthNumber).padStart(2, '0');
  const paddedDay = String(dayOfMonth).padStart(2, '0');
  const isoDate = `${year}-${paddedMonth}-${paddedDay}`;
  const displayDate = `${dayOfMonth} ${monthName} ${year}`;

  const customSlot = workspace?.timeSlots?.[slotCode];
  if (customSlot) {
    return {
      dayOfMonth,
      monthName,
      monthNumber,
      year,
      isoDate,
      displayDate,
      slotCode: customSlot.code || slotCode,
      slotLabel: customSlot.label,
      slotTimeWindow: customSlot.window,
      recommendedTimeWib: customSlot.defaultTime,
      slotDescription: customSlot.recommendation,
    };
  }

  if (slotCode === '01') {
    return {
      dayOfMonth,
      monthName,
      monthNumber,
      year,
      isoDate,
      displayDate,
      slotCode: '01',
      slotLabel: 'Siang',
      slotTimeWindow: '11.30 - 12.00 WIB',
      recommendedTimeWib: '11:30',
      slotDescription:
        'Menyasar jam istirahat makan siang saat orang membuka HP sambil santai.',
    };
  }

  if (slotCode === '02') {
    return {
      dayOfMonth,
      monthName,
      monthNumber,
      year,
      isoDate,
      displayDate,
      slotCode: '02',
      slotLabel: 'Malam',
      slotTimeWindow: '19.30 - 20.00 WIB',
      recommendedTimeWib: '19:30',
      slotDescription:
        'Jam prime time saat orang beristirahat di rumah dan punya waktu lebih lama untuk menyimak cerita sejarah hingga habis.',
    };
  }

  return {
    dayOfMonth,
    monthName,
    monthNumber,
    year,
    isoDate,
    displayDate,
    slotCode,
    slotLabel: `Slot ${slotCode}`,
    slotTimeWindow: 'Fleksibel WIB',
    recommendedTimeWib: '15:00',
    slotDescription: `Slot upload tambahan (${slotCode}).`,
  };
}

function compileRuleRegex(pattern: string | undefined, fallback: RegExp): RegExp {
  if (!pattern || !pattern.trim()) return fallback;
  try {
    return new RegExp(pattern.trim(), 'i');
  } catch {
    return fallback;
  }
}

export function scanSingleContentFolder(
  folderAbsPath: string,
  contentRootPath = DEFAULT_CONTENT_ROOT,
  defaultYear = DEFAULT_YEAR,
  workspace?: WorkspaceMetadata
): ScannedContentFolder {
  const folderCode = path.basename(folderAbsPath);
  const relFromRoot = toPosixPath(path.relative(contentRootPath, folderAbsPath));
  const pathParts = relFromRoot.split('/').filter(Boolean);
  let monthFolder: string;
  if (pathParts.length >= 3) {
    // Support nested YYYY/Bulan/DD.SLOT -> canonical YYYY-Bulan
    monthFolder = `${pathParts[0]}-${pathParts[1]}`;
  } else if (pathParts.length === 2) {
    monthFolder = pathParts[0];
  } else {
    const now = new Date();
    monthFolder = formatYearMonthFolder(defaultYear, now.getMonth() + 1);
  }
  const relativeFolderPath = relFromRoot;
  const id = relativeFolderPath;

  const rules = workspace?.rules;
  const watermarkPolicy = rules?.watermarkPolicy ?? 'separate_wm_file';
  const requiredAssets = rules?.requiredAssets ?? {
    video: true,
    cover: true,
    caption: true,
  };

  const rawVideoRegex = compileRuleRegex(
    rules?.fileRules?.rawVideoRegex,
    DEFAULT_RAW_VIDEO_REGEX
  );
  const wmVideoRegex = compileRuleRegex(
    rules?.fileRules?.wmVideoRegex,
    DEFAULT_WM_VIDEO_REGEX
  );
  const coverRegex = compileRuleRegex(
    rules?.fileRules?.coverRegex,
    DEFAULT_COVER_REGEX
  );
  const captionFileNameLower = (
    rules?.fileRules?.captionFileName?.trim() || 'caption.txt'
  ).toLowerCase();

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(folderAbsPath, { withFileTypes: true });
  } catch {
    entries = [];
  }

  let rawVideo: AssetFileInfo = createEmptyAssetInfo({
    extractedId: null,
    aspectRatio: null,
  });
  let fallbackAnyVideo: AssetFileInfo = createEmptyAssetInfo({
    extractedId: null,
    aspectRatio: null,
  });
  let cover: AssetFileInfo = createEmptyAssetInfo({
    extractedId: null,
    aspectRatio: null,
  });
  let fallbackAnyImage: AssetFileInfo = createEmptyAssetInfo({
    extractedId: null,
    aspectRatio: null,
  });
  let caption: AssetFileInfo = createEmptyAssetInfo();
  let captionParsed: ParsedCaption = parseCaptionText('');
  let hasOverwriteMarker = false;

  const wmCandidates: Array<{
    fileName: string;
    relativePath: string;
    absolutePath: string;
    sizeBytes: number;
    mtimeMs: number;
  }> = [];

  const otherFiles: OtherFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;

    if (fileName === OVERWRITE_WATERMARK_MARKER_FILE) {
      hasOverwriteMarker = true;
      continue;
    }

    const fileAbsPath = path.join(folderAbsPath, fileName);
    const fileRelPath = toPosixPath(path.relative(contentRootPath, fileAbsPath));

    let stat: fs.Stats;
    try {
      stat = fs.statSync(fileAbsPath);
    } catch {
      continue;
    }

    const wmMatch = fileName.match(wmVideoRegex);
    if (wmMatch) {
      wmCandidates.push({
        fileName,
        relativePath: fileRelPath,
        absolutePath: fileAbsPath,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      });
      continue;
    }

    const rawMatch = fileName.match(rawVideoRegex);
    if (rawMatch) {
      if (!rawVideo.exists || stat.mtimeMs >= (rawVideo.mtimeMs ?? 0)) {
        rawVideo = {
          exists: true,
          fileName,
          relativePath: fileRelPath,
          absolutePath: fileAbsPath,
          mediaUrl: buildMediaUrl(fileRelPath),
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          mtimeMs: stat.mtimeMs,
          lastModifiedIso: new Date(stat.mtimeMs).toISOString(),
          extractedId: rawMatch[1] ?? null,
          aspectRatio: rawMatch[2] ?? null,
        };
      }
      continue;
    }

    if (ANY_VIDEO_REGEX.test(fileName)) {
      if (
        !fallbackAnyVideo.exists ||
        stat.mtimeMs >= (fallbackAnyVideo.mtimeMs ?? 0)
      ) {
        fallbackAnyVideo = {
          exists: true,
          fileName,
          relativePath: fileRelPath,
          absolutePath: fileAbsPath,
          mediaUrl: buildMediaUrl(fileRelPath),
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          mtimeMs: stat.mtimeMs,
          lastModifiedIso: new Date(stat.mtimeMs).toISOString(),
          extractedId: null,
          aspectRatio: null,
        };
      }
      if (watermarkPolicy !== 'separate_wm_file') {
        continue;
      }
    }

    const coverMatch = fileName.match(coverRegex);
    if (coverMatch) {
      if (!cover.exists || stat.mtimeMs >= (cover.mtimeMs ?? 0)) {
        cover = {
          exists: true,
          fileName,
          relativePath: fileRelPath,
          absolutePath: fileAbsPath,
          mediaUrl: buildMediaUrl(fileRelPath),
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          mtimeMs: stat.mtimeMs,
          lastModifiedIso: new Date(stat.mtimeMs).toISOString(),
          extractedId: coverMatch[1] ?? null,
          aspectRatio: coverMatch[2] ?? null,
        };
      }
      continue;
    }

    if (ANY_IMAGE_REGEX.test(fileName)) {
      if (
        !fallbackAnyImage.exists ||
        stat.mtimeMs >= (fallbackAnyImage.mtimeMs ?? 0)
      ) {
        fallbackAnyImage = {
          exists: true,
          fileName,
          relativePath: fileRelPath,
          absolutePath: fileAbsPath,
          mediaUrl: buildMediaUrl(fileRelPath),
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          mtimeMs: stat.mtimeMs,
          lastModifiedIso: new Date(stat.mtimeMs).toISOString(),
          extractedId: null,
          aspectRatio: null,
        };
      }
      if (watermarkPolicy !== 'separate_wm_file') {
        continue;
      }
    }

    if (fileName.toLowerCase() === captionFileNameLower) {
      caption = {
        exists: true,
        fileName,
        relativePath: fileRelPath,
        absolutePath: fileAbsPath,
        mediaUrl: buildMediaUrl(fileRelPath),
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        mtimeMs: stat.mtimeMs,
        lastModifiedIso: new Date(stat.mtimeMs).toISOString(),
      };
      try {
        const rawText = fs.readFileSync(fileAbsPath, 'utf-8');
        captionParsed = parseCaptionText(rawText);
      } catch {
        captionParsed = parseCaptionText('');
      }
      continue;
    }

    const ext = path.extname(fileName).replace(/^\./, '').toLowerCase();
    otherFiles.push({
      fileName,
      relativePath: fileRelPath,
      sizeBytes: stat.size,
      sizeFormatted: formatBytes(stat.size),
      extension: ext,
    });
  }

  // Fallback for flexible modes when rawVideo or cover did not match strict naming
  if (!rawVideo.exists && fallbackAnyVideo.exists && watermarkPolicy !== 'separate_wm_file') {
    rawVideo = fallbackAnyVideo;
  }
  if (!cover.exists && fallbackAnyImage.exists && watermarkPolicy !== 'separate_wm_file') {
    cover = fallbackAnyImage;
  }

  // Sort wmCandidates by newest mtimeMs first
  wmCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const candidateNames = wmCandidates.map((c) => c.fileName);

  let wmVideo: AssetFileInfo;
  if (wmCandidates.length > 0) {
    const primary = wmCandidates[0];
    wmVideo = {
      exists: true,
      fileName: primary.fileName,
      relativePath: primary.relativePath,
      absolutePath: primary.absolutePath,
      mediaUrl: buildMediaUrl(primary.relativePath),
      sizeBytes: primary.sizeBytes,
      sizeFormatted: formatBytes(primary.sizeBytes),
      mtimeMs: primary.mtimeMs,
      lastModifiedIso: new Date(primary.mtimeMs).toISOString(),
      candidates: candidateNames,
    };
  } else if (watermarkPolicy === 'direct_or_wm' && rawVideo.exists) {
    // In direct_or_wm mode, any video in the folder is immediately upload-ready
    wmVideo = {
      ...rawVideo,
      candidates: rawVideo.fileName ? [rawVideo.fileName] : [],
    };
  } else if (
    watermarkPolicy === 'overwrite_source' &&
    rawVideo.exists &&
    hasOverwriteMarker
  ) {
    // In overwrite_source mode, once watermarked marker exists, rawVideo is also wmVideo
    wmVideo = {
      ...rawVideo,
      candidates: rawVideo.fileName ? [rawVideo.fileName] : [],
    };
  } else {
    wmVideo = createEmptyAssetInfo({ candidates: [] });
  }

  otherFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

  const hasRawVideo = rawVideo.exists;
  const hasCover = cover.exists;
  const hasCaption = caption.exists;
  const hasWmFinal = wmVideo.exists;

  const completenessScore =
    (hasRawVideo ? 1 : 0) +
    (hasCover ? 1 : 0) +
    (hasCaption ? 1 : 0) +
    (hasWmFinal ? 1 : 0);

  const requiredScore =
    (hasWmFinal ? 1 : 0) + (hasCover ? 1 : 0) + (hasCaption ? 1 : 0);

  const isUploadReady =
    (!requiredAssets.video || hasWmFinal) &&
    (!requiredAssets.cover || hasCover) &&
    (!requiredAssets.caption || hasCaption);

  const missingRequired: string[] = [];
  if (requiredAssets.video && !hasWmFinal) {
    missingRequired.push(
      watermarkPolicy === 'separate_wm_file' ? 'wm_final.mp4' : 'video.mp4'
    );
  }
  if (requiredAssets.cover && !hasCover) missingRequired.push('cover');
  if (requiredAssets.caption && !hasCaption) {
    missingRequired.push(rules?.fileRules?.captionFileName || 'caption.txt');
  }

  const missingOptional: string[] = [];
  if (!hasRawVideo) {
    missingOptional.push(
      watermarkPolicy === 'separate_wm_file' ? 'motionprovit' : 'video'
    );
  }
  if (!requiredAssets.cover && !hasCover) {
    missingOptional.push('cover');
  }

  const readiness: AssetReadiness = {
    hasRawVideo,
    hasCover,
    hasCaption,
    hasWmFinal,
    completenessScore,
    requiredScore,
    isUploadReady,
    missingRequired,
    missingOptional,
  };

  const motionprovitId = rawVideo.extractedId ?? cover.extractedId ?? null;
  const aspectRatio = cover.aspectRatio ?? rawVideo.aspectRatio ?? '9x16';

  const autoMetadata: AutoScannedMetadata = {
    motionprovitId,
    aspectRatio,
    assets: {
      rawVideo,
      wmVideo,
      cover,
      caption,
      otherFiles,
    },
    readiness,
    captionParsed,
    lastScannedAt: new Date().toISOString(),
  };

  const schedule = parseScheduleSlot(
    folderCode,
    monthFolder,
    defaultYear,
    workspace
  );

  return {
    id,
    folderCode,
    monthFolder,
    relativeFolderPath,
    absolutePath: folderAbsPath,
    schedule,
    autoMetadata,
  };
}

const IGNORED_SCAN_DIRS = new Set([
  'node_modules',
  'data',
  '.cache',
  '.git',
  'dist',
  'dist-server',
  'browser-profile',
  'graphify-out',
  'release-bundle',
  'release-artifacts',
]);

export function findContentFolderPaths(
  dirPath: string,
  results: string[] = []
): string[] {
  if (!fs.existsSync(dirPath)) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const lowerName = entry.name.toLowerCase();
    if (IGNORED_SCAN_DIRS.has(lowerName) || entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (CONTENT_FOLDER_REGEX.test(entry.name)) {
      results.push(fullPath);
    } else {
      findContentFolderPaths(fullPath, results);
    }
  }

  return results;
}

export function scanContentDirectory(
  contentRootPath = DEFAULT_CONTENT_ROOT,
  defaultYear = DEFAULT_YEAR,
  workspace?: WorkspaceMetadata
): ScannedContentFolder[] {
  const folderPaths = findContentFolderPaths(contentRootPath);
  const scannedItems = folderPaths.map((folderAbsPath) =>
    scanSingleContentFolder(
      folderAbsPath,
      contentRootPath,
      defaultYear,
      workspace
    )
  );

  // Sort chronologically by isoDate then slotCode
  scannedItems.sort((a, b) => {
    const dateCompare = a.schedule.isoDate.localeCompare(b.schedule.isoDate);
    if (dateCompare !== 0) return dateCompare;
    return a.schedule.slotCode.localeCompare(b.schedule.slotCode);
  });

  return scannedItems;
}
