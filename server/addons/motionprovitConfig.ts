import fs from 'node:fs';
import path from 'node:path';
import type {
  MotionProvitConfigPublic,
  MotionProvitJobSummary,
} from '../../src/types/motionprovit.ts';
import {
  getActiveWorkspace,
  getWorkspacePaths,
} from '../workspaces/registry.ts';

export const MOTIONPROVIT_BASE_URL = 'https://motion.clipprovit.com';
export const MOTIONPROVIT_LOGIN_URL = `${MOTIONPROVIT_BASE_URL}/login?callbackUrl=%2Fapp%2Fjobs`;
export const MOTIONPROVIT_JOBS_URL = `${MOTIONPROVIT_BASE_URL}/app/jobs`;

export interface InternalMotionProvitConfig {
  schemaVersion: string;
  baseUrl: string;
  email: string;
  password: string;
  connected: boolean;
  accountName: string | null;
  accountEmail: string | null;
  lastVerifiedAt: string | null;
  lastSyncedAt: string | null;
  totalRemoteCount: number;
  cachedJobs: MotionProvitJobSummary[];
}

const SCHEMA_VERSION = '1.0.0';

function createDefaultConfig(): InternalMotionProvitConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    baseUrl: MOTIONPROVIT_BASE_URL,
    email: '',
    password: '',
    connected: false,
    accountName: null,
    accountEmail: null,
    lastVerifiedAt: null,
    lastSyncedAt: null,
    totalRemoteCount: 0,
    cachedJobs: [],
  };
}

function getConfigPath(workspaceId?: string): string {
  return getWorkspacePaths(workspaceId).motionprovitConfigFile;
}

export function getInternalMotionProvitConfig(
  workspaceId?: string
): InternalMotionProvitConfig {
  const filePath = getConfigPath(workspaceId);
  if (!fs.existsSync(filePath)) {
    return createDefaultConfig();
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<InternalMotionProvitConfig>;
    const defaults = createDefaultConfig();
    return {
      schemaVersion: SCHEMA_VERSION,
      baseUrl:
        typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
          ? parsed.baseUrl.trim().replace(/\/+$/, '')
          : defaults.baseUrl,
      email: typeof parsed.email === 'string' ? parsed.email.trim() : '',
      password: typeof parsed.password === 'string' ? parsed.password : '',
      connected: Boolean(parsed.connected),
      accountName:
        typeof parsed.accountName === 'string' && parsed.accountName.trim()
          ? parsed.accountName.trim()
          : null,
      accountEmail:
        typeof parsed.accountEmail === 'string' && parsed.accountEmail.trim()
          ? parsed.accountEmail.trim()
          : null,
      lastVerifiedAt:
        typeof parsed.lastVerifiedAt === 'string' ? parsed.lastVerifiedAt : null,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      totalRemoteCount:
        typeof parsed.totalRemoteCount === 'number' &&
        Number.isFinite(parsed.totalRemoteCount)
          ? parsed.totalRemoteCount
          : Array.isArray(parsed.cachedJobs)
            ? parsed.cachedJobs.length
            : 0,
      cachedJobs: Array.isArray(parsed.cachedJobs) ? parsed.cachedJobs : [],
    };
  } catch {
    return createDefaultConfig();
  }
}

export function saveInternalMotionProvitConfig(
  config: InternalMotionProvitConfig,
  workspaceId?: string
): InternalMotionProvitConfig {
  const filePath = getConfigPath(workspaceId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    filePath,
    JSON.stringify(config, null, 2) + '\n',
    'utf-8'
  );
  return config;
}

export function updateMotionProvitConfig(
  patch: Partial<Omit<InternalMotionProvitConfig, 'schemaVersion'>>,
  workspaceId?: string
): InternalMotionProvitConfig {
  const current = getInternalMotionProvitConfig(workspaceId);
  const next: InternalMotionProvitConfig = {
    ...current,
    ...patch,
    schemaVersion: SCHEMA_VERSION,
  };
  return saveInternalMotionProvitConfig(next, workspaceId);
}

export function clearMotionProvitConfig(workspaceId?: string): InternalMotionProvitConfig {
  const paths = getWorkspacePaths(workspaceId);
  try {
    if (fs.existsSync(paths.motionprovitSessionFile)) {
      fs.unlinkSync(paths.motionprovitSessionFile);
    }
  } catch {
    // ignore unlink failure
  }
  return saveInternalMotionProvitConfig(createDefaultConfig(), workspaceId);
}

export function toPublicMotionProvitConfig(
  config: InternalMotionProvitConfig,
  workspaceId?: string
): MotionProvitConfigPublic {
  const resolvedWorkspaceId =
    workspaceId && workspaceId.trim()
      ? workspaceId.trim()
      : getActiveWorkspace().id;

  return {
    workspaceId: resolvedWorkspaceId,
    baseUrl: config.baseUrl,
    email: config.email,
    passwordConfigured: Boolean(config.password),
    connected: config.connected,
    accountName: config.accountName,
    accountEmail: config.accountEmail,
    lastVerifiedAt: config.lastVerifiedAt,
    lastSyncedAt: config.lastSyncedAt,
    cachedJobsCount: config.cachedJobs.length,
    totalRemoteCount: Math.max(config.totalRemoteCount, config.cachedJobs.length),
  };
}
