import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearch } from '@tanstack/react-router';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Film,
  Grid2x2,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { ContentPlannerItem } from '@/types/planner';
import {
  ANCHOR_COORDINATES,
  DEFAULT_WATERMARK_CONFIG,
  type WatermarkAnchor,
  type WatermarkCapabilities,
  type WatermarkEncoderMode,
  type WatermarkFontOption,
  type WatermarkPresetStore,
  type WatermarkRenderJob,
  type WatermarkRenderSpeedMode,
  type WatermarkStyleConfig,
} from '@/types/watermark';
import { buildWatermarkSvg, clampNumber } from '../../../shared/watermarkSvg';
import {
  watermarkApi,
  type WatermarkOutputMode,
} from '@/services/watermarkApi';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input, Separator } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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
  qsvAvailable: false,
  amfAvailable: false,
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

function formatSampleLabel(item: ContentPlannerItem): string {
  const statusTag = item.autoMetadata.readiness.hasWmFinal
    ? 'WM siap'
    : 'Butuh WM';
  const rawTitle =
    item.userProperties.customTitle ||
    item.autoMetadata.captionParsed.hookTitle ||
    'Tanpa judul';
  const title = rawTitle.length > 36 ? `${rawTitle.slice(0, 36)}...` : rawTitle;
  return `${item.folderCode} (${statusTag}) · ${title}`;
}

export function WatermarkPage() {
  const workspace = usePlannerWorkspace();
  const { allItems: items, activeWorkspace, refresh, showToast } = workspace;
  const routeSearch = useSearch({ from: '/planner-layout' });
  const initialItemId = routeSearch.item ?? routeSearch.watermark ?? null;
  const watermarkPolicy =
    activeWorkspace?.rules.watermarkPolicy ?? 'separate_wm_file';

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
  const [speedMode, setSpeedMode] = useState<WatermarkRenderSpeedMode>('fast');
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
  }, [watermarkPolicy]);

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
  const refreshRef = useRef(refresh);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    refreshRef.current = refresh;
    showToastRef.current = showToast;
  }, [refresh, showToast]);

  // Select item from ?item search param or best available video sample
  useEffect(() => {
    if (items.length === 0) return;
    if (initialItemId && items.some((it) => it.id === initialItemId)) {
      setSelectedItemId(initialItemId);
      return;
    }
    setSelectedItemId((prev) => {
      if (prev && items.some((it) => it.id === prev)) return prev;
      const firstNeedsWm = items.find(
        (it) =>
          !it.autoMetadata.readiness.hasWmFinal &&
          it.autoMetadata.readiness.hasRawVideo
      );
      const firstWithRaw = items.find(
        (it) => it.autoMetadata.readiness.hasRawVideo
      );
      const fallbackItem = firstNeedsWm ?? firstWithRaw ?? items[0] ?? null;
      return fallbackItem ? fallbackItem.id : '';
    });
  }, [initialItemId, items]);

  // Load fonts, capabilities, presets, and active jobs on mount
  useEffect(() => {
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

    void loadStudioData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to SSE render progress stream
  useEffect(() => {
    const handleJobTransitions = (incomingJobs: WatermarkRenderJob[]) => {
      let anyCompleted = false;
      for (const job of incomingJobs) {
        if (handledTerminalJobsRef.current.has(job.jobId)) continue;
        if (job.status === 'completed') {
          handledTerminalJobsRef.current.add(job.jobId);
          anyCompleted = true;
          showToastRef.current(
            `Render selesai: ${job.folderCode} (${job.outputFile || 'wm_final.mp4'})`,
            'success'
          );
        } else if (job.status === 'failed') {
          handledTerminalJobsRef.current.add(job.jobId);
          showToastRef.current(
            `Render gagal (${job.folderCode}): ${job.error || 'Terjadi kesalahan saat merender.'}`,
            'error'
          );
        } else if (job.status === 'cancelled') {
          handledTerminalJobsRef.current.add(job.jobId);
        }
      }
      if (anyCompleted) {
        refreshRef.current();
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
  }, []);

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
  const activeFileName =
    activeItem?.autoMetadata.assets.rawVideo.fileName ||
    activeItem?.autoMetadata.assets.wmVideo.fileName ||
    'Tidak ada video';

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
      showToast('Masukkan nama preset terlebih dahulu.', 'error');
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
      showToast(`Preset "${data.preset.name}" berhasil disimpan.`, 'success');
    } catch (err) {
      showToast(
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
      showToast(`Preset "${data.preset.name}" diperbarui.`, 'success');
    } catch (err) {
      showToast(
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
      showToast(
        `Preset "${selectedPreset.name}" dijadikan default.`,
        'success'
      );
    } catch (err) {
      showToast(
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
      showToast(`Preset "${selectedPreset.name}" dihapus.`, 'info');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghapus preset.',
        'error'
      );
    } finally {
      setIsMutatingPreset(false);
    }
  };

  const handleResetReference = () => {
    setConfig({ ...DEFAULT_WATERMARK_CONFIG });
    showToast('Pengaturan watermark dikembalikan ke referensi standar.', 'info');
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
        speedMode,
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
        showToast(
          `Tidak ada video yang dirender: ${data.skipped[0].reason}`,
          'error'
        );
      } else {
        showToast(`Antrean render dimulai: ${label}`, 'info');
      }
    } catch (err) {
      showToast(
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
      showToast('Tugas render dibatalkan.', 'info');
    } catch (err) {
      showToast(
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

  const encoderLabel = useMemo(() => {
    if (encoder === 'x264') return 'CPU x264 (CRF 16)';
    if (encoder === 'nvenc') {
      return capabilities.nvencAvailable
        ? 'NVIDIA NVENC GPU (CQ 17)'
        : 'NVENC (Tidak tersedia)';
    }
    if (encoder === 'qsv') {
      return capabilities.qsvAvailable
        ? 'Intel QuickSync GPU (ICQ 17)'
        : 'Intel QSV (Tidak tersedia)';
    }
    if (encoder === 'amf') {
      return capabilities.amfAvailable
        ? 'AMD AMF GPU (CQP 17)'
        : 'AMD AMF (Tidak tersedia)';
    }
    const recName =
      capabilities.recommendedEncoder === 'nvenc'
        ? 'NVENC GPU'
        : capabilities.recommendedEncoder === 'qsv'
          ? 'Intel QSV GPU'
          : capabilities.recommendedEncoder === 'amf'
            ? 'AMD AMF GPU'
            : 'CPU x264';
    return `Otomatis (${recName})`;
  }, [
    encoder,
    capabilities.nvencAvailable,
    capabilities.qsvAvailable,
    capabilities.amfAvailable,
    capabilities.recommendedEncoder,
  ]);

  const outputModeLabel =
    outputMode === 'overwrite_source'
      ? 'Timpa video asli'
      : 'File wm_final.mp4';

  const presetLabel = useMemo(() => {
    if (!selectedPreset) return 'Memuat preset...';
    const suffix = selectedPreset.isDefault ? ' (Default)' : '';
    return `${selectedPreset.name}${suffix}`;
  }, [selectedPreset]);

  const fontLabel = useMemo(() => {
    if (!activeFont) return 'Arial Black (Bawaan)';
    return `${activeFont.label} (${activeFont.weight})`;
  }, [activeFont]);

  return (
    <div className="space-y-4">
      {fontFaceCss ? <style data-watermark-fonts>{fontFaceCss}</style> : null}

      {capabilitiesLoaded && !capabilities.ffmpegAvailable ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            FFmpeg tidak terdeteksi di sistem. Instal FFmpeg agar proses render
            watermark dapat berjalan.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        {/* Left Column: Interactive 9:16 Video Canvas Card */}
        <section
          aria-label="Pratinjau video 9:16"
          className="lg:col-span-5"
        >
          <Card>
            <CardContent className="space-y-3.5 p-4">
              {/* Sample Video Selector Header */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="wm-sample-select"
                    className="text-xs font-medium text-foreground"
                  >
                    Sampel video
                  </label>
                  <span
                    className="truncate font-mono text-[11px] font-light text-muted-foreground/75"
                    title={activeFileName}
                  >
                    {activeFileName}
                  </span>
                </div>

                <Select
                  value={activeItem?.id ?? ''}
                  onValueChange={(next) => {
                    if (typeof next === 'string' && next.length > 0) {
                      setSelectedItemId(next);
                    }
                  }}
                  disabled={items.length === 0}
                >
                  <SelectTrigger
                    id="wm-sample-select"
                    className="h-9 w-full text-xs"
                  >
                    <SelectValue>
                      {activeItem
                        ? formatSampleLabel(activeItem)
                        : 'Belum ada konten tersedia'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {items.map((it) => (
                      <SelectItem
                        key={it.id}
                        value={it.id}
                        className="text-xs"
                      >
                        {formatSampleLabel(it)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Interactive 9:16 Video Preview Container */}
              <div
                ref={previewContainerRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                role="application"
                aria-label="Kanvas pratinjau watermark. Klik dan seret untuk mengatur posisi watermark."
                className={cn(
                  'relative mx-auto aspect-[9/16] max-h-[540px] w-full max-w-[304px] select-none overflow-hidden rounded-lg border border-border bg-black touch-none',
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                )}
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
                    <span>Pilih konten yang memiliki video.</span>
                  </div>
                )}

                {/* Center Crosshair Guides */}
                {showGuides ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                  >
                    <div
                      className={cn(
                        'absolute inset-y-0 left-1/2 -translate-x-px border-l',
                        isSnappedX
                          ? 'border-[#f59e0b]/90'
                          : 'border-dashed border-white/30'
                      )}
                    />
                    <div
                      className={cn(
                        'absolute inset-x-0 top-1/2 -translate-y-px border-t',
                        isSnappedY
                          ? 'border-[#f59e0b]/90'
                          : 'border-dashed border-white/30'
                      )}
                    />
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-black/40" />
                  </div>
                ) : null}

                {/* Live WYSIWYG SVG Watermark Overlay */}
                {showWatermark ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                ) : null}

                {/* Coordinate Pill */}
                {showGuides || isDragging ? (
                  <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm border border-white/15 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-100 tabular-nums">
                    X {config.xPercent.toFixed(1)}% · Y{' '}
                    {config.yPercent.toFixed(1)}%
                  </div>
                ) : null}

                {!showWatermark ? (
                  <div className="pointer-events-none absolute top-2 left-2 rounded-sm border border-white/15 bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100">
                    Tanpa watermark
                  </div>
                ) : null}
              </div>

              {/* Clean 1-Row Player Control Bar */}
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                <IconActionButton
                  icon={isPlaying ? Pause : Play}
                  label={isPlaying ? 'Jeda video' : 'Putar video'}
                  variant="outline"
                  size="icon-xs"
                  onClick={() => void handleTogglePlay()}
                  disabled={!activeRawVideoUrl}
                />

                <IconActionButton
                  icon={isMuted ? VolumeX : Volume2}
                  label={isMuted ? 'Aktifkan suara' : 'Bisukan suara'}
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setIsMuted((m) => !m)}
                  disabled={!activeRawVideoUrl}
                />

                <div className="min-w-0 flex-1 px-1">
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

                <Separator orientation="vertical" className="mx-0.5 h-4" />

                <IconActionButton
                  icon={Grid2x2}
                  label="Garis bantu"
                  variant={showGuides ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  aria-pressed={showGuides}
                  onClick={() => setShowGuides((v) => !v)}
                />

                <IconActionButton
                  icon={showWatermark ? Eye : EyeOff}
                  label="Tampilkan watermark"
                  variant={showWatermark ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  aria-pressed={showWatermark}
                  onClick={() => setShowWatermark((v) => !v)}
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Right Column: Clean Control Workbench */}
        <section
          aria-label="Pengaturan watermark dan antrean render"
          className="space-y-4 lg:col-span-7"
        >
          {/* Main Controls Card */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as StudioTab)}
              >
                <TabsList
                  aria-label="Kategori pengaturan watermark"
                  className="grid w-full grid-cols-3"
                >
                  <TabsTrigger value="preset">Preset</TabsTrigger>
                  <TabsTrigger value="posisi">Posisi</TabsTrigger>
                  <TabsTrigger value="gaya">Gaya</TabsTrigger>
                </TabsList>

                {/* TAB 1: Preset */}
                <TabsContent value="preset" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="wm-preset-select"
                        className="text-xs font-medium text-foreground"
                      >
                        Preset tersimpan
                      </label>
                      {selectedPreset?.isBuiltIn ? (
                        <Badge variant="muted" size="xs">
                          Bawaan
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <Select
                          value={selectedPresetId}
                          onValueChange={(next) => {
                            if (typeof next === 'string' && next.length > 0) {
                              handleSelectPreset(next);
                            }
                          }}
                          disabled={
                            !presetStore || presetStore.presets.length === 0
                          }
                        >
                          <SelectTrigger
                            id="wm-preset-select"
                            className="h-9 w-full text-xs"
                          >
                            <SelectValue>{presetLabel}</SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {(presetStore?.presets ?? []).map((preset) => (
                              <SelectItem
                                key={preset.id}
                                value={preset.id}
                                className="text-xs"
                              >
                                {preset.name}
                                {preset.isDefault ? ' (Default)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <IconActionButton
                          icon={Plus}
                          label="Simpan preset baru"
                          variant={isCreatingPreset ? 'secondary' : 'outline'}
                          size="icon"
                          onClick={() => setIsCreatingPreset((v) => !v)}
                          disabled={isMutatingPreset}
                        />
                        <IconActionButton
                          icon={Save}
                          label="Perbarui preset"
                          variant="outline"
                          size="icon"
                          onClick={() => void handleUpdatePreset()}
                          disabled={!selectedPreset || isMutatingPreset}
                        />
                        <IconActionButton
                          icon={Star}
                          label="Jadikan default"
                          variant={
                            selectedPreset?.isDefault ? 'secondary' : 'outline'
                          }
                          size="icon"
                          onClick={() => void handleSetDefaultPreset()}
                          disabled={
                            !selectedPreset ||
                            selectedPreset.isDefault ||
                            isMutatingPreset
                          }
                        />
                        <IconActionButton
                          icon={Trash2}
                          label="Hapus preset"
                          variant="outline"
                          size="icon"
                          onClick={() => void handleDeletePreset()}
                          disabled={
                            !selectedPreset ||
                            selectedPreset.isBuiltIn ||
                            isMutatingPreset
                          }
                          className="text-destructive hover:text-destructive"
                        />
                        <IconActionButton
                          icon={RotateCcw}
                          label="Reset ke referensi"
                          variant="outline"
                          size="icon"
                          onClick={handleResetReference}
                        />
                      </div>
                    </div>

                    {isCreatingPreset ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2.5">
                        <Input
                          id="wm-new-preset-name"
                          aria-label="Nama preset baru"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCreatePreset();
                            if (e.key === 'Escape') {
                              setIsCreatingPreset(false);
                              setNewPresetName('');
                            }
                          }}
                          placeholder="Nama preset baru..."
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="editorial"
                          size="sm"
                          onClick={() => void handleCreatePreset()}
                          disabled={isMutatingPreset || !newPresetName.trim()}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Simpan</span>
                        </Button>
                        <Button
                          type="button"
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
                    ) : null}
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="wm-text-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Teks
                      </label>
                      <Input
                        id="wm-text-input"
                        value={config.text}
                        onChange={(e) => updateConfig({ text: e.target.value })}
                        placeholder="@jurnaldunia_"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="wm-font-select"
                        className="block text-xs font-medium text-foreground"
                      >
                        Font
                      </label>
                      <Select
                        value={config.fontId}
                        onValueChange={(next) => {
                          if (typeof next === 'string' && next.length > 0) {
                            updateConfig({ fontId: next });
                          }
                        }}
                        disabled={fonts.length === 0}
                      >
                        <SelectTrigger
                          id="wm-font-select"
                          className="h-9 w-full text-xs"
                        >
                          <SelectValue>{fontLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {fonts.length === 0 ? (
                            <SelectItem
                              value={config.fontId}
                              className="text-xs"
                            >
                              Arial Black (Bawaan)
                            </SelectItem>
                          ) : (
                            fonts.map((font) => (
                              <SelectItem
                                key={font.id}
                                value={font.id}
                                className="text-xs"
                              >
                                {font.label} ({font.weight})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 2: Posisi */}
                <TabsContent value="posisi" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        Titik jangkar
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {config.anchor === 'custom'
                          ? 'Kustom'
                          : ANCHOR_COORDINATES[config.anchor]?.label}
                      </span>
                    </div>
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
                            className={cn(
                              'min-h-8 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                              isActive
                                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                                : 'border-border bg-card text-foreground hover:bg-muted'
                            )}
                          >
                            {coord.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3.5">
                    {/* Posisi X */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Posisi X
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
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Posisi Y
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

                    {/* Ukuran */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Ukuran
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
                        aria-label="Ukuran font piksel"
                        onValueChange={(v) =>
                          updateConfig({
                            fontSizePx: Math.round(getSliderScalar(v)),
                          })
                        }
                      />
                    </div>

                    {/* Spasi */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Spasi
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
                        aria-label="Spasi huruf piksel"
                        onValueChange={(v) =>
                          updateConfig({
                            letterSpacingPx: getSliderScalar(v),
                          })
                        }
                      />
                    </div>

                    {/* Rotasi */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Rotasi
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
                  </div>
                </TabsContent>

                {/* TAB 3: Gaya */}
                <TabsContent value="gaya" className="mt-4 space-y-4">
                  {/* Fill Color & Opacity */}
                  <div className="space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="wm-fill-color"
                          className="text-xs font-medium text-foreground"
                        >
                          Warna teks
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
                              className={cn(
                                'h-6 w-6 rounded-sm border transition-transform',
                                active
                                  ? 'scale-105 border-foreground ring-2 ring-ring'
                                  : 'border-border hover:scale-105'
                              )}
                              style={{ backgroundColor: swatch.hex }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          Opacity
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
                        aria-label="Opacity global persen"
                        onValueChange={(v) =>
                          updateConfig({
                            opacity: Math.round(getSliderScalar(v)) / 100,
                          })
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Outline */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="wm-stroke-switch"
                        className="cursor-pointer text-xs font-medium text-foreground"
                      >
                        Outline
                      </label>
                      <Switch
                        id="wm-stroke-switch"
                        checked={config.strokeEnabled}
                        onCheckedChange={(checked) =>
                          updateConfig({ strokeEnabled: checked })
                        }
                      />
                    </div>

                    {config.strokeEnabled ? (
                      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor="wm-stroke-color"
                              className="text-xs text-muted-foreground"
                            >
                              Warna
                            </label>
                            <input
                              id="wm-stroke-color"
                              type="color"
                              value={config.strokeColor}
                              onChange={(e) =>
                                updateConfig({ strokeColor: e.target.value })
                              }
                              className="h-7 w-9 cursor-pointer rounded-md border border-border bg-card p-0.5"
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
                                  aria-label={`Pilih warna outline ${swatch.label}`}
                                  className={cn(
                                    'h-5 w-5 rounded-sm border transition-transform',
                                    active
                                      ? 'scale-105 border-foreground ring-2 ring-ring'
                                      : 'border-border hover:scale-105'
                                  )}
                                  style={{ backgroundColor: swatch.hex }}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Ketebalan
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
                            aria-label="Ketebalan outline piksel"
                            onValueChange={(v) =>
                              updateConfig({
                                strokeWidthPx: getSliderScalar(v),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Opacity
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
                            aria-label="Opacity outline persen"
                            onValueChange={(v) =>
                              updateConfig({
                                strokeOpacity:
                                  Math.round(getSliderScalar(v)) / 100,
                              })
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <Separator />

                  {/* Shadow */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="wm-shadow-switch"
                        className="cursor-pointer text-xs font-medium text-foreground"
                      >
                        Shadow
                      </label>
                      <Switch
                        id="wm-shadow-switch"
                        checked={config.shadowEnabled}
                        onCheckedChange={(checked) =>
                          updateConfig({ shadowEnabled: checked })
                        }
                      />
                    </div>

                    {config.shadowEnabled ? (
                      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="wm-shadow-color"
                            className="text-xs text-muted-foreground"
                          >
                            Warna
                          </label>
                          <input
                            id="wm-shadow-color"
                            type="color"
                            value={config.shadowColor}
                            onChange={(e) =>
                              updateConfig({ shadowColor: e.target.value })
                            }
                            className="h-7 w-9 cursor-pointer rounded-md border border-border bg-card p-0.5"
                          />
                          <span className="font-mono text-xs uppercase text-muted-foreground">
                            {config.shadowColor}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Blur</span>
                            <span className="font-mono text-muted-foreground tabular-nums">
                              {config.shadowBlurPx} px
                            </span>
                          </div>
                          <Slider
                            value={[config.shadowBlurPx]}
                            min={0}
                            max={24}
                            step={1}
                            aria-label="Blur shadow piksel"
                            onValueChange={(v) =>
                              updateConfig({
                                shadowBlurPx: Math.round(getSliderScalar(v)),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Opacity
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
                            aria-label="Opacity shadow persen"
                            onValueChange={(v) =>
                              updateConfig({
                                shadowOpacity:
                                  Math.round(getSliderScalar(v)) / 100,
                              })
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Render Action Card */}
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="wm-encoder-select"
                    className="block text-xs font-medium text-foreground"
                  >
                    Encoder
                  </label>
                  <Select
                    value={encoder}
                    onValueChange={(next) => {
                      if (
                        next === 'auto' ||
                        next === 'nvenc' ||
                        next === 'qsv' ||
                        next === 'amf' ||
                        next === 'x264'
                      ) {
                        setEncoder(next);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="wm-encoder-select"
                      className="h-9 w-full text-xs"
                    >
                      <SelectValue>{encoderLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectItem value="auto" className="text-xs">
                        Otomatis (GPU tercepat / CPU)
                      </SelectItem>
                      <SelectItem
                        value="qsv"
                        disabled={!capabilities.qsvAvailable}
                        className="text-xs"
                      >
                        {capabilities.qsvAvailable
                          ? 'Intel QuickSync GPU (ICQ 17)'
                          : 'Intel QSV (Tidak tersedia)'}
                      </SelectItem>
                      <SelectItem
                        value="nvenc"
                        disabled={!capabilities.nvencAvailable}
                        className="text-xs"
                      >
                        {capabilities.nvencAvailable
                          ? 'NVIDIA NVENC GPU (CQ 17)'
                          : 'NVENC (Tidak tersedia)'}
                      </SelectItem>
                      <SelectItem
                        value="amf"
                        disabled={!capabilities.amfAvailable}
                        className="text-xs"
                      >
                        {capabilities.amfAvailable
                          ? 'AMD AMF GPU (CQP 17)'
                          : 'AMD AMF (Tidak tersedia)'}
                      </SelectItem>
                      <SelectItem value="x264" className="text-xs">
                        CPU x264 (CRF 16)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="wm-output-mode-select"
                    className="block text-xs font-medium text-foreground"
                  >
                    Output
                  </label>
                  <Select
                    value={outputMode}
                    onValueChange={(next) => {
                      if (
                        next === 'separate_wm_file' ||
                        next === 'overwrite_source'
                      ) {
                        setOutputMode(next);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="wm-output-mode-select"
                      className="h-9 w-full text-xs"
                    >
                      <SelectValue>{outputModeLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectItem
                        value="separate_wm_file"
                        className="text-xs"
                      >
                        File wm_final.mp4
                      </SelectItem>
                      <SelectItem
                        value="overwrite_source"
                        className="text-xs"
                      >
                        Timpa video asli
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    Kecepatan Render
                  </span>
                  <div
                    role="group"
                    aria-label="Kecepatan Render"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
                  >
                    <Button
                      type="button"
                      size="xs"
                      variant={speedMode === 'fast' ? 'default' : 'ghost'}
                      aria-pressed={speedMode === 'fast'}
                      onClick={() => setSpeedMode('fast')}
                    >
                      Cepat (HQ)
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={speedMode === 'balanced' ? 'default' : 'ghost'}
                      aria-pressed={speedMode === 'balanced'}
                      onClick={() => setSpeedMode('balanced')}
                    >
                      Seimbang
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant={
                        speedMode === 'max_compression' ? 'default' : 'ghost'
                      }
                      aria-pressed={speedMode === 'max_compression'}
                      onClick={() => setSpeedMode('max_compression')}
                    >
                      Hemat Ukuran
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] font-light text-muted-foreground/75">
                  {speedMode === 'fast'
                    ? 'Proses 3x-5x lebih cepat tanpa menurunkan kualitas visual (CRF 16 / ICQ 17, audio lossless copy). Ukuran file sedikit lebih besar.'
                    : speedMode === 'balanced'
                      ? 'Keseimbangan antara kecepatan proses dan ukuran file MP4 dengan kualitas visual tetap tinggi.'
                      : 'Kompresi maksimal agar ukuran file MP4 paling kecil dengan kualitas visual tetap sama (proses lebih lama).'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={needsWmItems.length > 0 ? 'warning' : 'success'}
                    size="sm"
                  >
                    {needsWmItems.length > 0
                      ? `${needsWmItems.length} butuh WM`
                      : 'Semua siap WM'}
                  </Badge>
                  {activeJobsCount > 0 ? (
                    <Badge variant="info" size="sm">
                      <Loader2
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                      />
                      <span className="font-mono">{activeJobsCount} aktif</span>
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    disabled={
                      needsWmItems.length === 0 ||
                      !capabilities.ffmpegAvailable ||
                      isSubmittingRender
                    }
                    onClick={() =>
                      void triggerRender(
                        needsWmItems.map((it) => it.id),
                        `${needsWmItems.length} video butuh WM`
                      )
                    }
                  >
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Batch ({needsWmItems.length})</span>
                  </Button>

                  <Button
                    type="button"
                    variant="editorial"
                    size="default"
                    disabled={
                      !activeItem ||
                      !activeHasRawVideo ||
                      !capabilities.ffmpegAvailable ||
                      isSubmittingRender
                    }
                    onClick={() =>
                      activeItem &&
                      void triggerRender(
                        [activeItem.id],
                        `Video ${activeItem.folderCode}`
                      )
                    }
                    title={
                      !activeHasRawVideo
                        ? 'Video mentah tidak ditemukan pada folder ini'
                        : undefined
                    }
                  >
                    <Film className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Render {activeItem?.folderCode ?? '-'}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Render Queue Card */}
          {sortedJobs.length > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    Antrean render
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {sortedJobs.length} tugas
                  </span>
                </div>

                <div className="space-y-2.5">
                  {sortedJobs.slice(0, 6).map((job) => {
                    const badge = getJobStatusBadge(job.status);
                    const isActiveJob =
                      job.status === 'queued' || job.status === 'rendering';
                    const clampedPct = clampNumber(job.percent, 0, 100);

                    return (
                      <div
                        key={job.jobId}
                        className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-foreground">
                              {job.folderCode}
                            </span>
                            <Badge variant={badge.variant} size="xs">
                              {job.status === 'completed' ? (
                                <CheckCircle2
                                  className="h-2.5 w-2.5"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {job.status === 'queued' ? (
                                <Clock
                                  className="h-2.5 w-2.5"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span>{badge.label}</span>
                            </Badge>
                            {job.encoderUsed ? (
                              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                                {job.encoderUsed}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                              {Math.round(clampedPct)}%
                              {job.speed ? ` · ${job.speed}` : ''}
                              {job.etaSec !== null && isActiveJob
                                ? ` · ETA ${formatEta(job.etaSec)}`
                                : ''}
                            </span>
                            {isActiveJob ? (
                              <IconActionButton
                                icon={X}
                                label="Batalkan"
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => void handleCancelJob(job.jobId)}
                                className="text-destructive hover:text-destructive"
                              />
                            ) : null}
                          </div>
                        </div>

                        <Progress
                          value={clampedPct}
                          className={cn(
                            'w-full [&_[data-slot=progress-track]]:h-1.5',
                            job.status === 'failed' &&
                              '[&_[data-slot=progress-indicator]]:bg-destructive',
                            job.status === 'completed' &&
                              '[&_[data-slot=progress-indicator]]:bg-[#166534] dark:[&_[data-slot=progress-indicator]]:bg-[#4ade80]'
                          )}
                        />

                        {job.status === 'failed' && job.error ? (
                          <p className="truncate text-[11px] text-destructive">
                            {job.error}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default WatermarkPage;
