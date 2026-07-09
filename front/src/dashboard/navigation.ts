import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Database,
  Download,
  LayoutDashboard,
  Network,
} from 'lucide-react';

export type DashboardGroupKey = 'analysis' | 'model' | 'output';

export type DashboardNavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  group: DashboardGroupKey;
};

export const dashboardGroups: Array<{ key: DashboardGroupKey; label: string }> = [
  { key: 'analysis', label: '工作区' },
  { key: 'model', label: '算法流程' },
  { key: 'output', label: '结果中心' },
];

export const dashboardNavItems: DashboardNavItem[] = [
  { label: '分析工作台', path: '/workbench/analysis', icon: LayoutDashboard, group: 'analysis' },
  { label: '数据管理', path: '/workbench/datasets', icon: Database, group: 'analysis' },
  { label: '任务中心', path: '/workbench/tasks', icon: ClipboardList, group: 'analysis' },
  { label: 'CA 协关联矩阵', path: '/workbench/ca-matrix', icon: Boxes, group: 'model' },
  { label: '多核相似性学习', path: '/workbench/mkl', icon: Network, group: 'model' },
  { label: '结果分析', path: '/workbench/results', icon: BarChart3, group: 'output' },
  { label: '结果导出', path: '/workbench/export', icon: Download, group: 'output' },
];

export const defaultWorkbenchPath = '/workbench/analysis';

export const legacyWorkbenchRedirects: Record<string, string> = {
  '/workbench/evaluation': '/workbench/results',
  '/workbench/visualization': '/workbench/results',
};

export function getActiveWorkbenchSection(pathname: string) {
  return dashboardNavItems.find((item) => item.path === pathname)?.label ?? null;
}
