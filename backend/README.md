# Backend

本目录是 DA-System-SC 的 FastAPI 后端，负责认证、数据集管理、分析任务调度、结果持久化、导出和日志查询。

## 启动

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\backend"
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

如果仓库根目录的脚本可用，也可以执行：

```powershell
cd "F:\研究生阶段\实验室项目\soft_web"
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

## 测试

```powershell
cd "F:\研究生阶段\实验室项目\soft_web\backend"
pytest
```
