import { useMemo, useState } from 'react';
import { Check, Droplets, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import type { ContentPlannerItem } from '@/types/planner';
import type {
  WatermarkCapabilities,
  WatermarkEncoderMode,
  WatermarkPresetStore,
} from '@/types/watermark';
import type { WatermarkOutputMode } from '@/services/watermarkApi';
import { formatSlotShort } from '@/lib/formatSlot';

export interface RemoteWatermarkTabProps {
  items: ContentPlannerItem[];
  presetStore: WatermarkPresetStore | null;
  capabilities: WatermarkCapabilities | null;
  isStarting: boolean;
  onStartRender: (params: {
    itemIds: string[];
    presetId?: string;
    encoder: WatermarkEncoderMode;
    outputMode: WatermarkOutputMode;
  }) => Promise<void>;
}

export function RemoteWatermarkTab({
  items,
  presetStore,
  capabilities,
  isStarting,
  onStartRender,
}: RemoteWatermarkTabProps) {
  const [filterMode, setFilterMode] = useState<'needs_wm' | 'all'>('needs_wm');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [presetId, setPresetId] = useState<string>(
    () => presetStore?.defaultPresetId ?? presetStore?.presets[0]?.id ?? ''
  );
  const [encoder, setEncoder] = useState<WatermarkEncoderMode>(
    () => presetStore?.defaultEncoder ?? 'auto'
  );
  const [outputMode, setOutputMode] =
    useState<WatermarkOutputMode>('separate_wm_file');

  const renderableItems = useMemo(
    () => items.filter((item) => item.autoMetadata.assets.rawVideo.exists),
    [items]
  );

  const needsWmItems = useMemo(
    () =>
      renderableItems.filter((item) => !item.autoMetadata.readiness.hasWmFinal),
    [renderableItems]
  );

  const visibleItems =
    filterMode === 'needs_wm' ? needsWmItems : renderableItems;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllNeedsWm = () => {
    setFilterMode('needs_wm');
    setSelectedIds(needsWmItems.map((i) => i.id));
  };

  const handleRender = async () => {
    if (selectedIds.length === 0) return;
    await onStartRender({
      itemIds: selectedIds,
      presetId: presetId || presetStore?.defaultPresetId || undefined,
      encoder,
      outputMode,
    });
    setSelectedIds([]);
  };

  return (
    <div className="space-y-3.5">
      {/* Batch config card */}
      <Card>
        <CardContent className="space-y-3 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Pengaturan Render Watermark
            </h2>
            <Badge
              variant={capabilities?.ffmpegAvailable ? 'success' : 'destructive'}
              size="xs"
            >
              {capabilities?.ffmpegAvailable
                ? capabilities.recommendedEncoder.toUpperCase()
                : 'FFmpeg N/A'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor="remote-wm-preset"
                className="block text-xs font-medium text-foreground"
              >
                Preset
              </label>
              <NativeSelect
                id="remote-wm-preset"
                value={presetId || presetStore?.defaultPresetId || ''}
                onChange={(e) => setPresetId(e.target.value)}
                className="min-h-11 w-full text-xs"
              >
                {(presetStore?.presets ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="remote-wm-encoder"
                className="block text-xs font-medium text-foreground"
              >
                Encoder GPU/CPU
              </label>
              <NativeSelect
                id="remote-wm-encoder"
                value={encoder}
                onChange={(e) =>
                  setEncoder(e.target.value as WatermarkEncoderMode)
                }
                className="min-h-11 w-full text-xs"
              >
                <option value="auto">Otomatis (Tercepat)</option>
                {capabilities?.nvencAvailable ? (
                  <option value="nvenc">NVIDIA NVENC</option>
                ) : null}
                {capabilities?.qsvAvailable ? (
                  <option value="qsv">Intel QuickSync</option>
                ) : null}
                {capabilities?.amfAvailable ? (
                  <option value="amf">AMD AMF</option>
                ) : null}
                <option value="x264">CPU x264</option>
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="remote-wm-output"
                className="block text-xs font-medium text-foreground"
              >
                Output
              </label>
              <NativeSelect
                id="remote-wm-output"
                value={outputMode}
                onChange={(e) =>
                  setOutputMode(e.target.value as WatermarkOutputMode)
                }
                className="min-h-11 w-full text-xs"
              >
                <option value="separate_wm_file">Buat wm_final.mp4</option>
                <option value="overwrite_source">Timpa Video Asli</option>
              </NativeSelect>
            </div>
          </div>

          <Button
            type="button"
            variant="editorial"
            disabled={
              isStarting ||
              selectedIds.length === 0 ||
              !capabilities?.ffmpegAvailable
            }
            onClick={() => void handleRender()}
            className="min-h-12 w-full text-sm font-semibold"
          >
            {isStarting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Droplets className="size-4" aria-hidden="true" />
            )}
            <span>
              {selectedIds.length === 0
                ? 'Pilih konten di bawah untuk render'
                : `Render Watermark (${selectedIds.length} Konten)`}
            </span>
          </Button>
        </CardContent>
      </Card>

      {/* Filter & Select All bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Filter daftar watermark"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
        >
          <Button
            type="button"
            size="xs"
            variant={filterMode === 'needs_wm' ? 'default' : 'ghost'}
            aria-pressed={filterMode === 'needs_wm'}
            onClick={() => setFilterMode('needs_wm')}
            className="min-h-10"
          >
            Perlu WM ({needsWmItems.length})
          </Button>
          <Button
            type="button"
            size="xs"
            variant={filterMode === 'all' ? 'default' : 'ghost'}
            aria-pressed={filterMode === 'all'}
            onClick={() => setFilterMode('all')}
            className="min-h-10"
          >
            Semua ({renderableItems.length})
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedIds.length > 0 ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              className="min-h-10"
            >
              Batal ({selectedIds.length})
            </Button>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={needsWmItems.length === 0}
            onClick={handleSelectAllNeedsWm}
            className="min-h-10"
          >
            Pilih Semua Belum WM
          </Button>
        </div>
      </div>

      {/* Item list */}
      {visibleItems.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-xs text-muted-foreground">
            {filterMode === 'needs_wm'
              ? 'Semua video pada workspace ini sudah memiliki watermark.'
              : 'Belum ada video mentah di folder workspace aktif.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const hasWm = item.autoMetadata.readiness.hasWmFinal;
            const title =
              item.autoMetadata.captionParsed.hookTitle ||
              item.userProperties.customTitle ||
              item.folderCode;
            const coverUrl = item.autoMetadata.assets.cover.mediaUrl;

            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggleItem(item.id)}
                className={
                  isSelected
                    ? 'flex w-full cursor-pointer items-center gap-3 rounded-lg border border-[#7F1D1D]/45 bg-[#FCE7EB]/40 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#9F1239]/60 dark:bg-[#4C0519]/30'
                    : 'flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    isSelected
                      ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#7F1D1D] bg-[#7F1D1D] text-white dark:border-[#9F1239] dark:bg-[#9F1239]'
                      : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-input bg-background text-transparent'
                  }
                >
                  <Check className="h-3.5 w-3.5" />
                </span>

                <div className="aspect-[9/16] w-9 shrink-0 overflow-hidden rounded border border-border bg-muted">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={`Cover ${item.folderCode}`}
                      width={36}
                      height={64}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {item.folderCode}
                    </span>
                    <span className="text-[11px] font-medium text-foreground">
                      {item.schedule.displayDate}
                    </span>
                    <Badge variant={hasWm ? 'success' : 'warning'} size="xs">
                      {hasWm ? 'WM Siap' : 'Perlu WM'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatSlotShort(item.schedule)} WIB
                  </p>
                  <p className="line-clamp-1 text-xs font-medium text-foreground">
                    {title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
