import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContentPlannerItem, PlannerDatabase } from '@/types/planner';

export interface UsePlannerItemsResult {
  database: PlannerDatabase | null;
  items: ContentPlannerItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Read-only planner feed for routes outside the planner workspace.
 * Keeps itself fresh through the existing planner SSE channel.
 */
export function usePlannerItems(): UsePlannerItemsResult {
  const [database, setDatabase] = useState<PlannerDatabase | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/events');
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            database?: PlannerDatabase;
            reason?: string;
            type?: string;
          };
          if (payload.database) {
            setDatabase(payload.database);
            return;
          }
          const reason = payload.reason ?? '';
          if (reason.startsWith('platform:') || reason.startsWith('item:')) {
            return;
          }
          if (
            payload.type === 'scan_complete' ||
            payload.type === 'file_change' ||
            payload.type === 'planner-updated' ||
            payload.type === 'workspace-switched' ||
            payload.type === 'workspace-activated'
          ) {
            void refresh();
          }
        } catch {
          // ignore heartbeats
        }
      };
    } catch {
      // EventSource unavailable
    }
    return () => {
      source?.close();
    };
  }, [refresh]);

  const items = useMemo<ContentPlannerItem[]>(() => {
    if (!database?.items) return [];
    return Object.values(database.items).sort((a, b) => {
      const byDate = a.schedule.isoDate.localeCompare(b.schedule.isoDate);
      if (byDate !== 0) return byDate;
      return a.folderCode.localeCompare(b.folderCode);
    });
  }, [database]);

  return { database, items, isLoading, refresh };
}