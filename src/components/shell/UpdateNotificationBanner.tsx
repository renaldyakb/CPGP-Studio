import { useEffect, useState } from 'react';
import { ArrowUpRight, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface GitHubUpdateStatus {
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

const DISMISS_STORAGE_KEY = 'cpgp-dismissed-update-version';

export function useUpdateChecker(): {
  updateInfo: GitHubUpdateStatus | null;
  dismissed: boolean;
  dismissUpdate: () => void;
  recheckUpdate: () => Promise<void>;
} {
  const [updateInfo, setUpdateInfo] = useState<GitHubUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  const fetchStatus = async (force = false) => {
    try {
      const res = await fetch(
        `/api/system/version${force ? '?refresh=true' : ''}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as GitHubUpdateStatus;
      setUpdateInfo(data);
      if (data.latestVersion) {
        try {
          const prevDismissed = window.localStorage.getItem(DISMISS_STORAGE_KEY);
          if (prevDismissed === data.latestVersion && !force) {
            setDismissed(true);
          } else if (force) {
            setDismissed(false);
          }
        } catch {
          // ignore storage errors
        }
      }
    } catch {
      // silent fallback when offline
    }
  };

  useEffect(() => {
    void fetchStatus(false);
  }, []);

  const dismissUpdate = () => {
    setDismissed(true);
    if (updateInfo?.latestVersion) {
      try {
        window.localStorage.setItem(
          DISMISS_STORAGE_KEY,
          updateInfo.latestVersion
        );
      } catch {
        // ignore storage errors
      }
    }
  };

  return {
    updateInfo,
    dismissed,
    dismissUpdate,
    recheckUpdate: () => fetchStatus(true),
  };
}

export function UpdateNotificationBanner({
  updateInfo,
  dismissed,
  onDismiss,
}: {
  updateInfo: GitHubUpdateStatus | null;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (!updateInfo || !updateInfo.hasUpdate || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-[#7f1d1d]/30 bg-cpgp-gradient px-3 py-2 text-xs text-white sm:px-5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <Badge
          variant="outline"
          size="xs"
          className="border-white/30 bg-white/15 font-mono text-white"
        >
          v{updateInfo.latestVersion}
        </Badge>
        <span className="font-medium">
          Pembaruan CPGP Studio tersedia (versi Anda sekarang{' '}
          <code className="font-mono">v{updateInfo.currentVersion}</code>).
          Segera update untuk mendapatkan fitur dan perbaikan terbaru.
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <a
          href={updateInfo.releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/30 bg-white/15 px-2.5 text-[11px] font-semibold text-white transition hover:bg-white/25"
        >
          <span>Unduh Rilis Terbaru</span>
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          aria-label="Tutup notifikasi pembaruan"
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
