import { KanbanView } from '@/components/KanbanView';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';

export function KanbanPage() {
  const workspace = usePlannerWorkspace();

  return (
    <KanbanView
      items={workspace.filteredItems}
      onSelectItem={(item) => workspace.openDetail(item)}
      onEditCaption={(item) => workspace.openCaption(item)}
      onOpenWatermark={(item) => workspace.openWatermark(item)}
      onOpenAutoPost={(item) => workspace.openAutoPost(item, null)}
      onUpdateStatus={workspace.updateStatus}
      onTogglePlatform={workspace.togglePlatform}
      onCopyText={(text, label) => workspace.copyText(text, label)}
      onOpenExplorer={workspace.openExplorer}
      groupBy={workspace.kanbanGroupBy}
      onGroupByChange={workspace.setKanbanGroupBy}
      onResetFilters={workspace.resetFilters}
      onRescan={workspace.rescan}
    />
  );
}
