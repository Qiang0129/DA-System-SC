"""数据库驱动的单任务执行调度器。

执行器只负责领取、监控和持久化；算法计算在独立子进程中完成，避免阻塞 Web 服务进程。
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import or_, select, update

from .config import get_settings
from .database import SessionLocal
from .models import AnalysisTask, Dataset, OperationLog, TaskResult
from .storage_cleanup import process_pending_cleanup_jobs
from .time_utils import utc_now


EVENT_PREFIX = "OMELET_EVENT "
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}


def _now() -> datetime:
    return utc_now().replace(microsecond=0)


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


def _terminate_process_tree(process: subprocess.Popen[str], wait_timeout: float = 5.0) -> None:
    """结束算法进程及其子进程，避免只杀掉外层 Python 进程。"""
    if process.poll() is not None:
        return

    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=max(5.0, wait_timeout),
            )
        except (OSError, subprocess.SubprocessError):
            # 精简 Windows 环境可能没有 taskkill，保留 Popen 的兜底终止。
            try:
                process.terminate()
            except OSError:
                pass
    else:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        except (OSError, ProcessLookupError):
            try:
                process.terminate()
            except OSError:
                pass

    try:
        process.wait(timeout=wait_timeout)
        return
    except subprocess.TimeoutExpired:
        pass

    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=max(5.0, wait_timeout),
            )
        except (OSError, subprocess.SubprocessError):
            try:
                process.kill()
            except OSError:
                pass
    else:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError):
            try:
                process.kill()
            except OSError:
                pass
    try:
        process.wait(timeout=wait_timeout)
    except subprocess.TimeoutExpired:
        pass


class TaskExecutionManager:
    """使用数据库租约的单并发任务调度器。

    一个部署实例只能启用一个调度器；多个 API 实例应将 TASK_EXECUTOR_ENABLED 设为 false。
    数据库租约仍会阻止误启动的第二个实例重复领取同一任务。
    """

    def __init__(self) -> None:
        self.worker_id = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:16]}"
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
            self._stop_event.clear()
            self._recover_interrupted_tasks()
            self._thread = threading.Thread(target=self._dispatch_loop, name="omelet-task-executor", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        with self._lock:
            process = self._process
            task_id = self._active_task_id
        if process is not None and process.poll() is None:
            _terminate_process_tree(process)
        if task_id is not None:
            self._requeue_active_task(task_id)
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=8)

    def notify(self) -> None:
        self._wake_event.set()

    def cancel_active_process(self, task_id: int) -> None:
        with self._lock:
            if task_id != self._active_task_id or self._process is None:
                return
            process = self._process
        if process.poll() is None:
            _terminate_process_tree(process)

    def _dispatch_loop(self) -> None:
        poll_interval = max(0.2, float(get_settings().task_poll_interval_seconds))
        last_cleanup_at = 0.0
        while not self._stop_event.is_set():
            if time.monotonic() - last_cleanup_at >= 5.0:
                try:
                    process_pending_cleanup_jobs(limit=10)
                except Exception:
                    # 清理器故障不应阻断任务调度，下一轮继续尝试。
                    pass
                last_cleanup_at = time.monotonic()
            try:
                claimed = self._claim_next_task()
            except Exception:
                # 数据库短暂不可用时保留调度线程，下一轮继续尝试。
                self._wake_event.wait(timeout=poll_interval)
                self._wake_event.clear()
                continue
            if claimed is None:
                self._wake_event.wait(timeout=poll_interval)
                self._wake_event.clear()
                continue
            try:
                self._execute_task(claimed)
            except Exception as exc:
                # 兜底保护调度线程；正常失败路径会在 _execute_task 内写入更具体的原因。
                task_id = int(claimed["taskId"])
                self.cancel_active_process(task_id)
                try:
                    self._mark_failed(task_id, "executor_error", f"执行器异常: {exc}")
                except Exception:
                    pass

    def _recover_interrupted_tasks(self) -> None:
        """只回收心跳超时的运行任务，仍由其他 worker 持有租约的任务保持不动。"""
        settings = get_settings()
        stale_before = _now() - timedelta(seconds=float(settings.task_heartbeat_timeout_seconds))
        with SessionLocal() as session:
            running = session.scalars(
                select(AnalysisTask)
                .where(
                    AnalysisTask.status == "running",
                    or_(
                        AnalysisTask.heartbeat_at.is_(None),
                        AnalysisTask.heartbeat_at <= stale_before,
                    ),
                )
                .order_by(AnalysisTask.id)
                .with_for_update(skip_locked=True),
            ).all()
            for task in running:
                task.status = "queued"
                task.retry_count = int(task.retry_count or 0) + 1
                task.progress = 0.0
                task.current_run = 0
                task.current_iter = 0
                task.current_stage = "select_base"
                task.started_at = None
                task.finished_at = None
                task.queued_at = _now()
                task.worker_id = None
                task.heartbeat_at = None
                session.add(
                    OperationLog(
                        user_id=task.user_id,
                        task_id=task.id,
                        action="task_recovered",
                        level="warning",
                        message="服务重启后任务心跳已超时，任务重新排队，将从头执行",
                        detail_json=_dump_json({"retryCount": task.retry_count}),
                    ),
                )
            if running:
                session.commit()

    def _claim_next_task(self) -> dict[str, Any] | None:
        """锁定候选行后再按 queued 条件更新，确保多实例只能有一个领取成功。"""
        with SessionLocal() as session:
            task = session.scalar(
                select(AnalysisTask)
                .where(AnalysisTask.status == "queued")
                .order_by(AnalysisTask.queued_at, AnalysisTask.id)
                .limit(1)
                .with_for_update(skip_locked=True),
            )
            if task is None:
                return None

            dataset = session.scalar(select(Dataset).where(Dataset.id == task.dataset_id))
            if dataset is None or not Path(dataset.storage_path).is_file():
                failed = session.execute(
                    update(AnalysisTask)
                    .where(AnalysisTask.id == task.id, AnalysisTask.status == "queued")
                    .values(
                        status="failed",
                        failure_reason="dataset_missing",
                        error_message="任务数据集文件不存在，无法执行分析",
                        finished_at=_now(),
                        worker_id=None,
                        heartbeat_at=None,
                    ),
                )
                if failed.rowcount == 1:
                    session.add(
                        OperationLog(
                            user_id=task.user_id,
                            task_id=task.id,
                            action="task_failed",
                            level="error",
                            message="任务数据集文件不存在，无法执行分析",
                        ),
                    )
                    session.commit()
                return None

            claimed_at = _now()
            claimed = session.execute(
                update(AnalysisTask)
                .where(AnalysisTask.id == task.id, AnalysisTask.status == "queued")
                .values(
                    status="running",
                    progress=0.0,
                    current_run=1,
                    current_iter=0,
                    current_stage="select_base",
                    started_at=claimed_at,
                    finished_at=None,
                    error_message=None,
                    failure_reason=None,
                    worker_id=self.worker_id,
                    heartbeat_at=claimed_at,
                ),
            )
            if claimed.rowcount != 1:
                session.rollback()
                return None

            payload = {
                "taskId": task.id,
                "userId": task.user_id,
                "workerId": self.worker_id,
                "mode": task.mode,
                "params": _load_json(task.params_json, {}),
                "datasetPath": dataset.storage_path,
            }
            session.add(
                OperationLog(
                    user_id=task.user_id,
                    task_id=task.id,
                    action="task_started",
                    message="OMELET 子进程已启动",
                    detail_json=_dump_json(
                        {"mode": task.mode, "datasetId": task.dataset_id, "workerId": self.worker_id},
                    ),
                ),
            )
            session.commit()
            return payload

    def _execute_task(self, payload: dict[str, Any]) -> None:
        """启动受控子进程，同时维护心跳、运行时上限和标准输出事件通道。"""
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
        popen_kwargs: dict[str, Any] = {
            "cwd": str(Path(__file__).resolve().parents[1]),
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "bufsize": 1,
            "env": environment,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            popen_kwargs["start_new_session"] = True

        try:
            process = subprocess.Popen(command, **popen_kwargs)
        except OSError as exc:
            self._mark_failed(task_id, "executor_start_failed", str(exc))
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return

        with self._lock:
            self._process = process
            self._active_task_id = task_id

        heartbeat_stop = threading.Event()
        heartbeat_lost = threading.Event()

        def heartbeat_loop() -> None:
            interval = max(0.5, float(settings.task_heartbeat_interval_seconds))
            while not heartbeat_stop.wait(interval):
                try:
                    heartbeat_alive = self._touch_heartbeat(task_id)
                except Exception:
                    heartbeat_alive = False
                if not heartbeat_alive:
                    heartbeat_lost.set()
                    with self._lock:
                        active_process = self._process
                    if active_process is not None and active_process.poll() is None:
                        _terminate_process_tree(active_process)
                    return

        heartbeat_thread = threading.Thread(
            target=heartbeat_loop,
            name=f"omelet-task-heartbeat-{task_id}",
            daemon=True,
        )
        heartbeat_thread.start()

        output_queue: queue.Queue[str | None] = queue.Queue()
        output_closed = threading.Event()

        def read_output() -> None:
            try:
                assert process.stdout is not None
                for line in process.stdout:
                    output_queue.put(line)
            finally:
                output_closed.set()
                output_queue.put(None)

        reader_thread = threading.Thread(target=read_output, name=f"omelet-task-output-{task_id}", daemon=True)
        reader_thread.start()

        completed_manifest: Path | None = None
        last_error = ""
        timed_out = False
        started_monotonic = time.monotonic()

        try:
            while True:
                if (
                    not timed_out
                    and process.poll() is None
                    and time.monotonic() - started_monotonic >= float(settings.task_max_runtime_seconds)
                ):
                    timed_out = True
                    _terminate_process_tree(process)

                try:
                    line = output_queue.get(timeout=0.2)
                except queue.Empty:
                    if process.poll() is not None and output_closed.is_set() and output_queue.empty():
                        break
                    continue

                if line is None:
                    if process.poll() is not None and output_queue.empty():
                        break
                    continue

                line = line.strip()
                if not line:
                    continue
                if line.startswith(EVENT_PREFIX):
                    try:
                        event = json.loads(line[len(EVENT_PREFIX) :])
                    except json.JSONDecodeError:
                        last_error = "任务子进程发送了无法解析的进度事件"
                        continue
                    event_type = event.get("type")
                    if event_type == "completed":
                        completed_manifest = Path(str(event.get("manifestPath", "")))
                    elif event_type == "error":
                        last_error = str(event.get("message") or "算法执行失败")
                    else:
                        try:
                            self._persist_progress(task_id, event)
                        except Exception as exc:
                            last_error = f"进度写入失败: {exc}"
                else:
                    last_error = line[-500:]

            try:
                return_code = process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                _terminate_process_tree(process)
                try:
                    return_code = process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # 进程句柄异常时也要继续落库和清理临时目录，不能让调度线程退出。
                    return_code = int(process.poll() if process.poll() is not None else -9)
        finally:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=2)
            with self._lock:
                if self._process is process:
                    self._process = None
                    self._active_task_id = None

        if self._task_is_cancelled(task_id) or self._stop_event.is_set() or heartbeat_lost.is_set():
            shutil.rmtree(temporary_dir, ignore_errors=True)
            return
        if timed_out:
            self._mark_failed(
                task_id,
                "timeout",
                f"任务运行超过最大时长 {float(settings.task_max_runtime_seconds):g} 秒，已终止完整进程树",
            )
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

    def _touch_heartbeat(self, task_id: int) -> bool:
        with SessionLocal() as session:
            result = session.execute(
                update(AnalysisTask)
                .where(
                    AnalysisTask.id == task_id,
                    AnalysisTask.status == "running",
                    AnalysisTask.worker_id == self.worker_id,
                )
                .values(heartbeat_at=_now()),
            )
            if result.rowcount != 1:
                session.rollback()
                return False
            session.commit()
            return True

    def _persist_progress(self, task_id: int, event: dict[str, Any]) -> None:
        """仅当前 worker 可以推进任务进度，失去租约后的迟到事件直接忽略。"""
        with SessionLocal() as session:
            task = session.scalar(
                select(AnalysisTask).where(
                    AnalysisTask.id == task_id,
                    AnalysisTask.status == "running",
                    AnalysisTask.worker_id == self.worker_id,
                ),
            )
            if task is None:
                return
            task.heartbeat_at = _now()
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
        """在锁定任务行后完成目录切换和结果写入，首个成功结果一经提交便不可覆盖。"""
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
        final_dir: Path | None = None
        moved = False
        try:
            with SessionLocal() as session:
                task = session.scalar(
                    select(AnalysisTask)
                    .where(
                        AnalysisTask.id == task_id,
                        AnalysisTask.status == "running",
                        AnalysisTask.worker_id == self.worker_id,
                    )
                    .with_for_update(),
                )
                if task is None:
                    shutil.rmtree(temporary_dir, ignore_errors=True)
                    return

                # 首次执行保持既有目录布局；重试使用同级独立目录，避免旧目录清理延迟时误删新结果。
                retry_count = int(task.retry_count or 0)
                final_dir = result_root / str(user_id) / str(task_id)
                if retry_count > 0:
                    final_dir = result_root / str(user_id) / f"{task_id}-attempt-{retry_count}"
                final_dir.parent.mkdir(parents=True, exist_ok=True)

                existing = session.scalar(
                    select(TaskResult).where(TaskResult.task_id == task_id).with_for_update(),
                )
                if existing is not None:
                    # 重复完成事件只清理本次临时目录，绝不覆盖已提交结果。
                    shutil.rmtree(temporary_dir, ignore_errors=True)
                    return
                if final_dir.exists():
                    raise ValueError("任务结果目录已存在，拒绝覆盖已有结果")

                shutil.move(str(temporary_dir), str(final_dir))
                moved = True
                result = TaskResult(
                    task_id=task_id,
                    schema_version=1,
                    metrics_json=_dump_json(manifest["metrics"]),
                    kernel_weights_json=_dump_json(manifest["kernelWeights"]),
                    convergence_json=_dump_json(manifest["convergence"]),
                    preview_json=_dump_json(manifest["preview"]),
                    labels_path=str(final_dir / str(artifacts["labels"])),
                    ca_matrix_path=str(final_dir / str(artifacts["ca"])),
                    s_matrix_path=str(final_dir / str(artifacts["s"])),
                    z_matrix_path=str(final_dir / str(artifacts["z"])),
                    runtime_seconds=float(manifest["runtimeSeconds"]),
                )
                session.add(result)
                task.status = "succeeded"
                task.progress = 100.0
                task.current_iter = int(task.max_iter or 0)
                task.current_run = int(_load_json(task.params_json, {}).get("runs") or 1)
                task.current_stage = "persist"
                task.finished_at = _now()
                task.error_message = None
                task.failure_reason = None
                task.worker_id = None
                task.heartbeat_at = None
                session.add(
                    OperationLog(
                        user_id=task.user_id,
                        task_id=task.id,
                        action="task_succeeded",
                        message="OMELET 分析完成，结果已持久化",
                        detail_json=_dump_json(
                            {
                                "runtimeSeconds": result.runtime_seconds,
                                "metrics": manifest["metrics"].get("aggregate", {}),
                            },
                        ),
                    ),
                )
                session.commit()
        except Exception:
            if moved and final_dir is not None:
                shutil.rmtree(final_dir, ignore_errors=True)
            raise

    def _task_is_cancelled(self, task_id: int) -> bool:
        with SessionLocal() as session:
            task = session.get(AnalysisTask, task_id)
            return task is not None and task.status == "cancelled"

    def _mark_failed(self, task_id: int, reason: str, message: str) -> None:
        with SessionLocal() as session:
            task = session.scalar(
                select(AnalysisTask)
                .where(
                    AnalysisTask.id == task_id,
                    AnalysisTask.worker_id == self.worker_id,
                )
                .with_for_update(),
            )
            if task is None or task.status in TERMINAL_STATUSES:
                return
            task.status = "failed"
            task.failure_reason = reason
            task.error_message = message[:1000]
            task.finished_at = _now()
            task.worker_id = None
            task.heartbeat_at = None
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
            task = session.scalar(
                select(AnalysisTask)
                .where(
                    AnalysisTask.id == task_id,
                    AnalysisTask.status == "running",
                    AnalysisTask.worker_id == self.worker_id,
                )
                .with_for_update(),
            )
            if task is None:
                return
            task.status = "queued"
            task.retry_count = int(task.retry_count or 0) + 1
            task.progress = 0.0
            task.current_run = 0
            task.current_iter = 0
            task.current_stage = "select_base"
            task.started_at = None
            task.finished_at = None
            task.queued_at = _now()
            task.worker_id = None
            task.heartbeat_at = None
            session.add(
                OperationLog(
                    user_id=task.user_id,
                    task_id=task.id,
                    action="task_requeued",
                    level="warning",
                    message="服务停止，任务已重新排队",
                    detail_json=_dump_json({"retryCount": task.retry_count}),
                ),
            )
            session.commit()


task_execution_manager = TaskExecutionManager()
