import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  FolderOpen,
  ExternalLink,
  AlertTriangle,
  Film,
  Image as ImageIcon,
  Tag,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Lock,
  Unlock,
  CheckSquare,
  Square,
  Hash,
  MessageSquare,
  Heading1,
  Send,
  Droplets,
} from 'lucide-react';
import {
  ContentPlannerItem,
  KANBAN_COLUMNS,
  PLATFORMS,
  PlatformKey,
  PlatformUploadStatus,
  PlatformPublishState,
  PriorityLevel,
  UserContentProperties,
  WorkflowStatus,
  ChecklistItem,
  ParsedCaption,
} from '../types/planner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Input, Textarea, NativeSelect } from '@/components/ui/input';
import { IconActionButton } from '@/components/autopost/parts/IconActionButton';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '@/components/autopost/parts/platformMeta';
import { formatSlotShort } from '@/lib/formatSlot';

export type MediaTabMode = 'wm_final' | 'raw_video' | 'cover';
export type ModalLayoutMode = 'drawer' | 'fullscreen';
export type DetailWorkTab = 'publish' | 'caption' | 'assets';
export type CaptionEditMode = 'raw' | 'structured';

export interface ContentDetailModalProps {
  item: ContentPlannerItem | null;
  isOpen?: boolean;
  onClose: () => void;
  initialTab?: 'publish' | 'caption' | 'assets';
  allItems?: ContentPlannerItem[];
  items?: ContentPlannerItem[];
  prevItem?: ContentPlannerItem | null;
  nextItem?: ContentPlannerItem | null;
  onSelectItem?: (item: ContentPlannerItem) => void;
  onNavigate?: (itemId: string) => void;
  onUpdateProperties?: (
    itemId: string,
    patch: Partial<UserContentProperties>
  ) => void | Promise<void>;
  onUpdateUserProperties?: (
    itemId: string,
    patch: Partial<UserContentProperties>
  ) => void | Promise<void>;
  onUpdateStatus?: (
    itemId: string,
    status: WorkflowStatus,
    lockManually?: boolean
  ) => void | Promise<void>;
  onUpdatePlatform?: (
    itemId: string,
    platform: PlatformKey,
    patch: Partial<PlatformPublishState>
  ) => void | Promise<void>;
  onBatchUpdatePlatforms?: (
    itemId: string,
    status: PlatformUploadStatus
  ) => void | Promise<void>;
  onSaveCaption?: (itemId: string, newText: string) => void | Promise<void>;
  onOpenWatermark?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (
    item: ContentPlannerItem,
    platform?: PlatformKey | null
  ) => void;
  onOpenExplorer?: (
    targetPath: string,
    selectFile?: boolean
  ) => void | Promise<void>;
}

const PLATFORM_STATUS_OPTIONS: Array<{
  value: PlatformUploadStatus;
  label: string;
}> = [
  { value: 'not_started', label: 'Belum Upload' },
  { value: 'uploaded_draft', label: 'Draft' },
  { value: 'scheduled', label: 'Terjadwal' },
  { value: 'published', label: 'Published' },
  { value: 'issue', label: 'Kendala' },
];

const PRIORITY_OPTIONS: Array<{
  value: PriorityLevel;
  label: string;
}> = [
  { value: 'low', label: 'Rendah (low)' },
  { value: 'normal', label: 'Normal (normal)' },
  { value: 'high', label: 'Tinggi (high)' },
  { value: 'urgent', label: 'Mendesak (urgent)' },
];

const QUICK_HASHTAG_CHIPS = [
  '#edukasi',
  '#shorts',
  '#reels',
  '#faktaunik',
  '#tips',
];

const PRESET_CATEGORY_TAGS = [
  'Sejarah Dunia',
  'Militer dan Perang',
  'Fakta Unik',
  'Tokoh Sejarah',
  'Misteri',
  'Geopolitik',
];

const DEFAULT_CHECKLIST_PRESETS = [
  'Cek video siap upload & watermark (wm_final.mp4) dan kualitas audio',
  'Pastikan rasio cover 9:16 dan teks judul terbaca jelas',
  'Salin Hook (<100 karakter) untuk judul YouTube Shorts',
  'Jadwalkan sesuai jam slot upload workspace',
];

const PLATFORM_UPLOAD_STUDIO_URL: Record<PlatformKey, string> =
  PLATFORMS.reduce(
    (acc, p) => {
      acc[p.key] = p.uploadUrl;
      return acc;
    },
    {
      yt_shorts: 'https://studio.youtube.com',
      tiktok: 'https://www.tiktok.com/tiktokstudio/upload',
      ig_reels: 'https://www.instagram.com',
      fb_reels: 'https://business.facebook.com/latest/home',
    } as Record<PlatformKey, string>
  );

function parseCaptionLive(rawText: string): ParsedCaption {
  const normalized = (rawText ?? '').replace(/\r\n/g, '\n');
  const trimmed = normalized.trim();
  if (!trimmed) {
    return {
      rawText: '',
      hookTitle: '',
      ctaQuestion: '',
      bodyWithoutHashtags: '',
      hashtags: [],
      charCount: 0,
      wordCount: 0,
      lineCount: 0,
    };
  }

  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const hashtags: string[] = [];
  const bodyLines: string[] = [];

  for (const line of lines) {
    const matches = line.match(/#[a-zA-Z0-9_]+/g);
    const nonTagText = line.replace(/#[a-zA-Z0-9_]+/g, '').trim();
    if (matches && matches.length > 0 && nonTagText.length === 0) {
      hashtags.push(...matches);
    } else {
      if (matches && matches.length > 0) {
        hashtags.push(...matches);
      }
      bodyLines.push(line);
    }
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      const withoutTags = p.replace(/#[a-zA-Z0-9_]+/g, '').trim();
      return withoutTags.length > 0;
    });

  const hookTitle = paragraphs[0] ?? bodyLines[0] ?? '';
  const ctaQuestion =
    paragraphs.length > 1
      ? paragraphs.slice(1).join('\n\n')
      : bodyLines.length > 1
        ? bodyLines.slice(1).join('\n')
        : '';
  const bodyWithoutHashtags = [hookTitle, ctaQuestion]
    .filter(Boolean)
    .join('\n\n');

  const words = trimmed.split(/\s+/).filter(Boolean);

  return {
    rawText: normalized,
    hookTitle,
    ctaQuestion,
    bodyWithoutHashtags,
    hashtags,
    charCount: normalized.length,
    wordCount: words.length,
    lineCount: normalized.split('\n').length,
  };
}

export function ContentDetailModal({
  item,
  isOpen = true,
  onClose,
  initialTab = 'publish',
  allItems,
  items,
  prevItem: prevItemProp,
  nextItem: nextItemProp,
  onSelectItem,
  onNavigate,
  onUpdateProperties,
  onUpdateUserProperties,
  onUpdateStatus,
  onUpdatePlatform,
  onBatchUpdatePlatforms,
  onSaveCaption,
  onOpenWatermark,
  onOpenAutoPost,
  onOpenExplorer,
}: ContentDetailModalProps) {
  const [layoutMode, setLayoutMode] = useState<ModalLayoutMode>('drawer');
  const [activeMediaTab, setActiveMediaTab] =
    useState<MediaTabMode>('wm_final');
  const [activeDetailTab, setActiveDetailTab] =
    useState<DetailWorkTab>(initialTab);
  const [captionMode, setCaptionMode] = useState<CaptionEditMode>('raw');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [captionDraft, setCaptionDraft] = useState<string>('');
  const [hookDraft, setHookDraft] = useState<string>('');
  const [ctaDraft, setCtaDraft] = useState<string>('');
  const [hashtagDraft, setHashtagDraft] = useState<string>('');
  const [isSavingCaption, setIsSavingCaption] = useState<boolean>(false);
  const [captionSavedNotice, setCaptionSavedNotice] = useState<boolean>(false);

  const [customTitleDraft, setCustomTitleDraft] = useState<string>('');
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [newChecklistInput, setNewChecklistInput] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);

  const [platformUrls, setPlatformUrls] = useState<Record<PlatformKey, string>>(
    {
      yt_shorts: '',
      tiktok: '',
      ig_reels: '',
      fb_reels: '',
    }
  );

  const composeCaptionFromParts = (hook: string, cta: string, tags: string) => {
    return [hook.trim(), cta.trim(), tags.trim()].filter(Boolean).join('\n\n');
  };

  useEffect(() => {
    setActiveDetailTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!item) return;

    const hasWm = item.autoMetadata.assets.wmVideo.exists;
    const hasRaw = item.autoMetadata.assets.rawVideo.exists;
    setActiveMediaTab(hasWm ? 'wm_final' : hasRaw ? 'raw_video' : 'wm_final');

    const raw = item.autoMetadata.captionParsed.rawText ?? '';
    const parsed = parseCaptionLive(raw);
    setCaptionDraft(raw);
    setHookDraft(parsed.hookTitle);
    setCtaDraft(parsed.ctaQuestion);
    setHashtagDraft(parsed.hashtags.join(' '));
    setCaptionSavedNotice(false);

    setCustomTitleDraft(item.userProperties.customTitle ?? '');
    setNotesDraft(item.userProperties.notes ?? '');

    setPlatformUrls({
      yt_shorts: item.userProperties.platforms.yt_shorts?.publishedUrl ?? '',
      tiktok: item.userProperties.platforms.tiktok?.publishedUrl ?? '',
      ig_reels: item.userProperties.platforms.ig_reels?.publishedUrl ?? '',
      fb_reels: item.userProperties.platforms.fb_reels?.publishedUrl ?? '',
    });
  }, [item?.id]);

  const { prevItem, nextItem } = useMemo(() => {
    if (prevItemProp !== undefined || nextItemProp !== undefined) {
      return {
        prevItem: prevItemProp ?? null,
        nextItem: nextItemProp ?? null,
      };
    }
    const list = allItems ?? items ?? [];
    if (!item || list.length === 0) {
      return { prevItem: null, nextItem: null };
    }
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx === -1) return { prevItem: null, nextItem: null };
    return {
      prevItem: idx > 0 ? list[idx - 1] : null,
      nextItem: idx < list.length - 1 ? list[idx + 1] : null,
    };
  }, [item, allItems, items, prevItemProp, nextItemProp]);

  const effectiveCaptionText =
    captionMode === 'raw'
      ? captionDraft
      : composeCaptionFromParts(hookDraft, ctaDraft, hashtagDraft);

  const handleCaptionModeSwitch = (nextMode: CaptionEditMode) => {
    if (nextMode === 'structured' && captionMode === 'raw') {
      const parsed = parseCaptionLive(captionDraft);
      setHookDraft(parsed.hookTitle);
      setCtaDraft(parsed.ctaQuestion);
      setHashtagDraft(parsed.hashtags.join(' '));
    } else if (nextMode === 'raw' && captionMode === 'structured') {
      setCaptionDraft(
        composeCaptionFromParts(hookDraft, ctaDraft, hashtagDraft)
      );
    }
    setCaptionMode(nextMode);
  };

  const copyTimerRef = useRef<number | null>(null);
  const captionNoticeTimerRef = useRef<number | null>(null);
  const notesSavingTimerRef = useRef<number | null>(null);

  const onCloseRef = useRef(onClose);
  const onSelectItemRef = useRef(onSelectItem);
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectItemRef.current = onSelectItem;
    onNavigateRef.current = onNavigate;
  }, [onClose, onSelectItem, onNavigate]);

  useEffect(() => {
    const clearTimers = () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      if (captionNoticeTimerRef.current !== null) {
        window.clearTimeout(captionNoticeTimerRef.current);
        captionNoticeTimerRef.current = null;
      }
      if (notesSavingTimerRef.current !== null) {
        window.clearTimeout(notesSavingTimerRef.current);
        notesSavingTimerRef.current = null;
      }
    };
    if (!isOpen) {
      clearTimers();
    }
    return clearTimers;
  }, [isOpen]);

  useEffect(() => {
    if (!item || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      } else if (e.altKey && e.key === 'ArrowLeft' && prevItem) {
        e.preventDefault();
        if (onSelectItemRef.current) {
          onSelectItemRef.current(prevItem);
        } else {
          onNavigateRef.current?.(prevItem.id);
        }
      } else if (e.altKey && e.key === 'ArrowRight' && nextItem) {
        e.preventDefault();
        if (onSelectItemRef.current) {
          onSelectItemRef.current(nextItem);
        } else {
          onNavigateRef.current?.(nextItem.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isOpen, prevItem, nextItem]);

  if (!item || !isOpen) return null;

  const { autoMetadata, userProperties, schedule } = item;
  const { assets } = autoMetadata;
  const liveParsedCaption = parseCaptionLive(effectiveCaptionText);
  const isCaptionDirty =
    effectiveCaptionText.replace(/\r\n/g, '\n').trim() !==
    (autoMetadata.captionParsed.rawText ?? '').replace(/\r\n/g, '\n').trim();

  const handleGoToItem = (target: ContentPlannerItem) => {
    if (onSelectItem) {
      onSelectItem(target);
    } else {
      onNavigate?.(target.id);
    }
  };

  const triggerCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      // Clipboard not available
    }
  };

  const persistPropertiesPatch = async (
    patch: Partial<UserContentProperties>
  ) => {
    if (onUpdateProperties) {
      await onUpdateProperties(item.id, patch);
      return;
    }
    if (onUpdateUserProperties) {
      await onUpdateUserProperties(item.id, patch);
      return;
    }
    try {
      await fetch(`/api/items/${encodeURIComponent(item.id)}/properties`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      // Ignore network errors
    }
  };

  const handleRevealInExplorer = async (
    targetPath: string,
    selectFile = true
  ) => {
    if (onOpenExplorer) {
      await onOpenExplorer(targetPath, selectFile);
      return;
    }
    try {
      await fetch('/api/system/open-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, selectFile }),
      });
    } catch {
      // Ignore network errors
    }
  };

  const handleWorkflowStatusChange = async (newStatus: WorkflowStatus) => {
    if (onUpdateStatus) {
      await onUpdateStatus(item.id, newStatus, true);
    } else {
      await persistPropertiesPatch({
        workflowStatus: newStatus,
        statusLockedManually: true,
      });
    }
  };

  const handleToggleStatusLock = async () => {
    await persistPropertiesPatch({
      statusLockedManually: !userProperties.statusLockedManually,
    });
  };

  const handlePriorityChange = async (priority: PriorityLevel) => {
    await persistPropertiesPatch({ priority });
  };

  const handleSaveCustomTitle = async () => {
    if (customTitleDraft !== userProperties.customTitle) {
      await persistPropertiesPatch({ customTitle: customTitleDraft.trim() });
    }
  };

  const handleAddTag = async (tagToAdd?: string) => {
    const clean = (tagToAdd ?? newTagInput).trim();
    if (!clean) return;
    if (!userProperties.categoryTags.includes(clean)) {
      await persistPropertiesPatch({
        categoryTags: [...userProperties.categoryTags, clean],
      });
    }
    if (!tagToAdd) setNewTagInput('');
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    await persistPropertiesPatch({
      categoryTags: userProperties.categoryTags.filter(
        (t) => t !== tagToRemove
      ),
    });
  };

  const handlePlatformChange = async (
    platformKey: PlatformKey,
    patch: Partial<PlatformPublishState>
  ) => {
    if (onUpdatePlatform) {
      await onUpdatePlatform(item.id, platformKey, patch);
      return;
    }
    const existing = userProperties.platforms[platformKey];
    const updatedPlatforms: Record<PlatformKey, PlatformPublishState> = {
      ...userProperties.platforms,
      [platformKey]: {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    };
    await persistPropertiesPatch({ platforms: updatedPlatforms });
  };

  const handleBatchPlatforms = async (status: PlatformUploadStatus) => {
    if (onBatchUpdatePlatforms) {
      await onBatchUpdatePlatforms(item.id, status);
      return;
    }
    const now = new Date().toISOString();
    const defaultScheduleTime = `${schedule.recommendedTimeWib || '12:00'} WIB`;
    const updatedPlatforms = PLATFORM_ORDER.reduce(
      (acc, key) => {
        const current = userProperties.platforms[key];
        acc[key] = {
          ...current,
          status,
          scheduledTime:
            status === 'scheduled'
              ? defaultScheduleTime
              : current.scheduledTime,
          updatedAt: now,
        };
        return acc;
      },
      { ...userProperties.platforms }
    );

    const nextWorkflowStatus: WorkflowStatus =
      status === 'published'
        ? 'published_all'
        : status === 'scheduled'
          ? 'scheduled'
          : userProperties.workflowStatus;

    await persistPropertiesPatch({
      platforms: updatedPlatforms,
      workflowStatus: nextWorkflowStatus,
    });
  };

  const handleSaveCaptionToDisk = async () => {
    const finalText = effectiveCaptionText.trim();
    try {
      setIsSavingCaption(true);
      if (onSaveCaption) {
        await onSaveCaption(item.id, finalText);
      } else {
        await fetch(`/api/items/${encodeURIComponent(item.id)}/caption`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: finalText, rawText: finalText }),
        });
      }
      setCaptionDraft(finalText);
      const parsed = parseCaptionLive(finalText);
      setHookDraft(parsed.hookTitle);
      setCtaDraft(parsed.ctaQuestion);
      setHashtagDraft(parsed.hashtags.join(' '));
      setCaptionSavedNotice(true);
      if (captionNoticeTimerRef.current !== null) {
        window.clearTimeout(captionNoticeTimerRef.current);
      }
      captionNoticeTimerRef.current = window.setTimeout(() => {
        captionNoticeTimerRef.current = null;
        setCaptionSavedNotice(false);
      }, 2500);
    } finally {
      setIsSavingCaption(false);
    }
  };

  const handleToggleQuickHashtag = (tag: string) => {
    const lowerTag = tag.toLowerCase();
    const exists = liveParsedCaption.hashtags.some(
      (h) => h.toLowerCase() === lowerTag
    );

    if (captionMode === 'structured') {
      const currentTags = hashtagDraft
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const nextTags = exists
        ? currentTags.filter((t) => t.toLowerCase() !== lowerTag)
        : [...currentTags, tag];
      setHashtagDraft(nextTags.join(' '));
    } else {
      if (exists) {
        const regex = new RegExp(`\\b${tag}\\b`, 'gi');
        setCaptionDraft((prev) =>
          prev
            .replace(regex, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim()
        );
      } else {
        setCaptionDraft((prev) => {
          const trimmed = prev.trim();
          if (!trimmed) return tag;
          const lines = trimmed.split('\n');
          const lastLine = lines[lines.length - 1].trim();
          if (lastLine.startsWith('#')) {
            lines[lines.length - 1] = `${lastLine} ${tag}`;
            return lines.join('\n');
          }
          return `${trimmed}\n\n${tag}`;
        });
      }
    }
  };

  const handleToggleChecklist = async (checkId: string) => {
    const nextList = userProperties.checklist.map((c) =>
      c.id === checkId ? { ...c, done: !c.done } : c
    );
    await persistPropertiesPatch({ checklist: nextList });
  };

  const handleAddChecklist = async () => {
    const text = newChecklistInput.trim();
    if (!text) return;
    const newItem: ChecklistItem = {
      id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      done: false,
    };
    await persistPropertiesPatch({
      checklist: [...userProperties.checklist, newItem],
    });
    setNewChecklistInput('');
  };

  const handleResetChecklistSop = async () => {
    const presetItems: ChecklistItem[] = DEFAULT_CHECKLIST_PRESETS.map(
      (text, idx) => ({
        id: `chk-preset-${Date.now()}-${idx}`,
        text,
        done: false,
      })
    );
    await persistPropertiesPatch({ checklist: presetItems });
  };

  const handleDeleteChecklist = async (checkId: string) => {
    await persistPropertiesPatch({
      checklist: userProperties.checklist.filter((c) => c.id !== checkId),
    });
  };

  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true);
      await persistPropertiesPatch({ notes: notesDraft });
    } finally {
      if (notesSavingTimerRef.current !== null) {
        window.clearTimeout(notesSavingTimerRef.current);
      }
      notesSavingTimerRef.current = window.setTimeout(() => {
        notesSavingTimerRef.current = null;
        setIsSavingNotes(false);
      }, 500);
    }
  };

  const wmFinalWindowsPath =
    assets.wmVideo.absolutePath || `${item.absolutePath}\\wm_final.mp4`;
  const coverWindowsPath =
    assets.cover.absolutePath ||
    `${item.absolutePath}\\${assets.cover.fileName ?? 'cover-9x16.jpg'}`;
  const primaryRevealPath =
    assets.wmVideo.absolutePath ||
    assets.rawVideo.absolutePath ||
    item.absolutePath;
  const hasPrimaryFile = Boolean(
    assets.wmVideo.absolutePath || assets.rawVideo.absolutePath
  );
  const coverUrl = assets.cover.mediaUrl ?? undefined;

  const currentMediaAsset =
    activeMediaTab === 'wm_final'
      ? assets.wmVideo
      : activeMediaTab === 'raw_video'
        ? assets.rawVideo
        : assets.cover;

  const currentMediaLabel =
    activeMediaTab === 'wm_final'
      ? (assets.wmVideo.fileName ?? 'wm_final.mp4')
      : activeMediaTab === 'raw_video'
        ? (assets.rawVideo.fileName ?? 'motionprovit.mp4')
        : (assets.cover.fileName ?? 'cover-9x16.jpg');

  const publishedCount = PLATFORM_ORDER.filter(
    (k) => userProperties.platforms[k]?.status === 'published'
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detail konten ${item.folderCode}`}
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={
          layoutMode === 'fullscreen'
            ? 'w-full h-full bg-background text-foreground flex flex-col overflow-hidden'
            : 'max-w-5xl w-full h-full ml-auto border-l border-border bg-background text-foreground flex flex-col shadow-2xl overflow-hidden'
        }
      >
        {/* Compact Single-Row Top Header */}
        <header className="h-14 px-4 border-b border-border bg-card flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant="default"
              className="font-mono text-xs font-bold shrink-0"
            >
              {item.folderCode}
            </Badge>

            <Badge
              variant="outline"
              size="sm"
              className="font-mono hidden sm:inline-flex shrink-0"
            >
              {`${schedule.slotCode} ${formatSlotShort(schedule)}`}
            </Badge>

            {assets.wmVideo.exists ? (
              <Badge variant="success" size="sm" className="shrink-0">
                WM Siap
              </Badge>
            ) : (
              <Badge variant="warning" size="sm" className="shrink-0">
                Butuh WM
              </Badge>
            )}

            <div className="flex items-center gap-1 min-w-0">
              <label htmlFor="header-workflow-status" className="sr-only">
                Status alur kerja Kanban
              </label>
              <NativeSelect
                id="header-workflow-status"
                value={userProperties.workflowStatus}
                onChange={(e) =>
                  handleWorkflowStatusChange(e.target.value as WorkflowStatus)
                }
                className="h-8 text-xs max-w-[180px] sm:max-w-[220px]"
              >
                {KANBAN_COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.shortLabel}
                  </option>
                ))}
              </NativeSelect>
              <IconActionButton
                icon={userProperties.statusLockedManually ? Lock : Unlock}
                label={
                  userProperties.statusLockedManually
                    ? 'Status dikunci manual (Klik untuk otomatis)'
                    : 'Status otomatis (Klik untuk kunci manual)'
                }
                onClick={handleToggleStatusLock}
                side="bottom"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <IconActionButton
              icon={ChevronLeft}
              label={
                prevItem
                  ? `Konten sebelumnya ${prevItem.folderCode} (Alt+Left)`
                  : 'Konten pertama'
              }
              disabled={!prevItem}
              onClick={() => prevItem && handleGoToItem(prevItem)}
              side="bottom"
            />
            <IconActionButton
              icon={ChevronRight}
              label={
                nextItem
                  ? `Konten berikutnya ${nextItem.folderCode} (Alt+Right)`
                  : 'Konten terakhir'
              }
              disabled={!nextItem}
              onClick={() => nextItem && handleGoToItem(nextItem)}
              side="bottom"
            />
            {onOpenWatermark && (
              <IconActionButton
                icon={Droplets}
                label="Render Watermark"
                variant={assets.wmVideo.exists ? 'ghost' : 'editorial'}
                onClick={() => onOpenWatermark(item)}
                side="bottom"
              />
            )}
            {onOpenAutoPost && (
              <IconActionButton
                icon={Send}
                label="Buka Dasbor Auto-Post"
                onClick={() => onOpenAutoPost(item, null)}
                side="bottom"
              />
            )}
            <IconActionButton
              icon={FolderOpen}
              label="Buka Folder di Explorer"
              onClick={() =>
                handleRevealInExplorer(primaryRevealPath, hasPrimaryFile)
              }
              side="bottom"
            />
            <IconActionButton
              icon={layoutMode === 'drawer' ? Maximize2 : Minimize2}
              label={
                layoutMode === 'drawer'
                  ? 'Perluas ke layar penuh'
                  : 'Kembalikan ke panel samping'
              }
              onClick={() =>
                setLayoutMode((m) => (m === 'drawer' ? 'fullscreen' : 'drawer'))
              }
              side="bottom"
            />
            <IconActionButton
              icon={X}
              label="Tutup panel (Esc)"
              onClick={onClose}
              side="bottom"
            />
          </div>
        </header>

        {/* Two-Column Split Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Focused 9:16 Media Preview */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-border bg-muted/30 p-4 flex flex-col justify-between gap-3 overflow-y-auto">
            <Tabs
              value={activeMediaTab}
              onValueChange={(val) => setActiveMediaTab(val as MediaTabMode)}
            >
              <TabsList
                aria-label="Pilih sumber media pratinjau"
                className="w-full grid grid-cols-3"
              >
                <TabsTrigger value="wm_final" className="text-xs truncate">
                  Video Final (WM)
                </TabsTrigger>
                <TabsTrigger value="raw_video" className="text-xs truncate">
                  Video Raw
                </TabsTrigger>
                <TabsTrigger value="cover" className="text-xs truncate">
                  Cover 9:16
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Crisp 9:16 Frame */}
            <div className="aspect-[9/16] max-h-[460px] mx-auto w-auto rounded-lg border border-border bg-black overflow-hidden relative flex items-center justify-center">
              {activeMediaTab === 'wm_final' &&
                assets.wmVideo.exists &&
                assets.wmVideo.mediaUrl && (
                  <video
                    key={`wm-${assets.wmVideo.mediaUrl}`}
                    src={assets.wmVideo.mediaUrl}
                    poster={coverUrl}
                    width={360}
                    height={640}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                  />
                )}

              {activeMediaTab === 'wm_final' && !assets.wmVideo.exists && (
                <div className="w-[260px] h-full flex flex-col items-center justify-center p-5 text-center gap-3 bg-card/95 text-foreground">
                  <Badge variant="warning" size="sm">
                    Belum Ada wm_final.mp4
                  </Badge>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    File watermark belum dirender untuk folder{' '}
                    <span className="font-mono text-foreground">
                      {item.folderCode}
                    </span>
                    .
                  </p>
                  <div className="flex flex-col w-full gap-2">
                    {onOpenWatermark && (
                      <Button
                        type="button"
                        variant="editorial"
                        size="sm"
                        onClick={() => onOpenWatermark(item)}
                        className="w-full"
                      >
                        <Droplets className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Render Watermark</span>
                      </Button>
                    )}
                    {assets.rawVideo.exists && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveMediaTab('raw_video')}
                        className="w-full"
                      >
                        <Film className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Pratinjau Video Raw</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {activeMediaTab === 'raw_video' &&
                (assets.rawVideo.exists && assets.rawVideo.mediaUrl ? (
                  <video
                    key={`raw-${assets.rawVideo.mediaUrl}`}
                    src={assets.rawVideo.mediaUrl}
                    poster={coverUrl}
                    width={360}
                    height={640}
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <div className="w-[260px] p-5 text-center text-xs text-muted-foreground bg-card/95">
                    Video mentah motionprovit tidak ditemukan.
                  </div>
                ))}

              {activeMediaTab === 'cover' &&
                (assets.cover.exists && assets.cover.mediaUrl ? (
                  <img
                    src={assets.cover.mediaUrl}
                    alt={`Cover ${item.folderCode}`}
                    width={360}
                    height={640}
                    decoding="async"
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <div className="w-[260px] p-5 text-center text-xs text-muted-foreground bg-card/95">
                    Cover 9:16 belum tersedia.
                  </div>
                ))}
            </div>

            {/* Compact Icon + Short-Action Strip */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-card">
              <div className="font-mono text-[11px] text-muted-foreground truncate">
                <span className="text-foreground">{currentMediaLabel}</span>
                {currentMediaAsset.exists &&
                  ` · ${currentMediaAsset.sizeFormatted}`}
                {autoMetadata.motionprovitId &&
                  ` · ${autoMetadata.motionprovitId}`}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconActionButton
                  icon={copiedKey === 'strip_wm' ? Check : Copy}
                  label={
                    copiedKey === 'strip_wm'
                      ? 'Path wm_final.mp4 tersalin'
                      : 'Salin path wm_final.mp4'
                  }
                  onClick={() => triggerCopy(wmFinalWindowsPath, 'strip_wm')}
                />
                <IconActionButton
                  icon={copiedKey === 'strip_cover' ? Check : ImageIcon}
                  label={
                    copiedKey === 'strip_cover'
                      ? 'Path Cover tersalin'
                      : 'Salin path Cover'
                  }
                  onClick={() => triggerCopy(coverWindowsPath, 'strip_cover')}
                />
                <IconActionButton
                  icon={FolderOpen}
                  label="Tampilkan di Explorer"
                  onClick={() =>
                    handleRevealInExplorer(primaryRevealPath, hasPrimaryFile)
                  }
                />
              </div>
            </div>
          </div>

          {/* Right Column: 3 Clean Partitioned Tabs */}
          <div className="lg:col-span-7 flex flex-col min-h-0 overflow-y-auto p-4 sm:p-5">
            <Tabs
              value={activeDetailTab}
              onValueChange={(val) => setActiveDetailTab(val as DetailWorkTab)}
              className="flex-1 flex flex-col gap-4"
            >
              <TabsList
                aria-label="Bagian kerja konten"
                className="w-full grid grid-cols-3"
              >
                <TabsTrigger value="publish" className="text-xs">
                  Publikasi & Platform
                </TabsTrigger>
                <TabsTrigger value="caption" className="text-xs">
                  Caption (caption.txt)
                </TabsTrigger>
                <TabsTrigger value="assets" className="text-xs">
                  Berkas, Checklist & Catatan
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: Publikasi & Platform */}
              <TabsContent value="publish" className="space-y-4">
                <section className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-semibold text-foreground">
                        Status 4 Platform
                      </h2>
                      <Badge variant="muted" size="xs" className="font-mono">
                        {publishedCount}/4
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleBatchPlatforms('published')}
                      >
                        Tandai 4 Selesai
                      </Button>
                      {onOpenAutoPost && (
                        <Button
                          type="button"
                          variant="editorial"
                          size="xs"
                          onClick={() => onOpenAutoPost(item, null)}
                        >
                          <Send className="w-3 h-3" aria-hidden="true" />
                          <span>Auto-Post Semua</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="divide-y divide-border border border-border rounded-md">
                    {PLATFORM_ORDER.map((key) => {
                      const meta = PLATFORM_META[key];
                      const pState = userProperties.platforms[key] ?? {
                        status: 'not_started',
                        publishedUrl: '',
                        scheduledTime: '',
                        notes: '',
                        updatedAt: null,
                      };
                      const urlDraft = platformUrls[key] ?? '';
                      const targetHref =
                        urlDraft.trim() || PLATFORM_UPLOAD_STUDIO_URL[key];

                      return (
                        <div
                          key={key}
                          className="p-2.5 flex flex-col sm:flex-row sm:items-center gap-2 bg-background/40"
                        >
                          <div className="flex items-center gap-2 min-w-[140px] shrink-0">
                            <PlatformIcon platform={key} size={15} />
                            <span className="text-xs font-medium text-foreground">
                              {meta.label}
                            </span>
                          </div>

                          <div className="flex flex-1 items-center gap-2 min-w-0">
                            <label
                              htmlFor={`status-${key}`}
                              className="sr-only"
                            >
                              Status {meta.label}
                            </label>
                            <NativeSelect
                              id={`status-${key}`}
                              value={pState.status}
                              onChange={(e) =>
                                handlePlatformChange(key, {
                                  status:
                                    e.target.value as PlatformUploadStatus,
                                })
                              }
                              className="h-8 text-xs w-[135px] shrink-0"
                            >
                              {PLATFORM_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </NativeSelect>

                            <label htmlFor={`url-${key}`} className="sr-only">
                              URL postingan {meta.label}
                            </label>
                            <Input
                              id={`url-${key}`}
                              type="url"
                              value={urlDraft}
                              onChange={(e) =>
                                setPlatformUrls((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              onBlur={() => {
                                if (urlDraft !== pState.publishedUrl) {
                                  handlePlatformChange(key, {
                                    publishedUrl: urlDraft.trim(),
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              placeholder="Tempel URL postingan..."
                              className="h-8 text-xs flex-1 min-w-0"
                            />
                          </div>

                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                            {onOpenAutoPost && (
                              <IconActionButton
                                icon={Send}
                                label={`Auto-Post ${meta.label}`}
                                onClick={() => onOpenAutoPost(item, key)}
                              />
                            )}
                            <IconActionButton
                              icon={ExternalLink}
                              label={
                                urlDraft.trim()
                                  ? `Buka postingan ${meta.label}`
                                  : `Buka Studio ${meta.label}`
                              }
                              onClick={() =>
                                window.open(
                                  targetHref,
                                  '_blank',
                                  'noopener,noreferrer'
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Ringkasan Jadwal & Judul Kustom */}
                <section className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <h2 className="text-xs font-semibold text-foreground">
                    Ringkasan Jadwal & Judul Kustom
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="block text-[11px] font-medium text-muted-foreground">
                        Jadwal Slot Upload
                      </span>
                      <div className="h-9 px-3 rounded-md border border-border bg-muted/50 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground truncate">
                          {schedule.displayDate} · {schedule.slotTimeWindow}
                        </span>
                        <Badge
                          variant="outline"
                          size="xs"
                          className="font-mono"
                        >
                          Slot {schedule.slotCode}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="detail-priority"
                        className="block text-[11px] font-medium text-muted-foreground"
                      >
                        Prioritas Produksi
                      </label>
                      <NativeSelect
                        id="detail-priority"
                        value={userProperties.priority}
                        onChange={(e) =>
                          handlePriorityChange(e.target.value as PriorityLevel)
                        }
                        className="w-full h-9 text-xs"
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="detail-custom-title"
                      className="block text-[11px] font-medium text-muted-foreground"
                    >
                      Judul Kustom [{item.folderCode}]
                    </label>
                    <Input
                      id="detail-custom-title"
                      type="text"
                      value={customTitleDraft}
                      onChange={(e) => setCustomTitleDraft(e.target.value)}
                      onBlur={handleSaveCustomTitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      placeholder={
                        liveParsedCaption.hookTitle ||
                        `Judul konten ${item.folderCode}`
                      }
                      className="h-9 text-xs"
                    />
                  </div>
                </section>
              </TabsContent>

              {/* TAB 2: Caption (caption.txt) */}
              <TabsContent value="caption" className="space-y-3">
                <section
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                  onKeyDown={(e) => {
                    if (
                      (e.ctrlKey || e.metaKey) &&
                      e.key.toLowerCase() === 's'
                    ) {
                      e.preventDefault();
                      handleSaveCaptionToDisk();
                    }
                  }}
                >
                  {/* Top Bar: Mode Toggle + 4 Compact Copy Actions + Counters */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Tabs
                        value={captionMode}
                        onValueChange={(val) =>
                          handleCaptionModeSwitch(val as CaptionEditMode)
                        }
                      >
                        <TabsList aria-label="Mode editor caption">
                          <TabsTrigger value="raw" className="text-xs">
                            Teks Penuh
                          </TabsTrigger>
                          <TabsTrigger value="structured" className="text-xs">
                            Terstruktur
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {liveParsedCaption.charCount} kar ·{' '}
                        {liveParsedCaption.wordCount} kata ·{' '}
                        {liveParsedCaption.hashtags.length} tag
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant={
                          copiedKey === 'cap_full' ? 'secondary' : 'outline'
                        }
                        size="xs"
                        onClick={() =>
                          triggerCopy(liveParsedCaption.rawText, 'cap_full')
                        }
                      >
                        {copiedKey === 'cap_full' ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>Salin Semua</span>
                      </Button>

                      <Button
                        type="button"
                        variant={
                          copiedKey === 'cap_hook' ? 'secondary' : 'outline'
                        }
                        size="xs"
                        onClick={() =>
                          triggerCopy(liveParsedCaption.hookTitle, 'cap_hook')
                        }
                      >
                        {copiedKey === 'cap_hook' ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Heading1 className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>Salin Hook YT</span>
                      </Button>

                      <Button
                        type="button"
                        variant={
                          copiedKey === 'cap_body' ? 'secondary' : 'outline'
                        }
                        size="xs"
                        onClick={() =>
                          triggerCopy(
                            liveParsedCaption.bodyWithoutHashtags,
                            'cap_body'
                          )
                        }
                      >
                        {copiedKey === 'cap_body' ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <MessageSquare
                            className="w-3 h-3"
                            aria-hidden="true"
                          />
                        )}
                        <span>Tanpa Tag</span>
                      </Button>

                      <Button
                        type="button"
                        variant={
                          copiedKey === 'cap_tags' ? 'secondary' : 'outline'
                        }
                        size="xs"
                        onClick={() =>
                          triggerCopy(
                            liveParsedCaption.hashtags.join(' '),
                            'cap_tags'
                          )
                        }
                      >
                        {copiedKey === 'cap_tags' ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Hash className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>Salin Tag</span>
                      </Button>
                    </div>
                  </div>

                  {/* Editor Area */}
                  {captionMode === 'raw' ? (
                    <div className="space-y-1">
                      <label
                        htmlFor="detail-caption-raw"
                        className="block text-xs font-medium text-foreground"
                      >
                        Isi Berkas caption.txt ({item.folderCode})
                      </label>
                      <Textarea
                        id="detail-caption-raw"
                        rows={10}
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        placeholder="Paragraf 1: Hook pertanyaan. Paragraf 2: Pertanyaan CTA komentar. Baris 3: Hashtag..."
                        className="text-xs leading-relaxed"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="detail-caption-hook"
                            className="text-xs font-medium text-foreground"
                          >
                            Hook / Judul Utama
                          </label>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {hookDraft.length}/100
                          </span>
                        </div>
                        <Textarea
                          id="detail-caption-hook"
                          rows={2}
                          value={hookDraft}
                          onChange={(e) => setHookDraft(e.target.value)}
                          placeholder="Kalimat pertanyaan pembuka..."
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="detail-caption-cta"
                          className="block text-xs font-medium text-foreground"
                        >
                          Pertanyaan CTA Komentar
                        </label>
                        <Textarea
                          id="detail-caption-cta"
                          rows={3}
                          value={ctaDraft}
                          onChange={(e) => setCtaDraft(e.target.value)}
                          placeholder="Pertanyaan diskusi penonton (diakhiri Tulis di komentar.)..."
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="detail-caption-hashtags"
                          className="block text-xs font-medium text-foreground"
                        >
                          Baris Hashtag
                        </label>
                        <Input
                          id="detail-caption-hashtags"
                          type="text"
                          value={hashtagDraft}
                          onChange={(e) => setHashtagDraft(e.target.value)}
                          placeholder="#edukasi #shorts #reels"
                          className="font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                  )}

                  {/* Quick Hashtag Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground mr-1">
                      Tag cepat:
                    </span>
                    {QUICK_HASHTAG_CHIPS.map((chip) => {
                      const active = liveParsedCaption.hashtags.some(
                        (h) => h.toLowerCase() === chip.toLowerCase()
                      );
                      return (
                        <Button
                          key={chip}
                          type="button"
                          variant={active ? 'secondary' : 'outline'}
                          size="xs"
                          onClick={() => handleToggleQuickHashtag(chip)}
                          className="font-mono text-[11px]"
                        >
                          {chip}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Sticky Bottom Save Bar */}
                  <div className="sticky bottom-0 pt-2 border-t border-border bg-card flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isCaptionDirty ? (
                        <Badge variant="warning" size="sm">
                          Belum disimpan
                        </Badge>
                      ) : (
                        <Badge
                          variant={captionSavedNotice ? 'success' : 'muted'}
                          size="sm"
                        >
                          Tersimpan di disk
                        </Badge>
                      )}
                      {isCaptionDirty && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            const orig =
                              autoMetadata.captionParsed.rawText ?? '';
                            const parsed = parseCaptionLive(orig);
                            setCaptionDraft(orig);
                            setHookDraft(parsed.hookTitle);
                            setCtaDraft(parsed.ctaQuestion);
                            setHashtagDraft(parsed.hashtags.join(' '));
                          }}
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>Reset</span>
                        </Button>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="editorial"
                      size="sm"
                      onClick={handleSaveCaptionToDisk}
                      disabled={isSavingCaption}
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isSavingCaption
                          ? 'Menyimpan...'
                          : 'Simpan ke caption.txt (Ctrl+S)'}
                      </span>
                    </Button>
                  </div>
                </section>
              </TabsContent>

              {/* TAB 3: Berkas, Checklist & Catatan */}
              <TabsContent value="assets" className="space-y-4">
                {/* 4-File Readiness List */}
                <section className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-foreground">
                      Kesiapan 4 Berkas Utama
                    </h2>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {autoMetadata.readiness.completenessScore}/4 tersedia
                    </span>
                  </div>

                  <div className="divide-y divide-border border border-border rounded-md">
                    {[
                      {
                        key: 'wm_final',
                        label: 'wm_final.mp4',
                        info: assets.wmVideo,
                      },
                      {
                        key: 'cover',
                        label: 'cover 9:16',
                        info: assets.cover,
                      },
                      {
                        key: 'caption',
                        label: 'caption.txt',
                        info: assets.caption,
                      },
                      {
                        key: 'raw_video',
                        label: 'motionprovit',
                        info: assets.rawVideo,
                      },
                    ].map((entry) => {
                      const targetPath =
                        entry.info.absolutePath || item.absolutePath;
                      return (
                        <div
                          key={entry.key}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <Badge
                              variant={
                                entry.info.exists ? 'success' : 'warning'
                              }
                              size="xs"
                            >
                              {entry.info.exists ? 'Ada' : 'Kurang'}
                            </Badge>
                            <span className="font-mono truncate text-foreground">
                              {entry.info.fileName ?? entry.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {entry.info.exists
                                ? entry.info.sizeFormatted
                                : '-'}
                            </span>
                            <IconActionButton
                              icon={
                                copiedKey === `asset_${entry.key}`
                                  ? Check
                                  : Copy
                              }
                              label={`Salin path ${entry.label}`}
                              onClick={() =>
                                triggerCopy(targetPath, `asset_${entry.key}`)
                              }
                            />
                            <IconActionButton
                              icon={FolderOpen}
                              label={`Tampilkan ${entry.label} di Explorer`}
                              onClick={() =>
                                handleRevealInExplorer(
                                  targetPath,
                                  Boolean(entry.info.absolutePath)
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {assets.otherFiles && assets.otherFiles.length > 0 && (
                    <div className="p-2.5 rounded-md border border-border bg-muted/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <AlertTriangle
                            className="w-3.5 h-3.5 text-[#991b1b] dark:text-[#fca5a5]"
                            aria-hidden="true"
                          />
                          <span>
                            Berkas ekstra non-standar (
                            {assets.otherFiles.length})
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            handleRevealInExplorer(item.absolutePath, false)
                          }
                        >
                          Buka Folder
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {assets.otherFiles.map((stray) => (
                          <Badge
                            key={stray.relativePath}
                            variant="destructive"
                            size="xs"
                            className="font-mono"
                          >
                            {stray.fileName} ({stray.sizeFormatted})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Category Tags */}
                <section className="rounded-lg border border-border bg-card p-4 space-y-2.5">
                  <h2 className="text-xs font-semibold text-foreground">
                    Tag Kategori
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {userProperties.categoryTags.map((tag) => (
                      <Badge key={tag} variant="secondary" size="sm">
                        <Tag className="w-3 h-3" aria-hidden="true" />
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          aria-label={`Hapus tag ${tag}`}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ))}
                    {PRESET_CATEGORY_TAGS.filter(
                      (t) => !userProperties.categoryTags.includes(t)
                    ).map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleAddTag(preset)}
                      >
                        + {preset}
                      </Button>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddTag();
                    }}
                    className="flex items-center gap-2"
                  >
                    <label htmlFor="detail-new-tag" className="sr-only">
                      Tambah tag kategori
                    </label>
                    <Input
                      id="detail-new-tag"
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="Tambah tag kustom..."
                      className="h-8 text-xs max-w-xs"
                    />
                    <Button type="submit" variant="outline" size="xs">
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Tambah</span>
                    </Button>
                  </form>
                </section>

                {/* Pre-Upload Checklist & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <section className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-xs font-semibold text-foreground">
                          Checklist Pra-Upload
                        </h2>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={handleResetChecklistSop}
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>Reset SOP</span>
                        </Button>
                      </div>

                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {userProperties.checklist.length > 0 ? (
                          userProperties.checklist.map((chk) => (
                            <div
                              key={chk.id}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-border bg-muted/40"
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleChecklist(chk.id)}
                                className="flex items-start gap-2 text-left flex-1"
                              >
                                {chk.done ? (
                                  <CheckSquare
                                    className="w-3.5 h-3.5 text-[#166534] dark:text-[#86efac] shrink-0 mt-0.5"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Square
                                    className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5"
                                    aria-hidden="true"
                                  />
                                )}
                                <span
                                  className={`text-xs leading-snug ${
                                    chk.done
                                      ? 'line-through text-muted-foreground'
                                      : 'text-foreground'
                                  }`}
                                >
                                  {chk.text}
                                </span>
                              </button>
                              <IconActionButton
                                icon={Trash2}
                                label={`Hapus item ${chk.text}`}
                                onClick={() => handleDeleteChecklist(chk.id)}
                              />
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">
                            Checklist kosong. Klik Reset SOP untuk memuat daftar
                            standar.
                          </p>
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddChecklist();
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <label htmlFor="detail-new-checklist" className="sr-only">
                        Tambah item checklist
                      </label>
                      <Input
                        id="detail-new-checklist"
                        type="text"
                        value={newChecklistInput}
                        onChange={(e) => setNewChecklistInput(e.target.value)}
                        placeholder="Tambah checklist..."
                        className="h-8 text-xs"
                      />
                      <Button type="submit" variant="outline" size="xs">
                        <Plus className="w-3 h-3" aria-hidden="true" />
                        <span>Tambah</span>
                      </Button>
                    </form>
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between gap-2.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="detail-production-notes"
                          className="text-xs font-semibold text-foreground"
                        >
                          Catatan Produksi
                        </label>
                        {isSavingNotes && (
                          <Badge variant="success" size="xs">
                            Tersimpan
                          </Badge>
                        )}
                      </div>
                      <Textarea
                        id="detail-production-notes"
                        rows={5}
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        onBlur={handleSaveNotes}
                        placeholder="Catatan revisi audio, sumber sejarah, atau pengingat jadwal..."
                        className="text-xs"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={handleSaveNotes}
                      >
                        Simpan Catatan
                      </Button>
                    </div>
                  </section>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContentDetailModal;
