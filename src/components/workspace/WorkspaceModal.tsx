import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  FolderOpen,
  FolderSearch,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CreateWorkspaceInput,
  PathValidationResult,
  TimeSlotDefinition,
  UpdateWorkspaceInput,
  WatermarkPolicyMode,
  WorkspaceMetadata,
  WorkspacePresetId,
  WorkspacesRegistry,
} from '@/types/workspace';
import type { PlannerDatabase } from '@/types/planner';
import {
  DEFAULT_TIME_SLOTS,
  WORKSPACE_RULE_PRESETS,
} from '../../../shared/rulePresets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Separator } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type WorkspaceModalMode = 'onboarding' | 'create' | 'edit';

export interface WorkspaceModalProps {
  isOpen: boolean;
  mode: WorkspaceModalMode;
  registry: WorkspacesRegistry | null;
  activeWorkspace: WorkspaceMetadata | null;
  onClose: () => void;
  onSaved: (payload: {
    workspace: WorkspaceMetadata;
    registry: WorkspacesRegistry;
    database: PlannerDatabase;
  }) => void;
  onToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

type ModalStepTab = 'identity' | 'rules' | 'slots';

const PRESET_ORDER: WorkspacePresetId[] = [
  'jurnal_dunia',
  'standard_creator',
  'overwrite_creator',
];

function policyLabel(policy: WatermarkPolicyMode): string {
  switch (policy) {
    case 'separate_wm_file':
      return 'Wajib wm_final.mp4 terpisah';
    case 'direct_or_wm':
      return 'Video langsung siap upload';
    case 'overwrite_source':
      return 'Mode Overwrite (timpa video asli)';
  }
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  mode,
  registry,
  activeWorkspace,
  onClose,
  onSaved,
  onToast,
}) => {
  const [stepTab, setStepTab] = useState<ModalStepTab>('identity');

  // Step 1: Identity & Root Folder
  const [name, setName] = useState<string>('');
  const [handle, setHandle] = useState<string>('');
  const [description, setDescription] = useState<string>(
    'Channel cerita sejarah dan edukasi fakta dunia'
  );
  const [contentRootPath, setContentRootPath] = useState<string>(
    'D:\\RENAL\\JURNAL DUNIA\\KONTEN'
  );
  const [createFolderIfMissing, setCreateFolderIfMissing] =
    useState<boolean>(true);
  const [copyFromWorkspaceId, setCopyFromWorkspaceId] = useState<string>('');

  // Path validation state
  const [isPickingFolder, setIsPickingFolder] = useState<boolean>(false);
  const [isValidatingPath, setIsValidatingPath] = useState<boolean>(false);
  const [pathValidation, setPathValidation] =
    useState<PathValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 2: File & Watermark Rules
  const [presetId, setPresetId] = useState<WorkspacePresetId>('jurnal_dunia');
  const [reqVideo, setReqVideo] = useState<boolean>(true);
  const [reqCover, setReqCover] = useState<boolean>(true);
  const [reqCaption, setReqCaption] = useState<boolean>(true);

  // Step 3: Daily Upload Time Slots & Default Hashtags
  const [timeSlotsList, setTimeSlotsList] = useState<TimeSlotDefinition[]>(() =>
    Object.values(DEFAULT_TIME_SLOTS)
  );
  const [defaultHashtagsInput, setDefaultHashtagsInput] = useState<string>(
    '#edukasi #konten'
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const existingWorkspaces = useMemo<WorkspaceMetadata[]>(() => {
    if (!registry?.workspaces) return [];
    return Object.values(registry.workspaces);
  }, [registry]);

  const validatePath = useCallback(async (targetPath: string) => {
    const trimmed = targetPath.trim();
    if (!trimmed) {
      setPathValidation(null);
      return;
    }
    try {
      setIsValidatingPath(true);
      setValidationError(null);
      const res = await fetch('/api/system/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Gagal memeriksa path (${res.status})`);
      }
      const raw = (await res.json()) as
        | PathValidationResult
        | { validation?: PathValidationResult };
      const data =
        raw && 'validation' in raw && raw.validation
          ? raw.validation
          : (raw as PathValidationResult);
      setPathValidation(data);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Gagal memeriksa folder.'
      );
    } finally {
      setIsValidatingPath(false);
    }
  }, []);

  const lastInitKeyRef = useRef<string | null>(null);

  // Initialize form state only when open/mode/workspace key changes so SSE refreshes never overwrite drafts
  useEffect(() => {
    const initKey = isOpen
      ? `${mode}:${activeWorkspace?.id ?? 'new'}`
      : null;
    if (!initKey) {
      lastInitKeyRef.current = null;
      return;
    }
    if (initKey === lastInitKeyRef.current) return;
    lastInitKeyRef.current = initKey;

    setStepTab('identity');
    setSubmitError(null);
    setValidationError(null);

    if (mode === 'edit' && activeWorkspace) {
      setName(activeWorkspace.name);
      setHandle(activeWorkspace.handle);
      setDescription(activeWorkspace.description);
      setContentRootPath(activeWorkspace.contentRootPath);
      setPresetId(activeWorkspace.rules.presetId);
      setReqVideo(activeWorkspace.rules.requiredAssets.video);
      setReqCover(activeWorkspace.rules.requiredAssets.cover);
      setReqCaption(activeWorkspace.rules.requiredAssets.caption);
      setTimeSlotsList(Object.values(activeWorkspace.timeSlots));
      setDefaultHashtagsInput(
        activeWorkspace.rules.defaultHashtags.join(' ')
      );
      setCopyFromWorkspaceId('');
      void validatePath(activeWorkspace.contentRootPath);
    } else if (mode === 'create') {
      setName('');
      setHandle('@channel_');
      setDescription('');
      setContentRootPath('');
      setCreateFolderIfMissing(true);
      const built = WORKSPACE_RULE_PRESETS.standard_creator.buildRules('@channel_');
      setPresetId('standard_creator');
      setReqVideo(built.requiredAssets.video);
      setReqCover(built.requiredAssets.cover);
      setReqCaption(built.requiredAssets.caption);
      setTimeSlotsList(Object.values(DEFAULT_TIME_SLOTS));
      setDefaultHashtagsInput(built.defaultHashtags.join(' '));
      setCopyFromWorkspaceId(activeWorkspace?.id ?? existingWorkspaces[0]?.id ?? '');
      setPathValidation(null);
    } else {
      // onboarding
      const target = activeWorkspace ?? existingWorkspaces[0] ?? null;
      const initialName = target?.name ?? '';
      const initialHandle = target?.handle ?? '';
      const initialPath =
        target?.contentRootPath ?? 'D:\\RENAL\\JURNAL DUNIA\\KONTEN';
      const initialPreset = target?.rules.presetId ?? 'jurnal_dunia';
      const built = WORKSPACE_RULE_PRESETS[initialPreset].buildRules(initialHandle);

      setName(initialName);
      setHandle(initialHandle);
      setDescription(
        target?.description ??
          'Workspace utama perencanaan & distribusi konten video pendek'
      );
      setContentRootPath(initialPath);
      setCreateFolderIfMissing(true);
      setPresetId(initialPreset);
      setReqVideo(target?.rules.requiredAssets.video ?? built.requiredAssets.video);
      setReqCover(target?.rules.requiredAssets.cover ?? built.requiredAssets.cover);
      setReqCaption(
        target?.rules.requiredAssets.caption ?? built.requiredAssets.caption
      );
      setTimeSlotsList(
        target ? Object.values(target.timeSlots) : Object.values(DEFAULT_TIME_SLOTS)
      );
      setDefaultHashtagsInput(
        (target?.rules.defaultHashtags ?? built.defaultHashtags).join(' ')
      );
      setCopyFromWorkspaceId('');
      void validatePath(initialPath);
    }
  }, [isOpen, mode, activeWorkspace, existingWorkspaces, validatePath]);

  // Escape key to close (unless mandatory onboarding wants Escape too)
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSelectPreset = (nextPreset: WorkspacePresetId) => {
    setPresetId(nextPreset);
    const descriptor = WORKSPACE_RULE_PRESETS[nextPreset];
    const built = descriptor.buildRules(handle || '@channel_');
    setReqVideo(built.requiredAssets.video);
    setReqCover(built.requiredAssets.cover);
    setReqCaption(built.requiredAssets.caption);
    setDefaultHashtagsInput(built.defaultHashtags.join(' '));
  };

  const handlePickWindowsFolder = async () => {
    try {
      setIsPickingFolder(true);
      setValidationError(null);
      const res = await fetch('/api/system/pick-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialDir: contentRootPath.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error || `Gagal membuka pemilih folder Windows (${res.status})`
        );
      }
      const data = (await res.json()) as {
        cancelled: boolean;
        path: string | null;
      };
      if (!data.cancelled && data.path) {
        setContentRootPath(data.path);
        await validatePath(data.path);
      }
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : 'Gagal membuka dialog folder Windows.'
      );
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleAddSlot = () => {
    const nextNum = timeSlotsList.length + 1;
    const code = String(nextNum).padStart(2, '0');
    setTimeSlotsList((prev) => [
      ...prev,
      {
        code,
        label: nextNum === 3 ? 'Sore' : `Slot ${code}`,
        window: '16.00 - 16.30 WIB',
        defaultTime: '16:00',
        recommendation: 'Slot tambahan untuk distribusi ekstra.',
      },
    ]);
  };

  const handleUpdateSlot = (
    index: number,
    patch: Partial<TimeSlotDefinition>
  ) => {
    setTimeSlotsList((prev) =>
      prev.map((slot, idx) => (idx === index ? { ...slot, ...patch } : slot))
    );
  };

  const handleRemoveSlot = (index: number) => {
    if (timeSlotsList.length <= 1) return;
    setTimeSlotsList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPath = contentRootPath.trim();
    const trimmedHandle = handle.trim() || '@channel_';

    if (!trimmedName) {
      setSubmitError('Nama workspace wajib diisi.');
      setStepTab('identity');
      return;
    }
    if (!trimmedPath) {
      setSubmitError('Lokasi folder konten (contentRootPath) wajib diisi.');
      setStepTab('identity');
      return;
    }

    const slotsRecord: Record<string, TimeSlotDefinition> = {};
    for (const s of timeSlotsList) {
      const code = s.code.trim() || '01';
      slotsRecord[code] = {
        ...s,
        code,
        window:
          s.window.trim() ||
          `${s.defaultTime.replace(':', '.')} WIB`,
      };
    }

    const parsedHashtags = defaultHashtagsInput
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const builtPresetRules =
      WORKSPACE_RULE_PRESETS[presetId].buildRules(trimmedHandle);

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      if (mode === 'create') {
        const payload: CreateWorkspaceInput = {
          name: trimmedName,
          handle: trimmedHandle,
          description: description.trim(),
          contentRootPath: trimmedPath,
          createFolderIfMissing,
          presetId,
          watermarkPolicy: builtPresetRules.watermarkPolicy,
          requiredAssets: {
            video: reqVideo,
            cover: reqCover,
            caption: reqCaption,
          },
          timeSlots: slotsRecord,
          defaultHashtags: parsedHashtags,
          copyWatermarkPresetsFromWorkspaceId:
            copyFromWorkspaceId || null,
        };

        const res = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err?.error || `Gagal membuat workspace (${res.status})`
          );
        }
        const data = (await res.json()) as {
          ok: boolean;
          workspace: WorkspaceMetadata;
          registry: WorkspacesRegistry;
          database: PlannerDatabase;
        };
        onToast?.(
          `Workspace "${data.workspace.name}" berhasil dibuat dan diaktifkan.`,
          'success'
        );
        onSaved(data);
        onClose();
      } else {
        // 'edit' or 'onboarding' updating active workspace (or creating if none exists)
        const targetId =
          activeWorkspace?.id ?? registry?.activeWorkspaceId ?? '';
        if (!targetId) {
          const payload: CreateWorkspaceInput = {
            name: trimmedName,
            handle: trimmedHandle,
            description: description.trim(),
            contentRootPath: trimmedPath,
            createFolderIfMissing,
            presetId,
            watermarkPolicy: builtPresetRules.watermarkPolicy,
            requiredAssets: {
              video: reqVideo,
              cover: reqCover,
              caption: reqCaption,
            },
            timeSlots: slotsRecord,
            defaultHashtags: parsedHashtags,
          };
          const res = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              err?.error || `Gagal menyimpan workspace (${res.status})`
            );
          }
          const data = (await res.json()) as {
            ok: boolean;
            workspace: WorkspaceMetadata;
            registry: WorkspacesRegistry;
            database: PlannerDatabase;
          };
          onToast?.(
            `Workspace "${data.workspace.name}" siap digunakan.`,
            'success'
          );
          onSaved(data);
          onClose();
          return;
        }

        const updatePayload: UpdateWorkspaceInput = {
          name: trimmedName,
          handle: trimmedHandle,
          description: description.trim(),
          contentRootPath: trimmedPath,
          rules: {
            ...builtPresetRules,
            presetId,
            requiredAssets: {
              video: reqVideo,
              cover: reqCover,
              caption: reqCaption,
            },
            defaultHashtags: parsedHashtags,
          },
          timeSlots: slotsRecord,
        };

        const res = await fetch(
          `/api/workspaces/${encodeURIComponent(targetId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err?.error || `Gagal memperbarui workspace (${res.status})`
          );
        }
        const data = (await res.json()) as {
          ok: boolean;
          workspace: WorkspaceMetadata;
          registry: WorkspacesRegistry;
          database: PlannerDatabase;
        };
        onToast?.(
          `Pengaturan workspace "${data.workspace.name}" disimpan.`,
          'success'
        );
        onSaved(data);
        onClose();
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Gagal menyimpan workspace.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const activePresetDesc = WORKSPACE_RULE_PRESETS[presetId];
  const headerTitle =
    mode === 'onboarding'
      ? 'Selamat Datang di CPGP'
      : mode === 'create'
        ? 'Buat Workspace Channel Baru'
        : `Pengaturan Workspace: ${activeWorkspace?.name ?? 'Aktif'}`;
  const headerSubtitle =
    mode === 'onboarding'
      ? 'Atur folder sumber konten, kebijakan watermark, dan slot jadwal upload harian.'
      : mode === 'create'
        ? 'Setiap workspace memiliki folder konten, aturan watermark, dan database terpisah.'
        : 'Sesuaikan lokasi folder konten, aturan berkas siap upload, dan jam slot harian.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg"
      >
        {/* Luxury Burgundy Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-11 shrink-0 items-center justify-center rounded-md border border-[#4a0d18] bg-cpgp-gradient font-mono text-xs font-bold tracking-wider text-white"
              aria-hidden="true"
            >
              CPGP
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                  {headerTitle}
                </h2>
                <Badge variant="outline" size="xs" className="font-mono">
                  Content Planer Gam Puko
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {headerSubtitle}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onClose}
            aria-label="Tutup jendela pengaturan workspace"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        {/* Step Navigation & Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {submitError ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          ) : null}

          <Tabs
            value={stepTab}
            onValueChange={(val) => setStepTab(val as ModalStepTab)}
          >
            <TabsList
              aria-label="Tahap konfigurasi workspace"
              className="grid w-full grid-cols-3"
            >
              <TabsTrigger value="identity">
                1. Identitas & Folder Root
              </TabsTrigger>
              <TabsTrigger value="rules">
                2. Aturan File & Watermark
              </TabsTrigger>
              <TabsTrigger value="slots">
                3. Slot Jam Upload Harian
              </TabsTrigger>
            </TabsList>

            {/* STEP 1: IDENTITAS & FOLDER ROOT */}
            <TabsContent value="identity" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Identitas Channel / Workspace
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="ws-name-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Nama Workspace
                      </label>
                      <Input
                        id="ws-name-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Contoh: Studio Sejarah, Kanal Sains"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="ws-handle-input"
                        className="block text-xs font-medium text-foreground"
                      >
                        Handle Watermark
                      </label>
                      <Input
                        id="ws-handle-input"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="Contoh: @channel_anda"
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="ws-desc-input"
                      className="block text-xs font-medium text-foreground"
                    >
                      Deskripsi Singkat
                    </label>
                    <Input
                      id="ws-desc-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ringkasan topik channel atau catatan tim"
                    />
                  </div>

                  {mode === 'create' && existingWorkspaces.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <label
                        htmlFor="ws-copy-preset-select"
                        className="block text-xs font-medium text-foreground"
                      >
                        Salin Preset Watermark dari Workspace Lain
                      </label>
                      <NativeSelect
                        id="ws-copy-preset-select"
                        value={copyFromWorkspaceId}
                        onChange={(e) => setCopyFromWorkspaceId(e.target.value)}
                        className="w-full"
                      >
                        <option value="">
                          Gunakan preset standar baru ({handle || '@channel_'})
                        </option>
                        {existingWorkspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            Salin dari {ws.name} ({ws.handle}) dan sesuaikan ke{' '}
                            {handle || '@channel_'}
                          </option>
                        ))}
                      </NativeSelect>
                      <p className="text-[11px] text-muted-foreground">
                        Gaya font, ukuran, posisi, dan warna stroke disalin
                        otomatis dengan teks watermark baru Anda.
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Lokasi Folder Konten di Disk
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ws-root-path-input"
                      className="block text-xs font-medium text-foreground"
                    >
                      Lokasi Folder Konten (contentRootPath)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="ws-root-path-input"
                        value={contentRootPath}
                        onChange={(e) => setContentRootPath(e.target.value)}
                        placeholder="Contoh: D:\KONTEN_CHANNEL\Sains"
                        className="min-w-[240px] flex-1 font-mono"
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        onClick={() => void handlePickWindowsFolder()}
                        disabled={isPickingFolder}
                      >
                        {isPickingFolder ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <FolderOpen
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        <span>Pilih Folder Windows...</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="default"
                        onClick={() => void validatePath(contentRootPath)}
                        disabled={isValidatingPath || !contentRootPath.trim()}
                      >
                        {isValidatingPath ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <FolderSearch
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        <span>Cek Folder</span>
                      </Button>
                    </div>
                  </div>

                  {validationError ? (
                    <div className="rounded-md border border-destructive bg-destructive/10 p-2.5 text-xs text-destructive">
                      {validationError}
                    </div>
                  ) : null}

                  {pathValidation ? (
                    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-foreground">
                          {pathValidation.normalizedPath}
                        </span>
                        {pathValidation.exists && pathValidation.isDirectory ? (
                          <Badge variant="success" size="xs">
                            <CheckCircle2
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            <span>Folder Ditemukan</span>
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="xs">
                            <span>Folder Belum Ada di Disk</span>
                          </Badge>
                        )}
                      </div>

                      {pathValidation.exists && pathValidation.isDirectory ? (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span>
                            Subfolder bulan:{' '}
                            <strong className="font-mono text-foreground">
                              {pathValidation.detectedMonthFolders.length > 0
                                ? pathValidation.detectedMonthFolders.join(', ')
                                : '0'}
                            </strong>
                          </span>
                          <span>
                            Slot konten terdeteksi:{' '}
                            <strong className="font-mono text-foreground">
                              {pathValidation.detectedSlotFoldersCount}
                            </strong>
                          </span>
                          {pathValidation.sampleCodes.length > 0 ? (
                            <span>
                              Contoh kode:{' '}
                              <code className="font-mono text-foreground">
                                {pathValidation.sampleCodes.slice(0, 5).join(', ')}
                              </code>
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <label
                          htmlFor="ws-create-folder-checkbox"
                          className="flex items-center gap-2 pt-1 text-xs font-medium text-foreground"
                        >
                          <input
                            id="ws-create-folder-checkbox"
                            type="checkbox"
                            checked={createFolderIfMissing}
                            onChange={(e) =>
                              setCreateFolderIfMissing(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span>Buat folder otomatis jika belum ada</span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <label
                      htmlFor="ws-create-folder-fallback"
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <input
                        id="ws-create-folder-fallback"
                        type="checkbox"
                        checked={createFolderIfMissing}
                        onChange={(e) =>
                          setCreateFolderIfMissing(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>Buat folder otomatis jika belum ada di disk</span>
                    </label>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* STEP 2: ATURAN FILE & WATERMARK */}
            <TabsContent value="rules" className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {PRESET_ORDER.map((id) => {
                  const preset = WORKSPACE_RULE_PRESETS[id];
                  const selected = presetId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectPreset(id)}
                      aria-pressed={selected}
                      className={`flex flex-col justify-between gap-2.5 rounded-lg border p-3.5 text-left transition-colors ${
                        selected
                          ? 'border-primary bg-accent/50 ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-muted/60'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant={selected ? 'default' : 'outline'}
                            size="xs"
                          >
                            {preset.badge}
                          </Badge>
                          {selected ? (
                            <Check
                              className="h-4 w-4 text-primary"
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                        <h3 className="text-xs font-semibold text-foreground">
                          {preset.title}
                        </h3>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {preset.summary}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                {/* Interactive Folder Tree Preview */}
                <Card className="md:col-span-7">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Pratinjau Struktur Folder & File
                      </CardTitle>
                      <Badge variant="secondary" size="xs" className="font-mono">
                        {policyLabel(
                          WORKSPACE_RULE_PRESETS[presetId].buildRules(handle)
                            .watermarkPolicy
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                      {(contentRootPath.trim() || 'D:\\KONTEN') + '\\\n'}
                      {activePresetDesc.exampleTree
                        .map((line) => `  ${line}`)
                        .join('\n')}
                    </pre>
                  </CardContent>
                </Card>

                {/* Required Assets Checkboxes */}
                <Card className="md:col-span-5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Syarat Konten Siap Upload
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-xs">
                    <label
                      htmlFor="req-asset-video"
                      className="flex items-center gap-2.5 rounded-md border border-border bg-background/60 px-3 py-2 font-medium text-foreground"
                    >
                      <input
                        id="req-asset-video"
                        type="checkbox"
                        checked={reqVideo}
                        onChange={(e) => setReqVideo(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>
                        Video (
                        {presetId === 'jurnal_dunia'
                          ? 'Wajib wm_final.mp4'
                          : 'File .mp4 tersedia'}
                        )
                      </span>
                    </label>

                    <label
                      htmlFor="req-asset-cover"
                      className="flex items-center gap-2.5 rounded-md border border-border bg-background/60 px-3 py-2 font-medium text-foreground"
                    >
                      <input
                        id="req-asset-cover"
                        type="checkbox"
                        checked={reqCover}
                        onChange={(e) => setReqCover(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>Cover Thumbnail (.jpg / .png / .webp)</span>
                    </label>

                    <label
                      htmlFor="req-asset-caption"
                      className="flex items-center gap-2.5 rounded-md border border-border bg-background/60 px-3 py-2 font-medium text-foreground"
                    >
                      <input
                        id="req-asset-caption"
                        type="checkbox"
                        checked={reqCaption}
                        onChange={(e) => setReqCaption(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span>Berkas caption.txt</span>
                    </label>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* STEP 3: SLOT JAM UPLOAD HARIAN */}
            <TabsContent value="slots" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Daftar Slot Jam Upload Harian (DD.SLOT)
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground">
                        Kode folder konten memakai format Tanggal.Slot (contoh:
                        24.01 untuk Tanggal 24 Slot 01).
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={handleAddSlot}
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      <span>Tambah Slot Jam</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {timeSlotsList.map((slot, index) => (
                    <div
                      key={`${slot.code}-${index}`}
                      className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/30 p-2.5 sm:grid-cols-12 sm:items-center"
                    >
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`slot-code-${index}`}
                          className="block text-[10px] font-medium text-muted-foreground"
                        >
                          Kode Slot
                        </label>
                        <Input
                          id={`slot-code-${index}`}
                          value={slot.code}
                          onChange={(e) =>
                            handleUpdateSlot(index, { code: e.target.value })
                          }
                          className="font-mono"
                          placeholder="01"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label
                          htmlFor={`slot-label-${index}`}
                          className="block text-[10px] font-medium text-muted-foreground"
                        >
                          Nama Slot
                        </label>
                        <Input
                          id={`slot-label-${index}`}
                          value={slot.label}
                          onChange={(e) =>
                            handleUpdateSlot(index, { label: e.target.value })
                          }
                          placeholder="Siang / Malam"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`slot-time-${index}`}
                          className="block text-[10px] font-medium text-muted-foreground"
                        >
                          Jam Default
                        </label>
                        <Input
                          id={`slot-time-${index}`}
                          type="time"
                          value={slot.defaultTime}
                          onChange={(e) =>
                            handleUpdateSlot(index, {
                              defaultTime: e.target.value,
                              window: `${e.target.value.replace(':', '.')} WIB`,
                            })
                          }
                          className="font-mono"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label
                          htmlFor={`slot-window-${index}`}
                          className="block text-[10px] font-medium text-muted-foreground"
                        >
                          Rentang Waktu Tayang
                        </label>
                        <Input
                          id={`slot-window-${index}`}
                          value={slot.window}
                          onChange={(e) =>
                            handleUpdateSlot(index, { window: e.target.value })
                          }
                          placeholder="11.30 - 12.00 WIB"
                        />
                      </div>

                      <div className="flex items-end justify-end sm:col-span-1 pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={timeSlotsList.length <= 1}
                          onClick={() => handleRemoveSlot(index)}
                          aria-label={`Hapus slot ${slot.code}`}
                          title="Hapus slot"
                        >
                          <Trash2
                            className="h-3.5 w-3.5 text-destructive"
                            aria-hidden="true"
                          />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Hashtag Default Workspace
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <label
                    htmlFor="ws-default-hashtags"
                    className="block text-xs font-medium text-foreground"
                  >
                    Daftar Hashtag Bawaan (dipisahkan spasi)
                  </label>
                  <Input
                    id="ws-default-hashtags"
                    value={defaultHashtagsInput}
                    onChange={(e) => setDefaultHashtagsInput(e.target.value)}
                    placeholder="#edukasi #konten #sejarah"
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Otomatis diisikan saat Anda membuat folder konten baru atau
                    melakukan batch generate slot.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Separator />

        {/* Modal Footer */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-card px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {timeSlotsList.length} slot harian ({' '}
              {timeSlotsList.map((s) => `${s.code} ${s.label}`).join(' · ')})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="editorial"
              size="default"
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
              <span>Simpan & Aktifkan Workspace</span>
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
};

export default WorkspaceModal;
