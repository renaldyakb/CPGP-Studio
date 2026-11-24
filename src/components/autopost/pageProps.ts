import type { ContentPlannerItem } from '@/types/planner';
import type { AutoPostPage, UseAutoPostDataResult } from './useAutoPostData';

export interface AutoPostPageContext {
  items: ContentPlannerItem[];
  data: UseAutoPostDataResult;
  onNavigate: (page: AutoPostPage) => void;
  onOpenContentDetail: (item: ContentPlannerItem) => void;
  onEditCaption: (item: ContentPlannerItem) => void;
  onOpenWatermark: (item: ContentPlannerItem) => void;
  onCloseDashboard: () => void;
}

export interface AutoPostPageProps {
  ctx: AutoPostPageContext;
}