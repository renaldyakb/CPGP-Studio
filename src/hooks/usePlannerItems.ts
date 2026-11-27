import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openManagedEventSource } from '@/lib/managedEventSource';
import type { ContentPlannerItem, PlannerDatabase } from '@/types/planner';

export interface UsePlannerItemsOptions {
  enabled?: boolean;
  onWorkspaceSwitch?: () => void;
}

export interface UsePlannerItemsResult {
  database: PlannerDatabase | null;
  items: ContentPlannerItem[];
  isLoading: boolean;
  isLiveSyncActive: boolean;
  refresh: () => Promise<void>;
}

/**
 * Read-only planner feed for routes outside the planner workspace.
 * Keeps itself fresh through the existing planner SSE channel.
 */
export function usePlannerItems(
  options?: UsePlannerItemsOptions
): UsePlannerItemsResult {
  const enabled = options?.enabled ?? true;
  const [database, setDatabase] = useState<PlannerDatabase | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLiveSyncActive, setIsLiveSyncActive] = useState<boolean>(false);

  const onWorkspaceSwitchRef = useRef(options?.onWorkspaceSwitch);
  useEffect(() => {
    onWorkspaceSwitchRef.current = options?.onWorkspaceSwitch;
  }, [options?.onWorkspaceSwitch]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/planner');
      if (!res.ok) return;
      const payload = (await res.json()) as PlannerDatabase;
      setDatabase(payload);
    } catch {
      // keep last good snapshot
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      setIsLiveSyncActive(false);
      return;
    }

    let managed: { source: EventSource; close: () => void } | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 300);
    };

    try {
      managed = openManagedEventSource('/api/events');
      const { source } = managed;
      source.onopen = () => setIsLiveSyncActive(true);
      source.onerror = () => setIsLiveSyncActive(false);
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            database?: PlannerDatabase;
            reason?: string;
            type?: string;
          };
          const isWorkspaceSwitch =
            payload.type === 'workspace-switched' ||
            payload.type === 'workspace-activated';
          if (payload.database) {
            setDatabase(payload.database);
            if (isWorkspaceSwitch) {
              onWorkspaceSwitchRef.current?.();
            }
            return;
          }
          const reason = payload.reason ?? '';
          if (reason.startsWith('platform:') || reason.startsWith('item:')) {
            return;
          }
          if (isWorkspaceSwitch) {
            onWorkspaceSwitchRef.current?.();
            scheduleRefresh();
            return;
          }
          if (
            payload.type === 'scan_complete' ||
            payload.type === 'file_change' ||
            payload.type === 'planner-updated'
          ) {
            scheduleRefresh();
          }
        } catch {
          // ignore heartbeats
        }
      };
    } catch {
      setIsLiveSyncActive(false);
    }
    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      managed?.close();
    };
  }, [enabled, refresh]);

  const items = useMemo<ContentPlannerItem[]>(() => {
    if (!database?.items) return [];
    return Object.values(database.items).sort((a, b) => {
      const byDate = a.schedule.isoDate.localeCompare(b.schedule.isoDate);
      if (byDate !== 0) return byDate;
      return a.folderCode.localeCompare(b.folderCode);
    });
  }, [database]);

  return useMemo(
    () => ({ database, items, isLoading, isLiveSyncActive, refresh }),
    [database, items, isLoading, isLiveSyncActive, refresh]
  );
}