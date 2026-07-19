from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


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
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="user")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user")
    datasets: Mapped[list["Dataset"]] = relationship(back_populates="user")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped[User] = relationship(back_populates="sessions")


class Dataset(Base):
    __tablename__ = "datasets"

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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    user: Mapped[User] = relationship(back_populates="datasets")


class DatasetRevision(Base):
    __tablename__ = "dataset_revisions"

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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


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
    checked_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class DatasetTask(Base):
    """历史草稿任务表，数据管理页仍会统计；任务中心主实体已切换到 analysis_tasks。"""

    __tablename__ = "dataset_tasks"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("datasets.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    selected_base_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AnalysisTask(Base):
    """分析执行任务：承接 OMELET / OMELET-SV 的创建、调度、进度与结果关联。"""

    __tablename__ = "analysis_tasks"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    dataset_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
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
    queued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )


class TaskResult(Base):
    __tablename__ = "task_results"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    schema_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    task_id: Mapped[int] = mapped_column(
        IDENTIFIER_TYPE,
        ForeignKey("analysis_tasks.id", ondelete="CASCADE"),
        unique=True,
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
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TaskExport(Base):
    __tablename__ = "task_exports"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("analysis_tasks.id", ondelete="CASCADE"), index=True)
    export_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    items_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ready")
    filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TaskTemplate(Base):
    """用户保存的任务参数模板，便于重复创建同类分析。"""

    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    mode: Mapped[str] = mapped_column(String(32), default="OMELET-SV")
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column(IDENTIFIER_TYPE, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(IDENTIFIER_TYPE, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(IDENTIFIER_TYPE, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    level: Mapped[str] = mapped_column(String(16), default="info")
    message: Mapped[str] = mapped_column(String(500))
    detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
