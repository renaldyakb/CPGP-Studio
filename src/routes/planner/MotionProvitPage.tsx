import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  DatabaseZap,
  ExternalLink,
  Film,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  AlertCircle,
} from 'lucide-react';
import type { NextSuggestedSlot } from '@/types/workspace';
import type {
  MotionProvitCacheStats,
  MotionProvitConfigPublic,
  MotionProvitDownloadAssetsSelection,
  MotionProvitImportProgress,
  MotionProvitJobSummary,
} from '@/types/motionprovit';
import { motionprovitApi } from '@/services/motionprovitApi';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DatePicker,
  INDONESIAN_MONTH_NAMES,
  monthNameToIndex,
} from '@/components/ui/date-picker';
import { Input, NativeSelect } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDate(iso: string): Date | undefined {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function slotToIsoDate(slot: NextSuggestedSlot | null, defaultYear: number): string {
  if (!slot) {
    return toIsoDate(new Date());
  }
  const monthIdx = monthNameToIndex(slot.monthFolder);
  const d = new Date(
    defaultYear || new Date().getFullYear(),
    monthIdx >= 0 ? monthIdx : new Date().getMonth(),
    slot.dayOfMonth
  );
  return toIsoDate(d);
}

export function MotionProvitPage() {
  const { activeWorkspace, allItems, showToast, openDetail, rescan } =
    usePlannerWorkspace();

  const [config, setConfig] = useState<MotionProvitConfigPublic | null>(null);
  const [jobs, setJobs] = useState<MotionProvitJobSummary[]>([]);
  const [nextSlot, setNextSlot] = useState<NextSuggestedSlot | null>(null);
  const [cacheStats, setCacheStats] = useState<MotionProvitCacheStats | null>(
    null
  );
  const [importProgress, setImportProgress] =
    useState<MotionProvitImportProgress | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Login form state
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showAuthForm, setShowAuthForm] = useState<boolean>(false);

  // Filters, pagination & selection
  const [search, setSearch] = useState<string>('');
  const [styleFilter, setStyleFilter] = useState<string>('all');
  const [importFilter, setImportFilter] = useState<'new' | 'all'>('new');
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(12);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Selective assets & target start slot
  const [assets, setAssets] = useState<MotionProvitDownloadAssetsSelection>({
    video: true,
    cover: true,
    caption: true,
  });
  const [startDateIso, setStartDateIso] = useState<string>('');
  const [startSlotCode, setStartSlotCode] = useState<string>('01');

  const workspaceYear = activeWorkspace?.defaultYear || new Date().getFullYear();

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await motionprovitApi.getStatus();
      setConfig(res.config);
      setJobs(res.jobs);
      setNextSlot(res.nextSlot);
      if (res.cacheStats) setCacheStats(res.cacheStats);
      setImportProgress(res.importProgress);
      setEmail((prev) => prev || res.config.email || '');
      if (!res.config.connected) {
        setShowAuthForm(true);
      }
      if (res.nextSlot) {
        setStartDateIso((prev) => prev || slotToIsoDate(res.nextSlot, workspaceYear));
        setStartSlotCode((prev) => prev || res.nextSlot.slotCode || '01');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal memuat Add-on MotionProvit.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [showToast, workspaceYear]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, activeWorkspace?.id]);

  // Poll live progress while batch import is running
  useEffect(() => {
    if (!importProgress || importProgress.status !== 'running') return;
    const timer = window.setInterval(async () => {
      try {
        const res = await motionprovitApi.getImportStatus();
        if (res.importProgress) {
          setImportProgress(res.importProgress);
          if (res.importProgress.status !== 'running') {
            setSelectedIds([]);
            void loadStatus();
            void rescan();
            showToast(
              res.importProgress.currentStep,
              res.importProgress.failedCount > 0 &&
                res.importProgress.completedCount === 0
                ? 'error'
                : 'success'
            );
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [importProgress?.status, loadStatus, rescan, showToast]);

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || (!password && !config?.passwordConfigured)) {
      showToast('Masukkan email dan password MotionProvit.', 'error');
      return;
    }
    setBusyAction('login');
    try {
      const res = await motionprovitApi.login({ email: email.trim(), password });
      setConfig(res.config);
      setPassword('');
      if (res.ok) {
        setShowAuthForm(false);
        showToast(res.message, 'success');
        await handleFetchJobs();
      } else {
        showToast(res.message, 'error');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal login ke MotionProvit.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenBrowserLogin = async () => {
    setBusyAction('open-login');
    try {
      await motionprovitApi.openLoginBrowser();
      showToast(
        'Halaman login MotionProvit dibuka di Chrome. Setelah login, klik Cek Sesi.',
        'info'
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal membuka browser login.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCheckSession = async () => {
    setBusyAction('check-session');
    try {
      const res = await motionprovitApi.checkSession();
      setConfig(res.config);
      if (res.connected) {
        setShowAuthForm(false);
        showToast('Sesi MotionProvit aktif.', 'success');
        if (jobs.length === 0) {
          await handleFetchJobs();
        }
      } else {
        setShowAuthForm(true);
        showToast(res.message, 'info');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal memeriksa sesi.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    setBusyAction('disconnect');
    try {
      const res = await motionprovitApi.disconnect();
      setConfig(res.config);
      setJobs([]);
      setSelectedIds([]);
      setEmail('');
      setPassword('');
      setShowAuthForm(true);
      showToast('Koneksi MotionProvit untuk workspace ini diputuskan.', 'info');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal memutuskan koneksi.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleFetchJobs = async (
    mode: 'incremental' | 'full' = 'incremental'
  ) => {
    setBusyAction(mode === 'full' ? 'fetch-full' : 'fetch-jobs');
    try {
      const res = await motionprovitApi.fetchJobs(mode);
      setConfig(res.config);
      setJobs(res.jobs);
      setNextSlot(res.nextSlot);
      if (res.cacheStats) setCacheStats(res.cacheStats);
      if (res.nextSlot && !startDateIso) {
        setStartDateIso(slotToIsoDate(res.nextSlot, workspaceYear));
        setStartSlotCode(res.nextSlot.slotCode || '01');
      }
      const modeNote =
        res.syncMode === 'incremental'
          ? `Cek baru selesai (${res.newFoundCount ?? 0} video baru, ${res.pagesScanned ?? 1} halaman).`
          : `Sinkron penuh selesai: ${res.jobs.length} video dari ${res.pagesScanned ?? 1} halaman.`;
      showToast(modeNote, 'success');
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Gagal mengambil daftar video MotionProvit.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearCache = async () => {
    setBusyAction('clear-cache');
    try {
      const res = await motionprovitApi.clearCache();
      setCacheStats(res.cacheStats);
      showToast(
        `Cache thumbnail dibersihkan (${res.cacheStats.cacheDir}).`,
        'info'
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal membersihkan cache.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartImport = async () => {
    if (selectedIds.length === 0) {
      showToast('Pilih minimal satu video untuk diunduh.', 'error');
      return;
    }
    if (!assets.video && !assets.cover && !assets.caption) {
      showToast('Pilih minimal satu jenis berkas (Video, Cover, atau Caption).', 'error');
      return;
    }

    setBusyAction('import');
    try {
      const res = await motionprovitApi.startImport({
        jobIds: selectedIds,
        assets,
        startDateIso: startDateIso || undefined,
        startSlotCode: startSlotCode || undefined,
      });
      setImportProgress(res.importProgress);
      showToast(
        `Mengunduh ${selectedIds.length} video ke slot kosong workspace...`,
        'info'
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal memulai pengunduhan.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelImport = async () => {
    setBusyAction('cancel');
    try {
      const res = await motionprovitApi.cancelImport();
      if (res.importProgress) {
        setImportProgress(res.importProgress);
      }
      showToast('Proses unduh dibatalkan.', 'info');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Gagal membatalkan proses.',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const availableStyles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      const s = job.style || 'MotionProvit';
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (importFilter === 'new' && job.alreadyImported) return false;
      if (styleFilter !== 'all' && job.style !== styleFilter) return false;
      if (q) {
        const hay = `${job.title} ${job.shortId} ${job.style}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, importFilter, styleFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / perPage));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search, styleFilter, importFilter, perPage]);

  const paginatedJobs = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return filteredJobs.slice(start, start + perPage);
  }, [filteredJobs, safePage, perPage]);

  const pageNumbers = useMemo(() => {
    const pages: Array<number | 'ellipsis'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safePage > 3) pages.push('ellipsis');
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (safePage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [safePage, totalPages]);

  // Compute live target slot assignment preview for every selected job
  const orderedSlotCodes = useMemo(() => {
    const defs = activeWorkspace?.timeSlots;
    const keys = defs ? Object.keys(defs).sort() : ['01', '02'];
    return keys.length > 0 ? keys : ['01', '02'];
  }, [activeWorkspace?.timeSlots]);

  const slotPreviewMap = useMemo(() => {
    const map = new Map<string, string>();
    if (selectedIds.length === 0) return map;

    const occupied = new Set<string>();
    for (const item of allItems) {
      occupied.add(`${item.monthFolder.toLowerCase()}::${item.folderCode}`);
    }

    const baseDate =
      parseIsoDate(startDateIso) ??
      parseIsoDate(slotToIsoDate(nextSlot, workspaceYear)) ??
      new Date();
    let cursor = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate()
    );
    let slotIdx = Math.max(0, orderedSlotCodes.indexOf(startSlotCode));

    for (const jobId of selectedIds) {
      let guard = 0;
      while (guard < 500) {
        guard += 1;
        const monthName = INDONESIAN_MONTH_NAMES[cursor.getMonth()] ?? 'November';
        const day = cursor.getDate();
        const code = `${String(day).padStart(2, '0')}.${orderedSlotCodes[slotIdx] ?? '01'}`;
        const key = `${monthName.toLowerCase()}::${code}`;

        slotIdx += 1;
        if (slotIdx >= orderedSlotCodes.length) {
          slotIdx = 0;
          cursor = new Date(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate() + 1
          );
        }

        if (!occupied.has(key)) {
          occupied.add(key);
          map.set(jobId, `${monthName} ${code}`);
          break;
        }
      }
    }
    return map;
  }, [
    selectedIds,
    allItems,
    startDateIso,
    startSlotCode,
    nextSlot,
    workspaceYear,
    orderedSlotCodes,
  ]);

  const toggleSelect = (jobId: string) => {
    setSelectedIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  };

  const selectCurrentPage = () => {
    const pageJobIds = paginatedJobs
      .filter((j) => j.status === 'completed' || j.status === 'unknown')
      .map((j) => j.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...pageJobIds])));
  };

  const selectAllFiltered = () => {
    const ids = filteredJobs
      .filter((j) => j.status === 'completed' || j.status === 'unknown')
      .map((j) => j.id);
    setSelectedIds(ids);
  };

  const selectOnlyNew = () => {
    const ids = jobs
      .filter(
        (j) =>
          !j.alreadyImported &&
          (j.status === 'completed' || j.status === 'unknown')
      )
      .map((j) => j.id);
    setSelectedIds(ids);
  };

  const isImporting = importProgress?.status === 'running';
  const isBusy = busyAction !== null;
  const newJobsCount = jobs.filter((j) => !j.alreadyImported).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Connection & Credentials Card (Workspace-scoped) */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle>Koneksi MotionProvit</CardTitle>
            <Badge variant={config?.connected ? 'success' : 'warning'}>
              {config?.connected ? 'Terhubung' : 'Belum Login'}
            </Badge>
            {config?.accountName || config?.accountEmail ? (
              <span className="truncate font-mono text-[11px] font-light text-muted-foreground/75">
                {config.accountName || config.accountEmail}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {config?.connected ? (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="editorial"
                  disabled={isBusy || isImporting}
                  onClick={() => void handleFetchJobs('incremental')}
                >
                  {busyAction === 'fetch-jobs' ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                  )}
                  {jobs.length > 0 ? 'Cek Baru' : 'Ambil Daftar'}
                </Button>
                <IconActionButton
                  icon={busyAction === 'fetch-full' ? Loader2 : DatabaseZap}
                  iconClassName={
                    busyAction === 'fetch-full' ? 'animate-spin' : undefined
                  }
                  label="Sinkron penuh seluruh halaman MotionProvit"
                  variant="outline"
                  disabled={isBusy || isImporting}
                  onClick={() => void handleFetchJobs('full')}
                />
                <IconActionButton
                  icon={busyAction === 'clear-cache' ? Loader2 : Trash2}
                  iconClassName={
                    busyAction === 'clear-cache' ? 'animate-spin' : undefined
                  }
                  label={
                    cacheStats
                      ? `Bersihkan cache thumbnail (${cacheStats.filesCount} berkas, ${Math.round(cacheStats.totalBytes / 1024)} KB di ${cacheStats.cacheDir})`
                      : 'Bersihkan cache thumbnail lokal'
                  }
                  variant="outline"
                  disabled={
                    isBusy ||
                    isImporting ||
                    (cacheStats !== null && cacheStats.filesCount === 0)
                  }
                  onClick={() => void handleClearCache()}
                />
              </>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isBusy || isImporting}
              onClick={() => void handleCheckSession()}
            >
              {busyAction === 'check-session' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-3.5" aria-hidden="true" />
              )}
              Cek Sesi
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isBusy || isImporting}
              onClick={() => void handleOpenBrowserLogin()}
            >
              {busyAction === 'open-login' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink className="size-3.5" aria-hidden="true" />
              )}
              Login Browser
            </Button>
            {config?.connected ? (
              <>
                <IconActionButton
                  icon={KeyRound}
                  label={showAuthForm ? 'Tutup form kredensial' : 'Ubah kredensial workspace'}
                  variant="outline"
                  onClick={() => setShowAuthForm((prev) => !prev)}
                />
                <IconActionButton
                  icon={LogOut}
                  label="Putuskan koneksi MotionProvit"
                  variant="outline"
                  disabled={isBusy || isImporting}
                  onClick={() => void handleDisconnect()}
                />
              </>
            ) : null}
          </div>
        </CardHeader>

        {showAuthForm || !config?.connected ? (
          <CardContent className="space-y-3 pt-1">
            <p className="text-xs font-light text-muted-foreground/75">
              Kredensial &amp; sesi disimpan lokal khusus untuk workspace{' '}
              <span className="font-medium text-foreground">
                {activeWorkspace?.name ?? 'aktif'}
              </span>
              . Anda bisa login dengan email &amp; password atau melalui tab
              Chrome lokal.
            </p>
            <form
              onSubmit={handleLoginSubmit}
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email MotionProvit (kamu@email.com)"
                autoComplete="email"
                disabled={isBusy}
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  config?.passwordConfigured
                    ? 'Password tersimpan (kosongkan jika tetap)'
                    : 'Password MotionProvit'
                }
                autoComplete="current-password"
                disabled={isBusy}
              />
              <Button
                type="submit"
                variant="editorial"
                disabled={isBusy}
                className="min-h-9"
              >
                {busyAction === 'login' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-3.5" aria-hidden="true" />
                )}
                Simpan &amp; Masuk
              </Button>
            </form>
          </CardContent>
        ) : null}
      </Card>

      {/* Active / Recent Batch Download Progress */}
      {importProgress && importProgress.status !== 'idle' ? (
        <Card>
          <CardContent className="space-y-2.5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {importProgress.status === 'running' ? (
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-primary"
                    aria-hidden="true"
                  />
                ) : importProgress.status === 'completed' ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-[#166534] dark:text-[#86efac]"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertCircle
                    className="size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate text-xs font-medium text-foreground">
                  {importProgress.currentStep}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {importProgress.completedCount}/{importProgress.total}
                </span>
                {importProgress.status === 'running' ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void handleCancelImport()}
                  >
                    <X className="size-3" aria-hidden="true" />
                    Batal
                  </Button>
                ) : null}
              </div>
            </div>

            <Progress value={importProgress.progressPercent} />

            <div className="flex flex-wrap gap-1.5">
              {importProgress.items.map((entry) => (
                <Badge
                  key={entry.jobId}
                  variant={
                    entry.status === 'completed'
                      ? 'success'
                      : entry.status === 'failed'
                        ? 'destructive'
                        : entry.status === 'downloading'
                          ? 'info'
                          : 'muted'
                  }
                  size="xs"
                  className="font-mono"
                  title={entry.error || entry.downloadedFiles.join(', ')}
                >
                  #{entry.shortId}
                  {entry.folderCode ? ` -> ${entry.folderCode}` : ''}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Batch Download & Slot Assignment Controls */}
      {config?.connected ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  Berkas Unduh
                </span>
                {(
                  [
                    { key: 'video', label: 'Video MP4' },
                    { key: 'cover', label: 'Cover 9:16' },
                    { key: 'caption', label: 'Caption' },
                  ] as const
                ).map((opt) => {
                  const active = assets[opt.key];
                  return (
                    <Button
                      key={opt.key}
                      type="button"
                      size="xs"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      disabled={isImporting}
                      onClick={() =>
                        setAssets((prev) => ({
                          ...prev,
                          [opt.key]: !prev[opt.key],
                        }))
                      }
                    >
                      {active ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : null}
                      {opt.label}
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-light text-muted-foreground/75">
                  Mulai slot kosong
                </span>
                <div className="w-[152px]">
                  <DatePicker
                    value={parseIsoDate(startDateIso)}
                    onChange={(d) => {
                      if (d) setStartDateIso(toIsoDate(d));
                    }}
                    placeholder="Tanggal mulai"
                    disabled={isImporting}
                    ariaLabel="Tanggal mulai assign slot"
                  />
                </div>
                <NativeSelect
                  value={startSlotCode}
                  disabled={isImporting}
                  aria-label="Slot awal"
                  onChange={(e) => setStartSlotCode(e.target.value)}
                  className="w-24"
                >
                  {orderedSlotCodes.map((code) => (
                    <option key={code} value={code}>
                      Slot {code}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isImporting || newJobsCount === 0}
                  onClick={selectOnlyNew}
                >
                  Pilih Semua Baru ({newJobsCount})
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isImporting || paginatedJobs.length === 0}
                  onClick={selectCurrentPage}
                >
                  Pilih Halaman Ini ({paginatedJobs.length})
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isImporting || filteredJobs.length === 0}
                  onClick={selectAllFiltered}
                >
                  Pilih Semua ({filteredJobs.length})
                </Button>
                {selectedIds.length > 0 ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={isImporting}
                    onClick={() => setSelectedIds([])}
                  >
                    Bersihkan ({selectedIds.length})
                  </Button>
                ) : null}
              </div>

              <Button
                type="button"
                variant="editorial"
                size="sm"
                disabled={
                  selectedIds.length === 0 || isImporting || busyAction === 'import'
                }
                onClick={() => void handleStartImport()}
              >
                {busyAction === 'import' || isImporting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudDownload className="size-3.5" aria-hidden="true" />
                )}
                Unduh &amp; Assign ({selectedIds.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Filter Bar & Scraped Video List (Preview only, no download until confirmed) */}
      {config?.connected ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul, gaya, atau #ID..."
                className="pl-8"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                role="group"
                aria-label="Filter status impor"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
              >
                <Button
                  type="button"
                  size="xs"
                  variant={importFilter === 'new' ? 'default' : 'ghost'}
                  onClick={() => setImportFilter('new')}
                >
                  Baru ({newJobsCount})
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={importFilter === 'all' ? 'default' : 'ghost'}
                  onClick={() => setImportFilter('all')}
                >
                  Semua ({jobs.length})
                </Button>
              </div>
            </div>
          </div>

          {availableStyles.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant={styleFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStyleFilter('all')}
              >
                Semua Gaya
              </Button>
              {availableStyles.map(([styleName, count]) => (
                <Button
                  key={styleName}
                  type="button"
                  size="xs"
                  variant={styleFilter === styleName ? 'default' : 'outline'}
                  onClick={() => setStyleFilter(styleName)}
                >
                  {styleName} ({count})
                </Button>
              ))}
            </div>
          ) : null}

          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-xs font-light text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Memuat daftar MotionProvit...
              </CardContent>
            </Card>
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Film
                  className="size-8 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Daftar video belum diambil
                  </p>
                  <p className="max-w-sm text-xs font-light text-muted-foreground/75">
                    Klik Ambil Daftar untuk memindai halaman /app/jobs
                    MotionProvit tanpa mengunduh file terlebih dahulu.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="editorial"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void handleFetchJobs()}
                >
                  {busyAction === 'fetch-jobs' ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                  )}
                  Ambil Daftar Sekarang
                </Button>
              </CardContent>
            </Card>
          ) : filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-xs font-light text-muted-foreground/75">
                  Tidak ada video yang cocok dengan filter saat ini.
                </p>
                {importFilter === 'new' && jobs.length > 0 ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setImportFilter('all')}
                  >
                    Tampilkan semua ({jobs.length})
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {paginatedJobs.map((job) => {
                const isSelected = selectedIds.includes(job.id);
                const targetSlotLabel = slotPreviewMap.get(job.id);
                const existingPlannerItem = job.importedItemId
                  ? allItems.find((i) => i.id === job.importedItemId)
                  : undefined;

                return (
                  <Card
                    key={job.id}
                    className={cn(
                      'transition-colors',
                      isSelected && 'border-primary ring-1 ring-primary/30'
                    )}
                  >
                    <CardContent className="flex gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(job.id)}
                        disabled={isImporting}
                        aria-label={`Pilih ${job.title}`}
                        className="relative w-[76px] shrink-0 overflow-hidden rounded-md border border-border bg-muted aspect-[9/16] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                      >
                        {job.thumbnailUrl ? (
                          <img
                            src={motionprovitApi.getThumbnailProxyUrl(
                              job.thumbnailUrl
                            )}
                            alt={job.title}
                            width={76}
                            height={135}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                            <Film className="size-5" aria-hidden="true" />
                          </div>
                        )}
                        <span
                          className={cn(
                            'absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded border text-[10px] transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/80 bg-background/85 text-transparent'
                          )}
                        >
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                      </button>

                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="muted" size="xs">
                              {job.style}
                            </Badge>
                            {job.alreadyImported ? (
                              <Badge variant="success" size="xs">
                                Di CPGP: {job.importedFolderCode}
                              </Badge>
                            ) : (
                              <Badge variant="info" size="xs">
                                Baru
                              </Badge>
                            )}
                            {targetSlotLabel ? (
                              <Badge
                                variant="warning"
                                size="xs"
                                className="font-mono"
                              >
                                -&gt; {targetSlotLabel}
                              </Badge>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleSelect(job.id)}
                            disabled={isImporting}
                            className="block w-full text-left text-sm font-semibold leading-snug text-foreground line-clamp-2 hover:text-primary"
                          >
                            {job.title}
                          </button>

                          <p className="font-mono text-[11px] font-light text-muted-foreground/75">
                            #{job.shortId} · {job.aspectRatio}
                            {job.durationSec ? ` · ${job.durationSec}d` : ''}
                            {job.createdAtText ? ` · ${job.createdAtText}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <Button
                            type="button"
                            size="xs"
                            variant={isSelected ? 'default' : 'outline'}
                            disabled={isImporting}
                            onClick={() => toggleSelect(job.id)}
                          >
                            {isSelected ? 'Terpilih' : 'Pilih Unduh'}
                          </Button>

                          <div className="flex items-center gap-1">
                            {existingPlannerItem ? (
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                onClick={() => openDetail(existingPlannerItem)}
                              >
                                Buka Slot
                              </Button>
                            ) : null}
                            <IconActionButton
                              icon={ExternalLink}
                              label="Buka di MotionProvit"
                              onClick={() =>
                                window.open(
                                  job.detailUrl,
                                  '_blank',
                                  'noopener,noreferrer'
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              </div>

              {/* Pagination Bar (mirroring MotionProvit 12 / 24 / 48 per page) */}
              <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 sm:flex-row">
                <p className="font-mono text-[11px] font-light text-muted-foreground">
                  Menampilkan{' '}
                  <span className="font-semibold text-foreground">
                    {(safePage - 1) * perPage + 1}-
                    {Math.min(safePage * perPage, filteredJobs.length)}
                  </span>{' '}
                  dari{' '}
                  <span className="font-semibold text-foreground">
                    {filteredJobs.length}
                  </span>{' '}
                  video
                  {config?.totalRemoteCount &&
                  config.totalRemoteCount > jobs.length
                    ? ` (total ${config.totalRemoteCount} di MotionProvit)`
                    : ''}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <IconActionButton
                      icon={ChevronLeft}
                      label="Halaman sebelumnya"
                      variant="outline"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    />

                    {pageNumbers.map((entry, idx) =>
                      entry === 'ellipsis' ? (
                        <span
                          key={`el-${idx}`}
                          className="px-1.5 text-xs text-muted-foreground"
                        >
                          ...
                        </span>
                      ) : (
                        <Button
                          key={entry}
                          type="button"
                          size="xs"
                          variant={entry === safePage ? 'default' : 'outline'}
                          aria-current={entry === safePage ? 'page' : undefined}
                          onClick={() => setPage(entry)}
                          className="min-w-7 font-mono"
                        >
                          {entry}
                        </Button>
                      )
                    )}

                    <IconActionButton
                      icon={ChevronRight}
                      label="Halaman berikutnya"
                      variant="outline"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    />
                  </div>

                  <NativeSelect
                    value={String(perPage)}
                    aria-label="Jumlah video per halaman"
                    onChange={(e) => setPerPage(Number(e.target.value) || 12)}
                    className="w-36"
                  >
                    <option value="12">12 per halaman</option>
                    <option value="24">24 per halaman</option>
                    <option value="48">48 per halaman</option>
                  </NativeSelect>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
