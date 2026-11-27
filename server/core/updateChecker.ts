import fs from 'node:fs';
import path from 'node:path';

export const GITHUB_REPO_OWNER = 'renaldyakb';
export const GITHUB_REPO_NAME = 'CPGP-Studio';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
export const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
export const GITHUB_RELEASES_PAGE = `${GITHUB_REPO_URL}/releases`;

import { resolveAppRoot } from './appPaths.ts';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const ERROR_CACHE_TTL_MS = 60 * 1000; // 60 seconds for failed/offline checks

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  checkedAt: string;
  repoUrl: string;
  error: string | null;
}

let cachedResult: { timestamp: number; data: UpdateCheckResult } | null = null;
let inFlightCheck: Promise<UpdateCheckResult> | null = null;
let cachedAppVersion: string | null = null;

export function getCurrentAppVersion(): string {
  if (cachedAppVersion !== null) {
    return cachedAppVersion;
  }
  try {
    const pkgPath = path.join(resolveAppRoot(), 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    cachedAppVersion = (parsed.version ?? '2.0.0').replace(/^v/i, '').trim();
    return cachedAppVersion;
  } catch {
    cachedAppVersion = '2.0.0';
    return cachedAppVersion;
  }
}

function normalizeSemver(version: string): [number, number, number] {
  const cleaned = version.replace(/^v/i, '').split('-')[0].trim();
  const parts = cleaned.split('.').map((n) => {
    const parsed = Number.parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isNewerVersion(latest: string, current: string): boolean {
  const [lMaj, lMin, lPat] = normalizeSemver(latest);
  const [cMaj, cMin, cPat] = normalizeSemver(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export async function checkLatestGitHubRelease(
  forceRefresh = false
): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentAppVersion();
  const now = Date.now();

  if (!forceRefresh && cachedResult) {
    const ttl = cachedResult.data.error ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (now - cachedResult.timestamp < ttl) {
      return cachedResult.data;
    }
  }

  if (!forceRefresh && inFlightCheck) {
    return inFlightCheck;
  }

  const checkPromise = (async (): Promise<UpdateCheckResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const checkTimestamp = Date.now();

    try {
      const res = await fetch(GITHUB_LATEST_RELEASE_API, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `CPGP-Studio/${currentVersion}`,
        },
        signal: controller.signal,
      });

      if (res.status === 404) {
        const noRelease: UpdateCheckResult = {
          currentVersion,
          latestVersion: currentVersion,
          hasUpdate: false,
          releaseUrl: GITHUB_RELEASES_PAGE,
          releaseName: null,
          releaseNotes: null,
          publishedAt: null,
          checkedAt: new Date().toISOString(),
          repoUrl: GITHUB_REPO_URL,
          error: null,
        };
        cachedResult = { timestamp: checkTimestamp, data: noRelease };
        return noRelease;
      }

      if (!res.ok) {
        throw new Error(`GitHub API HTTP ${res.status}`);
      }

      const payload = (await res.json()) as {
        tag_name?: string;
        name?: string;
        html_url?: string;
        body?: string;
        published_at?: string;
      };

      const latestVersion =
        (payload.tag_name ?? '').replace(/^v/i, '').trim() || null;
      const hasUpdate = latestVersion
        ? isNewerVersion(latestVersion, currentVersion)
        : false;

      const result: UpdateCheckResult = {
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseUrl: payload.html_url || GITHUB_RELEASES_PAGE,
        releaseName:
          payload.name || (latestVersion ? `v${latestVersion}` : null),
        releaseNotes: payload.body ? payload.body.slice(0, 600) : null,
        publishedAt: payload.published_at || null,
        checkedAt: new Date().toISOString(),
        repoUrl: GITHUB_REPO_URL,
        error: null,
      };

      cachedResult = { timestamp: checkTimestamp, data: result };
      return result;
    } catch (err) {
      const fallback: UpdateCheckResult = {
        currentVersion,
        latestVersion: null,
        hasUpdate: false,
        releaseUrl: GITHUB_RELEASES_PAGE,
        releaseName: null,
        releaseNotes: null,
        publishedAt: null,
        checkedAt: new Date().toISOString(),
        repoUrl: GITHUB_REPO_URL,
        error:
          err instanceof Error ? err.message : 'Gagal memeriksa rilis GitHub',
      };
      cachedResult = { timestamp: checkTimestamp, data: fallback };
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  })();

  inFlightCheck = checkPromise;
  try {
    return await checkPromise;
  } finally {
    if (inFlightCheck === checkPromise) {
      inFlightCheck = null;
    }
  }
}
