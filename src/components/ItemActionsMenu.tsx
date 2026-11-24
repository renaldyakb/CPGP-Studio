import React from 'react';
import {
  MoreHorizontal,
  Eye,
  FileEdit,
  Copy,
  Heading1,
  FolderOpen,
  FileCode2,
  Image as ImageIcon,
  ArrowRightLeft,
  Stamp,
  Send,
} from 'lucide-react';
import {
  ContentPlannerItem,
  KANBAN_COLUMNS,
  WorkflowStatus,
} from '@/types/planner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ItemActionsMenuProps {
  item: ContentPlannerItem;
  onSelectItem: (item: ContentPlannerItem) => void;
  onEditCaption?: (item: ContentPlannerItem) => void;
  onOpenWatermark?: (item: ContentPlannerItem) => void;
  onOpenAutoPost?: (item: ContentPlannerItem) => void;
  onUpdateStatus?: (item: ContentPlannerItem, newStatus: WorkflowStatus) => void;
  onCopyText?: (text: string, label: string) => void;
  onOpenExplorer?: (targetPath: string, selectFile?: boolean) => void;
  triggerLabel?: string;
  align?: 'start' | 'center' | 'end';
}

export const ItemActionsMenu: React.FC<ItemActionsMenuProps> = ({
  item,
  onSelectItem,
  onEditCaption,
  onOpenWatermark,
  onOpenAutoPost,
  onUpdateStatus,
  onCopyText,
  onOpenExplorer,
  triggerLabel,
  align = 'end',
}) => {
  const { assets, captionParsed } = item.autoMetadata;

  const copyToClipboard = async (text: string | null | undefined, label: string) => {
    if (!text) return;
    if (onCopyText) {
      onCopyText(text, label);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard errors
    }
  };

  const primaryVideoPath =
    assets.wmVideo.absolutePath || assets.rawVideo.absolutePath || null;
  const primaryVideoLabel = assets.wmVideo.exists
    ? 'Salin Path wm_final.mp4'
    : 'Salin Path motionprovit (Raw)';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          triggerLabel ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Menu aksi konten ${item.folderCode}`}
            />
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Menu aksi konten ${item.folderCode}`}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            />
          )
        }
      >
        {triggerLabel ? (
          <>
            <span>{triggerLabel}</span>
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </>
        ) : (
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        onClick={(e) => e.stopPropagation()}
        className="w-56"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Konten</span>
            <span className="font-mono text-foreground">{item.folderCode}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onSelectItem(item)}>
            <Eye aria-hidden="true" />
            <span>Buka Detail Konten</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              onEditCaption ? onEditCaption(item) : onSelectItem(item)
            }
          >
            <FileEdit aria-hidden="true" />
            <span>Edit caption.txt</span>
          </DropdownMenuItem>
          {onOpenWatermark && (
            <DropdownMenuItem onClick={() => onOpenWatermark(item)}>
              <Stamp aria-hidden="true" />
              <span>Atur & Render Watermark</span>
            </DropdownMenuItem>
          )}
          {onOpenAutoPost && (
            <DropdownMenuItem onClick={() => onOpenAutoPost(item)}>
              <Send aria-hidden="true" />
              <span>Buka Dasbor Auto-Post</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Salin Cepat</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!captionParsed.rawText}
            onClick={() =>
              copyToClipboard(
                captionParsed.rawText,
                `Caption ${item.folderCode}`
              )
            }
          >
            <Copy aria-hidden="true" />
            <span>Salin Full Caption</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!captionParsed.hookTitle}
            onClick={() =>
              copyToClipboard(
                captionParsed.hookTitle,
                `Hook / Judul ${item.folderCode}`
              )
            }
          >
            <Heading1 aria-hidden="true" />
            <span>Salin Hook / Judul YT</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!primaryVideoPath}
            onClick={() =>
              copyToClipboard(
                primaryVideoPath,
                `Path Video ${item.folderCode}`
              )
            }
          >
            <FileCode2 aria-hidden="true" />
            <span>{primaryVideoLabel}</span>
          </DropdownMenuItem>
          {assets.cover.exists && assets.cover.absolutePath && (
            <DropdownMenuItem
              onClick={() =>
                copyToClipboard(
                  assets.cover.absolutePath,
                  `Path Cover ${item.folderCode}`
                )
              }
            >
              <ImageIcon aria-hidden="true" />
              <span>Salin Path Cover</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {onUpdateStatus && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft aria-hidden="true" />
              <span>Pindah Status</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuRadioGroup
                value={item.userProperties.workflowStatus}
                onValueChange={(val) =>
                  onUpdateStatus(item, val as WorkflowStatus)
                }
              >
                {KANBAN_COLUMNS.map((col) => (
                  <DropdownMenuRadioItem key={col.id} value={col.id}>
                    {col.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuItem
          onClick={() => {
            if (assets.wmVideo.exists && assets.wmVideo.absolutePath) {
              onOpenExplorer?.(assets.wmVideo.absolutePath, true);
            } else {
              onOpenExplorer?.(item.absolutePath, false);
            }
          }}
        >
          <FolderOpen aria-hidden="true" />
          <span>Buka di Windows Explorer</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
