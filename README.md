# DA-System-SC

DA-System-SC 是一个面向新材料数据分析场景的桌面优先 Web 系统，围绕 OMELET / OMELET-SV 集成聚类流程构建，提供登录注册、分析工作台、数据管理、CA 协关联矩阵分析、多核相似性学习、结果分析与导出等能力。

当前仓库同时包含三部分内容：

1. `front/`
   React + TypeScript + Vite 前端项目。
2. `backend/`
   FastAPI + SQLAlchemy + MySQL 后端项目。
3. `ec_python_converted/`
   OMELET MATLAB 代码的 Python 转换版与示例数据。

## 当前状态

目前仓库已经具备以下能力：

1. 前端已完成首页、登录注册、分析工作台、数据管理、数据质量、数据版本、任务中心、结果分析、报告导出和运行日志等页面。
2. 后端已提供认证、数据集、任务、任务结果、导出和日志接口。
3. 数据库表结构覆盖用户、会话、数据集、数据版本、分析任务、任务结果、导出记录与操作日志。
4. 后端任务执行器已经接入 OMELET / OMELET-SV Python 算法子进程，支持任务排队、进度写入、结果持久化和失败恢复。
5. `ec_python_converted/` 中保留 OMELET / OMELET-SV Python 转换实现和内置示例数据，便于算法复现与对照验证。
6. 本项目以桌面端工作台使用为主，不以移动端适配为目标。

## 技术栈

前端：

1. React 18
2. TypeScript
3. Vite
4. React Router
5. ECharts
6. Lucide React
7. Vitest + Testing Library

后端：

1. FastAPI
2. SQLAlchemy 2
3. PyMySQL
4. Pydantic Settings
5. python-jose
6. pytest

算法与研究参考：

1. OMELET / OMELET-SV Python 转换实现
2. `Topological-aware multiple kernel learning for ensemble clustering.pdf`
3. `新材料数据分析.docx`

## 目录结构

```text
DA-System-SC/
  front/                   # React + TypeScript 前端
  backend/                 # FastAPI 后端
  ec_python_converted/     # OMELET / OMELET-SV Python 转换版
  docs/soft-copyright/     # 软著登记与演示材料
  scripts/                 # 本地启动脚本
  output/                  # 调试与截图产物
  tmp/                     # 临时脚本与中间文件
  README.md
```

前端主要目录：

```text
front/src/
  App.tsx
  LandingPage.tsx
  AuthPages.tsx
  DatasetManagementPage.tsx
  AppBackground.tsx
  dashboard/
  workbench/
  api/
  components/
  images/
  test/
```

后端主要目录：

```text
backend/
  main.py
  app/
    auth.py
    config.py
    database.py
    datasets.py
    models.py
    schemas.py
    security.py
    tasks.py
    task_executor.py
    task_worker.py
  config/
    database.env.example  # 本地配置模板
  sql/
    schema.sql
  tests/
```

## 快速开始

前后端需要分别在两个终端中启动。以下命令以当前 Windows 项目路径为例。

### 1. 使用启动脚本

```powershell
cd "F:\研究生阶段\实验室项目\soft_web"

# 分别启动
.\scripts\start-backend.ps1
.\scripts\start-frontend.ps1

# 或同时打开两个服务窗口
.\scripts\start-all.ps1
```

脚本说明：

1. `start-backend.ps1` 会优先使用 `backend/.venv`，如果不存在则尝试使用 `D:\ProgramData\anaconda3\python.exe`，最后再回退到系统 PATH 中的 `python`。
2. `start-frontend.ps1` 默认使用 `127.0.0.1:5173` 启动 Vite。
3. `start-all.ps1` 会分别打开前端和后端两个 PowerShell 窗口，方便演示时同时观察日志。

### 2. 前端手动启动

要求：

1. Node.js 18 或更高版本
2. npm

在第一个 PowerShell 终端执行：

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\front"
# 首次运行时安装依赖，后续启动可跳过此命令
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

默认访问地址：

```text
http://127.0.0.1:5173
```

### 3. 后端手动启动

要求：

1. Python 3.10 或更高版本
2. MySQL 8.x

初始化数据库：

```bash
mysql -u root -p < backend/sql/schema.sql
```

配置数据库连接：

1. 首次运行时复制配置模板：

   ```powershell
   cd "F:\研究生阶段\实验室项目\soft_web"
   Copy-Item backend/config/database.env.example backend/config/database.env
   ```

2. 编辑本地文件 `backend/config/database.env`。
3. 根据本地环境修改 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`。
   该文件包含本地密码，已被 Git 忽略，不要提交到仓库。

配置 Cloudflare Turnstile 人机验证：

1. 在 Cloudflare 控制台创建 Turnstile widget。
2. 开发环境域名建议加入：

   ```text
   127.0.0.1
   localhost
   ```

3. 前端复制 `front/.env.example` 为 `front/.env`，填写 `VITE_TURNSTILE_SITE_KEY`。
4. 后端在 `backend/config/database.env` 填写 `TURNSTILE_SECRET_KEY`。
5. 本地不填写 `TURNSTILE_SECRET_KEY` 时，后端会跳过验证码校验；一旦填写，登录和注册接口都会强制校验 Cloudflare 返回结果。
6. `front/.env` 和 `backend/config/database.env` 都包含本地配置或密钥，不要提交到仓库。

使用虚拟环境启动：

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\backend"
# 首次运行时创建虚拟环境，后续启动可跳过此命令
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# 首次运行时安装依赖，依赖更新后再重新执行
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

如果 PowerShell 阻止虚拟环境激活，可以直接使用虚拟环境中的 Python 启动：

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\backend"
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

如果当前机器没有创建 `backend/.venv`，但 Anaconda 环境已经安装依赖，也可以直接使用本机 Anaconda Python 启动：

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\backend"
D:\ProgramData\anaconda3\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

健康检查地址：

```text
http://127.0.0.1:8000/api/health
```

### 4. 算法示例运行

```bash
cd ec_python_converted
pip install -r requirements.txt
python demo_OMELET.py --runs 1 --lambda-values 5 --gamma-values 5 --sigma-powers 0
python OMELET_SV.py --runs 1 --lambda-values 5 --gamma-values 5 --sigma-powers 0
```

## 当前页面与路由

前端目前包含以下页面：

1. `/`
   登录前首页
2. `/login`
   登录页
3. `/register`
   注册页
4. `/workbench/analysis`
   分析工作台首页
5. `/workbench/datasets`
   数据管理
6. `/workbench/data-quality`
   数据质量检查
7. `/workbench/dataset-versions`
   数据版本记录
8. `/workbench/tasks`
   任务中心
9. `/workbench/ca-matrix`
   CA 协关联矩阵分析
10. `/workbench/kernel-config`
    核函数配置
11. `/workbench/mkl`
    多核相似性学习
12. `/workbench/evaluation`
    性能评估
13. `/workbench/visualization`
    可视化展示
14. `/workbench/results`
    结果分析
15. `/workbench/export`
    结果导出
16. `/workbench/reports`
    分析报告
17. `/workbench/logs`
    运行日志

## 后端接口现状

已实现主要接口：

1. `GET /api/health`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `GET /api/auth/me`
5. `POST /api/auth/refresh`
6. `POST /api/auth/logout`
7. `GET /api/datasets`
8. `POST /api/datasets`
9. `PUT /api/datasets/{dataset_id}`
10. `POST /api/datasets/{dataset_id}/append`
11. `PATCH /api/datasets/{dataset_id}`
12. `POST /api/datasets/bulk-delete`
13. `POST /api/datasets/export`
14. `GET /api/datasets/{dataset_id}/versions`
15. `POST /api/datasets/{dataset_id}/quality`
16. `DELETE /api/datasets/{dataset_id}`
17. `GET /api/datasets/example-mat`
18. `POST /api/datasets/parse`
19. `GET /api/tasks/stats`
20. `GET /api/tasks/templates`
21. `POST /api/tasks/templates`
22. `DELETE /api/tasks/templates/{template_id}`
23. `GET /api/tasks`
24. `POST /api/tasks`
25. `GET /api/tasks/results/latest`
26. `GET /api/tasks/{task_id}/result`
27. `GET /api/tasks/{task_id}/artifacts/{artifact_key}`
28. `GET /api/tasks/{task_id}/exports`
29. `POST /api/tasks/{task_id}/exports`
30. `GET /api/tasks/{task_id}/exports/{export_id}/download`
31. `GET /api/tasks/{task_id}`
32. `PATCH /api/tasks/{task_id}`
33. `POST /api/tasks/{task_id}/start`
34. `POST /api/tasks/{task_id}/cancel`
35. `POST /api/tasks/{task_id}/retry`
36. `POST /api/tasks/{task_id}/clone`
37. `DELETE /api/tasks/{task_id}`
38. `GET /api/tasks/{task_id}/logs`
39. `POST /api/tasks/bulk`

认证、数据集和任务相关接口均有自动化测试覆盖。

## 软著材料与演示路线

软著登记、截图和演示建议见：

```text
docs/soft-copyright/README.md
```

推荐演示路径：

1. 首页进入系统。
2. 登录或注册。
3. 进入分析工作台。
4. 上传或追加数据集。
5. 检查数据质量和版本记录。
6. 创建并启动 OMELET-SV 分析任务。
7. 查看任务进度、运行日志和结果分析。
8. 导出结果档案或分析报告。

## 测试

前端测试：

```bash
cd front
npm test
```

前端生产构建：

```bash
cd front
npm run build
```

后端测试：

```bash
cd backend
pytest
```

## 开发说明

1. 项目当前以桌面端工作台体验为主。
2. 根目录中的研究论文与 Word 文档用于支持算法与业务界面设计，不属于运行时依赖。
3. `output/` 与 `tmp/` 目录主要用于调试截图、校验脚本和临时产物。
4. 本地数据库配置、运行日志、构建产物和上传后的存储文件均已通过 `.gitignore` 排除。

## 后续计划

1. 按软著截图清单补齐最终演示截图。
2. 持续压缩前端大资源，并按页面拆分重型图表依赖。
3. 将过大的前端入口和样式文件继续拆分到功能模块中。
4. 根据正式测试数据补充更多算法结果样例和报告模板。

## 致谢

本项目的算法设计参考论文：

`Topological-aware multiple kernel learning for ensemble clustering`
