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
  WatermarkRenderSpeedMode,
  WatermarkResolvedEncoder,
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

const FAILED_CAPABILITIES_TTL_MS = 30_000;
let cachedCapabilities: WatermarkCapabilities | null = null;
let cachedCapabilitiesAt = 0;
let capabilitiesInFlight: Promise<WatermarkCapabilities> | null = null;

export async function detectWatermarkCapabilities(
  forceRefresh = false
): Promise<WatermarkCapabilities> {
  if (!forceRefresh && cachedCapabilities) {
    if (
      cachedCapabilities.ffmpegAvailable ||
      Date.now() - cachedCapabilitiesAt < FAILED_CAPABILITIES_TTL_MS
    ) {
      return cachedCapabilities;
    }
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
    let qsvAvailable = false;
    let amfAvailable = false;

    if (ffmpegAvailable) {
      const [nvencProbe, qsvProbe, amfProbe] = await Promise.all([
        runShortCommand(
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
            'p4',
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
          8000
        ),
        runShortCommand(
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
            'h264_qsv',
            '-preset',
            'veryfast',
            '-global_quality',
            '17',
            '-look_ahead',
            '0',
            '-pix_fmt',
            'nv12',
            '-f',
            'null',
            '-',
          ],
          8000
        ),
        runShortCommand(
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
            'h264_amf',
            '-quality',
            'speed',
            '-rc',
            'cqp',
            '-qp_i',
            '17',
            '-qp_p',
            '17',
            '-f',
            'null',
            '-',
          ],
          8000
        ),
      ]);
      nvencAvailable = nvencProbe.ok;
      qsvAvailable = qsvProbe.ok;
      amfAvailable = amfProbe.ok;
    }

    const recommendedEncoder: WatermarkResolvedEncoder = nvencAvailable
      ? 'nvenc'
      : qsvAvailable
        ? 'qsv'
        : amfAvailable
          ? 'amf'
          : 'x264';

    const result: WatermarkCapabilities = {
      ffmpegAvailable,
      ffprobeAvailable,
      nvencAvailable,
      qsvAvailable,
      amfAvailable,
      recommendedEncoder,
    };

    cachedCapabilities = result;
    cachedCapabilitiesAt = Date.now();
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

const RENAME_RETRY_DELAYS_MS = [80, 160, 320, 640, 1000];

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveFileAtomically(
  srcPath: string,
  destPath: string
): Promise<void> {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RENAME_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await fs.promises.rename(srcPath, destPath);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EXDEV') {
        lastErr = err;
        break;
      }
      if (
        (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') &&
        attempt < RENAME_RETRY_DELAYS_MS.length
      ) {
        lastErr = err;
        await sleepMs(RENAME_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    }
  }

  // Only fall back to copy + rename when moving across different volumes (EXDEV)
  if ((lastErr as NodeJS.ErrnoException)?.code === 'EXDEV') {
    const stagingPath = path.join(
      destDir,
      `.wm_staging_${randomUUID().slice(0, 8)}.tmp`
    );
    try {
      await fs.promises.copyFile(srcPath, stagingPath);
      await fs.promises.rename(stagingPath, destPath);
      safeUnlink(srcPath);
      return;
    } catch (err) {
      safeUnlink(stagingPath);
      throw err;
    }
  }

  throw lastErr ?? new Error(`Gagal memindahkan file ke ${destPath}`);
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
  speedMode?: WatermarkRenderSpeedMode;
  signal?: AbortSignal;
  onEncoderResolved?: (encoderUsed: WatermarkResolvedEncoder) => void;
  onProgress?: (progress: RenderProgressUpdate) => void;
}

export interface RenderWatermarkedVideoResult {
  outputPath: string;
  outputFileName: string;
  encoderUsed: WatermarkResolvedEncoder;
  speedMode: WatermarkRenderSpeedMode;
  width: number;
  height: number;
  durationSec: number;
}

function buildEncoderArgs(
  encoderUsed: WatermarkResolvedEncoder,
  speedMode: WatermarkRenderSpeedMode
): { inputPreArgs: string[]; encoderArgs: string[]; pixFmt: string } {
  // All 3 speed modes preserve near-lossless visual quality (CRF 16 / CQ 17 / ICQ 17):
  // faster presets trade slight file size increase for 2.5x-5x faster encoding with zero quality loss.
  if (encoderUsed === 'nvenc') {
    const preset =
      speedMode === 'fast'
        ? 'p3'
        : speedMode === 'max_compression'
          ? 'p7'
          : 'p5';
    return {
      inputPreArgs: ['-hwaccel', 'auto'],
      encoderArgs: [
        '-c:v',
        'h264_nvenc',
        '-preset',
        preset,
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
      ],
      pixFmt: 'yuv420p',
    };
  }

  if (encoderUsed === 'qsv') {
    const preset =
      speedMode === 'fast'
        ? 'veryfast'
        : speedMode === 'max_compression'
          ? 'slow'
          : 'medium';
    return {
      inputPreArgs: ['-hwaccel', 'auto'],
      encoderArgs: [
        '-c:v',
        'h264_qsv',
        '-preset',
        preset,
        '-global_quality',
        '17',
        '-look_ahead',
        '0',
        '-profile:v',
        'high',
      ],
      pixFmt: 'nv12',
    };
  }

  if (encoderUsed === 'amf') {
    const quality =
      speedMode === 'fast'
        ? 'speed'
        : speedMode === 'max_compression'
          ? 'quality'
          : 'balanced';
    return {
      inputPreArgs: ['-hwaccel', 'auto'],
      encoderArgs: [
        '-c:v',
        'h264_amf',
        '-quality',
        quality,
        '-rc',
        'cqp',
        '-qp_i',
        '17',
        '-qp_p',
        '17',
        '-profile:v',
        'high',
      ],
      pixFmt: 'yuv420p',
    };
  }

  // CPU libx264 (CRF 16 preserves visual fidelity; veryfast is ~3.5x faster than slow!)
  const preset =
    speedMode === 'fast'
      ? 'veryfast'
      : speedMode === 'max_compression'
        ? 'slow'
        : 'medium';
  return {
    inputPreArgs: [],
    encoderArgs: [
      '-c:v',
      'libx264',
      '-crf',
      '16',
      '-preset',
      preset,
      '-profile:v',
      'high',
      '-level',
      '4.2',
    ],
    pixFmt: 'yuv420p',
  };
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
    speedMode = 'fast',
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

  let encoderUsed: WatermarkResolvedEncoder;
  if (encoder === 'nvenc') {
    encoderUsed = capabilities.nvencAvailable
      ? 'nvenc'
      : capabilities.recommendedEncoder;
  } else if (encoder === 'qsv') {
    encoderUsed = capabilities.qsvAvailable
      ? 'qsv'
      : capabilities.recommendedEncoder;
  } else if (encoder === 'amf') {
    encoderUsed = capabilities.amfAvailable
      ? 'amf'
      : capabilities.recommendedEncoder;
  } else if (encoder === 'x264') {
    encoderUsed = 'x264';
  } else {
    encoderUsed = capabilities.recommendedEncoder;
  }

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

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const runId = randomUUID();
  const tempPngPath = path.join(os.tmpdir(), `jd-wm-${runId}.png`);
  const tempOutputPath = path.join(outputDir, `.wm_tmp_${runId}.tmp.mp4`);
  const finalOutputPath = path.join(outputDir, outputFileName);

  try {
    fs.writeFileSync(tempPngPath, pngBuffer);

    const { inputPreArgs, encoderArgs, pixFmt } = buildEncoderArgs(
      encoderUsed,
      speedMode
    );

    // Pre-convert static watermark PNG once to yuva420p and blend directly in yuv420
    // (eval=init avoids recomputing overlay expressions per frame, significantly faster with identical quality)
    const filterGraph =
      pixFmt === 'nv12'
        ? '[1:v]format=yuva420p[wm];[0:v][wm]overlay=0:0:format=yuv420:eval=init,format=nv12[vout]'
        : '[1:v]format=yuva420p[wm];[0:v][wm]overlay=0:0:format=yuv420:eval=init,format=yuv420p[vout]';

    const ffmpegArgs = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputPreArgs,
      '-i',
      inputPath,
      '-i',
      tempPngPath,
      '-filter_complex',
      filterGraph,
      '-map',
      '[vout]',
      '-map',
      '0:a?',
      '-c:a',
      'copy',
      ...encoderArgs,
      '-pix_fmt',
      pixFmt,
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

    await moveFileAtomically(tempOutputPath, finalOutputPath);

    return {
      outputPath: finalOutputPath,
      outputFileName,
      encoderUsed,
      speedMode,
      width: streamInfo.width,
      height: streamInfo.height,
      durationSec: streamInfo.durationSec,
    };
  } finally {
    safeUnlink(tempPngPath);
    safeUnlink(tempOutputPath);
  }
}
