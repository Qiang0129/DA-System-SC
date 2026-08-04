from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .time_utils import UTCDateTime, utc_now


# 既有 MySQL 库的用户和数据集主键为 BIGINT UNSIGNED；SQLite 测试保留 INTEGER 才能正常自增。
IDENTIFIER_TYPE = (
    BigInteger()
    .with_variant(mysql.BIGINT(unsigned=True), "mysql")
    .with_variant(Integer(), "sqlite")
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="user")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        server_default=func.now(),
        onupdate=utc_now,
    )

    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user")
    datasets: Mapped[list["Dataset"]] = relationship(back_populates="user")


class EmailVerificationCode(Base):
    """邮箱验证码只保存哈希值，避免数据库泄漏时暴露仍在有效期内的明文验证码。"""

    __tablename__ = "email_verification_codes"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    purpose: Mapped[str] = mapped_column(String(32), default="register", index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), index=True,
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, server_default=func.now())

    user: Mapped[User] = relationship(back_populates="sessions")


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        Index("idx_datasets_user_created_at", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    file_hash: Mapped[str] = mapped_column(String(128))
    sample_count: Mapped[int] = mapped_column(Integer)
    base_cluster_count: Mapped[int] = mapped_column(Integer)
    has_ground_truth: Mapped[bool] = mapped_column(Boolean, default=False)
    cluster_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ready", index=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), index=True,
    )

    user: Mapped[User] = relationship(back_populates="datasets")


class DatasetRevision(Base):
    __tablename__ = "dataset_revisions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "version", name="uk_dataset_revisions_dataset_version"),
    )

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(128))
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    file_hash: Mapped[str] = mapped_column(String(128))
    sample_count: Mapped[int] = mapped_column(Integer)
    base_cluster_count: Mapped[int] = mapped_column(Integer)
    has_ground_truth: Mapped[bool] = mapped_column(Boolean, default=False)
    cluster_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_status: Mapped[str] = mapped_column(String(16), default="ready")
    quality_issues_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), index=True,
    )


class DatasetQuality(Base):
    __tablename__ = "dataset_qualities"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(
        IDENTIFIER_TYPE,
        ForeignKey("datasets.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(16), default="ready", index=True)
    issues_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), onupdate=utc_now,
    )


class AnalysisTask(Base):
    """分析执行任务：承接 OMELET / OMELET-SV 的创建、调度、进度与结果关联。"""

    __tablename__ = "analysis_tasks"
    __table_args__ = (
        Index("idx_analysis_tasks_user_dataset", "user_id", "dataset_id"),
        Index("idx_analysis_tasks_dataset_status_finished", "dataset_id", "status", "finished_at"),
        Index("idx_analysis_tasks_worker_id", "worker_id"),
        Index("idx_analysis_tasks_heartbeat_at", "heartbeat_at"),
        Index("idx_analysis_tasks_status_queued", "status", "queued_at", "id"),
        Index("idx_analysis_tasks_status_heartbeat", "status", "heartbeat_at"),
        Index("idx_analysis_tasks_user_status_queued", "user_id", "status", "queued_at"),
    )

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("datasets.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    mode: Mapped[str] = mapped_column(String(32), default="OMELET-SV")
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    current_run: Mapped[int] = mapped_column(Integer, default=0)
    current_iter: Mapped[int] = mapped_column(Integer, default=0)
    max_iter: Mapped[int] = mapped_column(Integer, default=20)
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    queued_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True, index=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utc_now,
        server_default=func.now(),
        onupdate=utc_now,
    )


class TaskResult(Base):
    __tablename__ = "task_results"
    __table_args__ = (
        UniqueConstraint("task_id", name="uk_task_results_task_id"),
    )

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    schema_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    task_id: Mapped[int] = mapped_column(
        IDENTIFIER_TYPE,
        ForeignKey("analysis_tasks.id", ondelete="CASCADE"),
        index=True,
    )
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    kernel_weights_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    convergence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    labels_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ca_matrix_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    s_matrix_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    z_matrix_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    runtime_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, server_default=func.now())


class TaskExport(Base):
    __tablename__ = "task_exports"
    __table_args__ = (
        Index("idx_task_exports_task_id_id", "task_id", "id"),
    )

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("analysis_tasks.id", ondelete="CASCADE"), index=True)
    export_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    items_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ready")
    filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now, server_default=func.now())


class TaskTemplate(Base):
    """用户保存的任务参数模板，便于重复创建同类分析。"""

    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    mode: Mapped[str] = mapped_column(String(32), default="OMELET-SV")
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), index=True,
    )


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(
        IDENTIFIER_TYPE,
        ForeignKey("analysis_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64), index=True)
    level: Mapped[str] = mapped_column(String(16), default="info")
    message: Mapped[str] = mapped_column(String(500))
    detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(), index=True,
    )


class StorageCleanupJob(Base):
    """数据库提交后清理文件的事务性队列记录。"""

    __tablename__ = "storage_cleanup_jobs"
    __table_args__ = (
        Index("idx_storage_cleanup_jobs_status_retry", "status", "next_attempt_at", "id"),
        Index("idx_storage_cleanup_jobs_created_at", "created_at"),
        Index("idx_storage_cleanup_jobs_status", "status"),
        Index("idx_storage_cleanup_jobs_next_attempt_at", "next_attempt_at"),
        UniqueConstraint("storage_path", name="uk_storage_cleanup_jobs_storage_path"),
    )

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_attempt_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
