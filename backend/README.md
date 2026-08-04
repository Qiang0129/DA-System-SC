# Backend

本目录是 DA-System-SC 的 FastAPI 后端，负责认证、数据集管理、分析任务调度、结果持久化、导出和日志查询。

## 启动

启动前必须先完成 Alembic 迁移。应用启动阶段只读取 `alembic_version`，不会自动创建表或执行 `ALTER TABLE`。

```powershell
cd "G:\研究生阶段\实验室项目\soft_web\backend"
python -m alembic upgrade head
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

已有数据库升级步骤：

1. 先备份数据库，并核对当前表结构、外键和索引已经包含 P0-01 的变更。
2. 确认旧的 P0-01 SQL 迁移已完成，且 `schema_migrations` 中存在 `20260804_p0_01_unify_task_references`。
3. 仅在核验通过后执行 `python -m alembic stamp 20260804_0002`，将现有结构登记为当前版本。
4. 如果旧库尚未完成 P0-01 数据迁移，不得直接 `stamp`；先执行对应 Alembic 迁移，再检查迁移结果。

`backend/sql/schema.sql` 是当前结构快照和人工核对材料，不是生产环境的迁移入口。历史表 `dataset_tasks` 和旧审计表 `schema_migrations` 会保留，但运行时业务只查询 `analysis_tasks`。

如果仓库根目录的脚本可用，也可以执行：

```powershell
cd "G:\研究生阶段\实验室项目\soft_web"
.\scripts\start-backend.ps1
```

## 主要模块

1. `app/auth.py`
   - 用户注册、登录、刷新令牌、退出登录和当前用户查询。

2. `app/datasets.py`
   - 数据集上传、追加、重命名、删除、版本记录、质量检查和导出。

3. `app/tasks.py`
   - 任务创建、列表筛选、启动、取消、重试、克隆、结果、导出和日志。

4. `app/task_executor.py`
   - 单并发后台调度器，负责领取排队任务、启动算法子进程、持久化结果。

5. `app/task_worker.py`
   - 单个 OMELET / OMELET-SV 任务执行入口。

## 任务执行器部署约束

任务执行器使用 `analysis_tasks` 的数据库租约、`worker_id` 和心跳字段保证不会重复领取同一任务。当前实现仍是随 FastAPI 进程启动的单调度器：生产部署只能保留一个 `TASK_EXECUTOR_ENABLED=true` 的实例，其他 API 实例必须设置为 `false`，Uvicorn 也只能使用一个启用调度器的 worker。

相关配置及默认值：

```text
TASK_MAX_RUNTIME_SECONDS=3600
TASK_HEARTBEAT_INTERVAL_SECONDS=10
TASK_HEARTBEAT_TIMEOUT_SECONDS=60
```

进程超过最大运行时间会被终止完整进程树并标记为 `failure_reason=timeout`，不会自动重试。服务停止或检测到心跳超时的运行任务会重新排队并递增 `retry_count`，需要用户手动重试的失败任务同样会递增该字段。

## 测试

```powershell
cd "G:\研究生阶段\实验室项目\soft_web\backend"
pytest
```
