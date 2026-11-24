import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

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
  const [activeTab, setActiveTab] = useState<CreateContentTab>(initialTab);

  // Single slot creation state
  const [suggestedSlot, setSuggestedSlot] = useState<NextSuggestedSlot | null>(
    null
  );
  const [isLoadingSuggestion, setIsLoadingSuggestion] =
    useState<boolean>(false);
  const [monthFolder, setMonthFolder] = useState<string>('November');
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [slotCode, setSlotCode] = useState<string>('01');
  const [hookTitle, setHookTitle] = useState<string>('');
  const [ctaQuestion, setCtaQuestion] = useState<string>(
    'Menurut kamu bagaimana? Tulis di komentar.'
  );
  const [hashtagsInput, setHashtagsInput] = useState<string>(
    '#edukasi #jurnaldunia'
  );
  const [openInExplorer, setOpenInExplorer] = useState<boolean>(true);

  // Batch slot generator state
  const [batchMonthFolder, setBatchMonthFolder] = useState<string>('November');
  const [startDay, setStartDay] = useState<number>(1);
  const [endDay, setEndDay] = useState<number>(7);
  const [selectedBatchSlots, setSelectedBatchSlots] = useState<string[]>([
    '01',
    '02',
  ]);
  const [batchCtaTemplate, setBatchCtaTemplate] = useState<string>(
    'Menurut kamu bagaimana? Tulis di komentar.'
  );
  const [batchHashtagsInput, setBatchHashtagsInput] = useState<string>(
    '#edukasi #jurnaldunia'
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timeSlots = useMemo<TimeSlotDefinition[]>(() => {
    const map = activeWorkspace?.timeSlots ?? DEFAULT_TIME_SLOTS;
    const list = Object.values(map);
    return list.length > 0 ? list : Object.values(DEFAULT_TIME_SLOTS);
  }, [activeWorkspace]);

  const monthSuggestions = useMemo<string[]>(() => {
    const set = new Set<string>(availableMonths);
    for (const m of INDONESIAN_MONTHS) set.add(m);
    return Array.from(set);
  }, [availableMonths]);

  const fetchSuggestedSlot = useCallback(async (monthHint?: string) => {
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
      if (data.monthFolder) {
        setMonthFolder(data.monthFolder);
        setBatchMonthFolder(data.monthFolder);
      }
      if (typeof data.dayOfMonth === 'number') {
        setDayOfMonth(data.dayOfMonth);
        setStartDay(data.dayOfMonth);
        setEndDay(Math.min(31, data.dayOfMonth + 6));
      }
      if (data.slotCode) {
        setSlotCode(data.slotCode);
      }
    } catch {
      // ignore suggestion fetch errors
    } finally {
      setIsLoadingSuggestion(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setErrorMsg(null);
    setHookTitle('');

    const defaultTags =
      activeWorkspace?.rules.defaultHashtags?.join(' ') ||
      '#edukasi #jurnaldunia';
    setHashtagsInput(defaultTags);
    setBatchHashtagsInput(defaultTags);

    const allCodes = timeSlots.map((s) => s.code);
    setSelectedBatchSlots(allCodes);
    if (allCodes.length > 0) {
      setSlotCode(allCodes[0]);
    }

    const fallbackMonth =
      availableMonths[availableMonths.length - 1] || 'November';
    setMonthFolder(fallbackMonth);
    setBatchMonthFolder(fallbackMonth);

    void fetchSuggestedSlot(fallbackMonth);
  }, [
    isOpen,
    initialTab,
    activeWorkspace,
    availableMonths,
    timeSlots,
    fetchSuggestedSlot,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

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

  const batchTotalCount = useMemo(() => {
    const days = Math.max(0, endDay - startDay + 1);
    return days * selectedBatchSlots.length;
  }, [startDay, endDay, selectedBatchSlots]);

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
    if (dayOfMonth < 1 || dayOfMonth > 31) {
      setErrorMsg('Tanggal harus berada di antara 1 sampai 31.');
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
        `Folder konten ${data.item.folderCode} dan caption.txt berhasil dibuat.`,
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
    if (startDay < 1 || endDay > 31 || startDay > endDay) {
      setErrorMsg('Rentang tanggal tidak valid (harus 1 sampai 31).');
      return;
    }
    if (selectedBatchSlots.length === 0) {
      setErrorMsg('Pilih minimal 1 slot jam untuk di-generate.');
      return;
    }

    const parsedHashtags = batchHashtagsInput
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const payload: BatchGenerateSlotsInput = {
      monthFolder: batchMonthFolder.trim() || undefined,
      startDay,
      endDay,
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
        `Batch selesai: ${data.createdCodes.length} folder baru dibuat (${data.skippedCodes.length} dilewati karena sudah ada).`,
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
      aria-label="Buat Konten Baru atau Batch Generate Slot"
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[780px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg">
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
                  Buat Slot Konten & caption.txt
                </h2>
                {activeWorkspace ? (
                  <Badge variant="outline" size="xs" className="font-mono">
                    {activeWorkspace.name} ({activeWorkspace.handle})
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                Buat folder kode DD.SLOT beserta template caption.txt langsung di
                disk.
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
                <span>Buat 1 Konten Baru</span>
              </TabsTrigger>
              <TabsTrigger value="batch">
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Batch Generate Slot (Mingguan / Bulanan)</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: SINGLE CONTENT */}
            <TabsContent value="single">
              <form onSubmit={handleCreateSingle} className="space-y-4">
                {/* Smart Slot Finder Banner */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      Smart Slot Finder:
                    </span>
                    {isLoadingSuggestion ? (
                      <span className="text-muted-foreground">
                        Mencari slot kosong berikutnya...
                      </span>
                    ) : suggestedSlot ? (
                      <Badge variant="success" size="sm" className="font-mono">
                        Saran Slot Kosong: {suggestedSlot.folderCode} (
                        {suggestedSlot.slotLabel}{' '}
                        {suggestedSlot.slotTimeWindow})
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Pilih tanggal dan slot jam di bawah
                      </span>
                    )}
                  </div>

                  {suggestedSlot ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setMonthFolder(suggestedSlot.monthFolder);
                        setDayOfMonth(suggestedSlot.dayOfMonth);
                        setSlotCode(suggestedSlot.slotCode);
                      }}
                    >
                      Pakai Slot {suggestedSlot.folderCode}
                    </Button>
                  ) : null}
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Jadwal & Lokasi Folder (DD.SLOT)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="single-month-input"
                          className="block text-xs font-medium text-foreground"
                        >
                          Folder Bulan
                        </label>
                        <Input
                          id="single-month-input"
                          list="cpgp-month-suggestions"
                          value={monthFolder}
                          onChange={(e) => setMonthFolder(e.target.value)}
                          placeholder="Contoh: November, Desember"
                        />
                        <datalist id="cpgp-month-suggestions">
                          {monthSuggestions.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="single-day-input"
                          className="block text-xs font-medium text-foreground"
                        >
                          Tanggal (1-31)
                        </label>
                        <Input
                          id="single-day-input"
                          type="number"
                          min={1}
                          max={31}
                          value={dayOfMonth}
                          onChange={(e) =>
                            setDayOfMonth(Number(e.target.value) || 1)
                          }
                          className="font-mono"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="single-slot-select"
                          className="block text-xs font-medium text-foreground"
                        >
                          Slot Jam Upload
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
                      <span className="text-muted-foreground">
                        Lokasi berkas fisik:
                      </span>
                      <code className="font-mono font-semibold text-foreground">
                        {liveCaptionPathPreview}
                      </code>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Penyusun caption.txt Terstruktur
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="single-hook-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Hook / Judul Pertanyaan Utama (Paragraf 1)
                      </label>
                      <Textarea
                        id="single-hook-input"
                        rows={2}
                        value={hookTitle}
                        onChange={(e) => setHookTitle(e.target.value)}
                        placeholder="Contoh: Mengapa Perpustakaan Alexandria yang legendaris bisa musnah tanpa jejak?"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="single-cta-input"
                          className="block text-xs font-medium text-foreground"
                        >
                          Pertanyaan CTA Komentar (Paragraf 2)
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={handleAppendCtaSuffix}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span>&quot;Tulis di komentar.&quot;</span>
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
                        Hashtags (Baris Terakhir)
                      </label>
                      <Input
                        id="single-hashtags-input"
                        value={hashtagsInput}
                        onChange={(e) => setHashtagsInput(e.target.value)}
                        placeholder="#edukasi #jurnaldunia #sejarah"
                        className="font-mono"
                      />
                    </div>

                    <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-1">
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Pratinjau Isi caption.txt
                      </span>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
                        {liveCaptionPreview}
                      </pre>
                    </div>

                    <label
                      htmlFor="single-open-explorer"
                      className="flex items-center gap-2 pt-1 text-xs font-medium text-foreground"
                    >
                      <input
                        id="single-open-explorer"
                        type="checkbox"
                        checked={openInExplorer}
                        onChange={(e) => setOpenInExplorer(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>
                        Buka folder di Windows Explorer setelah dibuat (untuk
                        menaruh file video & cover)
                      </span>
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
                    <span>Buat Folder {formattedCode} & caption.txt</span>
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
                      Rentang Tanggal & Slot Harian
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="batch-month-input"
                          className="block text-xs font-medium text-foreground"
                        >
                          Folder Bulan
                        </label>
                        <Input
                          id="batch-month-input"
                          list="cpgp-month-suggestions"
                          value={batchMonthFolder}
                          onChange={(e) => setBatchMonthFolder(e.target.value)}
                          placeholder="November"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="batch-start-day"
                          className="block text-xs font-medium text-foreground"
                        >
                          Dari Tanggal (1-31)
                        </label>
                        <Input
                          id="batch-start-day"
                          type="number"
                          min={1}
                          max={31}
                          value={startDay}
                          onChange={(e) =>
                            setStartDay(Number(e.target.value) || 1)
                          }
                          className="font-mono"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="batch-end-day"
                          className="block text-xs font-medium text-foreground"
                        >
                          Sampai Tanggal (1-31)
                        </label>
                        <Input
                          id="batch-end-day"
                          type="number"
                          min={1}
                          max={31}
                          value={endDay}
                          onChange={(e) =>
                            setEndDay(Number(e.target.value) || 1)
                          }
                          className="font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-medium text-foreground">
                        Slot Jam yang Akan Dibuat Setiap Hari
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
                      Template Dasar caption.txt
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="batch-cta-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Template CTA Komentar
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
                        Template Hashtags Default
                      </label>
                      <Input
                        id="batch-hashtags-input"
                        value={batchHashtagsInput}
                        onChange={(e) => setBatchHashtagsInput(e.target.value)}
                        className="font-mono"
                        placeholder="#edukasi #jurnaldunia"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
                      <span>Total folder yang akan disiapkan:</span>
                      <Badge variant="default" size="sm" className="font-mono">
                        {Math.max(0, endDay - startDay + 1)} hari x{' '}
                        {selectedBatchSlots.length} slot = {batchTotalCount}{' '}
                        folder konten
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
                    <span>Generate Semua Folder & caption.txt</span>
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
