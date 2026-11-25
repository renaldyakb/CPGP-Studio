export type WatermarkAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom';

export type WatermarkEncoderMode = 'auto' | 'nvenc' | 'qsv' | 'amf' | 'x264';

export type WatermarkResolvedEncoder = 'nvenc' | 'qsv' | 'amf' | 'x264';

export type WatermarkRenderSpeedMode = 'fast' | 'balanced' | 'max_compression';

export interface WatermarkFontOption {
  id: string;
  label: string;
  family: string;
  weight: number;
  fileName: string;
  url: string;
}

export interface WatermarkStyleConfig {
  text: string;
  fontId: string;
  fontSizePx: number; // Scaled on 1080px base width (24..140)
  letterSpacingPx: number; // -4..16
  xPercent: number; // 0..100
  yPercent: number; // 0..100
  anchor: WatermarkAnchor;
  rotationDeg: number; // -45..45
  opacity: number; // 0.05..1.0
  fillColor: string; // Hex color
  strokeEnabled: boolean;
  strokeColor: string; // Hex color
  strokeWidthPx: number; // 0..12
  strokeOpacity: number; // 0..1.0
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlurPx: number; // 0..24
  shadowOpacity: number; // 0..1.0
}

export interface WatermarkPreset {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  isDefault: boolean;
  config: WatermarkStyleConfig;
  createdAt: string;
  updatedAt: string;
}

export interface WatermarkPresetStore {
  schemaVersion: string;
  defaultPresetId: string;
  defaultEncoder: WatermarkEncoderMode;
  defaultSpeedMode?: WatermarkRenderSpeedMode;
  presets: WatermarkPreset[];
}

export type WatermarkJobStatus =
  | 'queued'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WatermarkRenderJob {
  jobId: string;
  workspaceId?: string;
  itemId: string;
  folderCode: string;
  inputFile: string;
  outputFile: string;
  encoderRequested: WatermarkEncoderMode;
  encoderUsed: WatermarkResolvedEncoder | null;
  speedMode?: WatermarkRenderSpeedMode;
  presetName: string;
  status: WatermarkJobStatus;
  percent: number;
  fps: number | null;
  speed: string | null;
  etaSec: number | null;
  durationSec: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WatermarkCapabilities {
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  nvencAvailable: boolean;
  qsvAvailable: boolean;
  amfAvailable: boolean;
  recommendedEncoder: WatermarkResolvedEncoder;
}

export const ANCHOR_COORDINATES: Record<
  Exclude<WatermarkAnchor, 'custom'>,
  { xPercent: number; yPercent: number; label: string }
> = {
  'top-left': { xPercent: 18, yPercent: 12, label: 'Kiri Atas' },
  'top-center': { xPercent: 50, yPercent: 12, label: 'Tengah Atas' },
  'top-right': { xPercent: 82, yPercent: 12, label: 'Kanan Atas' },
  'middle-left': { xPercent: 20, yPercent: 50, label: 'Tengah Kiri' },
  center: { xPercent: 50, yPercent: 50, label: 'Tengah Video' },
  'middle-right': { xPercent: 80, yPercent: 50, label: 'Tengah Kanan' },
  'bottom-left': { xPercent: 20, yPercent: 84, label: 'Kiri Bawah' },
  'bottom-center': { xPercent: 50, yPercent: 84, label: 'Tengah Bawah' },
  'bottom-right': { xPercent: 80, yPercent: 84, label: 'Kanan Bawah' },
};

export const DEFAULT_WATERMARK_CONFIG: WatermarkStyleConfig = {
  text: '@channel_anda',
  fontId: 'arial-black',
  fontSizePx: 76,
  letterSpacingPx: 0,
  xPercent: 50,
  yPercent: 50,
  anchor: 'center',
  rotationDeg: 0,
  opacity: 0.32,
  fillColor: '#3A3A3A',
  strokeEnabled: true,
  strokeColor: '#FFFFFF',
  strokeWidthPx: 2.5,
  strokeOpacity: 0.55,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlurPx: 6,
  shadowOpacity: 0.25,
};
