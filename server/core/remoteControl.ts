import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request } from 'express';
import { resolveAppRoot } from './appPaths.ts';
import { CPGP_NOTIF_MP3_BASE64 } from './notifSoundData.ts';
import { generateQrCodeSvg } from './qrCodeSvg.ts';

export const REMOTE_COOKIE_NAME = 'cpgp_remote_session';
const REMOTE_CONFIG_FILE = path.join(resolveAppRoot(), 'data', 'remote-control.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days on paired phone
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_FAILURES = 8;

export interface RemoteControlInternalConfig {
  schemaVersion: number;
  enabled: boolean;
  pin: string;
  pairToken: string;
  sessionSecret: string;
  soundOnDesktop: boolean;
  updatedAt: string;
}

export interface ConnectedRemoteDevice {
  id: string;
  ip: string;
  deviceName: string;
  lastSeenAt: string;
}

export interface RemoteControlPublicStatus {
  enabled: boolean;
  pin: string;
  pairToken: string;
  soundOnDesktop: boolean;
  port: number;
  lanAddresses: Array<{
    ip: string;
    interfaceName: string;
    remoteUrl: string;
    pairUrl: string;
    qrSvg: string;
  }>;
  primaryPairUrl: string;
  primaryRemoteUrl: string;
  primaryQrSvg: string;
  connectedDevices: ConnectedRemoteDevice[];
  updatedAt: string;
}

let actualServerPort = Number(process.env.PORT ?? 5173);
let cachedConfig: RemoteControlInternalConfig | null = null;
let cachedMtimeMs = 0;
let cachedNotifSoundBuffer: Buffer | null = null;

const connectedDevices = new Map<string, ConnectedRemoteDevice>();
const failedAuthByIp = new Map<string, { count: number; resetAt: number }>();

export function setActualServerPort(port: number): void {
  if (Number.isFinite(port) && port > 0) {
    actualServerPort = Math.floor(port);
  }
}

export function getActualServerPort(): number {
  return actualServerPort;
}

function generateSixDigitPin(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function generateRandomHex(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

function createDefaultConfig(): RemoteControlInternalConfig {
  return {
    schemaVersion: 1,
    enabled: false,
    pin: generateSixDigitPin(),
    pairToken: generateRandomHex(16),
    sessionSecret: generateRandomHex(32),
    soundOnDesktop: true,
    updatedAt: new Date().toISOString(),
  };
}

function saveConfigToDisk(
  config: RemoteControlInternalConfig
): RemoteControlInternalConfig {
  const dir = path.dirname(REMOTE_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${REMOTE_CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(config, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpPath, payload, 'utf-8');
    fs.renameSync(tmpPath, REMOTE_CONFIG_FILE);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    fs.writeFileSync(REMOTE_CONFIG_FILE, payload, 'utf-8');
  }
  try {
    const st = fs.statSync(REMOTE_CONFIG_FILE);
    cachedMtimeMs = st.mtimeMs;
  } catch {
    cachedMtimeMs = Date.now();
  }
  cachedConfig = { ...config };
  return cachedConfig;
}

export function getRemoteControlConfig(): RemoteControlInternalConfig {
  try {
    if (fs.existsSync(REMOTE_CONFIG_FILE)) {
      const st = fs.statSync(REMOTE_CONFIG_FILE);
      if (cachedConfig && st.mtimeMs === cachedMtimeMs) {
        return { ...cachedConfig };
      }
      const raw = JSON.parse(
        fs.readFileSync(REMOTE_CONFIG_FILE, 'utf-8')
      ) as Partial<RemoteControlInternalConfig>;
      const defaults = createDefaultConfig();
      const normalized: RemoteControlInternalConfig = {
        schemaVersion: 1,
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
        pin:
          typeof raw.pin === 'string' && /^\d{6}$/.test(raw.pin.trim())
            ? raw.pin.trim()
            : defaults.pin,
        pairToken:
          typeof raw.pairToken === 'string' && raw.pairToken.trim().length >= 16
            ? raw.pairToken.trim()
            : defaults.pairToken,
        sessionSecret:
          typeof raw.sessionSecret === 'string' &&
          raw.sessionSecret.trim().length >= 32
            ? raw.sessionSecret.trim()
            : defaults.sessionSecret,
        soundOnDesktop:
          typeof raw.soundOnDesktop === 'boolean' ? raw.soundOnDesktop : true,
        updatedAt:
          typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
            ? raw.updatedAt.trim()
            : defaults.updatedAt,
      };
      cachedConfig = normalized;
      cachedMtimeMs = st.mtimeMs;
      return { ...normalized };
    }
  } catch {
    // fallback to default creation
  }
  return saveConfigToDisk(createDefaultConfig());
}

export function updateRemoteControlConfig(patch: {
  enabled?: boolean;
  soundOnDesktop?: boolean;
  regeneratePin?: boolean;
  customPin?: string;
}): RemoteControlInternalConfig {
  const current = getRemoteControlConfig();
  let nextPin = current.pin;
  let nextPairToken = current.pairToken;
  let nextSessionSecret = current.sessionSecret;

  if (patch.regeneratePin) {
    nextPin = generateSixDigitPin();
    nextPairToken = generateRandomHex(16);
    nextSessionSecret = generateRandomHex(32);
    connectedDevices.clear();
  } else if (
    typeof patch.customPin === 'string' &&
    /^\d{6}$/.test(patch.customPin.trim())
  ) {
    nextPin = patch.customPin.trim();
  }

  const next: RemoteControlInternalConfig = {
    schemaVersion: 1,
    enabled:
      typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    pin: nextPin,
    pairToken: nextPairToken,
    sessionSecret: nextSessionSecret,
    soundOnDesktop:
      typeof patch.soundOnDesktop === 'boolean'
        ? patch.soundOnDesktop
        : current.soundOnDesktop,
    updatedAt: new Date().toISOString(),
  };

  return saveConfigToDisk(next);
}

export function getLocalLanAddresses(): Array<{
  ip: string;
  interfaceName: string;
  priority: number;
}> {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{
    ip: string;
    interfaceName: string;
    priority: number;
  }> = [];

  for (const [ifName, list] of Object.entries(interfaces)) {
    if (!Array.isArray(list)) continue;
    const lowerName = ifName.toLowerCase();
    const isVirtual =
      /vethernet|wsl|docker|vmware|vbox|virtualbox|hyper-v|loopback|npcap/i.test(
        lowerName
      );

    for (const entry of list) {
      if (!entry || entry.internal) continue;
      const family = String(entry.family);
      if (family !== 'IPv4' && family !== '4') continue;
      const ip = entry.address?.trim();
      if (!ip || ip.startsWith('169.254.')) continue;

      let priority = 50;
      if (/wi-fi|wifi|wlan|wireless/i.test(lowerName)) priority = 10;
      else if (/ethernet|eth|en0|en1/i.test(lowerName) && !isVirtual) {
        priority = 20;
      } else if (ip.startsWith('192.168.')) priority = 30;
      else if (ip.startsWith('10.')) priority = 40;
      if (isVirtual) priority += 100;

      candidates.push({ ip, interfaceName: ifName, priority });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);

  // If real non-virtual adapters exist, put virtual ones at the end or omit if >=1 real exists
  const realOnes = candidates.filter((c) => c.priority < 100);
  return realOnes.length > 0 ? realOnes : candidates;
}

export function getRemoteControlPublicStatus(): RemoteControlPublicStatus {
  const cfg = getRemoteControlConfig();
  const port = getActualServerPort();
  const rawLans = getLocalLanAddresses();
  const effectiveLans =
    rawLans.length > 0
      ? rawLans
      : [{ ip: '127.0.0.1', interfaceName: 'Localhost', priority: 999 }];

  const lanAddresses = effectiveLans.map((entry) => {
    const remoteUrl = `http://${entry.ip}:${port}/remote`;
    const pairUrl = `${remoteUrl}?token=${encodeURIComponent(cfg.pairToken)}`;
    return {
      ip: entry.ip,
      interfaceName: entry.interfaceName,
      remoteUrl,
      pairUrl,
      qrSvg: generateQrCodeSvg(pairUrl),
    };
  });

  const primary = lanAddresses[0];
  return {
    enabled: cfg.enabled,
    pin: cfg.pin,
    pairToken: cfg.pairToken,
    soundOnDesktop: cfg.soundOnDesktop,
    port,
    lanAddresses,
    primaryPairUrl: primary.pairUrl,
    primaryRemoteUrl: primary.remoteUrl,
    primaryQrSvg: primary.qrSvg,
    connectedDevices: Array.from(connectedDevices.values()).sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    ),
    updatedAt: cfg.updatedAt,
  };
}

export function isLoopbackAddress(rawIp?: string | null): boolean {
  if (!rawIp) return false;
  const cleaned = rawIp.trim().toLowerCase();
  return (
    cleaned === '127.0.0.1' ||
    cleaned === '::1' ||
    cleaned === '::ffff:127.0.0.1' ||
    cleaned === 'localhost'
  );
}

export function isLoopbackRequest(req: Request): boolean {
  const socketIp = req.socket?.remoteAddress ?? req.ip ?? '';
  return isLoopbackAddress(socketIp);
}

export function createRemoteSessionToken(): string {
  const cfg = getRemoteControlConfig();
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = generateRandomHex(8);
  const payload = `${exp}.${nonce}`;
  const sig = crypto
    .createHmac('sha256', cfg.sessionSecret)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

export function verifyRemoteSessionToken(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const cfg = getRemoteControlConfig();
  const expectedSig = crypto
    .createHmac('sha256', cfg.sessionSecret)
    .update(`${expStr}.${nonce}`)
    .digest('hex');

  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      try {
        return decodeURIComponent(trimmed.slice(name.length + 1).trim());
      } catch {
        return trimmed.slice(name.length + 1).trim();
      }
    }
  }
  return null;
}

function summarizeDeviceUserAgent(ua: string, ip: string): string {
  const lower = ua.toLowerCase();
  let osLabel = 'Perangkat';
  if (lower.includes('iphone')) osLabel = 'iPhone';
  else if (lower.includes('ipad')) osLabel = 'iPad';
  else if (lower.includes('android')) osLabel = 'Android';
  else if (lower.includes('Windows')) osLabel = 'Windows';
  else if (lower.includes('macintosh')) osLabel = 'Mac';

  let browserLabel = '';
  if (lower.includes('edg/')) browserLabel = 'Edge';
  else if (lower.includes('crios/') || lower.includes('chrome/')) {
    browserLabel = 'Chrome';
  } else if (lower.includes('fxios/') || lower.includes('firefox/')) {
    browserLabel = 'Firefox';
  } else if (lower.includes('safari/')) {
    browserLabel = 'Safari';
  }

  const label = browserLabel ? `${osLabel} (${browserLabel})` : osLabel;
  return `${label} · ${ip}`;
}

export function recordRemoteClientActivity(req: Request): void {
  const rawIp = (req.socket?.remoteAddress ?? req.ip ?? '')
    .replace(/^::ffff:/, '')
    .trim();
  if (!rawIp || isLoopbackAddress(rawIp)) return;
  const ua = String(req.headers['user-agent'] ?? '');
  const id = `${rawIp}`;
  connectedDevices.set(id, {
    id,
    ip: rawIp,
    deviceName: summarizeDeviceUserAgent(ua, rawIp),
    lastSeenAt: new Date().toISOString(),
  });
}

export function extractRemoteSessionFromRequest(req: Request): string | null {
  const fromCookie = parseCookieValue(req.headers.cookie, REMOTE_COOKIE_NAME);
  if (fromCookie) return fromCookie;

  const fromHeader = req.headers['x-cpgp-remote-token'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }

  const authHeader = req.headers.authorization;
  if (
    typeof authHeader === 'string' &&
    authHeader.toLowerCase().startsWith('bearer ')
  ) {
    return authHeader.slice(7).trim();
  }

  const queryToken = req.query?.remoteToken;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  return null;
}

export function isAuthorizedRemoteRequest(req: Request): boolean {
  if (isLoopbackRequest(req)) {
    return true;
  }
  const cfg = getRemoteControlConfig();
  if (!cfg.enabled) {
    return false;
  }
  const sessionToken = extractRemoteSessionFromRequest(req);
  if (!verifyRemoteSessionToken(sessionToken)) {
    return false;
  }
  recordRemoteClientActivity(req);
  return true;
}

export function authenticateRemoteClient(
  req: Request,
  input: { pin?: string; token?: string }
): { ok: boolean; sessionToken?: string; error?: string; status?: number } {
  const cfg = getRemoteControlConfig();
  const isLocal = isLoopbackRequest(req);

  if (!cfg.enabled && !isLocal) {
    return {
      ok: false,
      status: 403,
      error:
        'Remote Control HP belum diaktifkan. Aktifkan terlebih dahulu dari tombol Remote HP di aplikasi Desktop CPGP.',
    };
  }

  const clientIp = (req.socket?.remoteAddress ?? req.ip ?? 'unknown')
    .replace(/^::ffff:/, '')
    .trim();
  const now = Date.now();
  const rateEntry = failedAuthByIp.get(clientIp);
  if (rateEntry && rateEntry.resetAt > now) {
    if (rateEntry.count >= RATE_LIMIT_MAX_FAILURES) {
      const waitSec = Math.max(1, Math.ceil((rateEntry.resetAt - now) / 1000));
      return {
        ok: false,
        status: 429,
        error: `Terlalu banyak percobaan PIN gagal. Coba lagi dalam ${waitSec} detik.`,
      };
    }
  } else if (rateEntry) {
    failedAuthByIp.delete(clientIp);
  }

  const candidateToken = (input.token ?? '').trim();
  const candidatePin = (input.pin ?? '').trim();

  const tokenMatched =
    candidateToken.length >= 16 && candidateToken === cfg.pairToken;
  const pinMatched = /^\d{6}$/.test(candidatePin) && candidatePin === cfg.pin;

  if (!tokenMatched && !pinMatched) {
    const prev = failedAuthByIp.get(clientIp);
    const nextCount = prev && prev.resetAt > now ? prev.count + 1 : 1;
    failedAuthByIp.set(clientIp, {
      count: nextCount,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return {
      ok: false,
      status: 401,
      error: candidateToken
        ? 'QR Code atau token pairing sudah kedaluwarsa. Scan ulang QR Code terbaru di PC.'
        : 'PIN 6 digit tidak sesuai. Periksa PIN pada modal Remote HP di PC.',
    };
  }

  failedAuthByIp.delete(clientIp);
  recordRemoteClientActivity(req);
  const sessionToken = createRemoteSessionToken();
  return {
    ok: true,
    sessionToken,
  };
}

export function getNotifSoundBuffer(): Buffer {
  if (cachedNotifSoundBuffer) {
    return cachedNotifSoundBuffer;
  }
  const appRoot = resolveAppRoot();
  const candidates = [
    path.join(appRoot, 'public', 'sounds', 'cpgp-notif.mp3'),
    path.join(appRoot, 'dist', 'sounds', 'cpgp-notif.mp3'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        cachedNotifSoundBuffer = fs.readFileSync(filePath);
        return cachedNotifSoundBuffer;
      }
    } catch {
      // fall through to embedded base64
    }
  }
  cachedNotifSoundBuffer = Buffer.from(CPGP_NOTIF_MP3_BASE64, 'base64');
  return cachedNotifSoundBuffer;
}
