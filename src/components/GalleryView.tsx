import React, { useState, useMemo } from 'react';
import {
  ContentPlannerItem,
  PLATFORMS,
  PlatformKey,
  WorkflowStatus,
} from '../types/planner';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ItemActionsMenu } from '@/components/ItemActionsMenu';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import { formatSlotShort } from '@/lib/formatSlot';

export interface GalleryViewProps {
  items: ContentPlannerItem[];
  onSelectItem: (item: ContentPlannerItem) => void;
  onUpdateStatus?: (item: ContentPlannerItem, newStatus: WorkflowStatus) => void;
  onTogglePlatform: (item: ContentPlannerItem, platformKey: PlatformKey) => void;
  onEditCaption?: (item: ContentPlannerItem) => void;
  onOpenWatermark?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (item: ContentPlannerItem) => void;
  onCopyText?: (text: string, label: string) => void;
  onOpenExplorer?: (targetPath: string, selectFile?: boolean) => void;
  onResetFilters?: () => void;
  onRescan?: () => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  items,
  onSelectItem,
  onUpdateStatus,
  onTogglePlatform: _onTogglePlatform,
  onEditCaption,
  onOpenWatermark,
  onOpenAutoPost,
  onCopyText,
  onOpenExplorer,
  onResetFilters,
  onRescan,
}) => {
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [unmutedId, setUnmutedId] = useState<string | null>(null);

  const handleOpenExplorerSafe = async (
    targetPath: string,
    selectFile = true
  ) => {
    if (onOpenExplorer) {
      onOpenExplorer(targetPath, selectFile);
      return;
    }
    try {
      await fetch('/api/system/open-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, targetPath, selectFile }),
      });
    } catch {
      // ignore explorer errors
    }
  };

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.folderCode.localeCompare(b.folderCode, undefined, { numeric: true })
      ),
    [items]
  );

  if (sortedItems.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Tidak ada video galeri yang cocok dengan filter
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tidak ditemukan item konten 9:16 untuk filter aktif saat ini. Reset
            filter untuk menampilkan seluruh galeri atau jalankan Scan Folder.
          </p>
          <div className="pt-3 flex items-center justify-center gap-2">
            {onResetFilters && (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                Reset Filter
              </Button>
            )}
            {onRescan && (
              <Button variant="secondary" size="sm" onClick={onRescan}>
                Scan Folder
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {sortedItems.map((item) => {
          const { assets, readiness, captionParsed } = item.autoMetadata;
          const { platforms, customTitle } = item.userProperties;
          const isPlaying = activePreviewId === item.id;
          const isUnmuted = unmutedId === item.id;

          const activeVideoAsset = assets.wmVideo.exists
            ? assets.wmVideo
            : assets.rawVideo.exists
            ? assets.rawVideo
            : null;

          const displayTitle =
            customTitle?.trim() ||
            captionParsed.hookTitle?.trim() ||
            `Konten ${item.folderCode}`;

          const publishedCount = PLATFORMS.filter(
            (p) => platforms[p.key]?.status === 'published'
          ).length;

          return (
            <Card key={item.id} className="flex flex-col overflow-hidden">
              {/* 9:16 Vertical Media Canvas */}
              <div
                onMouseEnter={() => {
                  if (activeVideoAsset?.mediaUrl) {
                    setActivePreviewId(item.id);
                  }
                }}
                onMouseLeave={() => {
                  setActivePreviewId((prev) =>
                    prev === item.id ? null : prev
                  );
                  setUnmutedId((prev) => (prev === item.id ? null : prev));
                }}
                className="relative aspect-[9/16] w-full bg-muted overflow-hidden group"
              >
                <button
                  type="button"
                  onClick={() => onSelectItem(item)}
                  aria-label={`Buka detail konten ${item.folderCode}`}
                  className="block h-full w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                >
                  {assets.cover.exists && assets.cover.mediaUrl ? (
                    <img
                      src={assets.cover.mediaUrl}
                      alt={`Cover konten ${item.folderCode}`}
                      width={270}
                      height={480}
                      loading="lazy"
                      className="h-full w-full aspect-[9/16] object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center text-muted-foreground">
                      <ImageIcon
                        className="h-7 w-7 mb-1.5"
                        aria-hidden="true"
                      />
                      <span className="text-xs">Tanpa Cover</span>
                    </div>
                  )}

                  {isPlaying && activeVideoAsset?.mediaUrl && (
                    <video
                      src={activeVideoAsset.mediaUrl}
                      poster={assets.cover.mediaUrl || undefined}
                      width={270}
                      height={480}
                      autoPlay
                      loop
                      playsInline
                      muted={!isUnmuted}
                      className="absolute inset-0 h-full w-full aspect-[9/16] object-cover z-10 bg-black"
                    />
                  )}
                </button>

                {/* Hover / Click Play & Audio Controls */}
                {activeVideoAsset?.mediaUrl && (
                  <div
                    className={`absolute top-2 right-2 z-20 flex items-center gap-1 transition-opacity ${
                      isPlaying
                        ? 'opacity-100'
                        : 'opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
                    }`}
                  >
                    <IconActionButton
                      icon={isPlaying ? Pause : Play}
                      variant="secondary"
                      size="icon-sm"
                      side="left"
                      label={
                        isPlaying
                          ? `Hentikan pratinjau video ${item.folderCode}`
                          : `Putar pratinjau video ${item.folderCode}`
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreviewId((prev) =>
                          prev === item.id ? null : item.id
                        );
                      }}
                    />

                    {isPlaying && (
                      <IconActionButton
                        icon={isUnmuted ? Volume2 : VolumeX}
                        variant="secondary"
                        size="icon-sm"
                        side="left"
                        label={
                          isUnmuted
                            ? `Bisukan audio ${item.folderCode}`
                            : `Aktifkan audio ${item.folderCode}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setUnmutedId((prev) =>
                            prev === item.id ? null : item.id
                          );
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Uncluttered 2-Line Footer */}
              <div className="p-3 space-y-1.5 border-t border-border bg-card">
                {/* Line 1: Folder Code + Slot | WM Badge + Actions Menu */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 min-w-0 truncate">
                    <span className="font-mono text-xs font-semibold text-foreground shrink-0">
                      {item.folderCode}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      · {formatSlotShort(item.schedule)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant={readiness.hasWmFinal ? 'success' : 'warning'}
                      size="xs"
                    >
                      {readiness.hasWmFinal ? 'WM Siap' : 'Belum WM'}
                    </Badge>
                    <ItemActionsMenu
                      item={item}
                      onSelectItem={onSelectItem}
                      onEditCaption={onEditCaption}
                      onOpenWatermark={onOpenWatermark}
                      onOpenAutoPost={onOpenAutoPost}
                      onUpdateStatus={onUpdateStatus}
                      onCopyText={onCopyText}
                      onOpenExplorer={handleOpenExplorerSafe}
                    />
                  </div>
                </div>

                {/* Line 2: 1-Line Hook Title + Subtle Platform Count */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="flex-1 min-w-0 text-left text-xs font-medium text-foreground truncate hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    title={displayTitle}
                  >
                    {displayTitle}
                  </button>
                  <span
                    className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0"
                    title={`${publishedCount} dari 4 platform sudah tayang`}
                  >
                    {publishedCount}/4
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
    </div>
  );
};

export default GalleryView;
