import { ScheduleView } from '@/components/ScheduleView';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';

export function SchedulePage() {
  const workspace = usePlannerWorkspace();

  return (
    <ScheduleView
      items={workspace.filteredItems}
      onSelectItem={(item) => workspace.openDetail(item)}
      onEditCaption={(item) => workspace.openCaption(item)}
      onOpenWatermark={(item) => workspace.openWatermark(item)}
      onOpenAutoPost={(item) => workspace.openAutoPost(item, null)}
      onUpdateStatus={workspace.updateStatus}
      onTogglePlatform={workspace.togglePlatform}
      onCopyText={(text, label) => workspace.copyText(text, label)}
      onOpenExplorer={workspace.openExplorer}
      onResetFilters={workspace.resetFilters}
      onRescan={workspace.rescan}
    />
  );
}
