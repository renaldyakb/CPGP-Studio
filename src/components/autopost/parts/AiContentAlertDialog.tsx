import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { AutoPostMode } from '@/types/autopost';
import type { PlatformKey } from '@/types/planner';
import { PLATFORM_META, PlatformIcon } from './platformMeta';

export interface PendingAutoPostConfirmation {
  itemId: string;
  folderCode: string;
  platforms: PlatformKey[];
  mode: AutoPostMode;
  scheduledAt: string | null;
}

export interface AiContentAlertDialogProps {
  pending: PendingAutoPostConfirmation | null;
  onCancel: () => void;
  onConfirm: (aiGenerated: boolean, saveAsDefault: boolean) => void;
}

export function AiContentAlertDialog({
  pending,
  onCancel,
  onConfirm,
}: AiContentAlertDialogProps) {
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  useEffect(() => {
    if (pending) {
      setSaveAsDefault(false);
    }
  }, [pending]);

  const scheduleText = pending?.scheduledAt
    ? pending.scheduledAt.replace('T', ' ')
    : null;

  return (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
              <Bot className="size-4" aria-hidden="true" />
            </span>
            <AlertDialogTitle>
              Tandai sebagai Konten AI-Generated?
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Pilih apakah konten ini dibuat atau diedit signifikan menggunakan
            AI. Label AI otomatis diaktifkan pada opsi YouTube (Altered content:
            Yes) dan TikTok (AI-generated content).
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pending ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {pending.folderCode}
                </span>
                <Badge
                  variant={scheduleText ? 'info' : 'muted'}
                  size="xs"
                >
                  {scheduleText
                    ? `Jadwal ${scheduleText}`
                    : pending.mode === 'publish'
                      ? 'Publish Langsung'
                      : 'Mode Tinjau'}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {pending.platforms.map((key) => (
                  <span
                    key={key}
                    title={PLATFORM_META[key].label}
                    className="inline-flex items-center"
                  >
                    <PlatformIcon platform={key} size={14} />
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
              <div className="space-y-0.5">
                <label
                  htmlFor="autopost-ai-remember-default"
                  className="cursor-pointer text-xs font-medium text-foreground"
                >
                  Jadikan default workspace
                </label>
                <p className="text-[11px] font-light text-muted-foreground/75">
                  Gunakan pilihan ini otomatis di upload berikutnya tanpa
                  bertanya lagi.
                </p>
              </div>
              <Switch
                id="autopost-ai-remember-default"
                checked={saveAsDefault}
                onCheckedChange={setSaveAsDefault}
              />
            </div>
          </div>
        ) : null}

        <AlertDialogFooter className="pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Batal
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onConfirm(false, saveAsDefault)}
          >
            Bukan AI
          </Button>
          <Button
            type="button"
            variant="editorial"
            size="sm"
            onClick={() => onConfirm(true, saveAsDefault)}
          >
            Tandai AI-Generated
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
