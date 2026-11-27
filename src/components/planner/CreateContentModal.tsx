import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  AlertCircle,
  CalendarPlus,
  Check,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import type {
  BatchGenerateSlotsInput,
  CreateContentSlotInput,
  NextSuggestedSlot,
  TimeSlotDefinition,
  WorkspaceMetadata,
} from '@/types/workspace';
import type { ContentPlannerItem, PlannerDatabase } from '@/types/planner';
import { DEFAULT_TIME_SLOTS } from '../../../shared/rulePresets';
import { composeCaptionFromParts } from '../../../shared/captionParser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DatePicker,
  DateRangePicker,
  formatYearMonthFolder,
  monthNameToIndex,
} from '@/components/ui/date-picker';
import {
  Input,
  NativeSelect,
  Separator,
  Textarea,
} from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type CreateContentTab = 'single' | 'batch';

export interface CreateContentModalProps {
  isOpen: boolean;
  initialTab?: CreateContentTab;
  activeWorkspace: WorkspaceMetadata | null;
  contentRootPath: string;
  availableMonths: string[];
  onClose: () => void;
  onCreatedSingle: (payload: {
    item: ContentPlannerItem;
    database: PlannerDatabase;
  }) => void;
  onCreatedBatch: (payload: {
    createdCodes: string[];
    skippedCodes: string[];
    database: PlannerDatabase;
  }) => void;
  onToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

function buildDateFromFolder(
  monthName: string,
  dayOfMonth: number,
  fallbackYear: number
): Date {
  const yearMatch = monthName.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : fallbackYear;
  const idx = monthNameToIndex(monthName);
  const monthIndex = idx >= 0 ? idx : new Date().getMonth();
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.max(1, Math.min(maxDay, dayOfMonth || 1));
  return new Date(year, monthIndex, safeDay);
}

function buildDefaultRangeFromDate(start: Date): DateRange {
  const year = start.getFullYear();
  const month = start.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDay = Math.min(lastDay, start.getDate() + 6);
  return {
    from: start,
    to: new Date(year, month, endDay),
  };
}

export const CreateContentModal: React.FC<CreateContentModalProps> = ({
  isOpen,
  initialTab = 'single',
  activeWorkspace,
  contentRootPath,
  availableMonths,
  onClose,
  onCreatedSingle,
  onCreatedBatch,
  onToast,
}) => {
  const defaultYear = activeWorkspace?.defaultYear || new Date().getFullYear();
  const [activeTab, setActiveTab] = useState<CreateContentTab>(initialTab);

  // Single slot creation state
  const [suggestedSlot, setSuggestedSlot] = useState<NextSuggestedSlot | null>(
    null
  );
  const [isLoadingSuggestion, setIsLoadingSuggestion] =
    useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    buildDateFromFolder('November', 1, defaultYear)
  );
  const [monthFolder, setMonthFolder] = useState<string>('November');
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [slotCode, setSlotCode] = useState<string>('01');
  const [hookTitle, setHookTitle] = useState<string>('');
  const [ctaQuestion, setCtaQuestion] = useState<string>(
    'Menurut kamu bagaimana? Tulis di komentar.'
  );
  const [hashtagsInput, setHashtagsInput] = useState<string>(
    '#edukasi #konten'
  );
  const [openInExplorer, setOpenInExplorer] = useState<boolean>(true);

  // Batch slot generator state
  const [batchRange, setBatchRange] = useState<DateRange | undefined>(() =>
    buildDefaultRangeFromDate(buildDateFromFolder('November', 1, defaultYear))
  );
  const [selectedBatchSlots, setSelectedBatchSlots] = useState<string[]>([
    '01',
    '02',
  ]);
  const [batchCtaTemplate, setBatchCtaTemplate] = useState<string>(
    'Menurut kamu bagaimana? Tulis di komentar.'
  );
  const [batchHashtagsInput, setBatchHashtagsInput] = useState<string>(
    '#edukasi #konten'
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timeSlots = useMemo<TimeSlotDefinition[]>(() => {
    const map = activeWorkspace?.timeSlots ?? DEFAULT_TIME_SLOTS;
    const list = Object.values(map);
    return list.length > 0 ? list : Object.values(DEFAULT_TIME_SLOTS);
  }, [activeWorkspace]);

  const fetchSuggestedSlot = useCallback(
    async (monthHint?: string) => {
      try {
        setIsLoadingSuggestion(true);
        const query = monthHint
          ? `?month=${encodeURIComponent(monthHint)}`
          : '';
        const res = await fetch(`/api/items/suggest-slot${query}`);
        if (!res.ok) return;
        const raw = (await res.json()) as
          | NextSuggestedSlot
          | { suggested?: NextSuggestedSlot };
        const data =
          raw && 'suggested' in raw && raw.suggested
            ? raw.suggested
            : (raw as NextSuggestedSlot);
        if (!data || !data.folderCode) return;
        setSuggestedSlot(data);

        const targetMonth = data.monthFolder || monthHint || formatYearMonthFolder(new Date());
        const targetDay =
          typeof data.dayOfMonth === 'number' ? data.dayOfMonth : 1;
        const suggestedDate = buildDateFromFolder(
          targetMonth,
          targetDay,
          data.year || defaultYear
        );

        setSelectedDate(suggestedDate);
        setMonthFolder(formatYearMonthFolder(suggestedDate));
        setDayOfMonth(suggestedDate.getDate());
        setBatchRange(buildDefaultRangeFromDate(suggestedDate));

        if (data.slotCode) {
          setSlotCode(data.slotCode);
        }
      } catch {
        // ignore suggestion fetch errors
      } finally {
        setIsLoadingSuggestion(false);
      }
    },
    [defaultYear]
  );

  const defaultMonthFolder = availableMonths[availableMonths.length - 1];
  const lastInitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const initKey = isOpen
      ? `${initialTab}:${defaultMonthFolder ?? ''}`
      : null;
    if (!initKey) {
      lastInitKeyRef.current = null;
      return;
    }
    if (initKey === lastInitKeyRef.current) return;
    lastInitKeyRef.current = initKey;

    setActiveTab(initialTab);
    setErrorMsg(null);
    setHookTitle('');

    const defaultTags =
      activeWorkspace?.rules.defaultHashtags?.join(' ') ||
      '#edukasi #konten';
    setHashtagsInput(defaultTags);
    setBatchHashtagsInput(defaultTags);

    const allCodes = timeSlots.map((s) => s.code);
    setSelectedBatchSlots(allCodes);
    if (allCodes.length > 0) {
      setSlotCode(allCodes[0]);
    }

    const fallbackMonth =
      defaultMonthFolder || formatYearMonthFolder(new Date());
    const initialDate = buildDateFromFolder(fallbackMonth, 1, defaultYear);
    setSelectedDate(initialDate);
    setMonthFolder(formatYearMonthFolder(initialDate));
    setDayOfMonth(initialDate.getDate());
    setBatchRange(buildDefaultRangeFromDate(initialDate));

    // Request global chronological next slot (continuing after latest occupied item, across months/years)
    void fetchSuggestedSlot();
  }, [
    isOpen,
    initialTab,
    defaultMonthFolder,
    activeWorkspace,
    timeSlots,
    defaultYear,
    fetchSuggestedSlot,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSingleDateChange = (date?: Date) => {
    if (!date) return;
    setSelectedDate(date);
    setMonthFolder(formatYearMonthFolder(date));
    setDayOfMonth(date.getDate());
  };

  const formattedCode = useMemo(() => {
    const dd = String(Math.max(1, Math.min(31, dayOfMonth || 1))).padStart(
      2,
      '0'
    );
    const slot = (slotCode || '01').trim();
    return `${dd}.${slot}`;
  }, [dayOfMonth, slotCode]);

  const liveCaptionPathPreview = useMemo(() => {
    const cleanRoot = (contentRootPath || 'D:\\KONTEN').replace(/[\\/]+$/, '');
    const cleanMonth = monthFolder.trim();
    return cleanMonth
      ? `${cleanRoot}\\${cleanMonth}\\${formattedCode}\\caption.txt`
      : `${cleanRoot}\\${formattedCode}\\caption.txt`;
  }, [contentRootPath, monthFolder, formattedCode]);

  const liveCaptionPreview = useMemo(() => {
    return composeCaptionFromParts({
      hookTitle:
        hookTitle.trim() ||
        `[Hook pertanyaan utama untuk konten ${formattedCode}]`,
      ctaQuestion,
      hashtags: hashtagsInput,
    });
  }, [hookTitle, ctaQuestion, hashtagsInput, formattedCode]);

  const batchDerived = useMemo(() => {
    if (!batchRange?.from) {
      return {
        monthFolder: '',
        startDay: 0,
        endDay: 0,
        dayCount: 0,
        clampedCrossMonth: false,
      };
    }
    const from = batchRange.from;
    const to = batchRange.to ?? from;
    const fromYear = from.getFullYear();
    const fromMonth = from.getMonth();
    const monthFolderLabel = formatYearMonthFolder(from);
    const lastDayOfMonth = new Date(fromYear, fromMonth + 1, 0).getDate();
    const clampedCrossMonth =
      to.getFullYear() !== fromYear || to.getMonth() !== fromMonth;
    const startDay = from.getDate();
    const endDay = clampedCrossMonth
      ? lastDayOfMonth
      : Math.max(startDay, to.getDate());

    return {
      monthFolder: monthFolderLabel,
      startDay,
      endDay,
      dayCount: Math.max(0, endDay - startDay + 1),
      clampedCrossMonth,
    };
  }, [batchRange]);

  const batchTotalCount = useMemo(() => {
    return batchDerived.dayCount * selectedBatchSlots.length;
  }, [batchDerived.dayCount, selectedBatchSlots]);

  const handleToggleBatchSlot = (code: string) => {
    setSelectedBatchSlots((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAppendCtaSuffix = () => {
    setCtaQuestion((prev) => {
      const trimmed = prev.trim();
      if (trimmed.toLowerCase().includes('tulis di komentar')) return trimmed;
      return trimmed
        ? `${trimmed} Tulis di komentar.`
        : 'Menurut kamu bagaimana? Tulis di komentar.';
    });
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || dayOfMonth < 1 || dayOfMonth > 31) {
      setErrorMsg('Pilih tanggal yang valid.');
      return;
    }

    const parsedHashtags = hashtagsInput
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const payload: CreateContentSlotInput = {
      monthFolder: monthFolder.trim() || undefined,
      dayOfMonth,
      slotCode,
      hookTitle: hookTitle.trim() || undefined,
      ctaQuestion: ctaQuestion.trim() || undefined,
      hashtags: parsedHashtags,
      openInExplorer,
    };

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/items/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error || `Gagal membuat folder konten (${res.status})`
        );
      }
      const data = (await res.json()) as {
        ok: boolean;
        item: ContentPlannerItem;
        database: PlannerDatabase;
      };
      onToast?.(
        `Folder ${data.item.folderCode} dan caption.txt dibuat.`,
        'success'
      );
      onCreatedSingle(data);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal membuat folder konten baru.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      batchDerived.dayCount <= 0 ||
      batchDerived.startDay < 1 ||
      batchDerived.endDay > 31
    ) {
      setErrorMsg('Pilih rentang tanggal terlebih dahulu.');
      return;
    }
    if (selectedBatchSlots.length === 0) {
      setErrorMsg('Pilih minimal 1 slot jam.');
      return;
    }

    const parsedHashtags = batchHashtagsInput
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const payload: BatchGenerateSlotsInput = {
      monthFolder: batchDerived.monthFolder || undefined,
      startDay: batchDerived.startDay,
      endDay: batchDerived.endDay,
      slotCodes: selectedBatchSlots,
      defaultHashtags: parsedHashtags,
      ctaTemplate: batchCtaTemplate.trim() || undefined,
    };

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/items/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error || `Gagal batch generate slot (${res.status})`
        );
      }
      const data = (await res.json()) as {
        ok: boolean;
        createdCodes: string[];
        skippedCodes: string[];
        database: PlannerDatabase;
      };
      onToast?.(
        `Batch selesai: ${data.createdCodes.length} folder dibuat (${data.skippedCodes.length} dilewati).`,
        'success'
      );
      onCreatedBatch(data);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal melakukan batch generate slot.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buat Konten Baru"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#4a0d18] bg-cpgp-gradient text-white"
              aria-hidden="true"
            >
              <FolderPlus className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                  Buat Konten
                </h2>
                {activeWorkspace ? (
                  <Badge variant="outline" size="xs" className="font-mono">
                    {activeWorkspace.name} ({activeWorkspace.handle})
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs font-light text-muted-foreground/75">
                Siapkan folder DD.SLOT dan caption.txt di disk.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onClose}
            aria-label="Tutup modal buat konten"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as CreateContentTab)}
          >
            <TabsList
              aria-label="Mode pembuatan folder konten"
              className="grid w-full grid-cols-2"
            >
              <TabsTrigger value="single">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Tunggal</span>
              </TabsTrigger>
              <TabsTrigger value="batch">
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Batch</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: SINGLE CONTENT */}
            <TabsContent value="single">
              <form onSubmit={handleCreateSingle} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      Saran Slot
                    </span>
                    {isLoadingSuggestion ? (
                      <span className="font-light text-muted-foreground/75">
                        Mencari slot kosong...
                      </span>
                    ) : suggestedSlot ? (
                      <Badge variant="success" size="sm" className="font-mono">
                        {suggestedSlot.folderCode} ({suggestedSlot.slotLabel}{' '}
                        {suggestedSlot.slotTimeWindow})
                      </Badge>
                    ) : (
                      <span className="font-light text-muted-foreground/75">
                        Pilih tanggal dan slot.
                      </span>
                    )}
                  </div>

                  {suggestedSlot ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        const date = buildDateFromFolder(
                          suggestedSlot.monthFolder,
                          suggestedSlot.dayOfMonth,
                          suggestedSlot.year || defaultYear
                        );
                        setSelectedDate(date);
                        setMonthFolder(formatYearMonthFolder(date));
                        setDayOfMonth(date.getDate());
                        setSlotCode(suggestedSlot.slotCode);
                      }}
                    >
                      Pakai {suggestedSlot.folderCode}
                    </Button>
                  ) : null}
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Jadwal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="single-date-picker"
                          className="block text-xs font-medium text-foreground"
                        >
                          Tanggal
                        </label>
                        <DatePicker
                          id="single-date-picker"
                          value={selectedDate}
                          onChange={handleSingleDateChange}
                          defaultMonth={selectedDate}
                          placeholder="Pilih tanggal"
                          ariaLabel="Pilih tanggal konten"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="single-slot-select"
                          className="block text-xs font-medium text-foreground"
                        >
                          Slot Jam
                        </label>
                        <NativeSelect
                          id="single-slot-select"
                          value={slotCode}
                          onChange={(e) => setSlotCode(e.target.value)}
                          className="w-full font-mono"
                        >
                          {timeSlots.map((slot) => (
                            <option key={slot.code} value={slot.code}>
                              {slot.code} {slot.label} ({slot.defaultTime})
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px]">
                      <span className="font-light text-muted-foreground/75">
                        Lokasi
                      </span>
                      <code className="break-all font-mono font-medium text-foreground">
                        {liveCaptionPathPreview}
                      </code>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Caption
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="single-hook-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Hook
                      </label>
                      <Textarea
                        id="single-hook-input"
                        rows={2}
                        value={hookTitle}
                        onChange={(e) => setHookTitle(e.target.value)}
                        placeholder="Mengapa Perpustakaan Alexandria bisa musnah?"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="single-cta-input"
                          className="block text-xs font-medium text-foreground"
                        >
                          CTA
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={handleAppendCtaSuffix}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span>Tulis di komentar.</span>
                        </Button>
                      </div>
                      <Input
                        id="single-cta-input"
                        value={ctaQuestion}
                        onChange={(e) => setCtaQuestion(e.target.value)}
                        placeholder="Menurut kamu bagaimana? Tulis di komentar."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="single-hashtags-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Hashtag
                      </label>
                      <Input
                        id="single-hashtags-input"
                        value={hashtagsInput}
                        onChange={(e) => setHashtagsInput(e.target.value)}
                        placeholder="#edukasi #konten #sejarah"
                        className="font-mono"
                      />
                    </div>

                    <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-1">
                      <span className="block text-[10px] font-light uppercase tracking-wide text-muted-foreground/75">
                        Pratinjau
                      </span>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
                        {liveCaptionPreview}
                      </pre>
                    </div>

                    <label
                      htmlFor="single-open-explorer"
                      className="flex items-center gap-2 pt-1 text-xs font-light text-muted-foreground/75"
                    >
                      <input
                        id="single-open-explorer"
                        type="checkbox"
                        checked={openInExplorer}
                        onChange={(e) => setOpenInExplorer(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>Buka folder di Explorer setelah dibuat</span>
                    </label>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    variant="editorial"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Buat {formattedCode}</span>
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* TAB 2: BATCH GENERATOR */}
            <TabsContent value="batch">
              <form onSubmit={handleCreateBatch} className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rentang Jadwal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="batch-date-range"
                        className="block text-xs font-medium text-foreground"
                      >
                        Rentang
                      </label>
                      <DateRangePicker
                        id="batch-date-range"
                        value={batchRange}
                        onChange={setBatchRange}
                        defaultMonth={batchRange?.from ?? selectedDate}
                        placeholder="Pilih rentang tanggal"
                        ariaLabel="Pilih rentang tanggal batch"
                      />
                      {batchDerived.clampedCrossMonth ? (
                        <p className="text-[11px] font-light text-muted-foreground/75">
                          Rentang lintas bulan dibatasi hingga akhir{' '}
                          {batchDerived.monthFolder} (tgl {batchDerived.endDay}
                          ).
                        </p>
                      ) : batchDerived.monthFolder ? (
                        <p className="text-[11px] font-light text-muted-foreground/75">
                          Folder bulan {batchDerived.monthFolder} (tgl{' '}
                          {batchDerived.startDay}-{batchDerived.endDay}).
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-medium text-foreground">
                        Slot Harian
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {timeSlots.map((slot) => {
                          const checked = selectedBatchSlots.includes(
                            slot.code
                          );
                          return (
                            <label
                              key={slot.code}
                              htmlFor={`batch-slot-${slot.code}`}
                              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                                checked
                                  ? 'border-primary bg-accent/50 text-foreground'
                                  : 'border-border bg-card text-muted-foreground'
                              }`}
                            >
                              <input
                                id={`batch-slot-${slot.code}`}
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  handleToggleBatchSlot(slot.code)
                                }
                                className="h-4 w-4 rounded border-input accent-primary"
                              />
                              <span className="font-mono font-semibold">
                                {slot.code}
                              </span>
                              <span>
                                {slot.label} ({slot.defaultTime})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Template Caption
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="batch-cta-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        CTA
                      </label>
                      <Input
                        id="batch-cta-input"
                        value={batchCtaTemplate}
                        onChange={(e) => setBatchCtaTemplate(e.target.value)}
                        placeholder="Menurut kamu bagaimana? Tulis di komentar."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="batch-hashtags-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Hashtag
                      </label>
                      <Input
                        id="batch-hashtags-input"
                        value={batchHashtagsInput}
                        onChange={(e) => setBatchHashtagsInput(e.target.value)}
                        className="font-mono"
                        placeholder="#edukasi #konten"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
                      <span className="font-light text-muted-foreground/75">
                        Ringkasan
                      </span>
                      <Badge variant="default" size="sm" className="font-mono">
                        {batchDerived.dayCount} hari ·{' '}
                        {selectedBatchSlots.length} slot = {batchTotalCount}{' '}
                        folder
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Separator />

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    variant="editorial"
                    disabled={isSubmitting || batchTotalCount <= 0}
                  >
                    {isSubmitting ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Buat {batchTotalCount} Folder</span>
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default CreateContentModal;
