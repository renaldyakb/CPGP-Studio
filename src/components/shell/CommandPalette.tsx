import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock,
  CalendarDays,
  Columns3,
  Droplets,
  HelpCircle,
  History,
  LayoutDashboard,
  LayoutGrid,
  MonitorSmartphone,
  Moon,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Share2,
  Sun,
  Table2,
  FolderPlus,
} from 'lucide-react';
import { SiYoutube } from 'react-icons/si';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import type { WorkspaceMetadata } from '@/types/workspace';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRescan?: () => void;
  onOpenCreateContent?: () => void;
  onOpenCreateWorkspace?: () => void;
  onOpenWorkspaceSettings?: () => void;
  onOpenQuickGuide?: () => void;
  workspaces?: WorkspaceMetadata[];
  activeWorkspaceId?: string;
  onSwitchWorkspace?: (workspaceId: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  theme,
  onToggleTheme,
  onRescan,
  onOpenCreateContent,
  onOpenCreateWorkspace,
  onOpenWorkspaceSettings,
  onOpenQuickGuide,
  workspaces = [],
  activeWorkspaceId,
  onSwitchWorkspace,
}: CommandPaletteProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pencarian Cepat CPGP"
      description="Navigasi halaman, jalankan aksi, atau ganti workspace."
      className="sm:max-w-lg"
    >
      <Command>
        <CommandInput placeholder="Cari halaman, aksi, atau workspace..." />
        <CommandList>
          <CommandEmpty>Tidak ada perintah yang cocok.</CommandEmpty>

          <CommandGroup heading="Aksi Cepat">
            {onOpenCreateContent ? (
              <CommandItem onSelect={() => run(onOpenCreateContent)}>
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Konten Baru</span>
                <CommandShortcut>Baru</CommandShortcut>
              </CommandItem>
            ) : null}
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/watermark' }))}
            >
              <Droplets className="size-3.5" aria-hidden="true" />
              <span>Watermark Studio</span>
            </CommandItem>
            {onRescan ? (
              <CommandItem onSelect={() => run(onRescan)}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                <span>Scan Ulang Folder</span>
              </CommandItem>
            ) : null}
            <CommandItem onSelect={() => run(onToggleTheme)}>
              {theme === 'dark' ? (
                <Sun className="size-3.5" aria-hidden="true" />
              ) : (
                <Moon className="size-3.5" aria-hidden="true" />
              )}
              <span>{theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navigasi">
            <CommandItem onSelect={() => run(() => void navigate({ to: '/' }))}>
              <LayoutDashboard className="size-3.5" aria-hidden="true" />
              <span>Ringkasan</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/kanban' }))}
            >
              <Columns3 className="size-3.5" aria-hidden="true" />
              <span>Kanban</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/tabel' }))}
            >
              <Table2 className="size-3.5" aria-hidden="true" />
              <span>Tabel</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/kalender' }))}
            >
              <CalendarDays className="size-3.5" aria-hidden="true" />
              <span>Kalender</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/jadwal' }))}
            >
              <CalendarClock className="size-3.5" aria-hidden="true" />
              <span>Jadwal</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/galeri' }))}
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              <span>Galeri</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void navigate({ to: '/auto-post' }))}
            >
              <Send className="size-3.5" aria-hidden="true" />
              <span>Auto-Post</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => void navigate({ to: '/auto-post/history' }))
              }
            >
              <History className="size-3.5" aria-hidden="true" />
              <span>Riwayat</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => void navigate({ to: '/auto-post/studio' }))
              }
            >
              <MonitorSmartphone className="size-3.5" aria-hidden="true" />
              <span>Sesi Browser</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => void navigate({ to: '/auto-post/meta' }))
              }
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              <span>Meta API</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => void navigate({ to: '/auto-post/youtube' }))
              }
            >
              <SiYoutube className="size-3.5" aria-hidden="true" />
              <span>YouTube API</span>
            </CommandItem>
          </CommandGroup>

          {workspaces.length > 0 && onSwitchWorkspace ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Workspace">
                {workspaces.map((ws) => (
                  <CommandItem
                    key={ws.id}
                    onSelect={() => run(() => onSwitchWorkspace(ws.id))}
                  >
                    <span className="truncate">{ws.name}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {ws.handle}
                    </span>
                    {ws.id === activeWorkspaceId ? (
                      <CommandShortcut>Aktif</CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))}
                {onOpenWorkspaceSettings ? (
                  <CommandItem onSelect={() => run(onOpenWorkspaceSettings)}>
                    <Settings className="size-3.5" aria-hidden="true" />
                    <span>Pengaturan Workspace</span>
                  </CommandItem>
                ) : null}
                {onOpenCreateWorkspace ? (
                  <CommandItem onSelect={() => run(onOpenCreateWorkspace)}>
                    <FolderPlus className="size-3.5" aria-hidden="true" />
                    <span>Workspace Baru</span>
                  </CommandItem>
                ) : null}
                {onOpenQuickGuide ? (
                  <CommandItem onSelect={() => run(onOpenQuickGuide)}>
                    <HelpCircle className="size-3.5" aria-hidden="true" />
                    <span>Panduan</span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
