from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import AnalysisTask, Dataset, OperationLog, TaskResult


EVENT_PREFIX = "OMELET_EVENT "
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}


def _now() -> datetime:
    return datetime.now().replace(microsecond=0)


def _load_json(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _is_in_directory(path: Path, directory: Path) -> bool:
    try:
        path.resolve().relative_to(directory.resolve())
        return True
    except ValueError:
        return False


class TaskExecutionManager:
    """单并发子进程调度器，主进程独占任务状态和结果表的写入权限。"""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._wake_event = threading.Event()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._process: subprocess.Popen[str] | None = None
        self._active_task_id: int | None = None

    def start(self) -> None:
        settings = get_settings()
        if not settings.task_executor_enabled:
            return
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._recover_interrupted_tasks()
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._dispatch_loop, name="omelet-task-executor", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        with self._lock:
            process = self._process
            task_id = self._active_task_id
        if task_id is not None:
            self._requeue_active_task(task_id)
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=6)

    def notify(self) -> None:
        self._wake_event.set()

    def cancel_active_process(self, task_id: int) -> None:
        with self._lock:
            if task_id != self._active_task_id or self._process is None:
                return
            process = self._process
        if process.poll() is None:
            process.terminate()

    def _dispatch_loop(self) -> None:
        poll_interval = max(0.2, float(get_settings().task_poll_interval_seconds))
        while not self._stop_event.is_set():
            claimed = self._claim_next_task()
            if claimed is None:
                self._wake_event.wait(timeout=poll_interval)
                self._wake_event.clear()
                continue
            self._execute_task(claimed)

    def _recover_interrupted_tasks(self) -> None:
        with SessionLocal() as session:
            running = session.scalars(select(AnalysisTask).where(AnalysisTask.status == "running")).all()
            for task in running:
                task.status = "queued"
                task.progress = 0.0
                task.current_run = 0
                task.current_iter = 0
                task.current_stage = "select_base"
                task.started_at = None
                task.finished_at = None
                task.queued_at = _now()
                session.add(
                    OperationLog(
                        user_id=task.user_id,
                        task_id=task.id,
                        action="task_recovered",
                        level="warning",
                        message="服务重启后任务已重新排队，将从头执行",
                    ),
                )
            if running:
                session.commit()

    def _claim_next_task(self) -> dict[str, Any] | None:
        with SessionLocal() as session:
            task = session.scalar(
                select(AnalysisTask)
                .where(AnalysisTask.status == "queued")
                .order_by(AnalysisTask.queued_at, AnalysisTask.id)
                .limit(1),
            )
            if task is None:
                return None
            dataset = session.scalar(select(Dataset).where(Dataset.id == task.dataset_id))
            if dataset is None or not Path(dataset.storage_path).is_file():
                task.status = "failed"
                task.failure_reason = "dataset_missing"
                task.error_message = "任务数据集文件不存在，无法执行分析"
                task.finished_at = _now()
                session.add(
                    OperationLog(
                        user_id=task.user_id,
                        task_id=task.id,
                        action="task_failed",
                        level="error",
                        message=task.error_message,
                    ),
                )
                session.commit()
                return None

            task.status = "running"
            task.progress = 0.0
            task.current_run = 1
            task.current_iter = 0
            task.current_stage = "select_base"
            task.started_at = _now()
            task.finished_at = None
            task.error_message = None
            task.failure_reason = None
            session.add(
                OperationLog(
                    user_id=task.user_id,
                    task_id=task.id,
                    action="task_started",
                    message="OMELET 子进程已启动",
                    detail_json=_dump_json({"mode": task.mode, "datasetId": task.dataset_id}),
                ),
            )
            payload = {
                "taskId": task.id,
                "userId": task.user_id,
                "mode": task.mode,
                "params": _load_json(task.params_json, {}),
                "datasetPath": dataset.storage_path,
            }
            session.commit()
            return payload

    def _execute_task(self, payload: dict[str, Any]) -> None:
        task_id = int(payload["taskId"])
        user_id = int(payload["userId"])
        settings = get_settings()
        result_root = Path(settings.result_storage_dir).resolve()
        temporary_dir = result_root / ".tmp" / f"{user_id}-{task_id}-{uuid.uuid4().hex}"
        temporary_dir.mkdir(parents=True, exist_ok=True)
        job_path = temporary_dir / "job.json"
        job_path.write_text(
            json.dumps({**payload, "outputDir": str(temporary_dir)}, ensure_ascii=False),
            encoding="utf-8",
        )

        command = [sys.executable, "-m", "app.task_worker", "--job", str(job_path)]
        environment = os.environ.copy()
        environment.setdefault("PYTHONUTF8", "1")
        try:
            process = subprocess.Popen(
                command,
                cwd=str(Path(__file__).resolve().parents[1]),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=environment,
            )
        except OSError as exc:
            self._mark_failed(task_id, "executor_start_failed", str(exc))
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return

        with self._lock:
            self._process = process
            self._active_task_id = task_id

        completed_manifest: Path | None = None
        last_error = ""
        assert process.stdout is not None
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            if line.startswith(EVENT_PREFIX):
                try:
                    event = json.loads(line[len(EVENT_PREFIX):])
                except json.JSONDecodeError:
                    last_error = "任务子进程发送了无法解析的进度事件"
                    continue
                event_type = event.get("type")
                if event_type == "completed":
                    completed_manifest = Path(str(event.get("manifestPath", "")))
                elif event_type == "error":
                    last_error = str(event.get("message") or "算法执行失败")
                else:
                    self._persist_progress(task_id, event)
            else:
                last_error = line[-500:]

        return_code = process.wait()
        with self._lock:
            self._process = None
            self._active_task_id = None

        if self._task_is_cancelled(task_id):
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return
        if self._stop_event.is_set():
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return
        if return_code != 0 or completed_manifest is None:
            self._mark_failed(
                task_id,
                "execution_error",
                last_error or f"OMELET 子进程异常退出，退出码 {return_code}",
            )
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return
        if not _is_in_directory(completed_manifest, temporary_dir) or not completed_manifest.is_file():
            self._mark_failed(task_id, "invalid_result", "任务结果清单不存在或位于受控目录之外")
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return
        try:
            manifest = json.loads(completed_manifest.read_text(encoding="utf-8"))
            self._persist_completed_result(task_id, user_id, temporary_dir, manifest)
        except Exception as exc:
            self._mark_failed(task_id, "persist_error", f"结果持久化失败: {exc}")
            shutil.rmtree(temporary_dir, ignore_errors=True)

    def _persist_progress(self, task_id: int, event: dict[str, Any]) -> None:
        with SessionLocal() as session:
            task = session.get(AnalysisTask, task_id)
            if task is None or task.status != "running":
                return
            progress = event.get("progress")
            if progress is not None:
                task.progress = max(float(task.progress or 0), min(99.0, float(progress)))
            task.current_stage = str(event.get("stage") or task.current_stage or "select_base")
            if event.get("run") is not None:
                next_run = max(1, int(event["run"]))
                if next_run != int(task.current_run or 0):
                    task.current_iter = 0
                task.current_run = next_run
            if event.get("iteration") is not None:
                task.current_iter = int(event["iteration"])
            if event.get("type") == "run_completed":
                session.add(
                    OperationLog(
                        user_id=task.user_id,
                        task_id=task.id,
                        action="task_run_completed",
                        message=f"第 {task.current_run} 轮实验完成",
                        detail_json=_dump_json(event.get("metrics") or {}),
                    ),
                )
            session.commit()

    def _persist_completed_result(
        self,
        task_id: int,
        user_id: int,
        temporary_dir: Path,
        manifest: dict[str, Any],
    ) -> None:
        if manifest.get("schemaVersion") != 1:
            raise ValueError("不支持的任务结果版本")
        artifacts = manifest.get("artifacts")
        if not isinstance(artifacts, dict):
            raise ValueError("任务结果缺少产物清单")
        required_keys = {"labels", "ca", "s", "z"}
        if not required_keys.issubset(artifacts):
            raise ValueError("任务结果缺少关键矩阵或标签产物")
        for relative_path in artifacts.values():
            artifact_path = temporary_dir / str(relative_path)
            if not _is_in_directory(artifact_path, temporary_dir) or not artifact_path.is_file():
                raise ValueError("任务结果包含不安全或不存在的产物路径")

        result_root = Path(get_settings().result_storage_dir).resolve()
        final_dir = result_root / str(user_id) / str(task_id)
        final_dir.parent.mkdir(parents=True, exist_ok=True)
        if final_dir.exists():
            shutil.rmtree(final_dir)
        shutil.move(str(temporary_dir), str(final_dir))

        with SessionLocal() as session:
            task = session.get(AnalysisTask, task_id)
            if task is None or task.status != "running":
                shutil.rmtree(final_dir, ignore_errors=True)
                return
            result = session.scalar(select(TaskResult).where(TaskResult.task_id == task_id))
            if result is None:
                result = TaskResult(task_id=task_id)
                session.add(result)
            result.schema_version = 1
            result.metrics_json = _dump_json(manifest["metrics"])
            result.kernel_weights_json = _dump_json(manifest["kernelWeights"])
            result.convergence_json = _dump_json(manifest["convergence"])
            result.preview_json = _dump_json(manifest["preview"])
            result.labels_path = str(final_dir / str(artifacts["labels"]))
            result.ca_matrix_path = str(final_dir / str(artifacts["ca"]))
            result.s_matrix_path = str(final_dir / str(artifacts["s"]))
            result.z_matrix_path = str(final_dir / str(artifacts["z"]))
            result.runtime_seconds = float(manifest["runtimeSeconds"])
            task.status = "succeeded"
            task.progress = 100.0
            task.current_iter = int(task.max_iter or 0)
            task.current_run = int(_load_json(task.params_json, {}).get("runs") or 1)
            task.current_stage = "persist"
            task.finished_at = _now()
            task.error_message = None
            task.failure_reason = None
            session.add(
                OperationLog(
                    user_id=task.user_id,
                    task_id=task.id,
                    action="task_succeeded",
                    message="OMELET 分析完成，结果已持久化",
                    detail_json=_dump_json({
                        "runtimeSeconds": result.runtime_seconds,
                        "metrics": manifest["metrics"].get("aggregate", {}),
                    }),
                ),
            )
            session.commit()

    def _task_is_cancelled(self, task_id: int) -> bool:
        with SessionLocal() as session:
            task = session.get(AnalysisTask, task_id)
            return task is not None and task.status == "cancelled"

    def _mark_failed(self, task_id: int, reason: str, message: str) -> None:
        with SessionLocal() as session:
            task = session.get(AnalysisTask, task_id)
            if task is None or task.status in TERMINAL_STATUSES:
                return
            task.status = "failed"
            task.failure_reason = reason
            task.error_message = message[:1000]
            task.finished_at = _now()
            session.add(
                OperationLog(
                    user_id=task.user_id,
                    task_id=task.id,
                    action="task_failed",
                    level="error",
                    message=task.error_message[:500],
                    detail_json=_dump_json({"failureReason": reason}),
                ),
            )
            session.commit()

    def _requeue_active_task(self, task_id: int) -> None:
        with SessionLocal() as session:
            task = session.get(AnalysisTask, task_id)
            if task is None or task.status != "running":
                return
            task.status = "queued"
            task.progress = 0.0
            task.current_run = 0
            task.current_iter = 0
            task.current_stage = "select_base"
            task.started_at = None
            task.finished_at = None
            task.queued_at = _now()
            session.add(
                OperationLog(
                    user_id=task.user_id,
                    task_id=task.id,
                    action="task_requeued",
                    level="warning",
                    message="服务停止，任务已重新排队",
                ),
            )
            session.commit()


task_execution_manager = TaskExecutionManager()
