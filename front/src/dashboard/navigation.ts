import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Database,
  Download,
  FileText,
  History,
  Images,
  LayoutDashboard,
  Network,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

export type DashboardGroupKey = 'workspace' | 'data' | 'model' | 'output' | 'audit';

export type DashboardNavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  group: DashboardGroupKey;
};

export const dashboardGroups: Array<{ key: DashboardGroupKey; label: string }> = [
  { key: 'workspace', label: '工作区' },
  { key: 'data', label: '数据中心' },
  { key: 'model', label: '算法流程' },
  { key: 'output', label: '结果中心' },
  { key: 'audit', label: '审计记录' },
];

export const dashboardNavItems: DashboardNavItem[] = [
  { label: '分析工作台', path: '/workbench/analysis', icon: LayoutDashboard, group: 'workspace' },
  { label: '任务中心', path: '/workbench/tasks', icon: ClipboardList, group: 'workspace' },
  { label: '数据管理', path: '/workbench/datasets', icon: Database, group: 'data' },
  { label: '数据质量检查', path: '/workbench/data-quality', icon: ShieldCheck, group: 'data' },
  { label: '数据版本记录', path: '/workbench/dataset-versions', icon: History, group: 'data' },
  { label: 'CA 协关联矩阵', path: '/workbench/ca-matrix', icon: Boxes, group: 'model' },
  { label: '核函数配置', path: '/workbench/kernel-config', icon: SlidersHorizontal, group: 'model' },
  { label: '多核相似性学习', path: '/workbench/mkl', icon: Network, group: 'model' },
  { label: '性能评估', path: '/workbench/evaluation', icon: ClipboardCheck, group: 'output' },
  { label: '可视化展示', path: '/workbench/visualization', icon: Images, group: 'output' },
  { label: '结果分析', path: '/workbench/results', icon: BarChart3, group: 'output' },
  { label: '结果导出', path: '/workbench/export', icon: Download, group: 'output' },
  { label: '分析报告', path: '/workbench/reports', icon: FileText, group: 'output' },
  { label: '运行日志', path: '/workbench/logs', icon: Activity, group: 'audit' },
];

export const defaultWorkbenchPath = '/workbench/analysis';

export const legacyWorkbenchRedirects: Record<string, string> = {};

export function getActiveWorkbenchSection(pathname: string) {
  return dashboardNavItems.find((item) => item.path === pathname)?.label ?? null;
}
