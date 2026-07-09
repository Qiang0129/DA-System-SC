# 数据管理页面 UI 实现计划

- 关联设计：`docs/superpowers/specs/数据管理页面UI设计.md`
- 范围：仅前端 UI，数据用示例，按钮动作留 TODO
- 目标：把 `DatasetManagementPage` 从「单数据集流程式」改为「多数据集目录 + 页面内详情视图」，并与工作台做视觉差异化

## 关键架构约束（已核实）

- 工作台子页面**不使用 React Router 嵌套路由**。路由只有 `App.tsx:1433` 的 `<Route path="/workbench/:section" element={dashboardShell} />`，`section` 经 `getActiveWorkbenchSection(pathname)`（navigation.ts:44）精确匹配 nav path 算出 `activeSection` 标签，`WorkbenchPageContent`（App.tsx:1252）按该标签字符串条件渲染。
- 因此详情页**不新增路由**，改为 `DatasetManagementPage` 组件内 `selectedId` 状态切换（已与用户确认）。
- 数据管理导航条目已存在（navigation.ts:29，`/workbench/datasets`），无需改 navigation。

## 任务分解

### 任务 1：扩充示例数据集（前端本地）

文件：`src/DatasetManagementPage.tsx`（当前单条 ionosphere + labelDistribution + clusterStats）

- 新增 `type DatasetCatalogItem`，字段：`id`、`name`、`createdAt`、`sampleCount`(n)、`baseCount`(m)、`classCount`(c)、`hasLabels`、`dataType`('数值'|'混合')、`taskCount`、`lastAnalysisAt`（可空）、`labelDistribution`、`clusterStats`。
- 新增导出 `sampleDatasets: DatasetCatalogItem[]`，≥3 条（ionosphere + 至少 2 条虚构示例，如 wine、seeds），数值合理。
- 保留现有 ionosphere 的 labelDistribution / clusterStats 数据，迁入对应字段。
- 验收：类型导出可被同文件引用；≥3 条；字段无 undefined。

### 任务 2：目录视图组件 + 样式

文件：`src/DatasetManagementPage.tsx`、`src/styles.css`

- 新增 `DatasetCatalogView` 子组件（或在主组件内分支）：工具栏 + 表格。
- 工具栏 `.dataset-toolbar`：搜索框（按名称过滤本地 state）、类型筛选（全部/数值/混合，简单 select 或 chips）、`使用示例数据`（`.btn.btn-secondary`，TODO 回调）、`上传数据集`（`.btn.btn-primary`，TODO 回调）。
- 表格 `.dataset-table`：无外层卡片框，分隔线区分；列：数据集名称+创建时间副行、规模 `n / m / c`（等宽 `font-variant-numeric: tabular-nums`）、状态徽章+类型、使用情况、`›`。
- 行 hover 高亮（`var(--primary-8)`）；点行 `setSelectedId(item.id)`。
- 空过滤结果时表格内一行提示。
- CSS：新增 `.dataset-toolbar` / `.dataset-table` / `.dataset-row` / 状态徽章样式，复用 token，**不**用 `.panel`。
- 验收：访问 `/workbench/datasets` 见工具栏+表格，≥3 行，hover 高亮，点行能进入详情视图（任务 3 接管）。

### 任务 3：详情视图组件 + 样式（页面内切换）

文件：`src/DatasetManagementPage.tsx`、`src/styles.css`

- 主组件加 `const [selectedId, setSelectedId] = useState<string | null>(null)`；`null` 渲染目录视图，否则渲染详情视图。
- `DatasetDetailView`：顶栏（`← 返回` → `setSelectedId(null)` + 面包屑「数据集 · {name}」）+ 两栏。
- 左栏 `.dataset-detail-sidebar`（320px）：元信息卡、规模数字卡、操作按钮组（创建任务/导出/重命名为 `.btn` 次按钮、删除为 `.btn.btn-danger`，全部 TODO 回调，不报错）。
- 右栏 `.dataset-detail-main`（1fr）：三个 `.dataset-detail-section`（标题+分隔线，非卡片）——标签分布条形、基础聚类统计表（复用 `.dataset-stat-table`）、选择基础聚类（复用 `.selection-controls`/`.selection-meter`/`.selected-base-grid` 样式语言与现有交互逻辑）。
- CSS：新增 `.dataset-detail-shell`(两栏 grid) / `.dataset-detail-sidebar` / `.dataset-detail-main` / `.dataset-detail-section` / `.btn.btn-danger`。
- 验收：点行进详情，两栏布局正确；返回回目录；按钮可点不报错；选择聚类交互沿用旧行为。

### 任务 4：迁移旧选择逻辑与清理

文件：`src/DatasetManagementPage.tsx`

- 把旧版单数据集流程里的「选择基础聚类」状态（n_base、随机种子、selectedCount、随机选择）迁入详情视图，保持交互。
- 删除旧的 `.status-header` 数据源状态条、旧的 `.dataset-workflow-grid`/`.dataset-import-panel`/`.dataset-middle-stack` 结构（不再渲染）。保留 `.dataset-dropzone` 样式语言供后续上传弹层，但目录页不直接渲染旧导入区。
- 确认 `App.tsx:1252` 的 `if (activeSection === '数据管理') return <DatasetManagementPage />` 仍成立（组件签名不变，无需改 App）。
- 验收：旧结构不再出现；详情页选择交互可用；App 路由分支不变。

### 任务 5：同步更新数据管理测试

文件：`src/App.test.tsx`

- 现有测试 `renders an interactive dataset management workflow prototype`（App.test.tsx:310-335）强依赖旧结构：`aria-label="导入基础聚类结果"` 导入面板（CSV/JSON/Excel/MAT/NPZ、`E: 351 x 100`、`y: 351`）、`aria-label="查看基础聚类统计"` 统计面板、`aria-label="基础聚类随机选择"` 选择面板 + n_base/随机选择交互。
- 重设计后：导入面板不再渲染、统计与选择移入详情视图（需先点行进入）。该测试必须同步重写。
- 重写方向：访问 `/workbench/datasets` → 断言目录表格存在（如 `getByRole('table')` 或目录工具栏文本）→ 点某行进入详情视图（`userEvent.click` 行）→ 断言详情两栏存在（统计表含 `base_1`、选择面板 `n_base` + 随机选择 → `12 / 100` + 12 个 base_）。导入面板相关断言删除（导入功能本次留 TODO，不渲染旧面板）。
- 验收：该测试通过，反映新交互；不残留对旧 aria-label 的断言。

### 任务 6：构建与回归验证

- `npx tsc --noEmit` 通过（无类型错误）。
- `npm run build` 通过。
- `npx vitest run` 现有测试不回归（任务 5 已重写数据管理测试；其余测试如导航/路由断言 App.test.tsx:109,198 仍应通过——它们只校验「数据管理」标签与 `/workbench/datasets` 路径存在，不受内部结构影响）。
- 手动：`/workbench/datasets` 目录 → 点行详情 → 返回；与 `/workbench/analysis` 并排对比，主形态可一眼区分。
- 验收：全部通过，符合设计文档第 8 节验收标准。

## 顺序与依赖

1 → 2 → 3 → 4 → 5 → 6。任务 2/3 可在任务 1 完成后并行起草；4 依赖 2/3 落地后清理旧结构；5 依赖 4（测试需对新结构 + 新交互断言）；6 最后。

## 风险

- 旧 `.dataset-stat-table` 等样式被详情页复用，删旧结构时勿误删这些共用样式。
- `App.test.tsx:310` 测试强依赖旧结构（已纳入任务 5 重写，非隐患而是必做项）。
- `App.test.tsx:109,198,311` 另有对「数据管理」标签与 `/workbench/datasets` 路径的断言——这些不依赖内部结构，应自动通过，但需在任务 6 确认。
- 示例数据虚构项的 n/m/c 要自洽（m≥c 等），避免详情页统计对不上。
- 详情视图的选择交互迁移后，`getAllByText(/^base_/)` 这类断言要适配新详情视图内渲染位置（`within` 详情容器）。
