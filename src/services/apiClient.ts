import type {
  ContentPlannerItem,
  PlannerDatabase,
  PlatformKey,
  PlatformUploadStatus,
  UserContentProperties,
} from '../types/planner';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export const plannerApi = {
  async getPlannerData(): Promise<PlannerDatabase> {
    const res = await fetch('/api/planner');
    return handleResponse<PlannerDatabase>(res);
  },

  async triggerScan(): Promise<PlannerDatabase> {
    const res = await fetch('/api/scan', {
      method: 'POST',
    });
    return handleResponse<PlannerDatabase>(res);
  },

  async updateItemProperties(
    itemId: string,
    patch: Partial<UserContentProperties>
  ): Promise<{ item: ContentPlannerItem; database: PlannerDatabase }> {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return handleResponse<{ item: ContentPlannerItem; database: PlannerDatabase }>(res);
  },

  async updatePlatformStatus(
    itemId: string,
    platform: PlatformKey,
    patch: {
      status?: PlatformUploadStatus;
      publishedUrl?: string;
      scheduledTime?: string;
      notes?: string;
    }
  ): Promise<{ item: ContentPlannerItem; database: PlannerDatabase }> {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/platform`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, ...patch }),
    });
    return handleResponse<{ item: ContentPlannerItem; database: PlannerDatabase }>(res);
  },

  async batchUpdatePlatforms(
    itemId: string,
    status: PlatformUploadStatus
  ): Promise<{ item: ContentPlannerItem; database: PlannerDatabase }> {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/platforms-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<{ item: ContentPlannerItem; database: PlannerDatabase }>(res);
  },

  /**
   * Menyimpan perubahan caption langsung ke file fisik `caption.txt` di dalam folder KONTEN
   * sekaligus mengupdate hasil parse (hook, CTA, hashtags) di `planner-data.json`.
   */
  async saveCaptionToFile(
    itemId: string,
    rawText: string
  ): Promise<{ item: ContentPlannerItem; database: PlannerDatabase; savedFilePath?: string }> {
    const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/caption`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, content: rawText }),
    });
    return handleResponse<{
      item: ContentPlannerItem;
      database: PlannerDatabase;
      savedFilePath?: string;
    }>(res);
  },

  async openInExplorer(
    itemIdOrPath: string,
    selectFile: 'wmVideo' | 'rawVideo' | 'cover' | 'caption' | 'folder' | boolean = 'wmVideo'
  ): Promise<{ ok: boolean; targetPath?: string }> {
    const body =
      typeof selectFile === 'boolean' || itemIdOrPath.includes('\\') || itemIdOrPath.includes(':')
        ? { targetPath: itemIdOrPath, path: itemIdOrPath, selectFile: Boolean(selectFile) }
        : { itemId: itemIdOrPath, selectFile };
    const res = await fetch('/api/system/open-explorer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handleResponse<{ ok: boolean; targetPath?: string }>(res);
  },
};
