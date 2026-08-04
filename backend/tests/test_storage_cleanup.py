from pathlib import Path

import pytest
from sqlalchemy import select

from app import storage_cleanup as storage_cleanup_module
from app.database import Base, make_engine, make_session_factory
from app.models import StorageCleanupJob
from app.storage_cleanup import enqueue_cleanup, process_pending_cleanup_jobs
from app.time_utils import utc_now


def _setup(tmp_path, monkeypatch):
    engine = make_engine(f"sqlite+pysqlite:///{(tmp_path / 'cleanup.sqlite3').as_posix()}")
    session_factory = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)
    settings = storage_cleanup_module.get_settings()
    monkeypatch.setattr(settings, "dataset_storage_dir", tmp_path / "datasets")
    monkeypatch.setattr(settings, "result_storage_dir", tmp_path / "results")
    return session_factory


def test_cleanup_jobs_are_idempotent_and_remove_files_after_commit(tmp_path, monkeypatch):
    session_factory = _setup(tmp_path, monkeypatch)
    path = tmp_path / "datasets" / "1" / "sample.mat"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"dataset")

    with session_factory() as session:
        first = enqueue_cleanup(session, path, "dataset")
        second = enqueue_cleanup(session, path, "dataset")
        session.commit()
        assert first.id == second.id

    summary = process_pending_cleanup_jobs(session_factory=session_factory, limit=10)
    assert summary.succeeded == 1
    assert not path.exists()
    with session_factory() as session:
        job = session.scalar(select(StorageCleanupJob).where(StorageCleanupJob.storage_path == str(path.resolve())))
        assert job is not None
        assert job.status == "succeeded"


def test_cleanup_failure_is_retryable_without_restoring_deleted_rows(tmp_path, monkeypatch):
    session_factory = _setup(tmp_path, monkeypatch)
    path = tmp_path / "results" / "1" / "attempt-1"
    path.mkdir(parents=True)
    (path / "labels.npz").write_bytes(b"result")

    with session_factory() as session:
        enqueue_cleanup(session, path, "result")
        session.commit()

    original_delete = storage_cleanup_module._delete_path
    monkeypatch.setattr(storage_cleanup_module, "_delete_path", lambda _: (_ for _ in ()).throw(OSError("locked")))
    failed = process_pending_cleanup_jobs(session_factory=session_factory, limit=10)
    assert failed.failed == 1
    with session_factory() as session:
        job = session.scalar(select(StorageCleanupJob).where(StorageCleanupJob.storage_path == str(path.resolve())))
        assert job is not None
        assert job.status == "failed"
        job.next_attempt_at = utc_now()
        session.commit()

    monkeypatch.setattr(storage_cleanup_module, "_delete_path", original_delete)
    retried = process_pending_cleanup_jobs(session_factory=session_factory, limit=10)
    assert retried.succeeded == 1
    assert not path.exists()


def test_cleanup_path_must_stay_inside_configured_storage_root(tmp_path, monkeypatch):
    session_factory = _setup(tmp_path, monkeypatch)
    outside = tmp_path / "outside.mat"
    outside.write_bytes(b"outside")
    with session_factory() as session:
        with pytest.raises(ValueError, match="受控存储目录"):
            enqueue_cleanup(session, outside, "dataset")
