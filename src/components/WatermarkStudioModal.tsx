import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Crosshair,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Plus,
  Trash2,
  Check,
  Star,
  Film,
  Layers,
  AlertCircle,
  Loader2,
  Ban,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { ContentPlannerItem } from '@/types/planner';
import type { WatermarkPolicyMode } from '@/types/workspace';
import {
  ANCHOR_COORDINATES,
  DEFAULT_WATERMARK_CONFIG,
  type WatermarkAnchor,
  type WatermarkCapabilities,
  type WatermarkEncoderMode,
  type WatermarkFontOption,
  type WatermarkPresetStore,
  type WatermarkRenderJob,
  type WatermarkStyleConfig,
} from '@/types/watermark';
import { buildWatermarkSvg, clampNumber } from '../../shared/watermarkSvg';
import {
  watermarkApi,
  type WatermarkOutputMode,
} from '@/services/watermarkApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input, NativeSelect, Separator } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

export interface WatermarkStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContentPlannerItem[];
  initialItemId?: string | null;
  watermarkPolicy?: WatermarkPolicyMode;
  onRenderCompleted?: () => void;
  onToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

type StudioTab = 'preset' | 'posisi' | 'gaya';

const ANCHOR_GRID_KEYS: Array<Exclude<WatermarkAnchor, 'custom'>> = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

const EDITORIAL_SWATCHES: Array<{ hex: string; label: string }> = [
  { hex: '#3A3A3A', label: 'Arang Editorial' },
  { hex: '#FFFFFF', label: 'Putih Bersih' },
  { hex: '#E4E4E7', label: 'Abu Terang' },
  { hex: '#18181B', label: 'Tinta Gelap' },
  { hex: '#F5E6C8', label: 'Krem Arsip' },
];

const FALLBACK_CAPABILITIES: WatermarkCapabilities = {
  ffmpegAvailable: true,
  ffprobeAvailable: true,
  nvencAvailable: false,
  recommendedEncoder: 'x264',
};

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatEta(etaSec: number | null): string {
  if (etaSec === null || !Number.isFinite(etaSec) || etaSec < 0) return '-';
  if (etaSec < 60) return `${Math.ceil(etaSec)}d`;
  const mins = Math.floor(etaSec / 60);
  const secs = Math.ceil(etaSec % 60);
  return `${mins}m ${secs}d`;
}

function getSliderScalar(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number);
}

function getJobStatusBadge(status: WatermarkRenderJob['status']): {
  label: string;
  variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning';
} {
  switch (status) {
    case 'queued':
      return { label: 'Antre', variant: 'secondary' };
    case 'rendering':
      return { label: 'Merender', variant: 'info' };
    case 'completed':
      return { label: 'Selesai', variant: 'success' };
    case 'failed':
      return { label: 'Gagal', variant: 'destructive' };
    case 'cancelled':
      return { label: 'Dibatalkan', variant: 'warning' };
  }
}

export const WatermarkStudioModal: React.FC<WatermarkStudioModalProps> = ({
  isOpen,
  onClose,
  items,
  initialItemId,
  watermarkPolicy = 'separate_wm_file',
  onRenderCompleted,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('preset');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [config, setConfig] = useState<WatermarkStyleConfig>(
    DEFAULT_WATERMARK_CONFIG
  );

  // Remote backend data
  const [fonts, setFonts] = useState<WatermarkFontOption[]>([]);
  const [capabilities, setCapabilities] = useState<WatermarkCapabilities>(
    FALLBACK_CAPABILITIES
  );
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState<boolean>(false);
  const [presetStore, setPresetStore] = useState<WatermarkPresetStore | null>(
    null
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [encoder, setEncoder] = useState<WatermarkEncoderMode>('auto');
  const [outputMode, setOutputMode] = useState<WatermarkOutputMode>(
    watermarkPolicy === 'overwrite_source'
      ? 'overwrite_source'
      : 'separate_wm_file'
  );
  const [jobs, setJobs] = useState<WatermarkRenderJob[]>([]);

  useEffect(() => {
    setOutputMode(
      watermarkPolicy === 'overwrite_source'
        ? 'overwrite_source'
        : 'separate_wm_file'
    );
  }, [watermarkPolicy, isOpen]);

  // Preset inline save state
  const [isCreatingPreset, setIsCreatingPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [isMutatingPreset, setIsMutatingPreset] = useState<boolean>(false);
  const [isSubmittingRender, setIsSubmittingRender] = useState<boolean>(false);

  // Live video preview state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Track already-handled terminal jobs so callbacks fire once per completion
  const handledTerminalJobsRef = useRef<Set<string>>(new Set());
  const onRenderCompletedRef = useRef(onRenderCompleted);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    onRenderCompletedRef.current = onRenderCompleted;
    onToastRef.current = onToast;
  }, [onRenderCompleted, onToast]);

  // Select best initial item whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (initialItemId && items.some((it) => it.id === initialItemId)) {
      setSelectedItemId(initialItemId);
      return;
    }
    const firstNeedsWm = items.find(
      (it) =>
        !it.autoMetadata.readiness.hasWmFinal &&
        it.autoMetadata.readiness.hasRawVideo
    );
    const firstWithRaw = items.find(
      (it) => it.autoMetadata.readiness.hasRawVideo
    );
    const fallbackItem = firstNeedsWm ?? firstWithRaw ?? items[0] ?? null;
    setSelectedItemId(fallbackItem ? fallbackItem.id : '');
  }, [isOpen, initialItemId, items]);

  // Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load fonts, capabilities, presets, and active jobs when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadStudioData = async () => {
      const [fontsRes, capRes, presetsRes, jobsRes] = await Promise.allSettled([
        watermarkApi.getFonts(),
        watermarkApi.getCapabilities(),
        watermarkApi.getPresets(),
        watermarkApi.getJobs(),
      ]);

      if (cancelled) return;

      if (fontsRes.status === 'fulfilled' && Array.isArray(fontsRes.value)) {
        setFonts(fontsRes.value);
      }

      if (capRes.status === 'fulfilled' && capRes.value) {
        setCapabilities(capRes.value);
        setCapabilitiesLoaded(true);
      } else {
        setCapabilitiesLoaded(true);
      }

      if (presetsRes.status === 'fulfilled' && presetsRes.value) {
        const store = presetsRes.value;
        setPresetStore(store);
        const defaultPreset =
          store.presets.find((p) => p.id === store.defaultPresetId) ??
          store.presets.find((p) => p.isDefault) ??
          store.presets[0] ??
          null;
        if (defaultPreset) {
          setSelectedPresetId(defaultPreset.id);
          setConfig({ ...DEFAULT_WATERMARK_CONFIG, ...defaultPreset.config });
        }
        if (store.defaultEncoder) {
          setEncoder(store.defaultEncoder);
        }
      }

      if (jobsRes.status === 'fulfilled' && Array.isArray(jobsRes.value)) {
        const initialJobs = jobsRes.value;
        for (const j of initialJobs) {
          if (
            j.status === 'completed' ||
            j.status === 'failed' ||
            j.status === 'cancelled'
          ) {
            handledTerminalJobsRef.current.add(j.jobId);
          }
        }
        setJobs(initialJobs);
      }
    };

    loadStudioData();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Subscribe to SSE render progress stream while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleJobTransitions = (incomingJobs: WatermarkRenderJob[]) => {
      let anyCompleted = false;
      for (const job of incomingJobs) {
        if (handledTerminalJobsRef.current.has(job.jobId)) continue;
        if (job.status === 'completed') {
          handledTerminalJobsRef.current.add(job.jobId);
          anyCompleted = true;
          onToastRef.current?.(
            `Render selesai: ${job.folderCode} (${job.outputFile || 'wm_final.mp4'})`,
            'success'
          );
        } else if (job.status === 'failed') {
          handledTerminalJobsRef.current.add(job.jobId);
          onToastRef.current?.(
            `Render gagal (${job.folderCode}): ${job.error || 'Terjadi kesalahan saat merender.'}`,
            'error'
          );
        } else if (job.status === 'cancelled') {
          handledTerminalJobsRef.current.add(job.jobId);
        }
      }
      if (anyCompleted) {
        onRenderCompletedRef.current?.();
      }
    };

    const unsubscribe = watermarkApi.subscribeEvents((event) => {
      if (Array.isArray(event.jobs)) {
        setJobs(event.jobs);
        handleJobTransitions(event.jobs);
      } else if (event.type === 'job-updated' && event.job) {
        const updatedJob = event.job;
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.jobId === updatedJob.jobId);
          if (idx === -1) return [updatedJob, ...prev];
          const next = [...prev];
          next[idx] = updatedJob;
          return next;
        });
        handleJobTransitions([updatedJob]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // Reset player state when active video item changes
  const activeItem = useMemo<ContentPlannerItem | null>(() => {
    if (!items.length) return null;
    return items.find((it) => it.id === selectedItemId) ?? items[0] ?? null;
  }, [items, selectedItemId]);

  const activeRawVideoUrl =
    activeItem?.autoMetadata.assets.rawVideo.mediaUrl ||
    activeItem?.autoMetadata.assets.wmVideo.mediaUrl ||
    null;
  const activeHasRawVideo = Boolean(
    activeItem?.autoMetadata.assets.rawVideo.exists
  );
  const coverUrl = activeItem?.autoMetadata.assets.cover.mediaUrl || undefined;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [activeRawVideoUrl]);

  const needsWmItems = useMemo(() => {
    return items.filter(
      (it) =>
        !it.autoMetadata.readiness.hasWmFinal &&
        it.autoMetadata.readiness.hasRawVideo
    );
  }, [items]);

  const selectedPreset = useMemo(() => {
    if (!presetStore) return null;
    return (
      presetStore.presets.find((p) => p.id === selectedPresetId) ?? null
    );
  }, [presetStore, selectedPresetId]);

  // Build @font-face CSS so browser SVG matches server @resvg/resvg-js 100%
  const fontFaceCss = useMemo(() => {
    if (fonts.length === 0) return '';
    return fonts
      .map((font) => {
        const escapedFamily = font.family.replace(/'/g, "\\'");
        return `@font-face {
  font-family: '${escapedFamily}';
  src: url('${font.url}');
  font-weight: ${font.weight};
  font-style: normal;
  font-display: swap;
}`;
      })
      .join('\n');
  }, [fonts]);

  const activeFont = useMemo(() => {
    if (fonts.length === 0) return null;
    return fonts.find((f) => f.id === config.fontId) ?? fonts[0] ?? null;
  }, [fonts, config.fontId]);

  const svgMarkup = useMemo(() => {
    return buildWatermarkSvg(config, {
      width: 1080,
      height: 1920,
      fontFamily: activeFont?.family || 'Arial Black, Arial, sans-serif',
      fontWeight: activeFont?.weight ?? 800,
    });
  }, [config, activeFont]);

  const updateConfig = useCallback((patch: Partial<WatermarkStyleConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // Pointer drag interaction on 9:16 preview canvas with magnetic center snap
  const updatePositionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = previewContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      let xPercent = clampNumber(
        ((clientX - rect.left) / rect.width) * 100,
        0,
        100
      );
      let yPercent = clampNumber(
        ((clientY - rect.top) / rect.height) * 100,
        0,
        100
      );

      if (Math.abs(xPercent - 50) <= 1.8) xPercent = 50;
      if (Math.abs(yPercent - 50) <= 1.8) yPercent = 50;

      xPercent = Math.round(xPercent * 2) / 2;
      yPercent = Math.round(yPercent * 2) / 2;

      const anchor: WatermarkAnchor =
        xPercent === 50 && yPercent === 50 ? 'center' : 'custom';

      setConfig((prev) => ({
        ...prev,
        xPercent,
        yPercent,
        anchor,
      }));
    },
    []
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updatePositionFromPointer(e.clientX, e.clientY);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updatePositionFromPointer(e.clientX, e.clientY);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  };

  // Player controls
  const handleTogglePlay = async () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      try {
        await vid.play();
      } catch {
        // ignore autoplay interruption
      }
    } else {
      vid.pause();
    }
  };

  const handleSeek = (val: number | readonly number[]) => {
    const nextTime = getSliderScalar(val);
    const vid = videoRef.current;
    setCurrentTime(nextTime);
    if (vid && Number.isFinite(nextTime)) {
      vid.currentTime = nextTime;
    }
  };

  // Preset actions
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = presetStore?.presets.find((p) => p.id === presetId);
    if (found) {
      setConfig({ ...DEFAULT_WATERMARK_CONFIG, ...found.config });
    }
  };

  const handleCreatePreset = async () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) {
      onToast?.('Masukkan nama preset terlebih dahulu.', 'error');
      return;
    }
    try {
      setIsMutatingPreset(true);
      const data = await watermarkApi.createPreset({
        name: trimmed,
        config,
        isDefault: false,
      });
      setPresetStore(data.store);
      setSelectedPresetId(data.preset.id);
      setNewPresetName('');
      setIsCreatingPreset(false);
      onToast?.(`Preset "${data.preset.name}" berhasil disimpan.`, 'success');
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Gagal menyimpan preset baru.',
        'error'
      );
    } finally {
      setIsMutatingPreset(false);
    }
  };

  const handleUpdatePreset = async () => {
    if (!selectedPreset) return;
    try {
      setIsMutatingPreset(true);
      const data = await watermarkApi.updatePreset(selectedPreset.id, {
        name: selectedPreset.name,
        description: selectedPreset.description,
        config,
      });
      setPresetStore(data.store);
      onToast?.(`Preset "${data.preset.name}" diperbarui.`, 'success');
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Gagal memperbarui preset.',
        'error'
      );
    } finally {
      setIsMutatingPreset(false);
    }
  };

  const handleSetDefaultPreset = async () => {
    if (!selectedPreset) return;
    try {
      setIsMutatingPreset(true);
      const data = await watermarkApi.setDefaultPreset(selectedPreset.id);
      setPresetStore(data.store);
      onToast?.(
        `Preset "${selectedPreset.name}" dijadikan default.`,
        'success'
      );
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Gagal mengatur preset default.',
        'error'
      );
    } finally {
      setIsMutatingPreset(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPreset || selectedPreset.isBuiltIn) return;
    try {
      setIsMutatingPreset(true);
      const data = await watermarkApi.deletePreset(selectedPreset.id);
      setPresetStore(data.store);
      const nextPreset =
        data.store.presets.find((p) => p.id === data.store.defaultPresetId) ??
        data.store.presets[0] ??
        null;
      if (nextPreset) {
        setSelectedPresetId(nextPreset.id);
        setConfig({ ...DEFAULT_WATERMARK_CONFIG, ...nextPreset.config });
      } else {
        setSelectedPresetId('');
      }
      onToast?.(`Preset "${selectedPreset.name}" dihapus.`, 'info');
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Gagal menghapus preset.',
        'error'
      );
    } finally {
      setIsMutatingPreset(false);
    }
  };

  const handleResetReference = () => {
    setConfig({ ...DEFAULT_WATERMARK_CONFIG });
    onToast?.('Pengaturan watermark dikembalikan ke referensi standar.', 'info');
  };

  // Render queue actions
  const triggerRender = async (itemIds: string[], label: string) => {
    if (itemIds.length === 0) return;
    try {
      setIsSubmittingRender(true);
      const data = await watermarkApi.startRender({
        itemIds,
        config,
        presetId: selectedPresetId || undefined,
        presetName: selectedPreset?.name,
        encoder,
        outputMode,
      });
      if (Array.isArray(data.jobs)) {
        setJobs((prev) => {
          const map = new Map<string, WatermarkRenderJob>();
          for (const j of data.jobs) map.set(j.jobId, j);
          for (const j of prev) {
            if (!map.has(j.jobId)) map.set(j.jobId, j);
          }
          return Array.from(map.values());
        });
      }
      if (data.jobs.length === 0 && data.skipped?.length) {
        onToast?.(
          `Tidak ada video yang dirender: ${data.skipped[0].reason}`,
          'error'
        );
      } else {
        onToast?.(`Antrean render dimulai: ${label}`, 'info');
      }
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Gagal memulai proses render.',
        'error'
      );
    } finally {
      setIsSubmittingRender(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const data = await watermarkApi.cancelJob(jobId);
      if (data.job) {
        const cancelledJob = data.job;
        setJobs((prev) =>
          prev.map((j) => (j.jobId === cancelledJob.jobId ? cancelledJob : j))
        );
      }
      onToast?.('Tugas render dibatalkan.', 'info');
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : 'Gagal membatalkan render.',
        'error'
      );
    }
  };

  const sortedJobs = useMemo(() => {
    const rank = (status: WatermarkRenderJob['status']) => {
      if (status === 'rendering') return 0;
      if (status === 'queued') return 1;
      return 2;
    };
    return [...jobs].sort((a, b) => {
      const rDiff = rank(a.status) - rank(b.status);
      if (rDiff !== 0) return rDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [jobs]);

  const activeJobsCount = useMemo(
    () =>
      jobs.filter((j) => j.status === 'rendering' || j.status === 'queued')
        .length,
    [jobs]
  );

  const isSnappedX = Math.abs(config.xPercent - 50) < 0.01;
  const isSnappedY = Math.abs(config.yPercent - 50) < 0.01;

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Watermark Studio dan Preset Manager"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {fontFaceCss && <style data-watermark-fonts>{fontFaceCss}</style>}

      <div className="flex h-[min(92vh,860px)] w-full max-w-[1220px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground">
        {/* Top Modal Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
              Watermark Studio
            </h2>
            {activeItem && (
              <Badge variant="outline" size="sm" className="font-mono font-semibold">
                {activeItem.folderCode}
              </Badge>
            )}
            <Badge
              variant={needsWmItems.length > 0 ? 'warning' : 'success'}
              size="sm"
            >
              {needsWmItems.length > 0
                ? `${needsWmItems.length} video butuh WM`
                : 'Semua video siap WM'}
            </Badge>
            {activeJobsCount > 0 && (
              <Badge variant="info" size="sm">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span className="font-mono">{activeJobsCount} antrean aktif</span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {capabilitiesLoaded && !capabilities.ffmpegAvailable && (
              <Badge variant="destructive" size="sm">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>FFmpeg tidak terdeteksi</span>
              </Badge>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onClose}
              aria-label="Tutup Watermark Studio"
              title="Tutup (Esc)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        {/* Main 2-Column Workspace */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
          {/* Left Column: Interactive 9:16 Live Video Canvas */}
          <section
            aria-label="Pratinjau langsung video 9:16"
            className="flex flex-col gap-3 border-b border-border bg-muted/30 p-4 sm:p-5 lg:col-span-5 lg:overflow-y-auto lg:border-b-0 lg:border-r"
          >
            {/* Sample Content Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="wm-sample-select"
                  className="text-xs font-medium text-foreground"
                >
                  Sampel Video Pratinjau
                </label>
                {activeItem && (
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {activeItem.autoMetadata.assets.rawVideo.fileName ||
                      activeItem.autoMetadata.assets.wmVideo.fileName ||
                      'Tidak ada video'}
                  </span>
                )}
              </div>
              <NativeSelect
                id="wm-sample-select"
                value={activeItem?.id ?? ''}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full"
                disabled={items.length === 0}
              >
                {items.length === 0 ? (
                  <option value="">Belum ada konten tersedia</option>
                ) : (
                  items.map((it) => {
                    const statusTag = it.autoMetadata.readiness.hasWmFinal
                      ? 'wm_final'
                      : 'Butuh WM';
                    const title = (
                      it.userProperties.customTitle ||
                      it.autoMetadata.captionParsed.hookTitle ||
                      'Tanpa judul'
                    ).slice(0, 42);
                    return (
                      <option key={it.id} value={it.id}>
                        {it.folderCode} [{statusTag}] - {title}
                      </option>
                    );
                  })
                )}
              </NativeSelect>
            </div>

            {/* Interactive 9:16 Video Preview Container */}
            <div className="flex flex-1 flex-col items-center justify-center">
              <div
                ref={previewContainerRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                role="application"
                aria-label="Kanvas pratinjau watermark. Klik dan seret untuk mengatur posisi watermark."
                className={`relative mx-auto aspect-[9/16] max-h-[540px] w-full max-w-[304px] select-none overflow-hidden rounded-lg border border-border bg-black touch-none ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                {activeRawVideoUrl ? (
                  <video
                    ref={videoRef}
                    key={activeRawVideoUrl}
                    src={activeRawVideoUrl}
                    poster={coverUrl}
                    width={360}
                    height={640}
                    playsInline
                    loop
                    muted={isMuted}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      setDuration(Number.isFinite(d) ? d : 0);
                    }}
                    onTimeUpdate={(e) => {
                      setCurrentTime(e.currentTarget.currentTime || 0);
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="pointer-events-none h-full w-full aspect-[9/16] object-contain"
                  />
                ) : coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={`Cover ${activeItem?.folderCode ?? ''}`}
                    width={360}
                    height={640}
                    className="pointer-events-none h-full w-full aspect-[9/16] object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-zinc-400">
                    <Film className="h-6 w-6" aria-hidden="true" />
                    <span>Pilih folder konten yang memiliki file video.</span>
                  </div>
                )}

                {/* Center Crosshair Guides */}
                {showGuides && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                  >
                    <div
                      className={`absolute inset-y-0 left-1/2 -translate-x-px border-l ${
                        isSnappedX
                          ? 'border-[#f59e0b]/90'
                          : 'border-dashed border-white/30'
                      }`}
                    />
                    <div
                      className={`absolute inset-x-0 top-1/2 -translate-y-px border-t ${
                        isSnappedY
                          ? 'border-[#f59e0b]/90'
                          : 'border-dashed border-white/30'
                      }`}
                    />
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-black/40" />
                  </div>
                )}

                {/* Live WYSIWYG SVG Watermark Overlay */}
                {showWatermark && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                )}

                {/* Subtle Coordinate Readout */}
                {(showGuides || isDragging) && (
                  <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm border border-white/15 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-100 tabular-nums">
                    X {config.xPercent.toFixed(1)}% · Y{' '}
                    {config.yPercent.toFixed(1)}%
                  </div>
                )}

                {!showWatermark && (
                  <div className="pointer-events-none absolute top-2 left-2 rounded-sm border border-white/15 bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100">
                    Video Asli (Tanpa WM)
                  </div>
                )}
              </div>

              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Klik dan seret langsung pada pratinjau untuk memindahkan posisi
                (snap otomatis ke tengah 50%).
              </p>
            </div>

            {/* Compact Player Control Bar */}
            <Card className="p-2.5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={handleTogglePlay}
                    disabled={!activeRawVideoUrl}
                    aria-label={isPlaying ? 'Jeda video' : 'Putar video'}
                    title={isPlaying ? 'Jeda' : 'Putar'}
                  >
                    {isPlaying ? (
                      <Pause className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Play className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setIsMuted((m) => !m)}
                    disabled={!activeRawVideoUrl}
                    aria-label={isMuted ? 'Aktifkan suara' : 'Bisukan suara'}
                    title={isMuted ? 'Aktifkan suara' : 'Bisukan'}
                  >
                    {isMuted ? (
                      <VolumeX className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Volume2 className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>

                  <div className="flex-1 px-1">
                    <Slider
                      value={[currentTime]}
                      min={0}
                      max={duration > 0 ? duration : 1}
                      step={0.1}
                      disabled={!activeRawVideoUrl || duration <= 0}
                      onValueChange={handleSeek}
                      aria-label="Garis waktu video"
                    />
                  </div>

                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatSeconds(currentTime)} / {formatSeconds(duration)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border pt-2">
                  <Button
                    variant={showGuides ? 'secondary' : 'outline'}
                    size="xs"
                    onClick={() => setShowGuides((v) => !v)}
                    aria-pressed={showGuides}
                  >
                    <Crosshair className="h-3 w-3" aria-hidden="true" />
                    <span>Garis Bantu</span>
                  </Button>

                  <Button
                    variant={showWatermark ? 'secondary' : 'outline'}
                    size="xs"
                    onClick={() => setShowWatermark((v) => !v)}
                    aria-pressed={showWatermark}
                  >
                    {showWatermark ? (
                      <Eye className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3 w-3" aria-hidden="true" />
                    )}
                    <span>Tampilkan WM</span>
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          {/* Right Column: 3 Clean Tabs + Sticky Render Footer */}
          <section
            aria-label="Pengaturan watermark dan antrean render"
            className="flex min-h-0 flex-col lg:col-span-7"
          >
            {/* Scrollable Tab Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as StudioTab)}
              >
                <TabsList
                  aria-label="Kategori pengaturan watermark"
                  className="grid w-full grid-cols-3"
                >
                  <TabsTrigger value="preset">Preset & Teks</TabsTrigger>
                  <TabsTrigger value="posisi">Posisi & Ukuran</TabsTrigger>
                  <TabsTrigger value="gaya">Warna & Outline</TabsTrigger>
                </TabsList>

                {/* TAB 1: Preset & Teks */}
                <TabsContent value="preset" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Manajer Preset
                        </CardTitle>
                        {selectedPreset?.isBuiltIn && (
                          <Badge variant="muted" size="xs">
                            Preset Bawaan
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="wm-preset-select"
                          className="block text-xs font-medium text-foreground"
                        >
                          Pilih Preset Tersimpan
                        </label>
                        <NativeSelect
                          id="wm-preset-select"
                          value={selectedPresetId}
                          onChange={(e) => handleSelectPreset(e.target.value)}
                          className="w-full"
                          disabled={!presetStore || presetStore.presets.length === 0}
                        >
                          {!presetStore || presetStore.presets.length === 0 ? (
                            <option value="">Memuat preset...</option>
                          ) : (
                            presetStore.presets.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}
                                {preset.isDefault ? ' (Default)' : ''}
                                {preset.isBuiltIn ? ' [Bawaan]' : ''}
                              </option>
                            ))
                          )}
                        </NativeSelect>
                        {selectedPreset?.description && (
                          <p className="text-[11px] text-muted-foreground">
                            {selectedPreset.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setIsCreatingPreset((v) => !v)}
                          disabled={isMutatingPreset}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span>Simpan Baru</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={handleUpdatePreset}
                          disabled={!selectedPreset || isMutatingPreset}
                        >
                          <Save className="h-3 w-3" aria-hidden="true" />
                          <span>Perbarui</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={handleSetDefaultPreset}
                          disabled={
                            !selectedPreset ||
                            selectedPreset.isDefault ||
                            isMutatingPreset
                          }
                        >
                          <Star className="h-3 w-3" aria-hidden="true" />
                          <span>Jadikan Default</span>
                        </Button>

                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={handleDeletePreset}
                          disabled={
                            !selectedPreset ||
                            selectedPreset.isBuiltIn ||
                            isMutatingPreset
                          }
                          title={
                            selectedPreset?.isBuiltIn
                              ? 'Preset bawaan tidak dapat dihapus'
                              : 'Hapus preset terpilih'
                          }
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Hapus</span>
                        </Button>
                      </div>

                      {isCreatingPreset && (
                        <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
                          <label
                            htmlFor="wm-new-preset-name"
                            className="block text-xs font-medium text-foreground"
                          >
                            Nama Preset Baru
                          </label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="wm-new-preset-name"
                              value={newPresetName}
                              onChange={(e) => setNewPresetName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreatePreset();
                                if (e.key === 'Escape') {
                                  setIsCreatingPreset(false);
                                  setNewPresetName('');
                                }
                              }}
                              placeholder="Contoh: Sudut Bawah Tipis"
                              autoFocus
                            />
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleCreatePreset}
                              disabled={isMutatingPreset || !newPresetName.trim()}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Simpan</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsCreatingPreset(false);
                                setNewPresetName('');
                              }}
                              disabled={isMutatingPreset}
                            >
                              Batal
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Teks & Tipografi
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={handleResetReference}
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          <span>Reset ke Referensi</span>
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="wm-text-input"
                          className="block text-xs font-medium text-foreground"
                        >
                          Teks Watermark
                        </label>
                        <Input
                          id="wm-text-input"
                          value={config.text}
                          onChange={(e) =>
                            updateConfig({ text: e.target.value })
                          }
                          placeholder="@jurnaldunia_"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="wm-font-select"
                          className="block text-xs font-medium text-foreground"
                        >
                          Jenis Huruf (Font)
                        </label>
                        <NativeSelect
                          id="wm-font-select"
                          value={config.fontId}
                          onChange={(e) =>
                            updateConfig({ fontId: e.target.value })
                          }
                          className="w-full"
                        >
                          {fonts.length === 0 ? (
                            <option value={config.fontId}>
                              Arial Black (Bawaan)
                            </option>
                          ) : (
                            fonts.map((font) => (
                              <option key={font.id} value={font.id}>
                                {font.label} ({font.weight})
                              </option>
                            ))
                          )}
                        </NativeSelect>
                        <p className="text-[11px] text-muted-foreground">
                          Font dimuat langsung dari server lokal sehingga hasil
                          pratinjau identik dengan hasil render video akhir.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB 2: Posisi & Ukuran */}
                <TabsContent value="posisi" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Titik Jangkar Cepat (3x3)
                        </CardTitle>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {config.anchor === 'custom'
                            ? 'Kustom'
                            : ANCHOR_COORDINATES[config.anchor]?.label}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-1.5">
                        {ANCHOR_GRID_KEYS.map((anchorKey) => {
                          const coord = ANCHOR_COORDINATES[anchorKey];
                          const isActive = config.anchor === anchorKey;
                          return (
                            <button
                              key={anchorKey}
                              type="button"
                              onClick={() =>
                                updateConfig({
                                  anchor: anchorKey,
                                  xPercent: coord.xPercent,
                                  yPercent: coord.yPercent,
                                })
                              }
                              aria-pressed={isActive}
                              className={`min-h-9 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                                isActive
                                  ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                  : 'border-border bg-card text-foreground hover:bg-muted'
                              }`}
                            >
                              {coord.label}
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Presisi Posisi & Dimensi
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Posisi X */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Posisi X (%)
                          </span>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {config.xPercent.toFixed(1)}%
                          </span>
                        </div>
                        <Slider
                          value={[config.xPercent]}
                          min={0}
                          max={100}
                          step={0.5}
                          aria-label="Posisi X persen"
                          onValueChange={(v) =>
                            updateConfig({
                              xPercent: getSliderScalar(v),
                              anchor: 'custom',
                            })
                          }
                        />
                      </div>

                      {/* Posisi Y */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Posisi Y (%)
                          </span>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {config.yPercent.toFixed(1)}%
                          </span>
                        </div>
                        <Slider
                          value={[config.yPercent]}
                          min={0}
                          max={100}
                          step={0.5}
                          aria-label="Posisi Y persen"
                          onValueChange={(v) =>
                            updateConfig({
                              yPercent: getSliderScalar(v),
                              anchor: 'custom',
                            })
                          }
                        />
                      </div>

                      <Separator />

                      {/* Ukuran Font */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Ukuran Font (px)
                          </span>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {config.fontSizePx} px
                          </span>
                        </div>
                        <Slider
                          value={[config.fontSizePx]}
                          min={24}
                          max={140}
                          step={1}
                          aria-label="Ukuran Font piksel"
                          onValueChange={(v) =>
                            updateConfig({
                              fontSizePx: Math.round(getSliderScalar(v)),
                            })
                          }
                        />
                      </div>

                      {/* Jarak Huruf */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Jarak Huruf (px)
                          </span>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {config.letterSpacingPx.toFixed(1)} px
                          </span>
                        </div>
                        <Slider
                          value={[config.letterSpacingPx]}
                          min={-4}
                          max={16}
                          step={0.5}
                          aria-label="Jarak Huruf piksel"
                          onValueChange={(v) =>
                            updateConfig({
                              letterSpacingPx: getSliderScalar(v),
                            })
                          }
                        />
                      </div>

                      {/* Rotasi */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Rotasi (deg)
                          </span>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {config.rotationDeg} deg
                          </span>
                        </div>
                        <Slider
                          value={[config.rotationDeg]}
                          min={-45}
                          max={45}
                          step={1}
                          aria-label="Rotasi derajat"
                          onValueChange={(v) =>
                            updateConfig({
                              rotationDeg: Math.round(getSliderScalar(v)),
                            })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* TAB 3: Warna & Outline */}
                <TabsContent value="gaya" className="space-y-4">
                  {/* Fill Color + Opacity */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Warna Isi & Transparansi
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="wm-fill-color"
                            className="text-xs font-medium text-foreground"
                          >
                            Warna Teks
                          </label>
                          <input
                            id="wm-fill-color"
                            type="color"
                            value={config.fillColor}
                            onChange={(e) =>
                              updateConfig({ fillColor: e.target.value })
                            }
                            className="h-8 w-10 cursor-pointer rounded-md border border-border bg-card p-0.5"
                          />
                          <span className="font-mono text-xs uppercase text-muted-foreground">
                            {config.fillColor}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {EDITORIAL_SWATCHES.map((swatch) => {
                            const active =
                              config.fillColor.toUpperCase() ===
                              swatch.hex.toUpperCase();
                            return (
                              <button
                                key={swatch.hex}
                                type="button"
                                onClick={() =>
                                  updateConfig({ fillColor: swatch.hex })
                                }
                                title={`${swatch.label} (${swatch.hex})`}
                                aria-label={`Pilih warna isi ${swatch.label}`}
                                className={`h-6 w-6 rounded-sm border transition-transform ${
                                  active
                                    ? 'border-foreground ring-2 ring-ring scale-105'
                                    : 'border-border hover:scale-105'
                                }`}
                                style={{ backgroundColor: swatch.hex }}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Opacity Global (%)
                          </span>
                          <span className="font-mono text-muted-foreground tabular-nums">
                            {Math.round(config.opacity * 100)}%
                          </span>
                        </div>
                        <Slider
                          value={[Math.round(config.opacity * 100)]}
                          min={5}
                          max={100}
                          step={1}
                          aria-label="Opacity Global persen"
                          onValueChange={(v) =>
                            updateConfig({
                              opacity:
                                Math.round(getSliderScalar(v)) / 100,
                            })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Outline / Stroke */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="wm-stroke-switch"
                          className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          Outline / Stroke
                        </label>
                        <Switch
                          id="wm-stroke-switch"
                          checked={config.strokeEnabled}
                          onCheckedChange={(checked) =>
                            updateConfig({ strokeEnabled: checked })
                          }
                        />
                      </div>
                    </CardHeader>
                    {config.strokeEnabled && (
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor="wm-stroke-color"
                              className="text-xs font-medium text-foreground"
                            >
                              Warna Stroke
                            </label>
                            <input
                              id="wm-stroke-color"
                              type="color"
                              value={config.strokeColor}
                              onChange={(e) =>
                                updateConfig({ strokeColor: e.target.value })
                              }
                              className="h-8 w-10 cursor-pointer rounded-md border border-border bg-card p-0.5"
                            />
                            <span className="font-mono text-xs uppercase text-muted-foreground">
                              {config.strokeColor}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {EDITORIAL_SWATCHES.map((swatch) => {
                              const active =
                                config.strokeColor.toUpperCase() ===
                                swatch.hex.toUpperCase();
                              return (
                                <button
                                  key={`stroke-${swatch.hex}`}
                                  type="button"
                                  onClick={() =>
                                    updateConfig({ strokeColor: swatch.hex })
                                  }
                                  title={`${swatch.label} (${swatch.hex})`}
                                  aria-label={`Pilih warna stroke ${swatch.label}`}
                                  className={`h-6 w-6 rounded-sm border transition-transform ${
                                    active
                                      ? 'border-foreground ring-2 ring-ring scale-105'
                                      : 'border-border hover:scale-105'
                                  }`}
                                  style={{ backgroundColor: swatch.hex }}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">
                              Ketebalan Stroke (px)
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {config.strokeWidthPx.toFixed(1)} px
                            </span>
                          </div>
                          <Slider
                            value={[config.strokeWidthPx]}
                            min={0}
                            max={12}
                            step={0.5}
                            aria-label="Ketebalan Stroke piksel"
                            onValueChange={(v) =>
                              updateConfig({
                                strokeWidthPx: getSliderScalar(v),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">
                              Opacity Stroke (%)
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {Math.round(config.strokeOpacity * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[Math.round(config.strokeOpacity * 100)]}
                            min={0}
                            max={100}
                            step={1}
                            aria-label="Opacity Stroke persen"
                            onValueChange={(v) =>
                              updateConfig({
                                strokeOpacity:
                                  Math.round(getSliderScalar(v)) / 100,
                              })
                            }
                          />
                        </div>
                      </CardContent>
                    )}
                  </Card>

                  {/* Shadow Halus */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="wm-shadow-switch"
                          className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          Shadow Halus
                        </label>
                        <Switch
                          id="wm-shadow-switch"
                          checked={config.shadowEnabled}
                          onCheckedChange={(checked) =>
                            updateConfig({ shadowEnabled: checked })
                          }
                        />
                      </div>
                    </CardHeader>
                    {config.shadowEnabled && (
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="wm-shadow-color"
                            className="text-xs font-medium text-foreground"
                          >
                            Warna Shadow
                          </label>
                          <input
                            id="wm-shadow-color"
                            type="color"
                            value={config.shadowColor}
                            onChange={(e) =>
                              updateConfig({ shadowColor: e.target.value })
                            }
                            className="h-8 w-10 cursor-pointer rounded-md border border-border bg-card p-0.5"
                          />
                          <span className="font-mono text-xs uppercase text-muted-foreground">
                            {config.shadowColor}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">
                              Blur Shadow (px)
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {config.shadowBlurPx} px
                            </span>
                          </div>
                          <Slider
                            value={[config.shadowBlurPx]}
                            min={0}
                            max={24}
                            step={1}
                            aria-label="Blur Shadow piksel"
                            onValueChange={(v) =>
                              updateConfig({
                                shadowBlurPx: Math.round(getSliderScalar(v)),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">
                              Opacity Shadow (%)
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {Math.round(config.shadowOpacity * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[Math.round(config.shadowOpacity * 100)]}
                            min={0}
                            max={100}
                            step={1}
                            aria-label="Opacity Shadow persen"
                            onValueChange={(v) =>
                              updateConfig({
                                shadowOpacity:
                                  Math.round(getSliderScalar(v)) / 100,
                              })
                            }
                          />
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Sticky Render Footer + Live Queue Panel */}
            <footer className="shrink-0 border-t border-border bg-card p-4 space-y-3">
              {/* Live Render Queue Panel (shown only when jobs exist) */}
              {sortedJobs.length > 0 && (
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/40 p-2.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Antrean Render FFmpeg</span>
                    <span className="font-mono tabular-nums">
                      {sortedJobs.length} tugas
                    </span>
                  </div>
                  <div className="space-y-2">
                    {sortedJobs.slice(0, 6).map((job) => {
                      const badge = getJobStatusBadge(job.status);
                      const isActiveJob =
                        job.status === 'queued' || job.status === 'rendering';
                      const clampedPct = clampNumber(job.percent, 0, 100);

                      return (
                        <div
                          key={job.jobId}
                          className="rounded-md border border-border bg-card p-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {job.folderCode}
                              </span>
                              <Badge variant={badge.variant} size="xs">
                                {job.status === 'completed' && (
                                  <CheckCircle2
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                )}
                                {job.status === 'queued' && (
                                  <Clock
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>{badge.label}</span>
                              </Badge>
                              {job.encoderUsed && (
                                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                  {job.encoderUsed}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                {Math.round(clampedPct)}%
                                {job.speed ? ` · ${job.speed}` : ''}
                                {job.etaSec !== null && isActiveJob
                                  ? ` · ETA ${formatEta(job.etaSec)}`
                                  : ''}
                              </span>
                              {isActiveJob && (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => handleCancelJob(job.jobId)}
                                  className="h-5 px-1.5 text-[11px] text-destructive hover:text-destructive"
                                >
                                  <Ban
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  <span>Batalkan</span>
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full transition-all ${
                                job.status === 'failed'
                                  ? 'bg-destructive'
                                  : job.status === 'completed'
                                  ? 'bg-[#166534] dark:bg-[#4ade80]'
                                  : 'bg-primary'
                              }`}
                              style={{ width: `${clampedPct}%` }}
                            />
                          </div>

                          {job.status === 'failed' && job.error && (
                            <p className="text-[11px] text-destructive truncate">
                              {job.error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Encoder, Output Mode & Render Buttons */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
                <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="wm-encoder-select"
                      className="block text-[11px] font-medium text-muted-foreground"
                    >
                      Encoder Video
                    </label>
                    <NativeSelect
                      id="wm-encoder-select"
                      value={encoder}
                      onChange={(e) =>
                        setEncoder(e.target.value as WatermarkEncoderMode)
                      }
                      className="w-full"
                    >
                      <option value="auto">Otomatis (Rekomendasi)</option>
                      <option value="x264">
                        Kualitas Maksimal (x264 CRF 16)
                      </option>
                      <option
                        value="nvenc"
                        disabled={!capabilities.nvencAvailable}
                      >
                        {capabilities.nvencAvailable
                          ? 'Cepat GPU (NVENC CQ 17)'
                          : 'Cepat GPU (NVENC Tidak Tersedia)'}
                      </option>
                    </NativeSelect>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="wm-output-mode-select"
                      className="block text-[11px] font-medium text-muted-foreground"
                    >
                      Mode Output File
                    </label>
                    <NativeSelect
                      id="wm-output-mode-select"
                      value={outputMode}
                      onChange={(e) =>
                        setOutputMode(e.target.value as WatermarkOutputMode)
                      }
                      className="w-full"
                    >
                      <option value="separate_wm_file">
                        Simpan ke wm_final.mp4
                      </option>
                      <option value="overwrite_source">
                        Timpa Video Asli (Overwrite)
                      </option>
                    </NativeSelect>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    variant="default"
                    size="default"
                    disabled={
                      !activeItem ||
                      !activeHasRawVideo ||
                      !capabilities.ffmpegAvailable ||
                      isSubmittingRender
                    }
                    onClick={() =>
                      activeItem &&
                      triggerRender(
                        [activeItem.id],
                        `Video ${activeItem.folderCode}`
                      )
                    }
                    title={
                      !activeHasRawVideo
                        ? 'Video mentah (motionprovit) tidak ditemukan pada folder ini'
                        : undefined
                    }
                  >
                    <Film className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      Render Video Ini ({activeItem?.folderCode ?? '-'})
                    </span>
                  </Button>

                  <Button
                    variant="editorial"
                    size="default"
                    disabled={
                      needsWmItems.length === 0 ||
                      !capabilities.ffmpegAvailable ||
                      isSubmittingRender
                    }
                    onClick={() =>
                      triggerRender(
                        needsWmItems.map((it) => it.id),
                        `${needsWmItems.length} video butuh WM`
                      )
                    }
                  >
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      Render Semua Butuh WM ({needsWmItems.length})
                    </span>
                  </Button>
                </div>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WatermarkStudioModal;
