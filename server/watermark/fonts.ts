import fs from 'node:fs';
import path from 'node:path';
import type { WatermarkFontOption } from '../../src/types/watermark.ts';

interface FontCatalogEntry {
  id: string;
  label: string;
  family: string;
  weight: number;
  fileName: string;
}

const WINDOWS_FONTS_DIR = path.join(
  process.env.WINDIR || 'C:\\Windows',
  'Fonts'
);

const FONT_CATALOG: readonly FontCatalogEntry[] = [
  {
    id: 'arial-black',
    label: 'Arial Black',
    family: 'Arial Black',
    weight: 900,
    fileName: 'ariblk.ttf',
  },
  {
    id: 'arial-bold',
    label: 'Arial Bold',
    family: 'Arial',
    weight: 700,
    fileName: 'arialbd.ttf',
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
  },
  {
    id: 'georgia-bold',
    label: 'Georgia Bold (Serif)',
    family: 'Georgia',
    weight: 700,
    fileName: 'georgiab.ttf',
  },
  {
    id: 'impact',
    label: 'Impact',
    family: 'Impact',
    weight: 400,
    fileName: 'impact.ttf',
  },
  {
    id: 'cascadia-mono',
    label: 'Cascadia Mono',
    family: 'Cascadia Mono',
    weight: 700,
    fileName: 'CascadiaMono.ttf',
  },
];

export interface ResolvedWatermarkFont {
  option: WatermarkFontOption;
  absolutePath: string;
}

function resolveDiskFontPath(fileName: string): string | null {
  const directPath = path.join(WINDOWS_FONTS_DIR, fileName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const lowerPath = path.join(WINDOWS_FONTS_DIR, fileName.toLowerCase());
  if (fs.existsSync(lowerPath)) {
    return lowerPath;
  }

  return null;
}

function buildResolvedFonts(): ResolvedWatermarkFont[] {
  const resolved: ResolvedWatermarkFont[] = [];

  for (const entry of FONT_CATALOG) {
    const absolutePath = resolveDiskFontPath(entry.fileName);
    if (!absolutePath) {
      continue;
    }

    resolved.push({
      option: {
        id: entry.id,
        label: entry.label,
        family: entry.family,
        weight: entry.weight,
        fileName: entry.fileName,
        url: `/api/watermark/fonts/${encodeURIComponent(entry.id)}`,
      },
      absolutePath,
    });
  }

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
      `Tidak ada file font TTF yang tersedia di direktori ${WINDOWS_FONTS_DIR}`
    );
  }

  const normalized = (fontId || '').trim().toLowerCase();
  const matched = available.find(
    (item) => item.option.id.toLowerCase() === normalized
  );

  return matched ?? available[0];
}
