import fs from 'node:fs';
import { google } from 'googleapis';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type { AutoPostMode } from '../../src/types/autopost.ts';
import type { ContentPlannerItem } from '../../src/types/planner.ts';
import {
  getInternalAutoPostConfig,
  saveYouTubeTokens,
} from './config.ts';
import { resolveUploadVideoForItem } from './contentHelpers.ts';

const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export interface YouTubeApiProgressUpdate {
  step: string;
  progressPercent: number;
  log?: string;
  level?: 'info' | 'success' | 'warning' | 'error';
}

export interface YouTubeApiPublishParams {
  item: ContentPlannerItem;
  mode: AutoPostMode;
  privacy?: 'public' | 'unlisted' | 'private';
  signal: AbortSignal;
  onProgress: (update: YouTubeApiProgressUpdate) => void;
  workspace?: WorkspaceMetadata;
}

export interface YouTubeApiPublishResult {
  status: 'completed' | 'awaiting_review';
  publishedUrl: string;
  summary: string;
}

function resolveRedirectUri(configuredUri: string, origin?: string): string {
  if (configuredUri.trim()) {
    return configuredUri.trim();
  }
  const normalizedOrigin = (origin || 'http://localhost:5173').replace(
    /\/+$/,
    ''
  );
  return `${normalizedOrigin}/api/autopost/youtube/callback`;
}

function buildOAuth2Client(origin?: string, workspaceId?: string) {
  const config = getInternalAutoPostConfig(workspaceId);
  const { clientId, clientSecret, redirectUri } = config.youtubeApi;

  if (!clientId.trim() || !clientSecret.trim()) {
    throw new Error(
      'YouTube API Client ID dan Client Secret belum dikonfigurasi di pengaturan Auto-Post.'
    );
  }

  const finalRedirectUri = resolveRedirectUri(redirectUri, origin);
  return new google.auth.OAuth2(clientId, clientSecret, finalRedirectUri);
}

export function createYouTubeOAuthUrl(origin: string): string {
  const oauth2Client = buildOAuth2Client(origin);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: YOUTUBE_OAUTH_SCOPES,
  });
}

export async function exchangeYouTubeOAuthCode(
  code: string,
  origin: string
): Promise<{ channelTitle: string | null }> {
  const oauth2Client = buildOAuth2Client(origin);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error('Google OAuth tidak mengembalikan token akses yang valid.');
  }

  oauth2Client.setCredentials(tokens);

  let channelTitle: string | null = null;
  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });
    const firstChannel = channelRes.data.items?.[0];
    channelTitle = firstChannel?.snippet?.title ?? null;
  } catch {
    channelTitle = null;
  }

  saveYouTubeTokens({
    refreshToken: tokens.refresh_token ?? undefined,
    accessToken: tokens.access_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    channelTitle,
  });

  return { channelTitle };
}

function buildYouTubeTitle(item: ContentPlannerItem): string {
  const candidate =
    item.userProperties.customTitle.trim() ||
    item.autoMetadata.captionParsed.hookTitle.trim() ||
    item.folderCode;
  return candidate.slice(0, 100);
}

function buildYouTubeTags(item: ContentPlannerItem): string[] {
  const tags: string[] = [];
  for (const rawTag of item.autoMetadata.captionParsed.hashtags) {
    const cleaned = rawTag.replace(/^#+/, '').trim();
    if (cleaned && !tags.includes(cleaned)) {
      tags.push(cleaned);
    }
  }
  return tags;
}

export async function publishToYouTubeApi(
  params: YouTubeApiPublishParams
): Promise<YouTubeApiPublishResult> {
  const { item, mode, privacy, signal, onProgress, workspace } = params;

  if (signal.aborted) {
    const err = new Error('Upload YouTube API dibatalkan.');
    err.name = 'AbortError';
    throw err;
  }

  const resolvedVideo = resolveUploadVideoForItem(item, workspace);
  if (!resolvedVideo) {
    throw new Error(
      `File video yang siap diunggah tidak ditemukan untuk item ${item.folderCode}.`
    );
  }
  const {
    absolutePath: videoPath,
    fileName,
    sizeFormatted,
  } = resolvedVideo;

  const config = getInternalAutoPostConfig(workspace?.id);
  if (!config.youtubeApi.refreshToken) {
    throw new Error(
      'Akun YouTube belum terhubung lewat OAuth2. Hubungkan akun di Pengaturan Auto-Post.'
    );
  }

  const oauth2Client = buildOAuth2Client(undefined, workspace?.id);
  oauth2Client.setCredentials({
    refresh_token: config.youtubeApi.refreshToken,
    access_token: config.youtubeApi.accessToken ?? undefined,
    expiry_date: config.youtubeApi.expiryDate ?? undefined,
  });

  oauth2Client.on('tokens', (newTokens) => {
    try {
      saveYouTubeTokens(
        {
          refreshToken: newTokens.refresh_token ?? undefined,
          accessToken: newTokens.access_token ?? undefined,
          expiryDate: newTokens.expiry_date ?? undefined,
        },
        workspace?.id
      );
    } catch {
      // Ignore non-fatal token cache persistence error during upload
    }
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const totalBytes = Math.max(1, fs.statSync(videoPath).size);
  const title = buildYouTubeTitle(item);
  const description = item.autoMetadata.captionParsed.rawText || title;
  const tags = buildYouTubeTags(item);
  const privacyStatus: 'public' | 'unlisted' | 'private' =
    privacy ?? (mode === 'publish' ? 'public' : 'unlisted');

  onProgress({
    step: 'Menyiapkan upload YouTube Data API v3',
    progressPercent: 10,
    log: `Mengunggah ${fileName} (${sizeFormatted}) dengan privasi ${privacyStatus}.`,
    level: 'info',
  });

  const fileStream = fs.createReadStream(videoPath);
  const onAbort = () => {
    fileStream.destroy();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  let videoId: string | null = null;
  try {
    let lastReportedPct = 10;

    const uploadRes = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description,
            tags,
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          mimeType: 'video/mp4',
          body: fileStream,
        },
      },
      {
        signal,
        onUploadProgress: (evt) => {
          const bytesRead = Number(
            (evt as { bytesRead?: number } | undefined)?.bytesRead ?? 0
          );
          if (!Number.isFinite(bytesRead) || bytesRead <= 0) return;

          const ratio = Math.min(1, bytesRead / totalBytes);
          const pct = Math.min(88, Math.max(12, Math.round(12 + ratio * 76)));
          if (pct >= lastReportedPct + 2 || pct === 88) {
            lastReportedPct = pct;
            onProgress({
              step: `Mengunggah video ke YouTube (${Math.round(ratio * 100)}%)`,
              progressPercent: pct,
            });
          }
        },
      }
    );

    videoId = uploadRes.data.id ?? null;
  } finally {
    signal.removeEventListener('abort', onAbort);
    fileStream.destroy();
  }

  if (!videoId) {
    throw new Error(
      'YouTube API menyelesaikan upload tetapi tidak mengembalikan ID video.'
    );
  }

  const publishedUrl = `https://youtube.com/shorts/${videoId}`;

  onProgress({
    step: 'Video terunggah ke YouTube',
    progressPercent: 90,
    log: `Video berhasil terunggah ke YouTube (ID: ${videoId}).`,
    level: 'success',
  });

  const coverAsset = item.autoMetadata.assets.cover;
  if (
    coverAsset.exists &&
    coverAsset.absolutePath &&
    fs.existsSync(coverAsset.absolutePath) &&
    !signal.aborted
  ) {
    onProgress({
      step: 'Mengunggah thumbnail cover',
      progressPercent: 94,
      log: `Mencoba mengatur thumbnail cover (${coverAsset.fileName ?? 'cover'}).`,
      level: 'info',
    });

    const coverStream = fs.createReadStream(coverAsset.absolutePath);
    try {
      await youtube.thumbnails.set(
        {
          videoId,
          media: {
            body: coverStream,
          },
        },
        { signal }
      );
      onProgress({
        step: 'Thumbnail cover terpasang',
        progressPercent: 98,
        log: 'Thumbnail cover custom berhasil dipasang di YouTube.',
        level: 'success',
      });
    } catch (thumbErr) {
      const msg =
        thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
      onProgress({
        step: 'Thumbnail dilewati',
        progressPercent: 96,
        log: `Video tetap berhasil diunggah, namun thumbnail custom dilewati (channel mungkin belum terverifikasi): ${msg}`,
        level: 'warning',
      });
    } finally {
      coverStream.destroy();
    }
  }

  const isCompleted = mode === 'publish' || privacyStatus === 'public';
  return {
    status: isCompleted ? 'completed' : 'awaiting_review',
    publishedUrl,
    summary: isCompleted
      ? `Berhasil publish ke YouTube Shorts (${privacyStatus}): ${publishedUrl}`
      : `Berhasil upload ke YouTube Shorts (${privacyStatus}) untuk review: ${publishedUrl}`,
  };
}
