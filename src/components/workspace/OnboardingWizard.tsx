import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FolderOpen,
  FolderTree,
  Layers,
  Loader2,
  Moon,
  Rocket,
  SlidersHorizontal,
  Sun,
  UserRound,
} from 'lucide-react';
import type { PlannerDatabase, PlatformKey } from '@/types/planner';
import type {
  PathValidationResult,
  WatermarkPolicyMode,
  WorkspaceMetadata,
  WorkspacePresetId,
  WorkspacesRegistry,
} from '@/types/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatYearMonthFolder } from '@/components/ui/date-picker';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import { cn } from '@/lib/utils';

export interface OnboardingWizardProps {
  defaultBaseDir: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onCompleted: (payload: {
    workspace: WorkspaceMetadata;
    registry: WorkspacesRegistry;
    database?: PlannerDatabase;
  }) => void;
}

type StepIndex = 0 | 1 | 2 | 3;

const STEPS: Array<{
  index: StepIndex;
  code: string;
  label: string;
  title: string;
  subtitle: string;
  icon: typeof UserRound;
}> = [
  {
    index: 0,
    code: '01',
    label: 'Identitas',
    title: 'Kenali workspace pertama Anda',
    subtitle:
      'Nama workspace otomatis dipakai sebagai nama folder penyimpanan konten Anda.',
    icon: UserRound,
  },
  {
    index: 1,
    code: '02',
    label: 'Folder',
    title: 'Tentukan lokasi folder konten',
    subtitle:
      'Folder baru akan dibuat otomatis sesuai nama workspace beserta folder tahun-bulan awal.',
    icon: FolderTree,
  },
  {
    index: 2,
    code: '03',
    label: 'Alur Kerja',
    title: 'Atur kebijakan watermark & platform',
    subtitle:
      'Sesuaikan aturan kesiapan video dan platform sosial media yang Anda kelola.',
    icon: SlidersHorizontal,
  },
  {
    index: 3,
    code: '04',
    label: 'Siap Mulai',
    title: 'Tinjau konfigurasi studio Anda',
    subtitle:
      'Periksa ringkasan di bawah, lalu mulai kelola konten di CPGP Studio.',
    icon: Rocket,
  },
];

const WATERMARK_OPTIONS: Array<{
  policy: WatermarkPolicyMode;
  presetId: WorkspacePresetId;
  title: string;
  badge: string;
  description: string;
}> = [
  {
    policy: 'separate_wm_file',
    presetId: 'jurnal_dunia',
    title: 'File wm_final.mp4 terpisah',
    badge: 'Direkomendasikan',
    description:
      'Video mentah tetap aman. Konten siap upload setelah dirender menjadi wm_final.mp4.',
  },
  {
    policy: 'direct_or_wm',
    presetId: 'standard_creator',
    title: 'Video langsung siap upload',
    badge: 'Fleksibel',
    description:
      'Video apa pun di dalam folder langsung dianggap siap upload tanpa wajib render watermark.',
  },
  {
    policy: 'overwrite_source',
    presetId: 'overwrite_creator',
    title: 'Timpa video asli saat render',
    badge: 'Hemat Disk',
    description:
      'Hemat ruang penyimpanan dengan menimpa file video asli saat watermark dirender.',
  },
];

function sanitizeFolderSegment(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim();
  return cleaned;
}

function deriveHandleFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24);
  return slug ? `@${slug}` : '';
}

function joinFsPath(base: string, child: string): string {
  const trimmedBase = base.trim().replace(/[\\/]+$/, '');
  const trimmedChild = child.trim().replace(/^[\\/]+/, '');
  if (!trimmedBase) return trimmedChild;
  if (!trimmedChild) return trimmedBase;
  const sep = trimmedBase.includes('/') && !trimmedBase.includes('\\') ? '/' : '\\';
  return `${trimmedBase}${sep}${trimmedChild}`;
}

export function OnboardingWizard({
  defaultBaseDir,
  theme,
  onToggleTheme,
  onCompleted,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<StepIndex>(0);

  // Step 1: Identity
  const [name, setName] = useState<string>('');
  const [handle, setHandle] = useState<string>('');
  const [handleTouched, setHandleTouched] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');

  // Step 2: Folder Setup
  const [parentDir, setParentDir] = useState<string>(defaultBaseDir);
  const [appendWorkspaceName, setAppendWorkspaceName] = useState<boolean>(true);
  const [customPathOverride, setCustomPathOverride] = useState<string | null>(
    null
  );
  const [isPickingFolder, setIsPickingFolder] = useState<boolean>(false);
  const [isValidatingPath, setIsValidatingPath] = useState<boolean>(false);
  const [pathValidation, setPathValidation] =
    useState<PathValidationResult | null>(null);

  // Step 3: Workflow & Platforms
  const [watermarkPolicy, setWatermarkPolicy] =
    useState<WatermarkPolicyMode>('separate_wm_file');
  const [activePlatforms, setActivePlatforms] = useState<PlatformKey[]>([
    ...PLATFORM_ORDER,
  ]);
  const [hashtagsInput, setHashtagsInput] = useState<string>('');
  const [hashtagsTouched, setHashtagsTouched] = useState<boolean>(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (defaultBaseDir && !parentDir) {
      setParentDir(defaultBaseDir);
    }
  }, [defaultBaseDir, parentDir]);

  // Auto-derive handle & default hashtags from workspace name until user edits them manually
  useEffect(() => {
    const derived = deriveHandleFromName(name);
    if (!handleTouched) {
      setHandle(derived);
    }
    if (!hashtagsTouched) {
      const cleanTag = derived.replace(/^@/, '#');
      setHashtagsInput(cleanTag ? `#edukasi ${cleanTag}` : '#edukasi #konten');
    }
  }, [name, handleTouched, hashtagsTouched]);

  const safeFolderName = useMemo(
    () => sanitizeFolderSegment(name) || 'Workspace-Baru',
    [name]
  );

  const resolvedContentPath = useMemo(() => {
    if (customPathOverride !== null) {
      return customPathOverride;
    }
    if (!appendWorkspaceName) {
      return parentDir.trim();
    }
    return joinFsPath(parentDir, safeFolderName);
  }, [customPathOverride, appendWorkspaceName, parentDir, safeFolderName]);

  const initYearMonth = useMemo(() => formatYearMonthFolder(new Date()), []);
  const sampleDayCode = useMemo(() => {
    const dd = String(new Date().getDate()).padStart(2, '0');
    return `${dd}.01`;
  }, []);

  const validatePath = useCallback(async (targetPath: string) => {
    const trimmed = targetPath.trim();
    if (!trimmed) {
      setPathValidation(null);
      return;
    }
    setIsValidatingPath(true);
    try {
      const res = await fetch('/api/system/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      });
      if (res.ok) {
        const data = (await res.json()) as PathValidationResult;
        setPathValidation(data);
      }
    } catch {
      setPathValidation(null);
    } finally {
      setIsValidatingPath(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 1 || !resolvedContentPath.trim()) return;
    const timer = window.setTimeout(() => {
      void validatePath(resolvedContentPath);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [step, resolvedContentPath, validatePath]);

  const handlePickParentFolder = async () => {
    setIsPickingFolder(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/system/pick-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Pilih Folder Induk untuk Konten Workspace',
          initialPath: parentDir || defaultBaseDir || undefined,
        }),
      });
      const data = (await res.json()) as {
        cancelled?: boolean;
        path?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuka dialog pemilihan folder.');
      }
      if (!data.cancelled && data.path) {
        setParentDir(data.path);
        setCustomPathOverride(null);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal memilih folder di sistem.'
      );
    } finally {
      setIsPickingFolder(false);
    }
  };

  const togglePlatform = (key: PlatformKey) => {
    setActivePlatforms((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const canProceedFromStep = useMemo(() => {
    if (step === 0) {
      return name.trim().length >= 2;
    }
    if (step === 1) {
      return resolvedContentPath.trim().length >= 3;
    }
    if (step === 2) {
      return activePlatforms.length > 0;
    }
    return name.trim().length >= 2 && resolvedContentPath.trim().length >= 3;
  }, [step, name, resolvedContentPath, activePlatforms]);

  const handleNext = () => {
    setErrorMsg(null);
    if (!canProceedFromStep) {
      if (step === 0) {
        setErrorMsg('Masukkan nama workspace minimal 2 karakter.');
      } else if (step === 1) {
        setErrorMsg('Tentukan lokasi folder konten terlebih dahulu.');
      }
      return;
    }
    if (step < 3) {
      setStep((prev) => (prev + 1) as StepIndex);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (step > 0) {
      setStep((prev) => (prev - 1) as StepIndex);
    }
  };

  const handleComplete = async () => {
    if (!name.trim() || !resolvedContentPath.trim()) {
      setErrorMsg('Nama workspace dan lokasi folder wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const selectedOption =
        WATERMARK_OPTIONS.find((o) => o.policy === watermarkPolicy) ??
        WATERMARK_OPTIONS[0];
      const parsedHashtags = hashtagsInput
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`));

      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          handle: handle.trim() || deriveHandleFromName(name) || '@channel',
          description: description.trim(),
          contentRootPath: resolvedContentPath.trim(),
          createFolderIfMissing: true,
          presetId: selectedOption.presetId,
          folderStructure: 'auto_both',
          watermarkPolicy,
          activePlatforms,
          browserProfileMode: 'isolated',
          defaultHashtags:
            parsedHashtags.length > 0 ? parsedHashtags : ['#edukasi', '#konten'],
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        workspace?: WorkspaceMetadata;
        registry?: WorkspacesRegistry;
        database?: PlannerDatabase;
        error?: string;
      };

      if (!res.ok || !data.workspace || !data.registry) {
        throw new Error(data.error || 'Gagal membuat workspace pertama.');
      }

      onCompleted({
        workspace: data.workspace,
        registry: data.registry,
        database: data.database,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat menyiapkan workspace.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStepMeta = STEPS[step];
  const selectedWatermarkMeta =
    WATERMARK_OPTIONS.find((o) => o.policy === watermarkPolicy) ??
    WATERMARK_OPTIONS[0];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Minimalist Top Bar */}
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#4a0d18] bg-cpgp-gradient font-mono text-[10px] font-bold tracking-tight text-white"
              aria-hidden="true"
            >
              CPGP
            </span>
            <div className="leading-tight">
              <span className="block font-mono text-xs font-bold tracking-wide text-foreground">
                CPGP Studio
              </span>
              <span className="block text-[10px] font-light text-muted-foreground">
                Content Planer Gam Puko
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="muted" size="xs" className="font-mono">
              Langkah {step + 1} / {STEPS.length}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={
                theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'
              }
              onClick={onToggleTheme}
            >
              {theme === 'dark' ? (
                <Sun className="size-4" aria-hidden="true" />
              ) : (
                <Moon className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Stepper Workspace */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        {/* Horizontal Stepper Navigation */}
        <nav aria-label="Tahapan penyiapan workspace" className="mb-6">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((item) => {
              const isCurrent = item.index === step;
              const isCompleted = item.index < step;
              const isClickable = item.index < step;

              return (
                <li key={item.code}>
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => {
                      if (isClickable) {
                        setErrorMsg(null);
                        setStep(item.index);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      isCurrent
                        ? 'border-primary bg-card text-foreground'
                        : isCompleted
                          ? 'border-border bg-card/80 text-foreground hover:bg-muted/60 cursor-pointer'
                          : 'border-border/70 bg-muted/30 text-muted-foreground cursor-default'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold',
                        isCurrent
                          ? 'bg-cpgp-gradient text-white'
                          : isCompleted
                            ? 'bg-[#DCFCE7] text-[#166534] dark:bg-[#052E16] dark:text-[#86EFAC]'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isCompleted ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : (
                        item.code
                      )}
                    </span>
                    <span className="min-w-0 truncate text-xs font-medium">
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Split Layout: Focused Step Card (Left) + Live Studio Preview (Right) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
          {/* Focused Step Form */}
          <Card className="lg:col-span-7">
            <div className="h-1 w-full rounded-t-xl bg-cpgp-gradient" />
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="space-y-1">
                <p className="font-mono text-[11px] font-medium text-primary">
                  LANGKAH {activeStepMeta.code}
                </p>
                <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {activeStepMeta.title}
                </h1>
                <p className="text-xs font-light leading-relaxed text-muted-foreground">
                  {activeStepMeta.subtitle}
                </p>
              </div>

              {errorMsg ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  <AlertCircle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{errorMsg}</span>
                </div>
              ) : null}

              {/* STEP 1: IDENTITAS */}
              {step === 0 ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="onb-ws-name"
                      className="block text-xs font-medium text-foreground"
                    >
                      Nama Workspace / Channel
                    </label>
                    <Input
                      id="onb-ws-name"
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canProceedFromStep) {
                          e.preventDefault();
                          handleNext();
                        }
                      }}
                      placeholder="Misal: Kanal Sains, Arsip Cerita, Studio Edukasi"
                    />
                    <p className="text-[11px] font-light text-muted-foreground/80">
                      Dipakai langsung sebagai nama folder konten Anda di disk.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="onb-ws-handle"
                      className="block text-xs font-medium text-foreground"
                    >
                      Handle / Teks Watermark
                    </label>
                    <Input
                      id="onb-ws-handle"
                      value={handle}
                      onChange={(e) => {
                        setHandleTouched(true);
                        setHandle(e.target.value);
                      }}
                      placeholder="@channel_anda"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="onb-ws-desc"
                      className="block text-xs font-medium text-foreground"
                    >
                      Deskripsi Singkat{' '}
                      <span className="font-light text-muted-foreground">
                        (opsional)
                      </span>
                    </label>
                    <Textarea
                      id="onb-ws-desc"
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Niche konten, gaya video, atau catatan jadwal produksi..."
                    />
                  </div>
                </div>
              ) : null}

              {/* STEP 2: FOLDER KONTEN */}
              {step === 1 ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="onb-parent-dir"
                      className="block text-xs font-medium text-foreground"
                    >
                      Folder Induk Penyimpanan
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="onb-parent-dir"
                        value={parentDir}
                        onChange={(e) => {
                          setParentDir(e.target.value);
                          setCustomPathOverride(null);
                        }}
                        placeholder="D:\Konten-Studio"
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPickingFolder}
                        onClick={() => void handlePickParentFolder()}
                        className="shrink-0"
                      >
                        {isPickingFolder ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <FolderOpen className="size-3.5" aria-hidden="true" />
                        )}
                        Pilih Folder
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                    <div className="space-y-0.5">
                      <label
                        htmlFor="onb-append-name"
                        className="cursor-pointer text-xs font-medium text-foreground"
                      >
                        Buat subfolder sesuai nama workspace
                      </label>
                      <p className="text-[11px] font-light text-muted-foreground/80">
                        Menambahkan{' '}
                        <code className="font-mono text-foreground">
                          \{safeFolderName}
                        </code>{' '}
                        di dalam folder induk secara otomatis.
                      </p>
                    </div>
                    <Switch
                      id="onb-append-name"
                      checked={appendWorkspaceName}
                      onCheckedChange={(checked) => {
                        setAppendWorkspaceName(checked);
                        setCustomPathOverride(null);
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="onb-final-path"
                      className="block text-xs font-medium text-foreground"
                    >
                      Path Folder Final Workspace
                    </label>
                    <Input
                      id="onb-final-path"
                      value={resolvedContentPath}
                      onChange={(e) => setCustomPathOverride(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                      {isValidatingPath ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Loader2
                            className="size-3 animate-spin"
                            aria-hidden="true"
                          />
                          Memeriksa lokasi folder...
                        </span>
                      ) : pathValidation ? (
                        pathValidation.exists ? (
                          <span className="inline-flex items-center gap-1.5 text-[#166534] dark:text-[#86EFAC]">
                            <CheckCircle2
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            Folder tersedia
                            {pathValidation.detectedSlotFoldersCount > 0
                              ? ` (${pathValidation.detectedSlotFoldersCount} slot konten terdeteksi)`
                              : ' dan siap dipakai'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <CheckCircle2
                              className="size-3.5 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            Folder baru beserta{' '}
                            <code className="font-mono text-foreground">
                              {initYearMonth}
                            </code>{' '}
                            akan dibuat otomatis.
                          </span>
                        )
                      ) : (
                        <span className="font-light text-muted-foreground/75">
                          Folder akan dibuat otomatis jika belum ada.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* STEP 3: ALUR KERJA & PLATFORM */}
              {step === 2 ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-foreground">
                      Kebijakan Watermark
                    </span>
                    <div className="space-y-2">
                      {WATERMARK_OPTIONS.map((opt) => {
                        const selected = watermarkPolicy === opt.policy;
                        return (
                          <button
                            key={opt.policy}
                            type="button"
                            onClick={() => setWatermarkPolicy(opt.policy)}
                            className={cn(
                              'flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                              selected
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-card hover:bg-muted/40'
                            )}
                          >
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-foreground">
                                  {opt.title}
                                </span>
                                <Badge
                                  variant={selected ? 'default' : 'muted'}
                                  size="xs"
                                >
                                  {opt.badge}
                                </Badge>
                              </div>
                              <p className="text-[11px] font-light leading-relaxed text-muted-foreground">
                                {opt.description}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                                selected
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-border'
                              )}
                            >
                              {selected ? (
                                <Check className="size-2.5" aria-hidden="true" />
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-foreground">
                      Platform Target
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {PLATFORM_ORDER.map((key) => {
                        const active = activePlatforms.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => togglePlatform(key)}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                              active
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                            )}
                          >
                            <span className="inline-flex items-center gap-2 truncate">
                              <PlatformIcon platform={key} size={14} />
                              <span className="truncate">
                                {PLATFORM_META[key].label}
                              </span>
                            </span>
                            {active ? (
                              <Check
                                className="size-3.5 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="onb-hashtags"
                      className="block text-xs font-medium text-foreground"
                    >
                      Hashtag Bawaan Caption
                    </label>
                    <Input
                      id="onb-hashtags"
                      value={hashtagsInput}
                      onChange={(e) => {
                        setHashtagsTouched(true);
                        setHashtagsInput(e.target.value);
                      }}
                      placeholder="#edukasi #konten"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ) : null}

              {/* STEP 4: TINJAU & MULAI */}
              {step === 3 ? (
                <div className="space-y-3">
                  <div className="divide-y divide-border rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                      <span className="font-light text-muted-foreground">
                        Workspace
                      </span>
                      <span className="font-semibold text-foreground">
                        {name.trim()}{' '}
                        <span className="font-mono font-normal text-muted-foreground">
                          ({handle.trim() || deriveHandleFromName(name)})
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <span className="shrink-0 font-light text-muted-foreground">
                        Folder Konten
                      </span>
                      <code className="truncate font-mono text-[11px] text-foreground">
                        {resolvedContentPath}
                      </code>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                      <span className="font-light text-muted-foreground">
                        Folder Tahun Awal
                      </span>
                      <code className="font-mono text-[11px] font-medium text-foreground">
                        {initYearMonth}
                      </code>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                      <span className="font-light text-muted-foreground">
                        Alur Watermark
                      </span>
                      <span className="font-medium text-foreground">
                        {selectedWatermarkMeta.title}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                      <span className="font-light text-muted-foreground">
                        Platform Aktif
                      </span>
                      <div className="flex items-center gap-1.5">
                        {activePlatforms.map((key) => (
                          <PlatformIcon key={key} platform={key} size={14} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] font-light text-muted-foreground/80">
                    Semua pengaturan ini dapat diubah kapan saja melalui menu
                    Pengaturan Workspace di pojok kiri atas.
                  </p>
                </div>
              ) : null}

              {/* Stepper Footer Actions */}
              <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={step === 0 || isSubmitting}
                  onClick={handleBack}
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Kembali
                </Button>

                {step < 3 ? (
                  <Button
                    type="button"
                    variant="editorial"
                    size="sm"
                    disabled={!canProceedFromStep}
                    onClick={handleNext}
                  >
                    Lanjut
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="editorial"
                    size="sm"
                    disabled={isSubmitting || !canProceedFromStep}
                    onClick={() => void handleComplete()}
                  >
                    {isSubmitting ? (
                      <Loader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Rocket className="size-3.5" aria-hidden="true" />
                    )}
                    Buat Workspace &amp; Masuk Studio
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Studio Preview Card (Right) */}
          <aside className="lg:col-span-5">
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Layers className="size-3.5 text-primary" aria-hidden="true" />
                    Pratinjau Studio
                  </span>
                  <Badge variant="muted" size="xs" className="font-mono">
                    {new Date().getFullYear()}
                  </Badge>
                </div>

                {/* Workspace Identity Preview */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/35 p-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cpgp-gradient font-mono text-xs font-bold text-white">
                    {(name.trim().slice(0, 2) || 'WS').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {name.trim() || 'Nama Workspace Anda'}
                    </p>
                    <p className="truncate font-mono text-[11px] font-light text-muted-foreground">
                      {handle.trim() || '@channel_anda'}
                    </p>
                  </div>
                </div>

                {/* Live Folder Structure Tree Preview */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    Struktur Folder di Disk
                  </span>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    <div className="truncate text-muted-foreground">
                      {resolvedContentPath || '...'}
                    </div>
                    <div className="pl-3 text-foreground">
                      └── {initYearMonth}/
                    </div>
                    <div className="pl-8 text-muted-foreground">
                      └── {sampleDayCode}/
                    </div>
                    <div className="pl-12 text-[10px] text-muted-foreground/80">
                      {watermarkPolicy === 'separate_wm_file'
                        ? 'wm_final.mp4 · cover.jpg · caption.txt'
                        : 'video.mp4 · cover.jpg · caption.txt'}
                    </div>
                  </div>
                </div>

                {/* Active Platforms Preview */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    Platform Distribusi ({activePlatforms.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activePlatforms.map((key) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground"
                      >
                        <PlatformIcon platform={key} size={12} />
                        {PLATFORM_META[key].shortLabel}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
