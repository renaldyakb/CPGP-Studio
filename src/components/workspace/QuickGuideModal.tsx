import React, { useEffect, useState } from 'react';
import {
  Droplets,
  FolderOpen,
  FolderTree,
  Plus,
  Send,
  Settings2,
  X,
} from 'lucide-react';
import type { WatermarkPolicyMode, WorkspaceMetadata } from '@/types/workspace';
import { WORKSPACE_RULE_PRESETS } from '../../../shared/rulePresets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface QuickGuideModalProps {
  isOpen: boolean;
  activeWorkspace: WorkspaceMetadata | null;
  contentRootPath: string;
  onClose: () => void;
  onOpenCreateContent: () => void;
  onOpenExplorerRoot: () => void;
  onOpenWorkspaceSettings: () => void;
}

type GuideTab = 'folder' | 'watermark' | 'autopost';

function getPolicyBadgeLabel(policy: WatermarkPolicyMode): string {
  switch (policy) {
    case 'separate_wm_file':
      return 'Wajib wm_final.mp4';
    case 'direct_or_wm':
      return 'Video Langsung';
    case 'overwrite_source':
      return 'Mode Overwrite';
  }
}

export const QuickGuideModal: React.FC<QuickGuideModalProps> = ({
  isOpen,
  activeWorkspace,
  contentRootPath,
  onClose,
  onOpenCreateContent,
  onOpenExplorerRoot,
  onOpenWorkspaceSettings,
}) => {
  const [tab, setTab] = useState<GuideTab>('folder');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const wsName = activeWorkspace?.name ?? 'Workspace Aktif';
  const wsHandle = activeWorkspace?.handle ?? '@workspace';
  const wsPolicy: WatermarkPolicyMode =
    activeWorkspace?.rules.watermarkPolicy ?? 'separate_wm_file';
  const presetId = activeWorkspace?.rules.presetId ?? 'jurnal_dunia';
  const presetDesc =
    WORKSPACE_RULE_PRESETS[presetId] ?? WORKSPACE_RULE_PRESETS.jurnal_dunia;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panduan Singkat CPGP"
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md border border-[#4a0d18] bg-cpgp-gradient font-mono text-[11px] font-bold text-white"
              aria-hidden="true"
            >
              CPGP
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                  Panduan Singkat Workspace: {wsName}
                </h2>
                <Badge variant="outline" size="xs" className="font-mono">
                  {getPolicyBadgeLabel(wsPolicy)}
                </Badge>
              </div>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {contentRootPath}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onClose}
            aria-label="Tutup panduan singkat"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as GuideTab)}>
            <TabsList
              aria-label="Topik panduan singkat"
              className="grid w-full grid-cols-3"
            >
              <TabsTrigger value="folder">
                <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Aturan Folder & File</span>
              </TabsTrigger>
              <TabsTrigger value="watermark">
                <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Alur Watermark</span>
              </TabsTrigger>
              <TabsTrigger value="autopost">
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Alur Auto-Post</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: FOLDER & FILE */}
            <TabsContent value="folder" className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Struktur Folder Aktif ({wsName})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {`${contentRootPath}\\\n`}
                    {presetDesc.exampleTree
                      .map((line) => `  ${line}`)
                      .join('\n')}
                  </pre>

                  <ul className="space-y-1.5 text-xs text-foreground">
                    <li className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-primary">
                        DD.SLOT
                      </span>
                      <span>
                        Kode tanggal dan slot jam tayang (contoh: 24.01).
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-primary">
                        caption.txt
                      </span>
                      <span>
                        Hook paragraf 1, CTA komentar paragraf 2, hashtag baris
                        akhir.
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-primary">
                        Live Sync
                      </span>
                      <span>
                        Edit caption di UI otomatis memperbarui file caption.txt.
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: WATERMARK */}
            <TabsContent value="watermark" className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Kebijakan Watermark ({wsHandle})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground">
                    {wsPolicy === 'separate_wm_file'
                      ? 'motionprovit-[id].mp4  -->  [Watermark Studio]  -->  wm_final.mp4 (Siap Upload)'
                      : wsPolicy === 'overwrite_source'
                        ? 'video.mp4  -->  [Watermark Studio Overwrite]  -->  video.mp4 (Tertimpa Aman)'
                        : 'video.mp4  -->  [Langsung Siap Upload atau Render wm_final.mp4 Opsional]'}
                  </div>

                  <ul className="space-y-1.5 text-foreground">
                    <li>
                      • Geser posisi teks {wsHandle} langsung di kanvas video
                      9:16.
                    </li>
                    <li>
                      • Pilih mode output: Simpan ke wm_final.mp4 atau Timpa
                      Video Asli.
                    </li>
                    <li>
                      • Render satu video atau seluruh antrean butuh watermark
                      sekaligus.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: AUTO-POST */}
            <TabsContent value="autopost" className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Distribusi ke 4 Platform Sosial Media
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground">
                    Konten Siap Upload --&gt; YouTube Shorts · TikTok · IG Reels
                    · FB Reels
                  </div>

                  <ul className="space-y-1.5 text-foreground">
                    <li>
                      • Login sekali di menu Sesi Browser Studio untuk menyimpan
                      profil.
                    </li>
                    <li>
                      • Gunakan Meta Graph API atau YouTube API untuk upload di
                      latar.
                    </li>
                    <li>
                      • Klik chip platform pada kartu Kanban untuk menandai
                      status tayang.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Separator />

        {/* Footer with 1-click actions */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-card px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="editorial"
              size="sm"
              onClick={() => {
                onClose();
                onOpenCreateContent();
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Buat Konten Baru</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenExplorerRoot}
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Buka Folder Root di Explorer</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onOpenWorkspaceSettings();
              }}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ubah Aturan Workspace</span>
            </Button>
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </footer>
      </div>
    </div>
  );
};

export default QuickGuideModal;
