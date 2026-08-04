from __future__ import annotations

import json
import subprocess
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app import task_executor as task_executor_module
from app.database import Base, make_engine, make_session_factory
from app.models import AnalysisTask, Dataset, TaskResult, User


def _setup_executor_db(tmp_path, monkeypatch):
    engine = make_engine(f"sqlite+pysqlite:///{(tmp_path / 'executor.sqlite3').as_posix()}")
    session_factory = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(task_executor_module, "SessionLocal", session_factory)
    return session_factory


def _create_task(session_factory, storage_path, *, status="queued", worker_id=None, heartbeat_at=None):
    storage_path.write_bytes(b"mat placeholder")
    with session_factory() as session:
        user = User(username=f"executor-{storage_path.stem}", password_hash="unused")
        session.add(user)
        session.flush()
        dataset = Dataset(
            user_id=user.id,
            name="executor-data",
            original_filename="executor.mat",
            storage_path=str(storage_path),
            file_hash="hash",
            sample_count=4,
            base_cluster_count=2,
            has_ground_truth=True,
            cluster_count=2,
            status="ready",
        )
        session.add(dataset)
        session.flush()
        task = AnalysisTask(
            user_id=user.id,
            dataset_id=dataset.id,
            name="executor-task",
            mode="OMELET",
            status=status,
            params_json=json.dumps({"nBase": 2, "runs": 1, "maxIter": 2}),
            queued_at=datetime.now(timezone.utc),
            worker_id=worker_id,
            heartbeat_at=heartbeat_at,
        )
        session.add(task)
        session.commit()
        return task.id, user.id


def test_claim_assigns_one_worker_and_second_worker_cannot_reclaim(tmp_path, monkeypatch):
    session_factory = _setup_executor_db(tmp_path, monkeypatch)
    task_id, user_id = _create_task(session_factory, tmp_path / "dataset.mat")
    first = task_executor_module.TaskExecutionManager()
    second = task_executor_module.TaskExecutionManager()

    first_payload = first._claim_next_task()
    second_payload = second._claim_next_task()

    assert first_payload == {
        "taskId": task_id,
        "userId": user_id,
        "workerId": first.worker_id,
        "mode": "OMELET",
        "params": {"nBase": 2, "runs": 1, "maxIter": 2},
        "datasetPath": str(tmp_path / "dataset.mat"),
    }
    assert second_payload is None
    with session_factory() as session:
        task = session.get(AnalysisTask, task_id)
        assert task is not None
        assert task.status == "running"
        assert task.worker_id == first.worker_id
        assert task.heartbeat_at is not None


def test_recovery_only_requeues_stale_running_tasks_and_increments_retry(tmp_path, monkeypatch):
    session_factory = _setup_executor_db(tmp_path, monkeypatch)
    fresh_id, _ = _create_task(
        session_factory,
        tmp_path / "fresh.mat",
        status="running",
        worker_id="live-worker",
        heartbeat_at=datetime.now(timezone.utc),
    )
    stale_id, _ = _create_task(
        session_factory,
        tmp_path / "stale.mat",
        status="running",
        worker_id="dead-worker",
        heartbeat_at=datetime.now(timezone.utc) - timedelta(minutes=10),
    )
    manager = task_executor_module.TaskExecutionManager()
    manager._recover_interrupted_tasks()

    with session_factory() as session:
        fresh = session.get(AnalysisTask, fresh_id)
        stale = session.get(AnalysisTask, stale_id)
        assert fresh is not None and fresh.status == "running"
        assert stale is not None
        assert stale.status == "queued"
        assert stale.retry_count == 1
        assert stale.worker_id is None
        assert stale.heartbeat_at is None


def test_non_owner_cannot_update_progress_or_failure(tmp_path, monkeypatch):
    session_factory = _setup_executor_db(tmp_path, monkeypatch)
    task_id, _ = _create_task(
        session_factory,
        tmp_path / "owned.mat",
        status="running",
        worker_id="another-worker",
        heartbeat_at=datetime.now(timezone.utc),
    )
    manager = task_executor_module.TaskExecutionManager()
    manager._persist_progress(task_id, {"type": "iteration", "progress": 80, "iteration": 8})
    manager._mark_failed(task_id, "execution_error", "should be ignored")

    with session_factory() as session:
        task = session.get(AnalysisTask, task_id)
        assert task is not None
        assert task.status == "running"
        assert task.progress == 0
        assert task.failure_reason is None


def test_duplicate_result_persistence_keeps_first_result(tmp_path, monkeypatch):
    session_factory = _setup_executor_db(tmp_path, monkeypatch)
    result_root = tmp_path / "results"
    monkeypatch.setattr(task_executor_module.get_settings(), "result_storage_dir", result_root)
    task_id, user_id = _create_task(
        session_factory,
        tmp_path / "result-data.mat",
        status="running",
        worker_id=None,
        heartbeat_at=datetime.now(timezone.utc),
    )
    manager = task_executor_module.TaskExecutionManager()
    with session_factory() as session:
        task = session.get(AnalysisTask, task_id)
        assert task is not None
        task.worker_id = manager.worker_id
        session.commit()

    manifest_template = {
        "schemaVersion": 1,
        "runtimeSeconds": 1.0,
        "metrics": {"aggregate": {}},
        "kernelWeights": {},
        "convergence": {},
        "preview": {},
        "artifacts": {"labels": "labels.npz", "ca": "ca.npz", "s": "s.npz", "z": "z.npz"},
    }
    first_dir = result_root / ".tmp" / "first"
    first_dir.mkdir(parents=True)
    for filename in ("labels.npz", "ca.npz", "s.npz", "z.npz"):
        (first_dir / filename).write_bytes(b"first")
    manager._persist_completed_result(task_id, user_id, first_dir, manifest_template)

    second_dir = result_root / ".tmp" / "second"
    second_dir.mkdir(parents=True)
    for filename in ("labels.npz", "ca.npz", "s.npz", "z.npz"):
        (second_dir / filename).write_bytes(b"second")
    manager._persist_completed_result(task_id, user_id, second_dir, manifest_template)

    with session_factory() as session:
        result = session.scalar(select(TaskResult).where(TaskResult.task_id == task_id))
        task = session.get(AnalysisTask, task_id)
        assert result is not None
        assert task is not None and task.status == "succeeded"
        assert (result_root / str(user_id) / str(task_id) / "labels.npz").read_bytes() == b"first"
    assert not second_dir.exists()


def test_task_timeout_marks_failure_and_cleans_temporary_directory(tmp_path, monkeypatch):
    session_factory = _setup_executor_db(tmp_path, monkeypatch)
    result_root = tmp_path / "timeout-results"
    settings = task_executor_module.get_settings()
    monkeypatch.setattr(settings, "result_storage_dir", result_root)
    monkeypatch.setattr(settings, "task_max_runtime_seconds", 0.05)
    monkeypatch.setattr(settings, "task_heartbeat_interval_seconds", 1.0)
    task_id, user_id = _create_task(
        session_factory,
        tmp_path / "timeout-data.mat",
        status="running",
        worker_id=None,
        heartbeat_at=datetime.now(timezone.utc),
    )
    manager = task_executor_module.TaskExecutionManager()
    with session_factory() as session:
        task = session.get(AnalysisTask, task_id)
        assert task is not None
        task.worker_id = manager.worker_id
        session.commit()

    class HangingProcess:
        pid = 43210

        def __init__(self):
            self.killed = False
            self.stdout = iter(())

        def poll(self):
            return -9 if self.killed else None

        def wait(self, timeout=None):
            if self.killed:
                return -9
            raise subprocess.TimeoutExpired(cmd="fake", timeout=timeout)

    process = HangingProcess()
    monkeypatch.setattr(task_executor_module.subprocess, "Popen", lambda *args, **kwargs: process)
    monkeypatch.setattr(
        task_executor_module,
        "_terminate_process_tree",
        lambda current_process, wait_timeout=5.0: setattr(current_process, "killed", True),
    )

    manager._execute_task(
        {
            "taskId": task_id,
            "userId": user_id,
            "workerId": manager.worker_id,
            "mode": "OMELET",
            "params": {"nBase": 2, "runs": 1, "maxIter": 2},
            "datasetPath": str(tmp_path / "timeout-data.mat"),
        },
    )

    with session_factory() as session:
        task = session.get(AnalysisTask, task_id)
        assert task is not None
        assert task.status == "failed"
        assert task.failure_reason == "timeout"
        assert task.worker_id is None
    temporary_root = result_root / ".tmp"
    assert not temporary_root.exists() or not any(temporary_root.iterdir())
