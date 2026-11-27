import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  Copy,
  Droplets,
  Ellipsis,
  Eye,
  FilePenLine,
  RotateCcw,
  Send,
  X,
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
import { formatSlotShort } from '@/lib/formatSlot';

export interface NextContentCardProps {
  items: ContentPlannerItem[];
  data: UseAutoPostDataResult;
  selectedId: string;
  selectedPlatforms: PlatformKey[];
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
  return `${item.folderCode} · ${item.autoMetadata.readiness.hasWmFinal ? 'WM Siap' : 'Perlu WM'}`;
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
  selectedPlatforms,
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
          <CardTitle>Konten Siap Kirim</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Belum ada konten di folder workspace aktif. Tambahkan konten atau
            muat ulang untuk memindai folder.
          </p>
          <Button
            type="button"
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

  const hasIgMetaApiScheduleConflict =
    scheduleEnabled &&
    selectedPlatforms.includes('ig_reels') &&
    data.capabilities.metaIgApiReady;

  const targetCount = selectedPlatforms.length;
  const canSend =
    hasWmFinal &&
    targetCount > 0 &&
    !busy &&
    (!scheduleEnabled || Boolean(scheduledAtPayload));

  const primaryCtaLabel = (() => {
    if (targetCount === 0) return 'Pilih minimal 1 platform di kanan';
    if (scheduleEnabled) {
      return mode === 'publish'
        ? `Jadwalkan ke ${targetCount} Platform`
        : `Tinjau Jadwal (${targetCount} Platform)`;
    }
    return mode === 'publish'
      ? `Publish Sekarang (${targetCount} Platform)`
      : `Tinjau di Studio (${targetCount} Platform)`;
  })();

  return (
    <Card className="overflow-hidden">
      <div
        className="h-1 w-full bg-[image:var(--gradient-burgundy)]"
        aria-hidden="true"
      />
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 p-4 pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm">Konten Aktif</CardTitle>
          <p className="text-xs text-muted-foreground">
            Atur waktu, mode eksekusi, lalu kirim ke platform yang dicentang.
          </p>
        </div>
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
            aria-label="Pilih konten untuk Auto-Post"
            className="min-h-10 w-full font-mono text-xs sm:min-h-9 sm:w-[210px]"
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

      <CardContent className="space-y-4 p-4 pt-0">
        {/* Selected content preview */}
        <div className="flex gap-3.5 rounded-lg border border-border bg-muted/40 p-3">
          {coverUrl ? (
            <img
              src={coverUrl}
              width={88}
              height={156}
              loading="eager"
              decoding="async"
              className="aspect-[9/16] w-[88px] shrink-0 rounded-md border border-border object-cover"
              alt={`Cover konten ${selected.folderCode}`}
            />
          ) : (
            <div className="flex aspect-[9/16] w-[88px] shrink-0 items-center justify-center rounded-md border border-border bg-card px-2 text-center text-xs text-muted-foreground">
              Tanpa cover
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {selected.folderCode}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatSlotShort(selected.schedule)}
                </span>
              </div>

              <p className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">
                {hookTitle}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Badge
                  variant={hasWmFinal ? 'success' : 'destructive'}
                  size="xs"
                >
                  {hasWmFinal ? (
                    <Check className="mr-0.5 size-3" aria-hidden="true" />
                  ) : (
                    <X className="mr-0.5 size-3" aria-hidden="true" />
                  )}
                  Video WM
                </Badge>
                <Badge
                  variant={readiness.hasCover ? 'success' : 'destructive'}
                  size="xs"
                >
                  {readiness.hasCover ? (
                    <Check className="mr-0.5 size-3" aria-hidden="true" />
                  ) : (
                    <X className="mr-0.5 size-3" aria-hidden="true" />
                  )}
                  Cover
                </Badge>
                <Badge
                  variant={readiness.hasCaption ? 'success' : 'destructive'}
                  size="xs"
                >
                  {readiness.hasCaption ? (
                    <Check className="mr-0.5 size-3" aria-hidden="true" />
                  ) : (
                    <X className="mr-0.5 size-3" aria-hidden="true" />
                  )}
                  Caption
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onEditCaption(selected)}
                className="min-h-9 sm:min-h-7"
              >
                <FilePenLine className="size-3" aria-hidden="true" />
                <span>Caption</span>
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onOpenWatermark(selected)}
                className="min-h-9 sm:min-h-7"
              >
                <Droplets className="size-3" aria-hidden="true" />
                <span>Watermark</span>
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => onOpenContentDetail(selected)}
                className="min-h-9 sm:min-h-7"
              >
                <Eye className="size-3" aria-hidden="true" />
                <span>Detail</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      aria-label="Aksi salin aset"
                      className="min-h-9 min-w-9 sm:min-h-7 sm:min-w-7"
                    />
                  }
                >
                  <Ellipsis className="size-3.5" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    disabled={!captionParsed.rawText}
                    onClick={() => void copyText(captionParsed.rawText)}
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span>Salin teks caption</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!assets.wmVideo.absolutePath}
                    onClick={() => void copyText(assets.wmVideo.absolutePath)}
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span>Salin path wm_final.mp4</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Missing watermark alert */}
        {!hasWmFinal ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#fcd34d] bg-[#fef3c7] px-3 py-2 text-xs text-[#92400e] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fcd34d]"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              Video watermark (wm_final.mp4) belum tersedia untuk slot ini.
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onOpenWatermark(selected)}
              className="min-h-9 bg-card text-foreground sm:min-h-7"
            >
              Render Watermark
            </Button>
          </div>
        ) : null}

        {/* Structured, scannable 3-setting configuration panel */}
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {/* 1. Timing */}
          <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-0.5">
              <span className="block text-xs font-medium text-foreground">
                Waktu Tayang
              </span>
              <span className="block text-xs text-muted-foreground">
                {scheduleEnabled
                  ? 'Mengatur tanggal dan jam tayang sesuai jadwal di bawah.'
                  : 'Dikirim untuk tayang langsung tanpa penjadwalan.'}
              </span>
            </div>
            <div
              role="group"
              aria-label="Pilih waktu tayang"
              className="inline-flex w-fit shrink-0 flex-wrap items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <Button
                type="button"
                size="xs"
                variant={!scheduleEnabled ? 'default' : 'ghost'}
                aria-pressed={!scheduleEnabled}
                onClick={() => onScheduleEnabledChange(false)}
                className="min-h-9 sm:min-h-7"
              >
                Sekarang
              </Button>
              <Button
                type="button"
                size="xs"
                variant={scheduleEnabled ? 'default' : 'ghost'}
                aria-pressed={scheduleEnabled}
                onClick={() => onScheduleEnabledChange(true)}
                className="min-h-9 sm:min-h-7"
              >
                Jadwalkan
              </Button>
            </div>
          </div>

          {/* Schedule controls when enabled */}
          {scheduleEnabled ? (
            <div className="space-y-2.5 bg-muted/40 p-3">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_120px_auto]">
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
                  className="min-h-10 bg-card font-mono text-xs sm:min-h-9"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={scheduleTime === '11:30' ? 'default' : 'outline'}
                    onClick={() => onScheduleTimeChange('11:30')}
                    className="min-h-10 flex-1 lg:min-h-9 lg:flex-none"
                  >
                    11:30
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={scheduleTime === '19:30' ? 'default' : 'outline'}
                    onClick={() => onScheduleTimeChange('19:30')}
                    className="min-h-10 flex-1 lg:min-h-9 lg:flex-none"
                  >
                    19:30
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    aria-label="Reset ke jadwal slot folder"
                    title="Reset ke jadwal slot folder"
                    onClick={onResetScheduleToSlot}
                    className="min-h-10 min-w-10 lg:min-h-9 lg:min-w-9"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {isScheduleTooSoon ? (
                <p
                  role="alert"
                  className="flex items-center gap-1.5 text-xs font-medium text-[#92400e] dark:text-[#fcd34d]"
                >
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                  Waktu terlalu dekat. Meta dan TikTok mensyaratkan minimal 20
                  menit dari sekarang.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Berlaku untuk seluruh platform terpilih (YouTube kelipatan
                  15m, TikTok 5m, Meta presisi menit).
                </p>
              )}

              {hasIgMetaApiScheduleConflict ? (
                <p className="text-xs font-medium text-[#92400e] dark:text-[#fcd34d]">
                  Catatan: Instagram via Meta Graph API hanya mendukung Upload
                  Sekarang. Hapus centang Instagram atau gunakan mode Browser
                  untuk menjadwalkan Instagram.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* 2. Execution Mode */}
          <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-0.5">
              <span className="block text-xs font-medium text-foreground">
                Mode Eksekusi
              </span>
              <span className="block text-xs text-muted-foreground">
                {mode === 'review'
                  ? 'Isi video, cover, dan caption lalu berhenti agar Anda cek sebelum klik akhir.'
                  : 'Otomatis menekan tombol Publish atau Jadwalkan hingga selesai.'}
              </span>
            </div>
            <div
              role="group"
              aria-label="Pilih mode eksekusi"
              className="inline-flex w-fit shrink-0 flex-wrap items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <Button
                type="button"
                size="xs"
                variant={mode === 'review' ? 'default' : 'ghost'}
                aria-pressed={mode === 'review'}
                onClick={() => onModeChange('review')}
                className="min-h-9 sm:min-h-7"
              >
                Tinjau Dulu
              </Button>
              <Button
                type="button"
                size="xs"
                variant={mode === 'publish' ? 'default' : 'ghost'}
                aria-pressed={mode === 'publish'}
                onClick={() => onModeChange('publish')}
                className="min-h-9 sm:min-h-7"
              >
                Langsung
              </Button>
            </div>
          </div>

          {/* 3. AI Disclosure */}
          <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-0.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Bot className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Label Konten AI
              </span>
              <span className="block text-xs text-muted-foreground">
                Menentukan opsi Altered Content (YouTube) dan AI-generated
                (TikTok).
              </span>
            </div>
            <div
              role="group"
              aria-label="Pilih label konten AI"
              className="inline-flex w-fit shrink-0 flex-wrap items-center gap-1 rounded-md border border-border bg-muted p-0.5"
            >
              <Button
                type="button"
                size="xs"
                variant={aiDisclosure === 'ask' ? 'default' : 'ghost'}
                aria-pressed={aiDisclosure === 'ask'}
                onClick={() => onAiDisclosureChange('ask')}
                className="min-h-9 sm:min-h-7"
              >
                Tanya
              </Button>
              <Button
                type="button"
                size="xs"
                variant={aiDisclosure === 'always_ai' ? 'default' : 'ghost'}
                aria-pressed={aiDisclosure === 'always_ai'}
                onClick={() => onAiDisclosureChange('always_ai')}
                className="min-h-9 sm:min-h-7"
              >
                Ya (AI)
              </Button>
              <Button
                type="button"
                size="xs"
                variant={aiDisclosure === 'always_non_ai' ? 'default' : 'ghost'}
                aria-pressed={aiDisclosure === 'always_non_ai'}
                onClick={() => onAiDisclosureChange('always_non_ai')}
                className="min-h-9 sm:min-h-7"
              >
                Bukan AI
              </Button>
            </div>
          </div>
        </div>

        {/* Single primary focal CTA */}
        <Button
          type="button"
          variant="editorial"
          size="lg"
          className="min-h-11 w-full text-sm font-semibold"
          disabled={!canSend}
          onClick={() =>
            onTriggerRequest(
              selected,
              selectedPlatforms,
              mode,
              scheduledAtPayload
            )
          }
        >
          {scheduleEnabled ? (
            <CalendarClock className="size-4" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          <span>{primaryCtaLabel}</span>
        </Button>
      </CardContent>
    </Card>
  );
}
