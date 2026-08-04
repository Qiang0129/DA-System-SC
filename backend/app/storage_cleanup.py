"""数据库提交后的文件清理队列。

数据库事务不能和本地文件系统组成同一个原子事务，因此删除接口只在数据库
事务中登记清理任务。文件操作放到提交之后执行，失败时保留可重试的队列记录，
避免出现数据库仍指向已删除文件的情况。
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .database import SessionLocal
from .models import StorageCleanupJob
from .time_utils import utc_now


logger = logging.getLogger(__name__)

CLEANUP_KINDS = {"dataset", "result", "export"}
CLEANUP_LEASE_SECONDS = 300
MAX_RETRY_DELAY_SECONDS = 3600


@dataclass(frozen=True)
class CleanupSummary:
    attempted: int = 0
    succeeded: int = 0
    failed: int = 0


def _cleanup_root(kind: str) -> Path:
    if kind == "dataset":
        return Path(get_settings().dataset_storage_dir).resolve()
    if kind in {"result", "export"}:
        return Path(get_settings().result_storage_dir).resolve()
    raise ValueError(f"不支持的文件清理类型：{kind}")


def normalize_cleanup_path(path: str | Path, kind: str) -> Path:
    """校验并规范化待清理路径，禁止队列删除存储根目录之外的文件。"""
    if kind not in CLEANUP_KINDS:
        raise ValueError(f"不支持的文件清理类型：{kind}")
    normalized = Path(path).resolve()
    root = _cleanup_root(kind)
    if normalized == root:
        raise ValueError("禁止把存储根目录加入文件清理队列")
    try:
        normalized.relative_to(root)
    except ValueError as exc:
        raise ValueError("文件清理路径不在受控存储目录内") from exc
    return normalized


def enqueue_cleanup(session: Session, path: str | Path, kind: str) -> StorageCleanupJob:
    """在当前业务事务中登记一次幂等的文件清理任务。"""
    normalized = normalize_cleanup_path(path, kind)
    normalized_path = str(normalized)
    job = session.scalar(
        select(StorageCleanupJob)
        .where(StorageCleanupJob.storage_path == normalized_path)
        .with_for_update(),
    )
    if job is not None:
        if job.status == "failed":
            job.status = "pending"
            job.last_error = None
            job.next_attempt_at = utc_now()
        return job

    job = StorageCleanupJob(
        storage_path=normalized_path,
        storage_kind=kind,
        status="pending",
        attempts=0,
        next_attempt_at=utc_now(),
    )
    session.add(job)
    session.flush()
    return job


def enqueue_cleanups(session: Session, paths: set[tuple[str, Path]]) -> list[StorageCleanupJob]:
    jobs: list[StorageCleanupJob] = []
    for kind, path in sorted(paths, key=lambda item: (item[0], str(item[1]))):
        jobs.append(enqueue_cleanup(session, path, kind))
    return jobs


def _delete_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.is_dir():
        shutil.rmtree(path)


def _retry_delay(attempts: int) -> int:
    return min(MAX_RETRY_DELAY_SECONDS, 2 ** min(max(attempts, 1), 10))


def _claim_job(session_factory) -> tuple[int, str, str, int] | None:
    now = utc_now()
    with session_factory() as session:
        job = session.scalar(
            select(StorageCleanupJob)
            .where(
                StorageCleanupJob.status.in_(("pending", "failed", "processing")),
                StorageCleanupJob.next_attempt_at <= now,
            )
            .order_by(StorageCleanupJob.next_attempt_at, StorageCleanupJob.id)
            .limit(1)
            .with_for_update(skip_locked=True),
        )
        if job is None:
            return None
        job.status = "processing"
        job.attempts = int(job.attempts or 0) + 1
        job.next_attempt_at = now + timedelta(seconds=CLEANUP_LEASE_SECONDS)
        session.commit()
        return job.id, job.storage_path, job.storage_kind, job.attempts


def process_pending_cleanup_jobs(*, limit: int = 20, session_factory=None, bind=None) -> CleanupSummary:
    """处理有限数量的清理任务；数据库异常交给调用方记录并在下一轮重试。"""
    factory = session_factory or (sessionmaker(bind=bind, autoflush=False, future=True) if bind is not None else SessionLocal)
    attempted = succeeded = failed = 0
    for _ in range(max(0, int(limit))):
        claimed = _claim_job(factory)
        if claimed is None:
            break
        job_id, raw_path, kind, attempts = claimed
        attempted += 1
        path = Path(raw_path)
        try:
            normalize_cleanup_path(path, kind)
            _delete_path(path)
        except Exception as exc:  # pragma: no cover - filesystem errors are platform-specific
            failed += 1
            with factory() as session:
                job = session.get(StorageCleanupJob, job_id)
                if job is not None:
                    job.status = "failed"
                    job.last_error = str(exc)[:2000]
                    job.next_attempt_at = utc_now() + timedelta(seconds=_retry_delay(attempts))
                    session.commit()
            logger.warning("文件清理失败，将在稍后重试：%s (%s)", path, exc)
        else:
            succeeded += 1
            with factory() as session:
                job = session.get(StorageCleanupJob, job_id)
                if job is not None:
                    job.status = "succeeded"
                    job.last_error = None
                    job.completed_at = utc_now()
                    session.commit()
    return CleanupSummary(attempted=attempted, succeeded=succeeded, failed=failed)
