import type { WatermarkStyleConfig } from '../src/types/watermark.ts';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export interface BuildWatermarkSvgOptions {
  width: number;
  height: number;
  fontFamily: string;
  fontWeight?: number;
}

/**
 * Shared 100% WYSIWYG SVG generator used identically by:
 * 1. React Live Video Preview Overlay (rendered over <video>)
 * 2. Backend @resvg/resvg-js (rasterized to transparent PNG for FFmpeg overlay)
 */
export function buildWatermarkSvg(
  config: WatermarkStyleConfig,
  options: BuildWatermarkSvgOptions
): string {
  const width = Math.max(64, Math.round(options.width || 1080));
  const height = Math.max(64, Math.round(options.height || 1920));
  const scale = width / 1080;

  const text = (config.text || '').trim();
  if (!text) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  const fontSize = Math.round(clampNumber(config.fontSizePx, 20, 180) * scale * 100) / 100;
  const letterSpacing =
    Math.round(clampNumber(config.letterSpacingPx, -8, 24) * scale * 100) / 100;
  const x = Math.round((clampNumber(config.xPercent, 0, 100) / 100) * width * 100) / 100;
  const y = Math.round((clampNumber(config.yPercent, 0, 100) / 100) * height * 100) / 100;
  const rotation = clampNumber(config.rotationDeg, -45, 45);
  const opacity = clampNumber(config.opacity, 0.05, 1);

  const strokeWidth = config.strokeEnabled
    ? Math.round(clampNumber(config.strokeWidthPx, 0, 20) * scale * 2 * 100) / 100
    : 0;
  const strokeOpacity = config.strokeEnabled
    ? clampNumber(config.strokeOpacity, 0, 1)
    : 0;

  const shadowBlur = config.shadowEnabled
    ? Math.round(clampNumber(config.shadowBlurPx, 0, 32) * scale * 100) / 100
    : 0;
  const shadowOpacity = config.shadowEnabled
    ? clampNumber(config.shadowOpacity, 0, 1)
    : 0;

  const safeText = escapeXml(text);
  const safeFontFamily = escapeXml(options.fontFamily || 'Arial Black, Arial, sans-serif');
  const fontWeight = options.fontWeight ?? 800;

  const defs = config.shadowEnabled && shadowOpacity > 0
    ? `<defs>
    <filter id="wmShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${Math.round(2 * scale * 100) / 100}" stdDeviation="${shadowBlur}" flood-color="${escapeXml(config.shadowColor || '#000000')}" flood-opacity="${shadowOpacity}" />
    </filter>
  </defs>`
    : '';

  const filterAttr = config.shadowEnabled && shadowOpacity > 0 ? ' filter="url(#wmShadow)"' : '';
  const transformAttr = rotation !== 0 ? ` transform="rotate(${rotation} ${x} ${y})"` : '';
  const strokeAttrs =
    config.strokeEnabled && strokeWidth > 0 && strokeOpacity > 0
      ? ` stroke="${escapeXml(config.strokeColor || '#FFFFFF')}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity}" stroke-linejoin="round" paint-order="stroke fill"`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs}
  <g opacity="${opacity}"${transformAttr}${filterAttr}>
    <text
      x="${x}"
      y="${y}"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${safeFontFamily}"
      font-weight="${fontWeight}"
      font-size="${fontSize}"
      letter-spacing="${letterSpacing}"
      fill="${escapeXml(config.fillColor || '#3A3A3A')}"${strokeAttrs}
    >${safeText}</text>
  </g>
</svg>`;
}
