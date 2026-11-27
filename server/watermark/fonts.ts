import fs from 'node:fs';
import path from 'node:path';
import type { WatermarkFontOption } from '../../src/types/watermark.ts';

interface FontCatalogEntry {
  id: string;
  label: string;
  family: string;
  weight: number;
  fileName: string;
  fallbackFileNames?: readonly string[];
}

const WINDOWS_FONTS_DIR = path.join(
  process.env.WINDIR || 'C:\\Windows',
  'Fonts'
);

const SYSTEM_FONT_DIRS: readonly string[] =
  process.platform === 'win32'
    ? [WINDOWS_FONTS_DIR]
    : process.platform === 'darwin'
      ? [
          '/System/Library/Fonts',
          '/System/Library/Fonts/Supplemental',
          '/Library/Fonts',
        ]
      : [
          '/usr/share/fonts',
          '/usr/share/fonts/truetype/dejavu',
          '/usr/share/fonts/truetype/liberation',
          '/usr/share/fonts/truetype/liberation2',
          '/usr/share/fonts/TTF',
          '/usr/local/share/fonts',
        ];

const FONT_CATALOG: readonly FontCatalogEntry[] = [
  {
    id: 'arial-black',
    label: 'Arial Black',
    family: 'Arial Black',
    weight: 900,
    fileName: 'ariblk.ttf',
    fallbackFileNames: ['Arial Black.ttf'],
  },
  {
    id: 'arial-bold',
    label: 'Arial Bold',
    family: 'Arial',
    weight: 700,
    fileName: 'arialbd.ttf',
    fallbackFileNames: ['Arial Bold.ttf'],
  },
  {
    id: 'segoe-ui-black',
    label: 'Segoe UI Black',
    family: 'Segoe UI Black',
    weight: 900,
    fileName: 'seguibl.ttf',
  },
  {
    id: 'segoe-ui-bold',
    label: 'Segoe UI Bold',
    family: 'Segoe UI',
    weight: 700,
    fileName: 'segoeuib.ttf',
  },
  {
    id: 'century-gothic-bold',
    label: 'Century Gothic Bold',
    family: 'Century Gothic',
    weight: 700,
    fileName: 'GOTHICB.TTF',
  },
  {
    id: 'trebuchet-bold',
    label: 'Trebuchet MS Bold',
    family: 'Trebuchet MS',
    weight: 700,
    fileName: 'trebucbd.ttf',
    fallbackFileNames: ['Trebuchet MS Bold.ttf'],
  },
  {
    id: 'georgia-bold',
    label: 'Georgia Bold (Serif)',
    family: 'Georgia',
    weight: 700,
    fileName: 'georgiab.ttf',
    fallbackFileNames: ['Georgia Bold.ttf'],
  },
  {
    id: 'impact',
    label: 'Impact',
    family: 'Impact',
    weight: 400,
    fileName: 'impact.ttf',
    fallbackFileNames: ['Impact.ttf'],
  },
  {
    id: 'cascadia-mono',
    label: 'Cascadia Mono',
    family: 'Cascadia Mono',
    weight: 700,
    fileName: 'CascadiaMono.ttf',
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    family: 'Helvetica',
    weight: 700,
    fileName: 'Helvetica.ttc',
  },
  {
    id: 'dejavu-sans-bold',
    label: 'DejaVu Sans Bold',
    family: 'DejaVu Sans',
    weight: 700,
    fileName: 'DejaVuSans-Bold.ttf',
  },
  {
    id: 'liberation-sans-bold',
    label: 'Liberation Sans Bold',
    family: 'Liberation Sans',
    weight: 700,
    fileName: 'LiberationSans-Bold.ttf',
  },
];

export interface ResolvedWatermarkFont {
  option: WatermarkFontOption;
  absolutePath: string;
}

let cachedResolvedFonts: ResolvedWatermarkFont[] | null = null;

function resolveDiskFontPath(
  candidateDirs: readonly string[],
  fileNames: readonly string[]
): { absolutePath: string; matchedFileName: string } | null {
  for (const dir of candidateDirs) {
    for (const fileName of fileNames) {
      const directPath = path.join(dir, fileName);
      if (fs.existsSync(directPath)) {
        return { absolutePath: directPath, matchedFileName: fileName };
      }

      const lowerName = fileName.toLowerCase();
      if (lowerName !== fileName) {
        const lowerPath = path.join(dir, lowerName);
        if (fs.existsSync(lowerPath)) {
          return { absolutePath: lowerPath, matchedFileName: lowerName };
        }
      }
    }
  }

  return null;
}

function buildResolvedFonts(): ResolvedWatermarkFont[] {
  if (cachedResolvedFonts !== null) {
    return cachedResolvedFonts;
  }

  const existingDirs = SYSTEM_FONT_DIRS.filter((dir) => fs.existsSync(dir));
  const resolved: ResolvedWatermarkFont[] = [];

  for (const entry of FONT_CATALOG) {
    const candidateNames = entry.fallbackFileNames
      ? [entry.fileName, ...entry.fallbackFileNames]
      : [entry.fileName];
    const match = resolveDiskFontPath(existingDirs, candidateNames);
    if (!match) {
      continue;
    }

    resolved.push({
      option: {
        id: entry.id,
        label: entry.label,
        family: entry.family,
        weight: entry.weight,
        fileName: match.matchedFileName,
        url: `/api/watermark/fonts/${encodeURIComponent(entry.id)}`,
      },
      absolutePath: match.absolutePath,
    });
  }

  cachedResolvedFonts = resolved;
  return resolved;
}

export function listAvailableFonts(): WatermarkFontOption[] {
  return buildResolvedFonts().map((item) => item.option);
}

export function getFontFileById(fontId: string): ResolvedWatermarkFont | null {
  const normalized = fontId.trim().toLowerCase();
  if (!normalized) return null;

  const available = buildResolvedFonts();
  return (
    available.find((item) => item.option.id.toLowerCase() === normalized) ??
    null
  );
}

export function resolveFontFile(fontId: string): ResolvedWatermarkFont {
  const available = buildResolvedFonts();
  if (available.length === 0) {
    throw new Error(
      `Tidak ada file font sistem yang tersedia di direktori ${SYSTEM_FONT_DIRS.join(', ')}`
    );
  }

  const normalized = (fontId || '').trim().toLowerCase();
  const matched = available.find(
    (item) => item.option.id.toLowerCase() === normalized
  );

  return matched ?? available[0];
}
