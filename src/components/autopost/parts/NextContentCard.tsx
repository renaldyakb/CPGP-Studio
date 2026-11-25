import {
  Bot,
  CalendarClock,
  Droplets,
  Ellipsis,
  Eye,
  FilePenLine,
  RotateCcw,
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
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiContentDisclosureMode, AutoPostMode } from '@/types/autopost';
import type { ContentPlannerItem, PlatformKey } from '@/types/planner';
import type { UseAutoPostDataResult } from '../useAutoPostData';
import { pickNextContent } from '../useAutoPostData';
import { IconActionButton } from './IconActionButton';
import { PLATFORM_ORDER } from './platformMeta';
import { formatSlotShort } from '@/lib/formatSlot';

export interface NextContentCardProps {
  items: ContentPlannerItem[];
  data: UseAutoPostDataResult;
  selectedId: string;
  mode: AutoPostMode;
  onModeChange: (mode: AutoPostMode) => void;
  aiDisclosure: AiContentDisclosureMode;
  onAiDisclosureChange: (next: AiContentDisclosureMode) => void;
  scheduleEnabled: boolean;
  scheduleDate: string;
  scheduleTime: string;
  onScheduleEnabledChange: (enabled: boolean) => void;
  onScheduleDateChange: (dateIso: string) => void;
  onScheduleTimeChange: (timeHhMm: string) => void;
  onResetScheduleToSlot: () => void;
  onTriggerRequest: (
    item: ContentPlannerItem,
    platforms: PlatformKey[],
    mode: AutoPostMode,
    scheduledAt: string | null
  ) => void;
  onSelectChange: (itemId: string) => void;
  onEditCaption: (item: ContentPlannerItem) => void;
  onOpenWatermark: (item: ContentPlannerItem) => void;
  onOpenContentDetail: (item: ContentPlannerItem) => void;
}

function parseIsoDateLocal(iso: string): Date | undefined {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIsoDateLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatItemOption(item: ContentPlannerItem): string {
  return `${item.folderCode} · ${item.autoMetadata.readiness.hasWmFinal ? 'Siap' : 'No WM'}`;
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
  mode,
  onModeChange,
  aiDisclosure,
  onAiDisclosureChange,
  scheduleEnabled,
  scheduleDate,
  scheduleTime,
  onScheduleEnabledChange,
  onScheduleDateChange,
  onScheduleTimeChange,
  onResetScheduleToSlot,
  onTriggerRequest,
  onSelectChange,
  onEditCaption,
  onOpenWatermark,
  onOpenContentDetail,
}: NextContentCardProps) {
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
          <p className="max-w-xs text-xs font-light leading-relaxed text-muted-foreground/75">
            Belum ada konten siap posting.
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

  const pendingKeys: PlatformKey[] = PLATFORM_ORDER.filter((key) => {
    const st = selected.userProperties.platforms[key].status;
    if (scheduleEnabled) {
      return st !== 'published' && st !== 'scheduled';
    }
    return st !== 'published';
  });
  const busy = data.busyKey === `trigger:${selected.id}`;
  const scheduledAtPayload =
    scheduleEnabled && scheduleDate && scheduleTime
      ? `${scheduleDate}T${scheduleTime}`
      : null;

  const scheduleDateObj = parseIsoDateLocal(scheduleDate);
  const scheduleTimestampMs = (() => {
    if (!scheduleEnabled || !scheduleDateObj || !scheduleTime) return null;
    const tm = scheduleTime.match(/^(\d{2}):(\d{2})$/);
    if (!tm) return null;
    return new Date(
      scheduleDateObj.getFullYear(),
      scheduleDateObj.getMonth(),
      scheduleDateObj.getDate(),
      Number(tm[1]),
      Number(tm[2])
    ).getTime();
  })();
  const isScheduleTooSoon =
    scheduleEnabled &&
    scheduleTimestampMs !== null &&
    scheduleTimestampMs < Date.now() + 20 * 60 * 1000;

  const canSend =
    hasWmFinal &&
    pendingKeys.length > 0 &&
    !busy &&
    (!scheduleEnabled || Boolean(scheduledAtPayload));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4 pb-2">
        <CardTitle>Konten Berikutnya</CardTitle>
        <Select
          value={selected.id}
          onValueChange={(next) => {
            if (typeof next === 'string' && next.length > 0) {
              onSelectChange(next);
            }
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Pilih konten"
            className="w-[152px] font-mono text-xs"
          >
            <SelectValue>{formatItemOption(selected)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {items.map((item) => (
              <SelectItem
                key={item.id}
                value={item.id}
                className="font-mono text-xs"
              >
                {formatItemOption(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <div className="flex w-[104px] aspect-[9/16] items-center justify-center rounded-md border border-border bg-muted text-[10px] font-light text-muted-foreground/75">
              Tanpa cover
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">
                {selected.folderCode}
              </span>
              <span className="text-[11px] font-light text-muted-foreground/75">
                {formatSlotShort(selected.schedule)}
              </span>
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Waktu Tayang"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
          >
            <Button
              type="button"
              size="xs"
              variant={!scheduleEnabled ? 'default' : 'ghost'}
              aria-pressed={!scheduleEnabled}
              onClick={() => onScheduleEnabledChange(false)}
            >
              Sekarang
            </Button>
            <Button
              type="button"
              size="xs"
              variant={scheduleEnabled ? 'default' : 'ghost'}
              aria-pressed={scheduleEnabled}
              onClick={() => onScheduleEnabledChange(true)}
            >
              Jadwalkan
            </Button>
          </div>

          <div
            role="group"
            aria-label="Mode Auto-Post"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
          >
            <Button
              type="button"
              size="xs"
              variant={mode === 'review' ? 'default' : 'ghost'}
              aria-pressed={mode === 'review'}
              onClick={() => onModeChange('review')}
            >
              Tinjau
            </Button>
            <Button
              type="button"
              size="xs"
              variant={mode === 'publish' ? 'default' : 'ghost'}
              aria-pressed={mode === 'publish'}
              onClick={() => onModeChange('publish')}
            >
              Langsung
            </Button>
          </div>

          <div
            role="group"
            aria-label="Label Konten AI"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
          >
            <span className="inline-flex items-center gap-1 px-1.5 text-[11px] font-light text-muted-foreground">
              <Bot className="size-3" aria-hidden="true" />
              AI
            </span>
            <Button
              type="button"
              size="xs"
              variant={aiDisclosure === 'ask' ? 'default' : 'ghost'}
              aria-pressed={aiDisclosure === 'ask'}
              onClick={() => onAiDisclosureChange('ask')}
            >
              Tanya
            </Button>
            <Button
              type="button"
              size="xs"
              variant={aiDisclosure === 'always_ai' ? 'default' : 'ghost'}
              aria-pressed={aiDisclosure === 'always_ai'}
              onClick={() => onAiDisclosureChange('always_ai')}
            >
              Ya
            </Button>
            <Button
              type="button"
              size="xs"
              variant={aiDisclosure === 'always_non_ai' ? 'default' : 'ghost'}
              aria-pressed={aiDisclosure === 'always_non_ai'}
              onClick={() => onAiDisclosureChange('always_non_ai')}
            >
              Tidak
            </Button>
          </div>
        </div>

        {scheduleEnabled ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_118px_auto]">
              <DatePicker
                value={scheduleDateObj}
                onChange={(nextDate) => {
                  if (nextDate) {
                    onScheduleDateChange(toIsoDateLocal(nextDate));
                  }
                }}
                placeholder="Pilih tanggal"
                ariaLabel="Tanggal jadwal tayang"
              />
              <Input
                type="time"
                step={300}
                value={scheduleTime}
                aria-label="Jam jadwal tayang"
                onChange={(e) => onScheduleTimeChange(e.target.value)}
                className="min-h-9 font-mono text-xs"
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant={scheduleTime === '11:30' ? 'default' : 'outline'}
                  onClick={() => onScheduleTimeChange('11:30')}
                >
                  11:30
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={scheduleTime === '19:30' ? 'default' : 'outline'}
                  onClick={() => onScheduleTimeChange('19:30')}
                >
                  19:30
                </Button>
                <IconActionButton
                  icon={RotateCcw}
                  label="Reset ke jadwal slot folder"
                  variant="outline"
                  onClick={onResetScheduleToSlot}
                />
              </div>
            </div>
            {isScheduleTooSoon ? (
              <p className="text-[11px] font-medium text-[#b45309] dark:text-[#fcd34d]">
                Waktu terlalu dekat. Meta &amp; TikTok mensyaratkan minimal 20
                menit dari sekarang.
              </p>
            ) : (
              <p className="text-[11px] font-light text-muted-foreground/75">
                Override waktu aktif untuk semua tombol platform. YouTube
                kelipatan 15m, TikTok 5m, Meta presisi menit.
              </p>
            )}
          </div>
        ) : null}

        <Button
          variant="editorial"
          size="lg"
          className="w-full"
          disabled={!canSend}
          onClick={() =>
            onTriggerRequest(
              selected,
              pendingKeys,
              mode,
              scheduledAtPayload
            )
          }
        >
          {scheduleEnabled ? (
            <CalendarClock className="size-3.5" aria-hidden="true" />
          ) : (
            <Send className="size-3.5" aria-hidden="true" />
          )}
          {scheduleEnabled
            ? mode === 'publish'
              ? `Jadwalkan (${pendingKeys.length} Platform)`
              : `Tinjau Jadwal (${pendingKeys.length} Platform)`
            : mode === 'publish'
              ? `Publish (${pendingKeys.length} Platform)`
              : `Tinjau (${pendingKeys.length} Platform)`}
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
          <div className="flex items-center justify-between gap-2 rounded-md border border-[#fcd34d] bg-[#fef3c7] px-2.5 py-1.5 text-[11px] text-[#92400e] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fcd34d]">
            <span className="truncate font-light">Belum ada video final.</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onOpenWatermark(selected)}
            >
              Render
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
