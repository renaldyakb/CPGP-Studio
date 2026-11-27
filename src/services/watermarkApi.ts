import { openManagedEventSource } from '../lib/managedEventSource';
import type {
  WatermarkCapabilities,
  WatermarkEncoderMode,
  WatermarkFontOption,
  WatermarkPreset,
  WatermarkPresetStore,
  WatermarkRenderJob,
  WatermarkRenderSpeedMode,
  WatermarkStyleConfig,
} from '../types/watermark';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // Ignore JSON parse errors on non-JSON error responses
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export interface CreateWatermarkPresetInput {
  name: string;
  description?: string;
  config: Partial<WatermarkStyleConfig>;
  isDefault?: boolean;
}

export interface UpdateWatermarkPresetInput {
  name?: string;
  description?: string;
  config?: Partial<WatermarkStyleConfig>;
  isDefault?: boolean;
}

export interface WatermarkPresetMutationResponse {
  ok: boolean;
  preset: WatermarkPreset;
  store: WatermarkPresetStore;
}

export interface DeleteWatermarkPresetResponse {
  ok: boolean;
  deletedId: string;
  store: WatermarkPresetStore;
}

export type WatermarkOutputMode = 'separate_wm_file' | 'overwrite_source';

export interface StartWatermarkRenderInput {
  itemIds: string[];
  config?: Partial<WatermarkStyleConfig>;
  presetId?: string;
  presetName?: string;
  encoder?: WatermarkEncoderMode;
  speedMode?: WatermarkRenderSpeedMode;
  outputMode?: WatermarkOutputMode;
  saveDefaultEncoder?: boolean;
}

export interface SkippedWatermarkItem {
  itemId: string;
  reason: string;
}

export interface StartWatermarkRenderResponse {
  ok: boolean;
  jobs: WatermarkRenderJob[];
  skipped: SkippedWatermarkItem[];
}

export interface CancelWatermarkJobResponse {
  ok: boolean;
  job: WatermarkRenderJob;
}

export type WatermarkSseEvent =
  | {
      type: 'jobs-snapshot';
      jobs: WatermarkRenderJob[];
      timestamp: string;
    }
  | {
      type: 'job-updated';
      job: WatermarkRenderJob;
      jobs: WatermarkRenderJob[];
      timestamp: string;
    };

export const watermarkApi = {
  async getFonts(): Promise<WatermarkFontOption[]> {
    const res = await fetch('/api/watermark/fonts');
    const data = await handleResponse<{ fonts: WatermarkFontOption[] }>(res);
    return data.fonts;
  },

  getFontUrl(fontId: string): string {
    return `/api/watermark/fonts/${encodeURIComponent(fontId)}`;
  },

  async getCapabilities(refresh = false): Promise<WatermarkCapabilities> {
    const query = refresh ? '?refresh=true' : '';
    const res = await fetch(`/api/watermark/capabilities${query}`);
    return handleResponse<WatermarkCapabilities>(res);
  },

  async getPresets(): Promise<WatermarkPresetStore> {
    const res = await fetch('/api/watermark/presets');
    return handleResponse<WatermarkPresetStore>(res);
  },

  async createPreset(
    input: CreateWatermarkPresetInput
  ): Promise<WatermarkPresetMutationResponse> {
    const res = await fetch('/api/watermark/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<WatermarkPresetMutationResponse>(res);
  },

  async updatePreset(
    id: string,
    patch: UpdateWatermarkPresetInput
  ): Promise<WatermarkPresetMutationResponse> {
    const res = await fetch(`/api/watermark/presets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return handleResponse<WatermarkPresetMutationResponse>(res);
  },

  async deletePreset(id: string): Promise<DeleteWatermarkPresetResponse> {
    const res = await fetch(`/api/watermark/presets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<DeleteWatermarkPresetResponse>(res);
  },

  async setDefaultPreset(
    id: string
  ): Promise<WatermarkPresetMutationResponse> {
    const res = await fetch(
      `/api/watermark/presets/${encodeURIComponent(id)}/default`,
      {
        method: 'POST',
      }
    );
    return handleResponse<WatermarkPresetMutationResponse>(res);
  },

  async getJobs(): Promise<WatermarkRenderJob[]> {
    const res = await fetch('/api/watermark/jobs');
    const data = await handleResponse<{ jobs: WatermarkRenderJob[] }>(res);
    return data.jobs;
  },

  async startRender(
    payload: StartWatermarkRenderInput
  ): Promise<StartWatermarkRenderResponse> {
    const res = await fetch('/api/watermark/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<StartWatermarkRenderResponse>(res);
  },

  async cancelJob(jobId: string): Promise<CancelWatermarkJobResponse> {
    const res = await fetch(
      `/api/watermark/jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: 'POST',
      }
    );
    return handleResponse<CancelWatermarkJobResponse>(res);
  },

  subscribeEvents(
    onEvent: (event: WatermarkSseEvent) => void,
    onError?: (err: Event) => void
  ): () => void {
    const managed = openManagedEventSource('/api/watermark/events');
    const { source } = managed;

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as WatermarkSseEvent;
        if (
          parsed &&
          (parsed.type === 'jobs-snapshot' || parsed.type === 'job-updated')
        ) {
          onEvent(parsed);
        }
      } catch {
        // Ignore malformed SSE frames
      }
    };

    if (onError) {
      source.onerror = onError;
    }

    return () => {
      managed.close();
    };
  },
};
