import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceMetadata } from '../../shared/types/workspace.ts';
import type { ContentPlannerItem } from '../../src/types/planner.ts';
import { getActiveWorkspace } from '../workspaces/registry.ts';

export interface ResolvedUploadVideo {
  absolutePath: string;
  fileName: string;
  sizeFormatted: string;
}

export function resolveUploadVideoForItem(
  item: ContentPlannerItem,
  workspace?: WorkspaceMetadata
): ResolvedUploadVideo | null {
  const effectiveWorkspace = workspace ?? getActiveWorkspace();
  const wmVideo = item.autoMetadata.assets.wmVideo;

  if (
    wmVideo.exists &&
    wmVideo.absolutePath &&
    fs.existsSync(wmVideo.absolutePath)
  ) {
    return {
      absolutePath: wmVideo.absolutePath,
      fileName: wmVideo.fileName ?? path.basename(wmVideo.absolutePath),
      sizeFormatted: wmVideo.sizeFormatted,
    };
  }

  const policy = effectiveWorkspace?.rules?.watermarkPolicy;
  const allowRawFallback =
    policy === 'direct_or_wm' || policy === 'overwrite_source';
  const rawVideo = item.autoMetadata.assets.rawVideo;

  if (
    allowRawFallback &&
    rawVideo.exists &&
    rawVideo.absolutePath &&
    fs.existsSync(rawVideo.absolutePath)
  ) {
    return {
      absolutePath: rawVideo.absolutePath,
      fileName: rawVideo.fileName ?? path.basename(rawVideo.absolutePath),
      sizeFormatted: rawVideo.sizeFormatted,
    };
  }

  return null;
}
