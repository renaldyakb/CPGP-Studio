import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Resvg } from '@resvg/resvg-js';
import { buildWatermarkSvg } from '../../shared/watermarkSvg.ts';
import type {
  WatermarkCapabilities,
  WatermarkEncoderMode,
  WatermarkStyleConfig,
} from '../../src/types/watermark.ts';
import { resolveFontFile } from './fonts.ts';

interface CommandCheckResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function runShortCommand(
  command: string,
  args: string[],
  timeoutMs = 8000
): Promise<CommandCheckResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore kill failures
      }
      resolve({ ok: false, stdout, stderr: stderr || 'Command timed out' });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: err.message });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

let cachedCapabilities: WatermarkCapabilities | null = null;
let capabilitiesInFlight: Promise<WatermarkCapabilities> | null = null;

export async function detectWatermarkCapabilities(
  forceRefresh = false
): Promise<WatermarkCapabilities> {
  if (!forceRefresh && cachedCapabilities) {
    return cachedCapabilities;
  }

  if (!forceRefresh && capabilitiesInFlight) {
    return capabilitiesInFlight;
  }

  const probePromise = (async (): Promise<WatermarkCapabilities> => {
    const [ffmpegCheck, ffprobeCheck] = await Promise.all([
      runShortCommand('ffmpeg', ['-version'], 6000),
      runShortCommand('ffprobe', ['-version'], 6000),
    ]);

    const ffmpegAvailable = ffmpegCheck.ok;
    const ffprobeAvailable = ffprobeCheck.ok;
    let nvencAvailable = false;

    if (ffmpegAvailable) {
      const nvencProbe = await runShortCommand(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=256x256:d=0.1',
          '-c:v',
          'h264_nvenc',
          '-preset',
          'p6',
          '-tune',
          'hq',
          '-rc',
          'vbr',
          '-cq',
          '17',
          '-b:v',
          '0',
          '-f',
          'null',
          '-',
        ],
        10000
      );
      nvencAvailable = nvencProbe.ok;
    }

    const result: WatermarkCapabilities = {
      ffmpegAvailable,
      ffprobeAvailable,
      nvencAvailable,
      recommendedEncoder: nvencAvailable ? 'nvenc' : 'x264',
    };

    cachedCapabilities = result;
    return result;
  })();

  capabilitiesInFlight = probePromise;
  try {
    return await probePromise;
  } finally {
    capabilitiesInFlight = null;
  }
}

export interface VideoStreamInfo {
  width: number;
  height: number;
  durationSec: number;
}

interface FfprobeJsonOutput {
  streams?: Array<{
    width?: number;
    height?: number;
    duration?: string;
    tags?: {
      rotate?: string;
    };
    side_data_list?: Array<{
      rotation?: number | string;
    }>;
  }>;
  format?: {
    duration?: string;
  };
}

export async function probeVideoStream(
  inputPath: string
): Promise<VideoStreamInfo> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File video sumber tidak ditemukan: ${inputPath}`);
  }

  const check = await runShortCommand(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration,tags:stream_side_data=rotation:format=duration',
      '-of',
      'json',
      inputPath,
    ],
    15000
  );

  if (!check.ok) {
    throw new Error(
      `Gagal membaca metadata video dengan ffprobe: ${check.stderr.trim() || 'Unknown error'}`
    );
  }

  let parsed: FfprobeJsonOutput;
  try {
    parsed = JSON.parse(check.stdout) as FfprobeJsonOutput;
  } catch {
    throw new Error('Output JSON dari ffprobe tidak valid');
  }

  const stream = parsed.streams?.[0];
  let width = Number(stream?.width ?? 0);
  let height = Number(stream?.height ?? 0);

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('Dimensi stream video tidak valid atau tidak ditemukan');
  }

  let rotation = 0;
  if (stream?.tags?.rotate !== undefined) {
    rotation = Number(stream.tags.rotate) || 0;
  } else if (Array.isArray(stream?.side_data_list)) {
    const rotEntry = stream.side_data_list.find(
      (item) => item && item.rotation !== undefined
    );
    if (rotEntry) {
      rotation = Number(rotEntry.rotation) || 0;
    }
  }

  const absRotation = Math.abs(rotation) % 360;
  if (absRotation === 90 || absRotation === 270) {
    const swapped = width;
    width = height;
    height = swapped;
  }

  const streamDuration = Number(stream?.duration);
  const formatDuration = Number(parsed.format?.duration);
  const durationSec =
    Number.isFinite(streamDuration) && streamDuration > 0
      ? streamDuration
      : Number.isFinite(formatDuration) && formatDuration > 0
        ? formatDuration
        : 0;

  return {
    width,
    height,
    durationSec,
  };
}

export async function renderWatermarkPng(
  config: WatermarkStyleConfig,
  width: number,
  height: number
): Promise<Buffer> {
  const font = resolveFontFile(config.fontId);
  const svg = buildWatermarkSvg(config, {
    width,
    height,
    fontFamily: font.option.family,
    fontWeight: font.option.weight,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontFiles: [font.absolutePath],
      loadSystemFonts: false,
      defaultFontFamily: font.option.family,
    },
  });

  const rendered = resvg.render();
  return rendered.asPng();
}

function safeUnlink(filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

function moveFileAtomically(srcPath: string, destPath: string): void {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    fs.renameSync(srcPath, destPath);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES') {
      throw err;
    }
  }

  // Cross-device safe atomic replacement (e.g. C:\Temp -> D:\RENAL\JURNAL DUNIA\KONTEN)
  const stagingPath = path.join(
    destDir,
    `.wm_staging_${randomUUID().slice(0, 8)}.tmp`
  );
  try {
    fs.copyFileSync(srcPath, stagingPath);
    fs.renameSync(stagingPath, destPath);
    safeUnlink(srcPath);
  } catch (err) {
    safeUnlink(stagingPath);
    throw err;
  }
}

function createAbortError(): Error {
  const err = new Error('Proses render watermark dibatalkan');
  err.name = 'AbortError';
  return err;
}

export interface RenderProgressUpdate {
  percent: number;
  fps: number | null;
  speed: string | null;
  etaSec: number | null;
  durationSec: number;
}

export interface RenderWatermarkedVideoOptions {
  inputPath: string;
  outputDir: string;
  outputFileName?: string;
  config: WatermarkStyleConfig;
  encoder: WatermarkEncoderMode;
  signal?: AbortSignal;
  onEncoderResolved?: (encoderUsed: 'x264' | 'nvenc') => void;
  onProgress?: (progress: RenderProgressUpdate) => void;
}

export interface RenderWatermarkedVideoResult {
  outputPath: string;
  outputFileName: string;
  encoderUsed: 'x264' | 'nvenc';
  width: number;
  height: number;
  durationSec: number;
}

export async function renderWatermarkedVideo(
  options: RenderWatermarkedVideoOptions
): Promise<RenderWatermarkedVideoResult> {
  const {
    inputPath,
    outputDir,
    outputFileName = 'wm_final.mp4',
    config,
    encoder,
    signal,
    onEncoderResolved,
    onProgress,
  } = options;

  if (signal?.aborted) {
    throw createAbortError();
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Video mentah tidak ditemukan: ${inputPath}`);
  }

  const capabilities = await detectWatermarkCapabilities();
  if (!capabilities.ffmpegAvailable || !capabilities.ffprobeAvailable) {
    throw new Error(
      'FFmpeg atau FFprobe tidak tersedia di PATH sistem. Pastikan FFmpeg sudah terpasang.'
    );
  }

  const encoderUsed: 'x264' | 'nvenc' =
    encoder === 'nvenc'
      ? capabilities.nvencAvailable
        ? 'nvenc'
        : 'x264'
      : encoder === 'x264'
        ? 'x264'
        : capabilities.recommendedEncoder;

  onEncoderResolved?.(encoderUsed);

  const streamInfo = await probeVideoStream(inputPath);
  if (signal?.aborted) {
    throw createAbortError();
  }

  const pngBuffer = await renderWatermarkPng(
    config,
    streamInfo.width,
    streamInfo.height
  );

  if (signal?.aborted) {
    throw createAbortError();
  }

  const runId = randomUUID();
  const tempPngPath = path.join(os.tmpdir(), `jd-wm-${runId}.png`);
  const tempOutputPath = path.join(os.tmpdir(), `jd-wm-${runId}.mp4`);
  const finalOutputPath = path.join(outputDir, outputFileName);

  try {
    fs.writeFileSync(tempPngPath, pngBuffer);

    const encoderArgs =
      encoderUsed === 'nvenc'
        ? [
            '-c:v',
            'h264_nvenc',
            '-preset',
            'p6',
            '-tune',
            'hq',
            '-rc',
            'vbr',
            '-cq',
            '17',
            '-b:v',
            '0',
            '-profile:v',
            'high',
          ]
        : [
            '-c:v',
            'libx264',
            '-crf',
            '16',
            '-preset',
            'slow',
            '-profile:v',
            'high',
            '-level',
            '4.2',
          ];

    const ffmpegArgs = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-i',
      tempPngPath,
      '-filter_complex',
      '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[vout]',
      '-map',
      '[vout]',
      '-map',
      '0:a?',
      '-c:a',
      'copy',
      ...encoderArgs,
      '-pix_fmt',
      'yuv420p',
      '-color_range',
      'tv',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      tempOutputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', ffmpegArgs, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderrOutput = '';
      let aborted = false;
      let killTimer: NodeJS.Timeout | null = null;

      let latestOutTimeUs = 0;
      let latestFps: number | null = null;
      let latestSpeed: string | null = null;
      let latestSpeedNumeric: number | null = null;

      const onAbort = () => {
        aborted = true;
        try {
          child.stdin?.write('q\n');
        } catch {
          // Ignore stdin write error
        }
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore kill error
        }
        killTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore kill error
          }
        }, 2000);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (rawLine: string) => {
        const eqIdx = rawLine.indexOf('=');
        if (eqIdx === -1) return;

        const key = rawLine.slice(0, eqIdx).trim();
        const value = rawLine.slice(eqIdx + 1).trim();

        if (key === 'out_time_us' || key === 'out_time_ms') {
          const parsedUs = Number(value);
          if (Number.isFinite(parsedUs) && parsedUs >= 0) {
            latestOutTimeUs = parsedUs;
          }
        } else if (key === 'fps') {
          const parsedFps = Number(value);
          if (Number.isFinite(parsedFps) && parsedFps >= 0) {
            latestFps = Math.round(parsedFps * 10) / 10;
          }
        } else if (key === 'speed') {
          if (value && value !== 'N/A') {
            latestSpeed = value;
            const numericMatch = value.match(/([\d.]+)/);
            if (numericMatch) {
              const num = Number(numericMatch[1]);
              latestSpeedNumeric = Number.isFinite(num) && num > 0 ? num : null;
            }
          }
        } else if (key === 'progress') {
          const outTimeSec = latestOutTimeUs / 1_000_000;
          const durationSec = streamInfo.durationSec;

          let percent = 0;
          if (value === 'end') {
            percent = 100;
          } else if (durationSec > 0) {
            percent = Math.min(
              99,
              Math.max(0, Math.round((outTimeSec / durationSec) * 100))
            );
          }

          let etaSec: number | null = null;
          if (value === 'end') {
            etaSec = 0;
          } else if (
            durationSec > 0 &&
            latestSpeedNumeric !== null &&
            latestSpeedNumeric > 0
          ) {
            const remaining = Math.max(0, durationSec - outTimeSec);
            etaSec = Math.round(remaining / latestSpeedNumeric);
          }

          onProgress?.({
            percent,
            fps: latestFps,
            speed: latestSpeed,
            etaSec,
            durationSec,
          });
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString('utf-8');
      });

      const cleanupListeners = () => {
        if (killTimer) {
          clearTimeout(killTimer);
          killTimer = null;
        }
        rl.close();
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      child.on('error', (err) => {
        cleanupListeners();
        reject(new Error(`Gagal menjalankan FFmpeg: ${err.message}`));
      });

      child.on('close', (code) => {
        cleanupListeners();
        if (aborted || signal?.aborted) {
          reject(createAbortError());
          return;
        }
        if (code !== 0) {
          const detail = stderrOutput.trim() || `Exit code ${String(code)}`;
          reject(new Error(`FFmpeg gagal merender video: ${detail}`));
          return;
        }
        resolve();
      });
    });

    if (signal?.aborted) {
      throw createAbortError();
    }

    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('File output sementara FFmpeg tidak ditemukan setelah render');
    }

    moveFileAtomically(tempOutputPath, finalOutputPath);

    return {
      outputPath: finalOutputPath,
      outputFileName,
      encoderUsed,
      width: streamInfo.width,
      height: streamInfo.height,
      durationSec: streamInfo.durationSec,
    };
  } finally {
    safeUnlink(tempPngPath);
    safeUnlink(tempOutputPath);
  }
}
