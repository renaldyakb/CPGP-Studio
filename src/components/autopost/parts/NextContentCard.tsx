import { useState } from 'react';
import {
  Droplets,
  Ellipsis,
  Eye,
  FilePenLine,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/input';
import type { AutoPostMode } from '@/types/autopost';
import type { ContentPlannerItem, PlatformKey } from '@/types/planner';
import type { UseAutoPostDataResult } from '../useAutoPostData';
import {
  countPendingPlatforms,
  pickNextContent,
} from '../useAutoPostData';
import { IconActionButton } from './IconActionButton';
import { PLATFORM_ORDER } from './platformMeta';
import { formatSlotShort } from '@/lib/formatSlot';

export interface NextContentCardProps {
  items: ContentPlannerItem[];
  data: UseAutoPostDataResult;
  selectedId: string;
  onSelectChange: (itemId: string) => void;
  onEditCaption: (item: ContentPlannerItem) => void;
  onOpenWatermark: (item: ContentPlannerItem) => void;
  onOpenContentDetail: (item: ContentPlannerItem) => void;
}

async function copyText(value: string | null | undefined): Promise<void> {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // clipboard unavailable in this context
  }
}

export function NextContentCard({
  items,
  data,
  selectedId,
  onSelectChange,
  onEditCaption,
  onOpenWatermark,
  onOpenContentDetail,
}: NextContentCardProps) {
  const [mode, setMode] = useState<AutoPostMode>(data.settings.defaultMode);

  const selected =
    items.find((item) => item.id === selectedId) ??
    pickNextContent(items) ??
    items[0] ??
    null;

  if (!selected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Konten Berikutnya</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Belum ada konten siap posting. Render watermark dulu di planner.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void data.refresh()}
          >
            Muat ulang
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { assets, captionParsed, readiness } = selected.autoMetadata;
  const hookTitle =
    captionParsed.hookTitle ||
    selected.userProperties.customTitle ||
    selected.folderCode;
  const coverUrl = assets.cover.mediaUrl;
  const hasWmFinal = readiness.hasWmFinal;

  const pendingKeys: PlatformKey[] = PLATFORM_ORDER.filter(
    (key) => selected.userProperties.platforms[key].status !== 'published'
  );
  const pendingCount = countPendingPlatforms(selected);
  const busy = data.busyKey === `trigger:${selected.id}`;
  const canSend = hasWmFinal && pendingKeys.length > 0 && !busy;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4 pb-2">
        <CardTitle>Konten Berikutnya</CardTitle>
        <NativeSelect
          aria-label="Pilih konten"
          className="max-w-[190px]"
          value={selected.id}
          onChange={(event) => onSelectChange(event.target.value)}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.folderCode}{' '}
              {item.autoMetadata.readiness.hasWmFinal ? 'wm Siap' : 'Belum WM'}
            </option>
          ))}
        </NativeSelect>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex gap-3">
          {coverUrl ? (
            <img
              src={coverUrl}
              width={104}
              height={185}
              loading="lazy"
              className="w-[104px] aspect-[9/16] rounded-md border border-border object-cover"
              alt={`Cover ${selected.folderCode}`}
            />
          ) : (
            <div className="flex w-[104px] aspect-[9/16] items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
              Tanpa cover
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">
                {selected.folderCode}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatSlotShort(selected.schedule)}
              </span>
              <Badge variant={hasWmFinal ? 'success' : 'warning'} size="xs">
                {hasWmFinal ? 'WM Siap' : 'Belum WM'}
              </Badge>
            </div>

            <p className="text-sm font-semibold line-clamp-3 text-foreground">
              {hookTitle}
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={hasWmFinal ? 'success' : 'destructive'}
                size="xs"
              >
                WM
              </Badge>
              <Badge
                variant={readiness.hasCover ? 'success' : 'destructive'}
                size="xs"
              >
                Cover
              </Badge>
              <Badge
                variant={readiness.hasCaption ? 'success' : 'destructive'}
                size="xs"
              >
                Caption
              </Badge>
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label="Mode Auto-Post"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
        >
          <Button
            type="button"
            size="xs"
            variant={mode === 'review' ? 'default' : 'outline'}
            aria-pressed={mode === 'review'}
            onClick={() => setMode('review')}
          >
            Tinjau dulu
          </Button>
          <Button
            type="button"
            size="xs"
            variant={mode === 'publish' ? 'default' : 'outline'}
            aria-pressed={mode === 'publish'}
            onClick={() => setMode('publish')}
          >
            Langsung publish
          </Button>
        </div>

        <Button
          variant="editorial"
          size="lg"
          className="w-full"
          disabled={!canSend}
          onClick={() => void data.triggerPost(selected.id, pendingKeys, mode)}
        >
          <Send className="size-3.5" aria-hidden="true" />
          Kirim ke {pendingCount} Platform Berikutnya
        </Button>

        <div className="flex items-center gap-1">
          <IconActionButton
            icon={FilePenLine}
            label="Edit caption.txt"
            onClick={() => onEditCaption(selected)}
          />
          <IconActionButton
            icon={Droplets}
            label="Render watermark"
            onClick={() => onOpenWatermark(selected)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<IconActionButton icon={Ellipsis} label="Aksi lainnya" />}
            />
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={() => onOpenContentDetail(selected)}
              >
                <Eye aria-hidden="true" />
                <span>Buka detail konten</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!captionParsed.rawText}
                onClick={() => void copyText(captionParsed.rawText)}
              >
                <span>Salin caption</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!assets.wmVideo.absolutePath}
                onClick={() => void copyText(assets.wmVideo.absolutePath)}
              >
                <span>Salin path wm_final.mp4</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {!hasWmFinal ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#fcd34d] bg-[#fef3c7] px-2.5 py-2 text-[11px] text-[#92400e] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fcd34d]">
            <span className="min-w-0 leading-relaxed">
              Video ini belum punya wm_final.mp4. Render watermark dulu sebelum
              mengirim.
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onOpenWatermark(selected)}
            >
              Render sekarang
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
