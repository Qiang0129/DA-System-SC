# DA-System-SC

DA-System-SC 是一个面向新材料数据分析场景的桌面优先 Web 系统，围绕 OMELET / OMELET-SV 集成聚类流程构建，提供登录注册、分析工作台、数据管理、CA 协关联矩阵分析、多核相似性学习、结果分析与导出等界面能力。

当前仓库同时包含三部分内容：

1. `front/`
   React + TypeScript + Vite 前端项目
2. `backend/`
   FastAPI + SQLAlchemy + MySQL 后端项目
3. `ec_python_converted/`
   OMELET MATLAB 代码的 Python 转换版与示例数据

## 当前状态

目前仓库已经具备以下基础能力：

1. 前端工作台与登录注册流程已完成，包含多个分析页面原型和交互测试。
2. 后端已提供认证接口，包括注册、登录、获取当前用户、刷新令牌、退出登录。
3. 数据库表结构已经定义，覆盖用户、会话、数据集、分析任务、任务结果、导出记录与操作日志。
4. `ec_python_converted/` 中已经包含可运行的 OMELET / OMELET-SV Python 脚本和 `ionosphere` 示例数据。

当前仍在接入中的部分：

1. 前端的数据导入、任务创建、结果分析页面目前以工作台原型和本地状态为主。
2. 后端的任务调度、数据集导入、算法执行、结果持久化与导出接口还未完全连通。
3. 本项目以桌面端使用为主，不以移动端适配为目标。

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
  dashboard/
  api/
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
    models.py
    schemas.py
    security.py
  config/
    database.env
  sql/
    schema.sql
  tests/
    test_auth.py
```

## 快速开始

前后端需要分别在两个终端中启动。以下命令以当前 Windows 项目路径为例。

### 1. 前端启动

要求：

1. Node.js 18 或更高版本
2. npm

在第一个 PowerShell 终端执行：

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\front"
# 首次运行时安装依赖，后续启动可跳过此命令
npm install
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173
```

### 2. 后端启动

要求：

1. Python 3.10 或更高版本
2. MySQL 8.x

初始化数据库：

```bash
mysql -u root -p < backend/sql/schema.sql
```

配置数据库连接：

1. 编辑 `backend/config/database.env`
2. 根据本地环境修改 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`

在第二个 PowerShell 终端执行：

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

健康检查地址：

```text
http://127.0.0.1:8000/api/health
```

### 3. 算法示例运行

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

已实现接口：

1. `GET /api/health`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `GET /api/auth/me`
5. `POST /api/auth/refresh`
6. `POST /api/auth/logout`

这些接口已经有自动化测试覆盖，适合作为前后端联调的第一阶段基础能力。

## 测试

前端测试：

```bash
cd front
npm test
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

## 后续计划

1. 打通前端数据集导入与后端数据集接口。
2. 接入分析任务创建、轮询与结果展示。
3. 将 `ec_python_converted/` 中的 OMELET / OMELET-SV 能力并入 FastAPI 服务。
4. 补全结果导出与分析报告生成链路。

## 致谢

本项目的算法设计参考论文：

`Topological-aware multiple kernel learning for ensemble clustering`
