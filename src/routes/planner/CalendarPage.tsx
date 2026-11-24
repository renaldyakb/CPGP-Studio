import { CalendarView } from '@/components/CalendarView';
import { usePlannerWorkspace } from '@/components/planner/PlannerContext';

export function CalendarPage() {
  const workspace = usePlannerWorkspace();

  return (
    <CalendarView
      items={workspace.filteredItems}
      onSelectItem={(item) => workspace.openDetail(item)}
      onEditCaption={(item) => workspace.openCaption(item)}
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
